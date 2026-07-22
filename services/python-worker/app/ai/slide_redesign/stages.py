from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
from typing import Any, Literal, cast

from app.ai.design_agent import (
    DesignAgentRequest,
    DesignAgentResponse,
    _is_broad_preset_request,
    normalize_design_proposal,
    validate_design_proposal,
)
from app.ai.design_program import PaletteRoles

from .composer import eligible_candidates, select_composition
from .diff import CandidateAnalysis, build_operations, filter_safe_candidates
from .media import MediaAssignment, build_media_operations, collect_source_images
from .ornament import generate_ornaments
from .palette import build_palette_options, derive_palette
from .safety import (
    ElementConstraints,
    collect_element_constraints,
    find_unsafe_elements,
    unsafe_refusal_message,
)
from .slide_extractor import (
    classify_slide_type_with_source,
    collect_text_elements,
    extract_slide,
    infer_hierarchy,
)
from .stage_models import (
    ComposeStageArtifact,
    ElementConstraintsArtifact,
    ImageRequestArtifact,
    InterpretStageArtifact,
    SlideRedesignSummary,
    VerifyStageArtifact,
)


MEDIA_ENABLED = True
CandidateFilter = Callable[..., list[CandidateAnalysis]]


def run_interpret_stage(
    request: DesignAgentRequest,
    *,
    model: str,
    api_key: str | None,
    client: Any | None = None,
) -> InterpretStageArtifact:
    if not _should_attempt_redesign(request):
        return InterpretStageArtifact(
            outcome="fallback-allowed",
            reason="request-not-broad",
        )
    if request.context.canvas.width != 1920 or request.context.canvas.height != 1080:
        return InterpretStageArtifact(
            outcome="fallback-allowed",
            reason="unsupported-canvas",
        )

    slide = request.context.slide
    unsafe_ids = find_unsafe_elements(slide, media_slots_available=MEDIA_ENABLED)
    if unsafe_ids:
        return InterpretStageArtifact(
            outcome="refused-unsafe",
            reason=unsafe_refusal_message(unsafe_ids, slide),
        )

    texts = collect_text_elements(slide)
    if not texts:
        return InterpretStageArtifact(
            outcome="fallback-allowed",
            reason="no-visible-text",
        )

    hierarchy = infer_hierarchy(texts)
    slide_type, slide_type_source = classify_slide_type_with_source(
        hierarchy,
        model=model,
        api_key=api_key,
        client=client,
    )
    extracted = extract_slide(slide, slide_type=slide_type, hierarchy=hierarchy)
    constraints = collect_element_constraints(slide)
    return InterpretStageArtifact(
        outcome="applicable",
        slideTypeSource=slide_type_source,
        summary=SlideRedesignSummary.model_validate(extracted.summary),
        provenance=extracted.provenance,
        constraints=ElementConstraintsArtifact.from_constraints(constraints),
    )


def run_compose_stage(
    request: DesignAgentRequest,
    artifact: InterpretStageArtifact,
    *,
    model: str,
    api_key: str | None,
    client: Any | None = None,
    filter_candidates: CandidateFilter = filter_safe_candidates,
) -> ComposeStageArtifact:
    if artifact.outcome != "applicable":
        return ComposeStageArtifact(outcome=artifact.outcome, reason=artifact.reason)
    assert artifact.summary is not None
    assert artifact.constraints is not None
    summary = artifact.summary.model_dump(by_alias=True)
    slide = request.context.slide

    if request.request_palette_options:
        palette_options = build_palette_options(
            request.context.theme,
            summary,
            model=model,
            api_key=api_key,
            client=client,
        )
        return ComposeStageArtifact(
            outcome="applicable",
            response=DesignAgentResponse.model_validate(
                {
                    "message": "리디자인에 사용할 배색을 골라주세요.",
                    "interpretedIntent": {
                        "target": "current-slide",
                        "action": "select-redesign-palette",
                        "alignment": None,
                    },
                    "operations": [],
                    "affectedElementIds": [],
                    "warnings": [],
                    "paletteOptions": [
                        option.model_dump(by_alias=True) for option in palette_options
                    ],
                    "smartArtRequest": None,
                    "uiAction": None,
                }
            ),
        )

    palette_override = (
        PaletteRoles.model_validate(
            request.selected_palette_option.palette.model_dump()
        )
        if request.selected_palette_option is not None
        else None
    )
    candidates = eligible_candidates(
        summary,
        media_enabled=MEDIA_ENABLED,
        source_image_count=len(collect_source_images(slide)),
        has_source_refs=_has_source_refs(slide),
    )
    constraints = artifact.constraints.to_constraints()
    analyses = filter_candidates(
        summary,
        artifact.provenance,
        slide,
        candidates,
        request.context.theme,
        constraints,
        palette_override,
    )
    if not analyses:
        constrained_ids = _constrained_ids(constraints)
        if constrained_ids:
            return ComposeStageArtifact(
                outcome="refused-unsafe",
                reason=unsafe_refusal_message(sorted(constrained_ids), slide),
                candidateCount=len(candidates),
            )
        return ComposeStageArtifact(
            outcome="fallback-allowed",
            reason="no-safe-candidate",
            candidateCount=len(candidates),
        )

    chosen = select_composition(
        summary,
        [analysis.candidate for analysis in analyses],
        request.question,
        model=model,
        api_key=api_key,
        client=client,
    )
    analysis = next(item for item in analyses if item.candidate == chosen)
    slide_id = str(slide.get("slideId", ""))
    original_elements = [
        element for element in slide.get("elements", []) if isinstance(element, dict)
    ]
    operations = build_operations(
        slide_id,
        original_elements,
        analysis.compiled,
        analysis.matching,
    )
    operations = _insert_operations_before_deletes(
        operations,
        build_media_operations(slide_id, analysis.media_assignments),
    )
    operation_count_without_ornaments = len(operations)
    ornaments = generate_ornaments(
        chosen.composition_id,
        analysis.compiled.elements,
        palette_override
        or derive_palette(request.context.theme, chosen.background_mode),
    )
    operations = _insert_supported_ornament_operations(
        operations,
        ornaments,
        slide_id=slide_id,
        original_elements=original_elements,
        addable_element_types=set(request.capabilities.addable_element_types),
    )
    response = DesignAgentResponse.model_validate(
        {
            "message": "현재 문구를 유지한 전체 슬라이드 리디자인안을 준비했습니다.",
            "interpretedIntent": {
                "target": "current-slide",
                "action": "redesign-slide",
                "alignment": None,
            },
            "operations": operations,
            "affectedElementIds": _affected_element_ids(operations),
            "warnings": [],
            "smartArtRequest": None,
            "uiAction": None,
        }
    )
    return ComposeStageArtifact(
        outcome="applicable",
        response=response,
        candidateCount=len(candidates),
        safeCandidateCount=len(analyses),
        chosenCompositionId=chosen.composition_id,
        irreversibleCount=len(analysis.matching.irreversible),
        ornamentApplied=len(operations) > operation_count_without_ornaments,
        imageRequests=_build_image_requests(
            operations,
            analysis.media_assignments,
            chosen.asset_role,
            artifact.summary,
        ),
    )


def run_verify_stage(
    request: DesignAgentRequest,
    artifact: ComposeStageArtifact,
) -> VerifyStageArtifact:
    if artifact.outcome != "applicable":
        return VerifyStageArtifact(outcome=artifact.outcome, reason=artifact.reason)
    assert artifact.response is not None
    response = validate_design_proposal(
        request,
        normalize_design_proposal(request, artifact.response),
    )
    return VerifyStageArtifact(outcome="applicable", response=response)


def _should_attempt_redesign(request: DesignAgentRequest) -> bool:
    if _is_explicit_smart_art_request(request.question):
        return False
    return request.intent_preset == "redesign-slide" or _is_broad_preset_request(
        request.question
    )


def _is_explicit_smart_art_request(question: str) -> bool:
    normalized = " ".join(question.casefold().split())
    return any(
        token in normalized
        for token in (
            "스마트아트",
            "다이어그램",
            "smartart",
            "smart art",
            "process diagram",
            "step diagram",
            "flow diagram",
        )
    )


def _constrained_ids(constraints: ElementConstraints) -> set[str]:
    return set().union(
        constraints.referenced_element_ids,
        constraints.locked_element_ids,
        constraints.grouped_element_ids,
        constraints.ooxml_element_ids,
    )


def _affected_element_ids(operations: list[dict[str, Any]]) -> list[str]:
    affected: list[str] = []
    for operation in operations:
        element_id = operation.get("elementId")
        if not isinstance(element_id, str):
            element = operation.get("element")
            element_id = element.get("elementId") if isinstance(element, dict) else None
        if isinstance(element_id, str) and element_id not in affected:
            affected.append(element_id)
    return affected


def _has_source_refs(slide: dict[str, Any]) -> bool:
    cues = slide.get("semanticCues")
    if not isinstance(cues, list):
        return False
    return any(
        isinstance(cue, dict)
        and isinstance(cue.get("sourceRefs"), list)
        and bool(cue["sourceRefs"])
        for cue in cues
    )


def _build_image_requests(
    operations: list[dict[str, Any]],
    assignments: list[MediaAssignment],
    asset_role: str,
    summary: SlideRedesignSummary,
) -> list[ImageRequestArtifact]:
    if asset_role not in {"atmosphere", "evidence", "decoration"}:
        return []
    request_asset_role = cast(
        Literal["atmosphere", "evidence", "decoration"], asset_role
    )
    added_media_ids = [
        str(element["elementId"])
        for operation in operations
        if operation.get("type") == "add_element"
        and isinstance((element := operation.get("element")), dict)
        and element.get("role") == "media"
        and isinstance(element.get("elementId"), str)
    ]
    prompt = " ".join(
        part.strip()
        for part in (summary.title, summary.message, summary.media_intent.alt)
        if part.strip()
    )
    alt = summary.media_intent.alt.strip() or summary.title.strip() or summary.message.strip()
    requests: list[ImageRequestArtifact] = []
    for assignment in assignments:
        if not assignment.needs_generation:
            continue
        base_id = assignment.slot.placeholder_element_id
        placeholder_id = next(
            (
                element_id
                for element_id in added_media_ids
                if element_id == base_id or element_id.startswith(f"{base_id}_r")
            ),
            None,
        )
        if placeholder_id is None:
            continue
        requests.append(
            ImageRequestArtifact(
                placeholderElementId=placeholder_id,
                assetRole=request_asset_role,
                needsGeneration=True,
                prompt=prompt or "Presentation visual",
                alt=alt or "Presentation visual",
            )
        )
    return requests


def _insert_supported_ornament_operations(
    operations: list[dict[str, Any]],
    ornaments: list[dict[str, Any]],
    *,
    slide_id: str,
    original_elements: list[dict[str, Any]],
    addable_element_types: set[str],
) -> list[dict[str, Any]]:
    reserved_ids = {
        str(element["elementId"])
        for element in original_elements
        if isinstance(element.get("elementId"), str) and element["elementId"]
    }
    for operation in operations:
        element = operation.get("element")
        if isinstance(element, dict) and isinstance(element.get("elementId"), str):
            reserved_ids.add(str(element["elementId"]))

    additions: list[dict[str, Any]] = []
    for ornament in ornaments:
        if ornament.get("type") not in addable_element_types:
            continue
        element = deepcopy(ornament)
        element_id = str(element["elementId"])
        element["elementId"] = _unique_element_id(element_id, reserved_ids)
        reserved_ids.add(str(element["elementId"]))
        additions.append(
            {"type": "add_element", "slideId": slide_id, "element": element}
        )
    return _insert_operations_before_deletes(operations, additions)


def _insert_operations_before_deletes(
    operations: list[dict[str, Any]],
    additions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    delete_index = next(
        (
            index
            for index, operation in enumerate(operations)
            if operation.get("type") == "delete_element"
        ),
        len(operations),
    )
    return [*operations[:delete_index], *additions, *operations[delete_index:]]


def _unique_element_id(element_id: str, reserved_ids: set[str]) -> str:
    if element_id not in reserved_ids:
        return element_id
    suffix = 2
    while f"{element_id}_r{suffix}" in reserved_ids:
        suffix += 1
    return f"{element_id}_r{suffix}"
