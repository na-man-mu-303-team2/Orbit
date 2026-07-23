from __future__ import annotations

from typing import Any


class MotionMergeValidationError(ValueError):
    pass


def validate_existing_motion_graph(slide: dict[str, Any]) -> None:
    element_ids = {
        str(element.get("elementId"))
        for element in slide.get("elements", [])
        if isinstance(element, dict) and element.get("elementId")
    }
    animations = [
        animation
        for animation in slide.get("animations", [])
        if isinstance(animation, dict)
    ]
    animation_ids: set[str] = set()
    for animation in animations:
        animation_id = str(animation.get("animationId", ""))
        if not animation_id or animation_id in animation_ids:
            raise MotionMergeValidationError("duplicate or missing animation ID")
        animation_ids.add(animation_id)
        if str(animation.get("elementId", "")) not in element_ids:
            raise MotionMergeValidationError("animation target is missing")

    for action in slide.get("actions", []):
        if not isinstance(action, dict):
            continue
        effect = action.get("effect")
        if (
            isinstance(effect, dict)
            and effect.get("kind") == "play-animation"
            and str(effect.get("animationId", "")) not in animation_ids
        ):
            raise MotionMergeValidationError("play-animation action is dangling")

    current_root = False
    for animation in sorted(animations, key=_animation_order):
        start_mode = animation.get("startMode")
        if start_mode in {"on-slide-enter", "on-click", None}:
            current_root = True
            continue
        if start_mode == "after-previous" and not current_root:
            raise MotionMergeValidationError("after-previous animation is orphaned")
        if start_mode not in {"with-previous", "after-previous"}:
            raise MotionMergeValidationError("animation startMode is invalid")


def _animation_order(animation: dict[str, Any]) -> tuple[int, str]:
    value = animation.get("order", 0)
    order = int(value) if isinstance(value, (int, float)) else 0
    return order, str(animation.get("animationId", ""))
