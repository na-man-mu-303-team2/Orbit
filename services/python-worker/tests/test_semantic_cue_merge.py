from app.ai.semantic_cue_merge import (
    compute_source_fingerprint,
    merge_semantic_cues,
)


def test_new_cue_ids_remain_stable_when_provider_order_changes() -> None:
    cause = cue(
        meaning="온보딩 이탈이 ARR 감소의 원인이다",
        report_label="ARR 감소 원인",
        cue_type="cause",
        concepts=["온보딩 이탈"],
        source_hash="a" * 64,
    )
    result = cue(
        meaning="체크리스트가 활성화율을 개선했다",
        report_label="활성화율 개선",
        cue_type="result",
        concepts=["체크리스트", "활성화율"],
        source_hash="b" * 64,
    )

    first = merge_semantic_cues([cause, result], [])
    reordered = merge_semantic_cues([result, cause], [])

    first_ids = {item["reportLabel"]: item["cueId"] for item in first.cues}
    reordered_ids = {item["reportLabel"]: item["cueId"] for item in reordered.cues}
    assert first_ids == reordered_ids
    assert all(cue_id.startswith("scue_") for cue_id in first_ids.values())


def test_minor_wording_change_preserves_id_revision_and_review_status() -> None:
    initial = merge_semantic_cues(
        [
            cue(
                meaning="온보딩 이탈이 ARR 감소의 원인이다.",
                report_label="ARR 감소 원인",
                cue_type="cause",
                concepts=["온보딩 이탈"],
                source_hash="a" * 64,
            )
        ],
        [],
    ).cues[0]
    initial.update({"revision": 3, "reviewStatus": "excluded", "origin": "ai"})
    regenerated = cue(
        meaning="온보딩 이탈이 ARR 감소의 원인이다",
        report_label="ARR 감소 원인",
        cue_type="cause",
        concepts=["온보딩 이탈"],
        source_hash="a" * 64,
    )

    merged = merge_semantic_cues([regenerated], [initial]).cues[0]

    assert merged["cueId"] == initial["cueId"]
    assert merged["revision"] == 3
    assert merged["reviewStatus"] == "excluded"


def test_semantic_change_reuses_source_identity_and_increments_revision() -> None:
    initial = merge_semantic_cues(
        [
            cue(
                meaning="가격 인상이 전환율을 낮췄다",
                report_label="가격 실험 결과",
                cue_type="result",
                concepts=["가격 인상"],
                source_hash="c" * 64,
            )
        ],
        [],
    ).cues[0]
    initial.update({"revision": 2, "reviewStatus": "excluded"})
    changed = cue(
        meaning="가격 인상 이후 무료 체험이 핵심 유입 경로가 됐다",
        report_label="가격 실험 결과",
        cue_type="result",
        concepts=["가격 인상"],
        source_hash="c" * 64,
    )

    merged = merge_semantic_cues([changed], [initial]).cues[0]

    assert merged["cueId"] == initial["cueId"]
    assert merged["revision"] == 3
    assert merged["reviewStatus"] == "suggested"


def test_ambiguous_identity_creates_new_id_and_warning() -> None:
    generated = cue(
        meaning="고객 이탈 원인을 설명했다",
        report_label="고객 이탈 원인",
        cue_type="cause",
        concepts=["고객 이탈"],
        source_hash="d" * 64,
    )
    fingerprint = compute_source_fingerprint(
        generated["sourceRefs"], generated["cueType"], generated["requiredConcepts"]
    )
    existing = [
        {**generated, "cueId": "scue_old_1", "sourceFingerprint": fingerprint},
        {**generated, "cueId": "scue_old_2", "sourceFingerprint": fingerprint},
    ]

    result = merge_semantic_cues([generated], existing)

    assert result.cues[0]["cueId"] not in {"scue_old_1", "scue_old_2"}
    assert "ambiguous-cue-identity" in result.cues[0]["qualityWarnings"]
    assert "ambiguous-cue-identity" in result.warnings


def test_removed_suggestions_are_reported_but_protected_cues_are_ignored() -> None:
    kept = merge_semantic_cues(
        [
            cue(
                meaning="문제를 정의했다",
                report_label="문제 정의",
                cue_type="problem",
                concepts=["고객 문제"],
                source_hash="e" * 64,
            )
        ],
        [],
    ).cues[0]
    removed = {
        **cue(
            meaning="과거 제안을 설명했다",
            report_label="과거 제안",
            cue_type="solution",
            concepts=["과거 제안"],
            source_hash="f" * 64,
        ),
        "cueId": "scue_removed",
    }
    manual = {**removed, "cueId": "scue_manual", "origin": "manual"}
    approved = {
        **removed,
        "cueId": "scue_approved",
        "reviewStatus": "approved",
    }

    result = merge_semantic_cues([kept], [kept, removed, manual, approved])

    assert result.warnings == ["removed-suggestion:scue_removed"]


def test_generated_duplicate_of_approved_or_manual_cue_is_suppressed() -> None:
    generated = cue(
        meaning="승인된 핵심 문제를 설명했다",
        report_label="승인된 문제",
        cue_type="problem",
        concepts=["핵심 문제"],
        source_hash="1" * 64,
    )
    fingerprint = compute_source_fingerprint(
        generated["sourceRefs"], generated["cueType"], generated["requiredConcepts"]
    )
    approved = {
        **generated,
        "cueId": "scue_approved",
        "sourceFingerprint": fingerprint,
        "reviewStatus": "approved",
        "revision": 5,
    }

    result = merge_semantic_cues([generated], [approved])

    assert result.cues == []
    assert result.warnings == []


def test_source_fingerprint_normalizes_unicode_whitespace_and_order() -> None:
    first = compute_source_fingerprint(
        [
            {"kind": "element", "refId": "el_2", "sourceHash": "b" * 64},
            {"kind": "slide-title", "refId": "slide_1", "sourceHash": "a" * 64},
        ],
        "definition",
        ["Cafe\u0301  지표", "ARR"],
    )
    second = compute_source_fingerprint(
        [
            {"kind": "slide-title", "refId": "slide_1", "sourceHash": "a" * 64},
            {"kind": "element", "refId": "el_2", "sourceHash": "b" * 64},
        ],
        "definition",
        ["ARR", "Café 지표"],
    )

    assert first == second
    assert len(first) == 64


def cue(
    *,
    meaning: str,
    report_label: str,
    cue_type: str,
    concepts: list[str],
    source_hash: str,
) -> dict[str, object]:
    return {
        "cueId": "scue_placeholder",
        "slideId": "slide_1",
        "meaning": meaning,
        "reportLabel": report_label,
        "presenterTag": report_label,
        "cueType": cue_type,
        "importance": "supporting",
        "reviewStatus": "suggested",
        "freshness": "current",
        "origin": "ai",
        "revision": 1,
        "sourceDeckVersion": 1,
        "sourceRefs": [
            {
                "kind": "speaker-notes",
                "refId": "slide_1",
                "sourceHash": source_hash,
            }
        ],
        "qualityWarnings": [],
        "required": False,
        "priority": 2,
        "candidateKeywords": [report_label],
        "aliases": {},
        "requiredConcepts": concepts,
        "nliHypotheses": [f"발표자는 {meaning}"],
        "negativeHints": [],
        "targetElementIds": [],
        "triggerActionIds": [],
    }
