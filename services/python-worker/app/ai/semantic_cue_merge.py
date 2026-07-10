from __future__ import annotations

import copy
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any


@dataclass(frozen=True)
class SemanticCueMergeResult:
    cues: list[dict[str, Any]]
    warnings: list[str]


def merge_semantic_cues(
    generated_cues: list[dict[str, Any]],
    existing_cues: list[dict[str, Any]],
) -> SemanticCueMergeResult:
    generated = [copy.deepcopy(cue) for cue in generated_cues]
    existing = [copy.deepcopy(cue) for cue in existing_cues]
    protected = [cue for cue in existing if _is_protected(cue)]
    candidates = [cue for cue in existing if not _is_protected(cue)]
    used_ids = {
        str(cue.get("cueId", "")) for cue in existing if cue.get("cueId")
    }
    candidates_by_identity: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for cue in candidates:
        fingerprint = _cue_fingerprint(cue)
        cue_type = str(cue.get("cueType") or "")
        if fingerprint:
            candidates_by_identity.setdefault((fingerprint, cue_type), []).append(cue)
    protected_by_identity: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for cue in protected:
        fingerprint = _cue_fingerprint(cue)
        cue_type = str(cue.get("cueType") or "")
        if fingerprint:
            protected_by_identity.setdefault((fingerprint, cue_type), []).append(cue)

    merged: list[dict[str, Any]] = []
    matched_ids: set[str] = set()
    warnings: list[str] = []
    for cue in generated:
        fingerprint = compute_source_fingerprint(
            list(cue.get("sourceRefs") or []),
            str(cue.get("cueType") or ""),
            list(cue.get("requiredConcepts") or []),
        )
        cue["sourceFingerprint"] = fingerprint
        cue_type = str(cue.get("cueType") or "")
        protected_matches = protected_by_identity.get((fingerprint, cue_type), [])
        if protected_matches:
            if len(protected_matches) > 1:
                warnings.append("ambiguous-cue-identity")
            continue
        matches = candidates_by_identity.get((fingerprint, cue_type), [])
        if len(matches) == 1:
            existing_cue = matches[0]
            existing_id = str(existing_cue["cueId"])
            cue["cueId"] = existing_id
            matched_ids.add(existing_id)
            if _same_semantic_meaning(cue, existing_cue):
                cue["revision"] = int(existing_cue.get("revision") or 1)
                cue["reviewStatus"] = str(
                    existing_cue.get("reviewStatus") or "suggested"
                )
                cue["origin"] = str(existing_cue.get("origin") or "ai")
            else:
                cue["revision"] = int(existing_cue.get("revision") or 1) + 1
                cue["reviewStatus"] = "suggested"
                cue["origin"] = "ai"
        else:
            cue["cueId"] = _new_cue_id(cue, used_ids)
            if len(matches) > 1:
                cue["qualityWarnings"] = _dedupe(
                    [*(cue.get("qualityWarnings") or []), "ambiguous-cue-identity"]
                )[:12]
                warnings.append("ambiguous-cue-identity")
        used_ids.add(str(cue["cueId"]))
        merged.append(cue)

    protected_ids = {str(cue.get("cueId", "")) for cue in protected}
    for cue in candidates:
        cue_id = str(cue.get("cueId", ""))
        if cue_id and cue_id not in matched_ids and cue_id not in protected_ids:
            warnings.append(f"removed-suggestion:{cue_id}")
    return SemanticCueMergeResult(cues=merged, warnings=_dedupe(warnings))


def compute_source_fingerprint(
    source_refs: list[dict[str, Any]],
    cue_type: str,
    required_concepts: list[str],
) -> str:
    normalized_refs = sorted(
        [
            {
                "kind": str(ref.get("kind") or ""),
                "refId": str(ref.get("refId") or ""),
                "sourceHash": str(ref.get("sourceHash") or ""),
            }
            for ref in source_refs
        ],
        key=lambda ref: (ref["kind"], ref["refId"], ref["sourceHash"]),
    )
    payload = {
        "cueType": _normalize_text(cue_type),
        "requiredConcepts": sorted(
            {_normalize_text(concept) for concept in required_concepts if concept.strip()}
        ),
        "sourceRefs": normalized_refs,
    }
    stable_json = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(stable_json.encode("utf-8")).hexdigest()


def _cue_fingerprint(cue: dict[str, Any]) -> str:
    fingerprint = cue.get("sourceFingerprint")
    if isinstance(fingerprint, str) and fingerprint.strip():
        return fingerprint.strip()
    source_refs = cue.get("sourceRefs")
    if not isinstance(source_refs, list):
        return ""
    return compute_source_fingerprint(
        source_refs,
        str(cue.get("cueType") or ""),
        list(cue.get("requiredConcepts") or []),
    )


def _same_semantic_meaning(
    generated: dict[str, Any], existing: dict[str, Any]
) -> bool:
    generated_concepts = _normalized_concepts(generated)
    existing_concepts = _normalized_concepts(existing)
    if generated_concepts != existing_concepts:
        return False
    generated_label = _normalize_text(
        str(generated.get("reportLabel") or generated.get("meaning") or "")
    )
    existing_label = _normalize_text(
        str(existing.get("reportLabel") or existing.get("meaning") or "")
    )
    if generated_label != existing_label:
        return False
    generated_meaning = _normalize_text(str(generated.get("meaning") or ""))
    existing_meaning = _normalize_text(str(existing.get("meaning") or ""))
    return generated_meaning == existing_meaning or SequenceMatcher(
        None, generated_meaning, existing_meaning
    ).ratio() >= 0.9


def _normalized_concepts(cue: dict[str, Any]) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                _normalize_text(str(concept))
                for concept in cue.get("requiredConcepts") or []
                if str(concept).strip()
            }
        )
    )


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value).casefold()
    normalized = re.sub(r"[^0-9a-z가-힣_-]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _new_cue_id(cue: dict[str, Any], used_ids: set[str]) -> str:
    identity = {
        "sourceFingerprint": cue["sourceFingerprint"],
        "meaning": _normalize_text(str(cue.get("meaning") or "")),
        "reportLabel": _normalize_text(str(cue.get("reportLabel") or "")),
        "requiredConcepts": list(_normalized_concepts(cue)),
    }
    digest = hashlib.sha256(
        json.dumps(
            identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
    ).hexdigest()
    candidate = f"scue_{digest[:24]}"
    suffix = 2
    while candidate in used_ids:
        candidate = f"scue_{digest[:20]}_{suffix}"
        suffix += 1
    return candidate


def _is_protected(cue: dict[str, Any]) -> bool:
    return cue.get("origin") == "manual" or cue.get("reviewStatus") == "approved"


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))
