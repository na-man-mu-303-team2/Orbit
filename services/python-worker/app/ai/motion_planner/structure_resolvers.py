from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal

from app.ai.motion_planner.models import MotionUnitSemanticRole

MotionStructureFamily = Literal[
    "timeline",
    "feature-comparison",
    "diagram-hub",
]


class MotionStructureResolutionError(ValueError):
    def __init__(
        self,
        structure_family: MotionStructureFamily,
        reason: str,
    ) -> None:
        super().__init__(f"{structure_family}: {reason}")
        self.structure_family = structure_family
        self.reason = reason


@dataclass(frozen=True)
class ResolvedMotionSlot:
    slot_id: str
    order: int
    member_element_ids: tuple[str, ...]
    frame_element_id: str
    semantic_role: MotionUnitSemanticRole


@dataclass(frozen=True)
class ResolvedMotionStructure:
    family: MotionStructureFamily
    slots: tuple[ResolvedMotionSlot, ...]


MotionStructureResolver = Callable[
    [dict[str, Any], list[dict[str, Any]]],
    ResolvedMotionStructure,
]

STRUCTURE_RESOLVERS: dict[str, MotionStructureResolver] = {}


def register_structure_resolver(
    composition_id: str,
) -> Callable[[MotionStructureResolver], MotionStructureResolver]:
    def decorator(resolver: MotionStructureResolver) -> MotionStructureResolver:
        if composition_id in STRUCTURE_RESOLVERS:
            raise ValueError(
                f"Motion structure resolver already registered: {composition_id}"
            )
        STRUCTURE_RESOLVERS[composition_id] = resolver
        return resolver

    return decorator


def resolve_motion_structure(
    slide: dict[str, Any],
    elements: list[dict[str, Any]],
) -> ResolvedMotionStructure | None:
    composition_id = _composition_id(slide)
    resolver = STRUCTURE_RESOLVERS.get(composition_id)
    return resolver(slide, elements) if resolver is not None else None


def _composition_id(slide: dict[str, Any]) -> str:
    ai_notes = slide.get("aiNotes")
    if not isinstance(ai_notes, dict):
        return ""
    composition = ai_notes.get("compositionPlan")
    if not isinstance(composition, dict):
        return ""
    return str(composition.get("compositionId", ""))
