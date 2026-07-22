from __future__ import annotations

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

SlideType = Literal[
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
NarrativeIntent = Literal[
    "orient", "sequence", "contrast", "explain-data", "emphasize", "summarize"
]
MotionSemanticRole = Literal[
    "title",
    "subtitle",
    "body",
    "focal",
    "media",
    "data",
    "label",
    "supporting",
    "other",
]


class MotionEffectiveTypography(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    element_id: str = Field(alias="elementId", min_length=1)
    character_count: int = Field(alias="characterCount", ge=0)
    dominant_font_size: float = Field(alias="dominantFontSize", ge=0)
    effective_font_size: float = Field(alias="effectiveFontSize", ge=0)
    effective_letter_spacing: float = Field(alias="effectiveLetterSpacing")
    effective_line_height: float = Field(alias="effectiveLineHeight", ge=0)
    resolved_font_scale: float = Field(alias="resolvedFontScale", gt=0, le=1)


class MotionPlanningContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    allowed_target_element_ids: list[str] = Field(
        alias="allowedTargetElementIds", max_length=200
    )
    effective_typography: list[MotionEffectiveTypography] = Field(
        alias="effectiveTypography", max_length=200
    )
    speaker_notes: str = Field(alias="speakerNotes", max_length=4_000)
    notes_present: bool = Field(alias="notesPresent")
    notes_truncated: bool = Field(alias="notesTruncated")


class MotionTarget(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    element_id: str = Field(alias="elementId", min_length=1)
    semantic_role: MotionSemanticRole = Field(alias="semanticRole")
    group_id: str | None = Field(default=None, alias="groupId")
    reading_order: int = Field(alias="readingOrder", ge=1, le=200)
    emphasis: Literal["primary", "secondary", "supporting"]
    geometry_bucket: Literal["top", "left", "center", "right", "bottom"] = Field(
        alias="geometryBucket"
    )


class ExtractedMotionContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    slide_type: SlideType = Field(alias="slideType")
    narrative_intent: NarrativeIntent = Field(alias="narrativeIntent")
    targets: list[MotionTarget] = Field(max_length=8)
    approved_cue_count: int = Field(alias="approvedCueCount", ge=0, le=100)
    notes_present: bool = Field(alias="notesPresent")
    notes_truncated: bool = Field(alias="notesTruncated")


class NarrativeBeat(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    beat_id: str = Field(alias="beatId", pattern=r"^beat_[a-z0-9_-]{1,32}$")
    purpose: Literal[
        "orient", "reveal", "connect", "contrast", "emphasize", "conclude"
    ]
    trigger: Literal["entry", "click"]
    target_element_ids: list[str] = Field(
        alias="targetElementIds", min_length=1, max_length=4
    )
    relation: Literal["together", "sequence"]

    @model_validator(mode="after")
    def reject_duplicate_targets(self) -> Self:
        if len(set(self.target_element_ids)) != len(self.target_element_ids):
            raise ValueError("NarrativeBeat targetElementIds must be unique")
        return self


class NarrativeMotionPlan(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    schema_version: Literal[1] = Field(alias="schemaVersion")
    pattern: Literal[
        "hero-then-support",
        "stepwise-process",
        "paired-comparison",
        "evidence-then-insight",
        "cluster-reveal",
        "summary-recap",
    ]
    beats: list[NarrativeBeat] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def enforce_caps(self) -> Self:
        entry_beats = [beat for beat in self.beats if beat.trigger == "entry"]
        click_beats = [beat for beat in self.beats if beat.trigger == "click"]
        if len(entry_beats) > 1:
            raise ValueError("NarrativeMotionPlan allows at most one entry beat")
        if entry_beats and len(entry_beats[0].target_element_ids) > 2:
            raise ValueError("NarrativeMotionPlan entry beat allows at most two targets")
        if len(click_beats) > 4:
            raise ValueError("NarrativeMotionPlan allows at most four click beats")
        targets = [
            element_id
            for beat in self.beats
            for element_id in beat.target_element_ids
        ]
        if len(targets) > 8:
            raise ValueError("NarrativeMotionPlan allows at most eight targets")
        if len(set(targets)) != len(targets):
            raise ValueError("NarrativeMotionPlan target IDs must not repeat")
        return self

    def validate_allowlist(self, allowed_target_element_ids: set[str]) -> Self:
        targets = {
            element_id
            for beat in self.beats
            for element_id in beat.target_element_ids
        }
        if not targets.issubset(allowed_target_element_ids):
            raise ValueError("NarrativeMotionPlan contains a non-allowlisted target")
        return self
