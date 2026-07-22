from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from app.ai.motion_planner import (
    MotionImportContext,
    MotionPlanningContext,
    compile_narrative_motion,
    evaluate_motion_eligibility,
    extract_motion_context,
    plan_narrative_motion,
)

ROOT = Path(__file__).resolve().parents[3]
GOLDEN_PATH = ROOT / "tests" / "fixtures" / "motion-golden" / "slide-types.json"
MANIFEST_PATH = ROOT / "tests" / "fixtures" / "motion-golden" / "eval-manifest.json"
ELIGIBILITY_PATH = ROOT / "tests" / "fixtures" / "motion-eligibility.json"
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
            planner = plan_narrative_motion(
                extraction,
                model=manifest["model"],
                api_key=api_key,
            )
            fallback_runs += int(planner.fallback_used)
            try:
                compiled = compile_narrative_motion(
                    deck_id=case["deckId"],
                    slide_id=slide["slideId"],
                    base_version=case["baseVersion"],
                    plan=planner.plan,
                    context=extraction.context,
                ).model_dump(by_alias=True)
            except ValueError:
                violations["compileFailure"] += 1
                continue
            check_compiled(case, compiled, violations)

    check_unsafe_matrix(violations)
    report = {
        "model": manifest["model"],
        "mode": args.mode,
        "fixtureVersion": manifest["fixtureVersion"],
        "fixtureCount": len(golden["cases"]),
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
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    raise SystemExit(main())
