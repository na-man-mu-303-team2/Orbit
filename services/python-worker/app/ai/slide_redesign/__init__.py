"""Fail-closed slide redesign primitives."""

from .safety import (
    MEDIA_ELEMENT_TYPES,
    UNSAFE_ELEMENT_TYPES_BASE,
    ElementConstraints,
    RedesignOutcome,
    can_replace,
    collect_element_constraints,
    find_unsafe_elements,
    normalize_text,
    text_preserved,
    unsafe_element_types,
    unsafe_refusal_message,
)

__all__ = [
    "MEDIA_ELEMENT_TYPES",
    "UNSAFE_ELEMENT_TYPES_BASE",
    "ElementConstraints",
    "RedesignOutcome",
    "can_replace",
    "collect_element_constraints",
    "find_unsafe_elements",
    "normalize_text",
    "text_preserved",
    "unsafe_element_types",
    "unsafe_refusal_message",
]
