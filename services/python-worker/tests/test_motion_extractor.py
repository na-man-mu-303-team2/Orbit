from __future__ import annotations

import json
from pathlib import Path

from app.ai.motion_planner import MotionPlanningContext, extract_motion_context

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "motion-extractor"
    / "semantic-slide.json"
)


def test_extractor_prefers_approved_current_cues_and_explicit_roles() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    extraction = extract_motion_context(
        fixture["slide"],
        MotionPlanningContext.model_validate(fixture["planningContext"]),
    )
    by_id = {target.element_id: target for target in extraction.context.targets}

    assert extraction.context.approved_cue_count == 1
    assert by_id["el_title"].semantic_role == "title"
    assert by_id["el_title"].reading_order == 1
    assert by_id["el_body"].emphasis == "primary"
    assert by_id["el_focal"].semantic_role == "focal"
    assert by_id["el_focal"].emphasis == "primary"
    assert extraction.context.slide_type == "solution"


def test_extracted_context_never_contains_text_or_notes() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    extraction = extract_motion_context(
        fixture["slide"],
        MotionPlanningContext.model_validate(fixture["planningContext"]),
    )

    serialized = extraction.context.model_dump_json(by_alias=True)
    assert "핵심 의미를 먼저" not in serialized
    assert "작아도 명시적 제목" not in serialized
    assert len(extraction.speaker_notes) <= 4_000
