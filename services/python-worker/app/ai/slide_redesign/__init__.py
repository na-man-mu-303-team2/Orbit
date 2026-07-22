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
from .slide_extractor import (
    ExtractedSlide,
    ExtractedText,
    SlideHierarchy,
    SlideType,
    classify_slide_type,
    collect_text_elements,
    extract_slide,
    infer_hierarchy,
    heuristic_slide_type,
    split_bullets,
)
from .palette import derive_palette, ensure_palette_contrast
from .composer import (
    CompositionCandidate,
    build_single_slide_program,
    compile_redesign,
    eligible_candidates,
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
    "ExtractedSlide",
    "ExtractedText",
    "SlideHierarchy",
    "SlideType",
    "classify_slide_type",
    "collect_text_elements",
    "extract_slide",
    "infer_hierarchy",
    "heuristic_slide_type",
    "split_bullets",
    "derive_palette",
    "ensure_palette_contrast",
    "CompositionCandidate",
    "build_single_slide_program",
    "compile_redesign",
    "eligible_candidates",
]
