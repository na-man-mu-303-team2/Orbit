from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

import pytest

from app.ai.motion_planner import (
    MotionPlanningContext,
    compile_narrative_motion,
    deterministic_fallback_plan,
    evaluate_motion_eligibility,
    extract_motion_context,
)
from app.ai.pptx_motion import (
    PML_NS,
    parse_main_sequence,
    serialize_slide_motion,
)

ROOT = Path(__file__).resolve().parents[3]
GOLDEN_PATH = ROOT / "tests" / "fixtures" / "motion-golden" / "slide-types.json"
ELIGIBILITY_PATH = ROOT / "tests" / "fixtures" / "motion-eligibility.json"
SYNTHETIC_NOTES_SENTINEL = "MOTION_GOLDEN_PRIVATE_SENTINEL"
SAFE_EFFECTS = {"appear", "fade-in", "zoom-in"}


def golden_manifest() -> dict[str, Any]:
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def golden_cases() -> list[dict[str, Any]]:
    return golden_manifest()["cases"]


def evaluate_case(case: dict[str, Any]) -> tuple[Any, Any, Any, Any]:
    slide = case["slide"]
    eligibility = evaluate_motion_eligibility(slide)
    extraction = extract_motion_context(
        slide,
        MotionPlanningContext.model_validate(
            {
                "allowedTargetElementIds": eligibility.allowed_target_element_ids,
                "effectiveTypography": [],
                "speakerNotes": SYNTHETIC_NOTES_SENTINEL,
                "notesPresent": True,
                "notesTruncated": False,
            }
        ),
    )
    plan = deterministic_fallback_plan(extraction)
    compiled = compile_narrative_motion(
        deck_id=case["deckId"],
        slide_id=slide["slideId"],
        base_version=case["baseVersion"],
        plan=plan,
        context=extraction.context,
    )
    return eligibility, extraction, plan, compiled


@pytest.mark.parametrize("case", golden_cases(), ids=lambda case: case["fixtureId"])
def test_authored_golden_matches_extractor_plan_compiler_and_graph(
    case: dict[str, Any],
) -> None:
    expected = case["expected"]
    eligibility, extraction, plan, compiled = evaluate_case(case)
    compiled_payload = compiled.model_dump(by_alias=True)
    animations = [
        operation["animation"] for operation in compiled_payload["operations"]
    ]

    assert eligibility.outcome == "applicable"
    assert eligibility.allowed_target_element_ids == expected["eligibleTargetIds"]
    assert set(expected["excludedTargetIds"]).isdisjoint(
        eligibility.allowed_target_element_ids
    )
    assert extraction.context.slide_type == expected["slideType"]
    assert extraction.context.narrative_intent == expected["narrativeIntent"]
    assert plan.model_dump(by_alias=True) == expected["plan"]
    assert compiled_payload == expected["compiled"]
    assert _candidate_graph(animations) == expected["candidateGraph"]
    assert _timeline_snapshot(animations, compiled.total_motion_ms) == expected[
        "timeline"
    ]
    assert expected["stableHash"] == {
        "compilerVersion": compiled.compiler_version,
        "animationIds": [animation["animationId"] for animation in animations],
    }
    assert {animation["type"] for animation in animations} <= SAFE_EFFECTS
    assert SYNTHETIC_NOTES_SENTINEL not in json.dumps(
        {"plan": expected["plan"], "compiled": compiled_payload},
        ensure_ascii=False,
    )


@pytest.mark.parametrize("case", golden_cases(), ids=lambda case: case["fixtureId"])
def test_offline_baseline_eval_is_stable_for_five_runs(case: dict[str, Any]) -> None:
    _, extraction, _, _ = evaluate_case(case)
    runs = []
    for _ in range(5):
        plan = deterministic_fallback_plan(extraction)
        compiled = compile_narrative_motion(
            deck_id=case["deckId"],
            slide_id=case["slide"]["slideId"],
            base_version=case["baseVersion"],
            plan=plan,
            context=extraction.context,
        )
        payload = compiled.model_dump(by_alias=True)
        assert _safety_violations(case, payload) == []
        runs.append(payload)

    assert all(run == runs[0] for run in runs)
    assert runs[0] == case["expected"]["compiled"]


@pytest.mark.parametrize("case", golden_cases(), ids=lambda case: case["fixtureId"])
def test_pptx_round_trip_preserves_motion_semantics(case: dict[str, Any]) -> None:
    animations = [
        operation["animation"]
        for operation in case["expected"]["compiled"]["operations"]
    ]
    element_targets = {
        animation["elementId"]: [str(index)]
        for index, animation in enumerate(animations, start=2)
    }
    shape_targets = {
        shape_id: element_id
        for element_id, shape_ids in element_targets.items()
        for shape_id in shape_ids
    }
    serialized = serialize_slide_motion(
        copy.deepcopy(animations),
        slide_index=1,
        element_targets=element_targets,
    )

    assert serialized.diagnostics == []
    assert serialized.timing is not None
    slide = ET.Element(f"{{{PML_NS}}}sld")
    ET.SubElement(slide, f"{{{PML_NS}}}cSld")
    slide.append(copy.deepcopy(serialized.timing))
    parsed, coverage, diagnostics = parse_main_sequence(
        slide,
        slide_index=1,
        shape_targets=shape_targets,
    )

    assert coverage == "complete"
    assert diagnostics == []
    assert _semantic_motion(parsed) == _semantic_motion(animations)


def test_golden_manifest_and_import_matrix_cover_release_axes() -> None:
    manifest = golden_manifest()
    assert manifest == {
        **manifest,
        "fixtureVersion": 1,
        "plannerSchemaVersion": 2,
        "compilerVersion": "motion-compiler-v2",
        "syntheticNotesOnly": True,
    }
    assert [case["expected"]["slideType"] for case in manifest["cases"]] == [
        "cover",
        "title",
        "problem",
        "solution",
        "feature-grid",
        "process",
        "architecture",
        "data",
        "chart",
        "comparison",
        "quote",
        "summary",
    ]
    eligibility_cases = json.loads(
        ELIGIBILITY_PATH.read_text(encoding="utf-8")
    )["cases"]
    names = {case["name"] for case in eligibility_cases}
    assert {
        "snapshot import",
        "partial imported main sequence",
        "unknown imported main sequence",
        "missing imported main sequence coverage",
        "editable import with authoritative target",
        "hybrid import filters unstable targets",
        "activity slide",
        "activity results slide",
    } <= names


def _candidate_graph(animations: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "animationIds": [animation["animationId"] for animation in animations],
        "actionAnimationIds": [],
    }


def _timeline_snapshot(
    animations: list[dict[str, Any]], total_duration_ms: int
) -> dict[str, Any]:
    return {
        "entryRoots": [
            animation["animationId"]
            for animation in animations
            if animation["startMode"] == "on-slide-enter"
        ],
        "clickRoots": [
            animation["animationId"]
            for animation in animations
            if animation["startMode"] == "on-click"
        ],
        "totalDurationMs": total_duration_ms,
    }


def _semantic_motion(animations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "elementId": animation["elementId"],
            "type": animation["type"],
            "startMode": animation["startMode"],
            "durationMs": animation["durationMs"],
            "delayMs": animation["delayMs"],
        }
        for animation in animations
    ]


def _safety_violations(
    case: dict[str, Any], compiled: dict[str, Any]
) -> list[str]:
    allowed = set(case["expected"]["eligibleTargetIds"])
    excluded = set(case["expected"]["excludedTargetIds"])
    operations = compiled["operations"]
    animations = [operation["animation"] for operation in operations]
    violations: list[str] = []
    if any(animation["elementId"] not in allowed for animation in animations):
        violations.append("invalid-target")
    if any(animation["elementId"] in excluded for animation in animations):
        violations.append("excluded-target")
    if any(animation["type"] not in SAFE_EFFECTS for animation in animations):
        violations.append("unsupported-effect")
    if compiled["entryMotionMs"] > 900:
        violations.append("entry-cap")
    if compiled["maxClickStepMotionMs"] > 1_200:
        violations.append("click-cap")
    if compiled["totalMotionMs"] > 6_000:
        violations.append("total-cap")
    if SYNTHETIC_NOTES_SENTINEL in json.dumps(compiled, ensure_ascii=False):
        violations.append("notes-artifact")
    return violations
