from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.ai.design_agent import DesignAgentRequest, DesignAgentResponse

from .safety import ElementConstraints, RedesignOutcome
from .slide_extractor import SlideType


class SlideRedesignContentItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    content_item_id: str = Field(alias="contentItemId", min_length=1)
    text: str


class SlideRedesignMediaIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alt: str


class SlideRedesignSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    title: str
    message: str
    content_items: list[SlideRedesignContentItem] = Field(alias="contentItems")
    slide_type: SlideType = Field(alias="slideType")
    visual_intent: dict[str, Any] = Field(alias="visualIntent")
    media_intent: SlideRedesignMediaIntent = Field(alias="mediaIntent")


class ElementConstraintsArtifact(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    referenced_element_ids: list[str] = Field(alias="referencedElementIds")
    locked_element_ids: list[str] = Field(alias="lockedElementIds")
    grouped_element_ids: list[str] = Field(alias="groupedElementIds")
    ooxml_element_ids: list[str] = Field(alias="ooxmlElementIds")

    @classmethod
    def from_constraints(
        cls, constraints: ElementConstraints
    ) -> ElementConstraintsArtifact:
        return cls(
            referencedElementIds=sorted(constraints.referenced_element_ids),
            lockedElementIds=sorted(constraints.locked_element_ids),
            groupedElementIds=sorted(constraints.grouped_element_ids),
            ooxmlElementIds=sorted(constraints.ooxml_element_ids),
        )

    def to_constraints(self) -> ElementConstraints:
        return ElementConstraints(
            referenced_element_ids=frozenset(self.referenced_element_ids),
            locked_element_ids=frozenset(self.locked_element_ids),
            grouped_element_ids=frozenset(self.grouped_element_ids),
            ooxml_element_ids=frozenset(self.ooxml_element_ids),
        )


class InterpretStageArtifact(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    stage: Literal["interpret"] = "interpret"
    outcome: RedesignOutcome
    reason: str | None = None
    slide_type_source: Literal["llm", "heuristic"] | None = Field(
        default=None,
        alias="slideTypeSource",
    )
    summary: SlideRedesignSummary | None = None
    provenance: dict[str, str] = Field(default_factory=dict)
    constraints: ElementConstraintsArtifact | None = None

    @model_validator(mode="after")
    def validate_applicable_artifact(self) -> InterpretStageArtifact:
        if self.outcome == "applicable" and (
            self.summary is None
            or self.constraints is None
            or self.slide_type_source is None
        ):
            raise ValueError("applicable interpret artifact requires stage data")
        return self


class ComposeStageArtifact(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    stage: Literal["compose"] = "compose"
    outcome: RedesignOutcome
    reason: str | None = None
    response: DesignAgentResponse | None = None
    candidate_count: int = Field(default=0, alias="candidateCount", ge=0)
    safe_candidate_count: int = Field(default=0, alias="safeCandidateCount", ge=0)
    chosen_composition_id: str | None = Field(
        default=None,
        alias="chosenCompositionId",
    )
    irreversible_count: int = Field(default=0, alias="irreversibleCount", ge=0)
    ornament_applied: bool = Field(default=False, alias="ornamentApplied")

    @model_validator(mode="after")
    def validate_applicable_artifact(self) -> ComposeStageArtifact:
        if self.outcome == "applicable" and self.response is None:
            raise ValueError("applicable compose artifact requires response")
        if self.safe_candidate_count > self.candidate_count:
            raise ValueError("safeCandidateCount cannot exceed candidateCount")
        return self


class VerifyStageArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: Literal["verify"] = "verify"
    outcome: RedesignOutcome
    reason: str | None = None
    response: DesignAgentResponse | None = None

    @model_validator(mode="after")
    def validate_applicable_artifact(self) -> VerifyStageArtifact:
        if self.outcome == "applicable" and self.response is None:
            raise ValueError("applicable verify artifact requires response")
        return self


SlideRedesignStageArtifact = Annotated[
    InterpretStageArtifact | ComposeStageArtifact | VerifyStageArtifact,
    Field(discriminator="stage"),
]


class InterpretStageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: Literal["interpret"]
    request: DesignAgentRequest


class ComposeStageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: Literal["compose"]
    request: DesignAgentRequest
    artifact: InterpretStageArtifact


class VerifyStageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: Literal["verify"]
    request: DesignAgentRequest
    artifact: ComposeStageArtifact


SlideRedesignStageRequest = Annotated[
    InterpretStageRequest | ComposeStageRequest | VerifyStageRequest,
    Field(discriminator="stage"),
]
SlideRedesignStageResponse = (
    InterpretStageArtifact | ComposeStageArtifact | VerifyStageArtifact
)
