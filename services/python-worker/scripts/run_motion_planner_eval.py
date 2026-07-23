from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from app.ai.motion_planner import (
    MotionImportContext,
    MotionPlanningContext,
    NarrativeMotionPlanDraftV3,
    NarrativeMotionPlanV3,
    compile_narrative_motion,
    compile_narrative_motion_v3,
    deterministic_fallback_plan,
    evaluate_motion_eligibility,
    extract_motion_context,
    extract_motion_units,
    plan_narrative_motion,
    plan_narrative_motion_v3,
)

ROOT = Path(__file__).resolve().parents[3]
GOLDEN_PATH = ROOT / "tests" / "fixtures" / "motion-golden" / "slide-types.json"
MANIFEST_PATH = ROOT / "tests" / "fixtures" / "motion-golden" / "eval-manifest.json"
ELIGIBILITY_PATH = ROOT / "tests" / "fixtures" / "motion-eligibility.json"
SEMANTIC_PROCESS_PATH = (
    ROOT
    / "tests"
    / "fixtures"
    / "motion-golden"
    / "semantic-process-v3.json"
)
SYNTHETIC_NOTES = "Synthetic notes for bounded Motion evaluation only."
SAFE_EFFECTS = {"appear", "fade-in", "zoom-in"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run bounded Semantic Motion Planner safety evaluation."
    )
    parser.add_argument(
        "--mode",
        choices=("offline", "live"),
        default="offline",
        help="offline uses deterministic fallback; live calls the pinned model",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = read_json(MANIFEST_PATH)
    golden = read_json(GOLDEN_PATH)
    api_key = os.environ.get("OPENAI_API_KEY") if args.mode == "live" else None
    if args.mode == "live" and not api_key:
        raise SystemExit("OPENAI_API_KEY is required for live Motion evaluation.")

    violations = {name: 0 for name in manifest["safetyInvariants"]}
    fallback_runs = 0
    total_runs = 0
    for case in golden["cases"]:
        slide = case["slide"]
        eligibility = evaluate_motion_eligibility(slide)
        if eligibility.outcome != "applicable":
            violations["unsafeSlideProposal"] += manifest["runsPerFixture"]
            continue
        extraction = extract_motion_context(
            slide,
            MotionPlanningContext.model_validate(
                {
                    "allowedTargetElementIds": eligibility.allowed_target_element_ids,
                    "effectiveTypography": [],
                    "speakerNotes": SYNTHETIC_NOTES,
                    "notesPresent": True,
                    "notesTruncated": False,
                }
            ),
        )
        for _ in range(manifest["runsPerFixture"]):
            total_runs += 1
            if args.mode == "offline":
                plan = deterministic_fallback_plan(extraction)
                fallback_runs += 1
            else:
                plan = plan_narrative_motion(
                    extraction,
                    model=manifest["model"],
                    api_key=api_key,
                ).plan
            try:
                compiled = compile_narrative_motion(
                    deck_id=case["deckId"],
                    slide_id=slide["slideId"],
                    base_version=case["baseVersion"],
                    plan=plan,
                    context=extraction.context,
                ).model_dump(by_alias=True)
            except ValueError:
                violations["compileFailure"] += 1
                continue
            check_compiled(case, compiled, violations)

    semantic_runs = check_semantic_process(
        mode=args.mode,
        api_key=api_key,
        manifest=manifest,
        violations=violations,
    )
    total_runs += semantic_runs
    check_unsafe_matrix(violations)
    report = {
        "model": manifest["model"],
        "mode": args.mode,
        "fixtureVersion": manifest["fixtureVersion"],
        "fixtureCount": len(golden["cases"]) + 1,
        "runsPerFixture": manifest["runsPerFixture"],
        "totalRuns": total_runs,
        "fallbackRuns": fallback_runs,
        "violations": violations,
        "passed": all(count == 0 for count in violations.values()),
    }
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0 if report["passed"] else 1


def check_compiled(
    case: dict[str, Any],
    compiled: dict[str, Any],
    violations: dict[str, int],
) -> None:
    allowed = set(case["expected"]["eligibleTargetIds"])
    excluded = set(case["expected"]["excludedTargetIds"])
    animations = [
        operation["animation"] for operation in compiled["operations"]
    ]
    violations["invalidTarget"] += sum(
        animation["elementId"] not in allowed for animation in animations
    )
    violations["excludedTarget"] += sum(
        animation["elementId"] in excluded for animation in animations
    )
    violations["unsupportedGeneratedEffect"] += sum(
        animation["type"] not in SAFE_EFFECTS for animation in animations
    )
    violations["capViolation"] += int(
        compiled["entryMotionMs"] > 900
        or compiled["maxClickStepMotionMs"] > 1_200
        or compiled["totalMotionMs"] > 6_000
    )
    violations["speakerNotesArtifact"] += int(
        SYNTHETIC_NOTES in json.dumps(compiled, ensure_ascii=False)
    )
    animation_ids = {
        animation["animationId"] for animation in animations
    }
    action_ids = set(case["expected"]["candidateGraph"]["actionAnimationIds"])
    violations["danglingAction"] += len(action_ids - animation_ids)


def check_semantic_process(
    *,
    mode: str,
    api_key: str | None,
    manifest: dict[str, Any],
    violations: dict[str, int],
) -> int:
    fixture = read_json(SEMANTIC_PROCESS_PATH)
    extraction = extract_motion_units(
        fixture["slide"],
        MotionPlanningContext.model_validate(fixture["planningContext"]),
    )
    unit_by_id = {unit.unit_id: unit for unit in extraction.context.units}
    expected_card_ids = [
        unit.unit_id
        for unit in extraction.context.units
        if unit.semantic_role == "card"
    ]
    runs = 0
    for _ in range(manifest["runsPerFixture"]):
        runs += 1
        if mode == "offline":
            draft = NarrativeMotionPlanDraftV3.model_validate(
                fixture["planDraft"]
            )
            plan = NarrativeMotionPlanV3(
                **draft.model_dump(by_alias=True),
                pattern="stepwise-process",
            )
        else:
            plan = plan_narrative_motion_v3(
                extraction,
                model=manifest["model"],
                api_key=api_key,
            ).plan
        try:
            compiled = compile_narrative_motion_v3(
                deck_id="deck_semantic_process",
                slide_id=fixture["slide"]["slideId"],
                base_version=1,
                plan=plan,
                context=extraction.context,
            ).model_dump(by_alias=True)
        except ValueError:
            violations["compileFailure"] += 1
            continue

        operation_target_ids = {
            operation["animation"]["elementId"]
            for operation in compiled["operations"]
        }
        selected_units = [
            unit_by_id[target.unit_id]
            for beat in plan.beats
            for target in beat.targets
        ]
        violations["partialCompositeTarget"] += sum(
            not set(unit.animation_element_ids).issubset(
                operation_target_ids
            )
            for unit in selected_units
        )
        planned_card_ids = [
            target.unit_id
            for beat in plan.beats
            for target in beat.targets
            if target.unit_id in set(expected_card_ids)
        ]
        violations["skippedSequentialUnit"] += int(
            planned_card_ids != expected_card_ids
        )
        violations["patternMismatch"] += int(
            plan.pattern != "stepwise-process"
        )
        violations["unsupportedGeneratedEffect"] += sum(
            operation["animation"]["type"] not in {"appear", "fade-in"}
            for operation in compiled["operations"]
        )
        violations["capViolation"] += int(
            compiled["entryMotionMs"] > 900
            or compiled["maxClickStepMotionMs"] > 1_200
            or compiled["totalMotionMs"] > 6_000
        )
    return runs


def check_unsafe_matrix(violations: dict[str, int]) -> None:
    cases = read_json(ELIGIBILITY_PATH)["cases"]
    unsafe_names = {
        "snapshot import",
        "partial imported main sequence",
        "unknown imported main sequence",
        "missing imported main sequence coverage",
        "activity slide",
        "activity results slide",
    }
    for case in cases:
        if case["name"] not in unsafe_names:
            continue
        slide: dict[str, Any] = {
            "slideId": "slide_eval_unsafe",
            "kind": case["slideKind"],
            "elements": [
                {
                    "elementId": element["elementId"],
                    "type": "text",
                    "role": element.get("role"),
                    "visible": element.get("visible", True),
                }
                for element in case["elements"]
            ],
        }
        import_context = None
        if case["deckSourceType"] == "import" and "importRenderMode" in case:
            import_context = MotionImportContext.model_validate(
                {
                    "renderMode": case["importRenderMode"],
                    "sourceSlidePartPresent": case.get(
                        "sourceSlidePartPresent", False
                    ),
                    "importedMainSequenceCoverage": case.get(
                        "importedMainSequenceCoverage", "unknown"
                    ),
                    "stableTargetElementIds": case.get(
                        "stableTargetElementIds", []
                    ),
                }
            )
        eligibility = evaluate_motion_eligibility(
            slide,
            deck_source_type=case["deckSourceType"],
            import_context=import_context,
        )
        if eligibility.outcome != "refused-unsafe":
            violations["unsafeSlideProposal"] += 1


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Motion eval fixture must be an object: {path.name}")
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
