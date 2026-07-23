from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.ai.motion_planner import MotionImportContext, evaluate_motion_eligibility

FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "motion-eligibility.json"
)


def _fixture_cases() -> list[dict[str, Any]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", _fixture_cases(), ids=lambda case: case["name"])
def test_motion_eligibility_matches_shared_fixture(case: dict[str, Any]) -> None:
    slide: dict[str, Any] = {
        "slideId": "slide_1",
        "kind": case["slideKind"],
        "elements": [
            {
                "elementId": element["elementId"],
                "type": "text",
                "role": element.get("role"),
                "visible": element.get("visible", True),
                "locked": element.get("locked", False),
                "opacity": element.get("opacity", 1),
            }
            for element in case["elements"]
        ],
    }
    if "importRenderMode" in case:
        slide["importRenderMode"] = case["importRenderMode"]
    if case.get("sourceSlidePartPresent"):
        slide["ooxmlSourceSlidePart"] = "ppt/slides/slide1.xml"
    if "importedMainSequenceCoverage" in case:
        slide["ooxmlMotionCapabilities"] = {
            "importedMainSequenceCoverage": case[
                "importedMainSequenceCoverage"
            ]
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

    result = evaluate_motion_eligibility(
        slide,
        deck_source_type=case["deckSourceType"],
        import_context=import_context,
    )
    assert result.model_dump(
        by_alias=True, exclude_none=True, exclude_defaults=True
    ) == case["expected"]


def test_imported_editable_without_internal_context_fails_closed() -> None:
    result = evaluate_motion_eligibility(
        {
            "slideId": "slide_1",
            "kind": "content",
            "importRenderMode": "editable",
            "ooxmlSourceSlidePart": "ppt/slides/slide1.xml",
            "ooxmlMotionCapabilities": {
                "importedMainSequenceCoverage": "complete"
            },
            "elements": [
                {
                    "elementId": "el_body",
                    "type": "text",
                    "role": "body",
                    "visible": True,
                    "locked": False,
                    "opacity": 1,
                }
            ],
        }
    )

    assert result.outcome == "refused-unsafe"
    assert result.reason_code == "NO_STABLE_TARGETS"
