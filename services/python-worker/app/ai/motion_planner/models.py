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
MotionIntent = Literal[
    "introduce",
    "reveal",
    "focus",
    "support",
    "compare",
    "connect",
    "conclude",
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
MotionUnitKind = Literal["element", "explicit-group", "spatial-cluster"]
MotionUnitSemanticRole = Literal[
    "title",
    "subtitle",
    "body",
    "card",
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


class MotionUnit(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    unit_id: str = Field(alias="unitId", pattern=r"^motion_unit_[a-z0-9_-]{1,160}$")
    kind: MotionUnitKind
    animation_element_ids: list[str] = Field(
        alias="animationElementIds", min_length=1, max_length=4
    )
    member_element_ids: list[str] = Field(
        alias="memberElementIds", min_length=1, max_length=8
    )
    semantic_role: MotionUnitSemanticRole = Field(alias="semanticRole")
    reading_order: int = Field(alias="readingOrder", ge=1, le=200)
    emphasis: Literal["primary", "secondary", "supporting"]
    geometry_bucket: Literal["top", "left", "center", "right", "bottom"] = Field(
        alias="geometryBucket"
    )

    @model_validator(mode="after")
    def reject_duplicate_elements(self) -> Self:
        if len(set(self.animation_element_ids)) != len(self.animation_element_ids):
            raise ValueError("MotionUnit animation element IDs must be unique")
        if len(set(self.member_element_ids)) != len(self.member_element_ids):
            raise ValueError("MotionUnit member element IDs must be unique")
        return self


class ExtractedMotionContextV3(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    slide_type: SlideType = Field(alias="slideType")
    narrative_intent: NarrativeIntent = Field(alias="narrativeIntent")
    units: list[MotionUnit] = Field(max_length=8)
    approved_cue_count: int = Field(alias="approvedCueCount", ge=0, le=100)
    notes_present: bool = Field(alias="notesPresent")
    notes_truncated: bool = Field(alias="notesTruncated")


class MotionPlanTarget(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    element_id: str = Field(alias="elementId", min_length=1)
    motion_intent: MotionIntent = Field(alias="motionIntent")


class NarrativeBeat(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    beat_id: str = Field(alias="beatId", pattern=r"^beat_[a-z0-9_-]{1,32}$")
    purpose: Literal[
        "orient", "reveal", "connect", "contrast", "emphasize", "conclude"
    ]
    trigger: Literal["entry", "click"]
    relation: Literal["together", "sequence"]
    targets: list[MotionPlanTarget] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def reject_duplicate_targets(self) -> Self:
        target_ids = self.target_element_ids
        if len(set(target_ids)) != len(target_ids):
            raise ValueError("NarrativeBeat target IDs must be unique")
        return self

    @property
    def target_element_ids(self) -> list[str]:
        return [target.element_id for target in self.targets]


class NarrativeMotionPlan(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    schema_version: Literal[2] = Field(alias="schemaVersion")
    pattern: Literal[
        "hero-then-support",
        "stepwise-process",
        "paired-comparison",
        "evidence-then-insight",
        "cluster-reveal",
        "summary-recap",
    ]
    pacing: Literal["deliberate", "balanced", "brisk"]
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


class MotionPlanMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    source: Literal["llm"] = "llm"
    model: str = Field(min_length=1, max_length=200)
    attempt_count: Literal[1, 2] = Field(alias="attemptCount")
    compiler_version: Literal["motion-compiler-v2"] = Field(alias="compilerVersion")
    plan: NarrativeMotionPlan


class MotionPlanUnitTarget(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    unit_id: str = Field(alias="unitId", pattern=r"^motion_unit_[a-z0-9_-]{1,160}$")
    motion_intent: MotionIntent = Field(alias="motionIntent")


class NarrativeBeatV3(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    beat_id: str = Field(alias="beatId", pattern=r"^beat_[a-z0-9_-]{1,32}$")
    purpose: Literal[
        "orient", "reveal", "connect", "contrast", "emphasize", "conclude"
    ]
    trigger: Literal["entry", "click"]
    relation: Literal["together", "sequence"]
    targets: list[MotionPlanUnitTarget] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def reject_duplicate_targets(self) -> Self:
        if len(set(self.target_unit_ids)) != len(self.target_unit_ids):
            raise ValueError("NarrativeBeatV3 target unit IDs must be unique")
        return self

    @property
    def target_unit_ids(self) -> list[str]:
        return [target.unit_id for target in self.targets]


class NarrativeMotionPlanDraftV3(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    schema_version: Literal[3] = Field(alias="schemaVersion")
    pacing: Literal["deliberate", "balanced", "brisk"]
    beats: list[NarrativeBeatV3] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def enforce_caps(self) -> Self:
        entry_beats = [beat for beat in self.beats if beat.trigger == "entry"]
        click_beats = [beat for beat in self.beats if beat.trigger == "click"]
        if len(entry_beats) > 1:
            raise ValueError("NarrativeMotionPlanDraftV3 allows at most one entry beat")
        if entry_beats and len(entry_beats[0].target_unit_ids) > 2:
            raise ValueError(
                "NarrativeMotionPlanDraftV3 entry beat allows at most two units"
            )
        if len(click_beats) > 5:
            raise ValueError(
                "NarrativeMotionPlanDraftV3 allows at most five click beats"
            )
        unit_ids = [
            unit_id for beat in self.beats for unit_id in beat.target_unit_ids
        ]
        if len(unit_ids) > 8:
            raise ValueError("NarrativeMotionPlanDraftV3 allows at most eight units")
        if len(set(unit_ids)) != len(unit_ids):
            raise ValueError(
                "NarrativeMotionPlanDraftV3 unit IDs must not repeat"
            )
        beat_ids = [beat.beat_id for beat in self.beats]
        if len(set(beat_ids)) != len(beat_ids):
            raise ValueError("NarrativeMotionPlanDraftV3 beat IDs must not repeat")
        return self

    def validate_allowlist(self, allowed_unit_ids: set[str]) -> Self:
        unit_ids = {
            unit_id for beat in self.beats for unit_id in beat.target_unit_ids
        }
        if not unit_ids.issubset(allowed_unit_ids):
            raise ValueError(
                "NarrativeMotionPlanDraftV3 contains a non-allowlisted unit"
            )
        return self


class NarrativeMotionPlanV3(NarrativeMotionPlanDraftV3):
    pattern: Literal[
        "hero-then-support",
        "stepwise-process",
        "paired-comparison",
        "evidence-then-insight",
        "cluster-reveal",
        "summary-recap",
    ]

    def validate_canonical_structure(
        self, units: list[MotionUnit]
    ) -> NarrativeMotionPlanV3:
        if self.pattern != "stepwise-process":
            return self

        ordered_units = sorted(units, key=lambda unit: unit.reading_order)
        cards = [unit for unit in ordered_units if unit.semantic_role == "card"]
        if not cards or len(cards) > 6:
            raise ValueError("Process plans require between one and six card units")

        entry_beats = [beat for beat in self.beats if beat.trigger == "entry"]
        click_beats = [beat for beat in self.beats if beat.trigger == "click"]
        if len(entry_beats) != 1:
            raise ValueError("Process plans require exactly one entry beat")
        entry_ids = entry_beats[0].target_unit_ids

        titles = [unit for unit in ordered_units if unit.semantic_role == "title"]
        if titles and titles[0].unit_id not in entry_ids:
            raise ValueError("Process plans must introduce the title on entry")

        first_card_order = cards[0].reading_order
        last_card_order = cards[-1].reading_order
        trailing_units = [
            unit
            for unit in ordered_units
            if unit.reading_order > last_card_order
        ]
        leading_non_card_ids = {
            unit.unit_id
            for unit in ordered_units
            if unit.reading_order < first_card_order
            and unit.semantic_role != "card"
        }
        if not set(entry_ids).issubset(leading_non_card_ids | {cards[0].unit_id}):
            raise ValueError(
                "Process entry may only contain leading context and the first card"
            )

        if len(cards) <= 5:
            if len(click_beats) != len(cards):
                raise ValueError("Process plans require one click beat per card")
            if any(card.unit_id in entry_ids for card in cards):
                raise ValueError("One-to-five-step process cards must start on click")
            expected_click_cards = cards
        else:
            if len(click_beats) != 5 or cards[0].unit_id not in entry_ids:
                raise ValueError(
                    "Six-step process plans require the first card on entry"
                )
            expected_click_cards = cards[1:]

        for beat, card in zip(click_beats, expected_click_cards, strict=True):
            card_ids = [
                unit_id
                for unit_id in beat.target_unit_ids
                if unit_id in {candidate.unit_id for candidate in cards}
            ]
            if card_ids != [card.unit_id]:
                raise ValueError(
                    "Process card units must appear exactly once in reading order"
                )

        if trailing_units:
            final_ids = click_beats[-1].target_unit_ids
            expected_trailing_ids = [unit.unit_id for unit in trailing_units]
            if final_ids[-len(expected_trailing_ids) :] != expected_trailing_ids:
                raise ValueError(
                    "Process trailing units must follow the final card"
                )

        selected_ids = [
            unit_id for beat in self.beats for unit_id in beat.target_unit_ids
        ]
        expected_card_ids = [card.unit_id for card in cards]
        if [
            unit_id for unit_id in selected_ids if unit_id in set(expected_card_ids)
        ] != expected_card_ids:
            raise ValueError(
                "Process card units must appear exactly once in reading order"
            )
        return self


class MotionPlanMetadataV3(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    source: Literal["llm"] = "llm"
    model: str = Field(min_length=1, max_length=200)
    attempt_count: Literal[1, 2] = Field(alias="attemptCount")
    compiler_version: Literal["motion-compiler-v3"] = Field(alias="compilerVersion")
    units: list[MotionUnit] = Field(min_length=1, max_length=8)
    plan: NarrativeMotionPlanV3
