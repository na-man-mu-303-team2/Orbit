from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal


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

CANVAS_HEIGHT = 1080
BOTTOM_LEFTOVER_Y = CANVAS_HEIGHT * 0.88


@dataclass(frozen=True)
class ExtractedText:
    element_id: str
    text: str
    role: str | None
    font_size: float
    x: float
    y: float
    z_index: int
    height: float


@dataclass(frozen=True)
class SlideHierarchy:
    title: ExtractedText | None
    message: ExtractedText | None
    items: list[ExtractedText]
    leftovers: list[ExtractedText]


@dataclass(frozen=True)
class ExtractedSlide:
    summary: dict[str, Any]
    provenance: dict[str, str]
    hierarchy: SlideHierarchy


def collect_text_elements(slide: dict[str, Any]) -> list[ExtractedText]:
    """Collect visible text elements without mutating the source Slide."""
    texts: list[ExtractedText] = []
    for element in slide.get("elements", []):
        if (
            not isinstance(element, dict)
            or element.get("type") != "text"
            or element.get("visible") is False
        ):
            continue
        element_id = element.get("elementId")
        props = element.get("props")
        if not isinstance(element_id, str) or not isinstance(props, dict):
            continue
        value = "\n".join(
            line
            for raw_line in str(props.get("text", "")).splitlines()
            if (line := " ".join(raw_line.split()))
        )
        if not value:
            continue
        role = element.get("role")
        texts.append(
            ExtractedText(
                element_id=element_id,
                text=value,
                role=role if isinstance(role, str) else None,
                font_size=_number(props.get("fontSize"), 24),
                x=_number(element.get("x"), 0),
                y=_number(element.get("y"), 0),
                z_index=int(_number(element.get("zIndex"), 0)),
                height=max(_number(element.get("height"), 0), 1),
            )
        )
    return texts


def infer_hierarchy(texts: list[ExtractedText]) -> SlideHierarchy:
    """Infer title, message, body reading order, and excluded leftovers."""
    title: ExtractedText | None = None
    message: ExtractedText | None = None
    items: list[ExtractedText] = []
    leftovers: list[ExtractedText] = []
    unassigned: list[ExtractedText] = []

    for text in sorted(texts, key=lambda item: (item.y, item.x, item.z_index)):
        if text.role == "footer" or (
            text.y >= BOTTOM_LEFTOVER_Y and text.font_size <= 20
        ):
            leftovers.append(text)
        elif text.role == "title" and title is None:
            title = text
        elif text.role in {"highlight", "subtitle"} and message is None:
            message = text
        elif text.role in {"body", "caption"}:
            items.append(text)
        elif text.role is None:
            unassigned.append(text)
        else:
            items.append(text)

    unassigned.sort(key=lambda item: (-item.font_size, item.y, item.x))
    if title is None and unassigned:
        title = unassigned.pop(0)
    if message is None and unassigned:
        title_size = title.font_size if title is not None else 0
        if unassigned[0].font_size >= title_size * 0.5:
            message = unassigned.pop(0)
    items.extend(unassigned)

    return SlideHierarchy(
        title=title,
        message=message,
        items=_reading_order(items),
        leftovers=_reading_order(leftovers),
    )


def split_bullets(text: str) -> list[str]:
    """Split a bullet list while leaving ordinary multiline copy intact."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    bullet_pattern = re.compile(r"^(?:[•●▪◦‣⁃\-–—]|\d+[.)]|[①-⑳])\s*")
    if len(lines) > 1 and any(bullet_pattern.match(line) for line in lines):
        return [
            cleaned
            for line in lines
            if (cleaned := bullet_pattern.sub("", line).strip())
        ]
    return [" ".join(text.split())]


def extract_slide(
    slide: dict[str, Any], *, slide_type: SlideType, hierarchy: SlideHierarchy
) -> ExtractedSlide:
    """Build a composition summary and an internal-only provenance map."""
    content_items: list[dict[str, str]] = []
    provenance: dict[str, str] = {}
    for item in hierarchy.items:
        for segment_index, segment in enumerate(split_bullets(item.text), start=1):
            content_item_id = f"{item.element_id}::segment::{segment_index}"
            if content_item_id in provenance:
                raise ValueError(f"duplicate contentItemId: {content_item_id}")
            content_items.append(
                {"contentItemId": content_item_id, "text": segment}
            )
            provenance[content_item_id] = item.element_id

    summary = {
        "title": hierarchy.title.text if hierarchy.title is not None else "",
        "message": hierarchy.message.text if hierarchy.message is not None else "",
        "contentItems": content_items,
        "slideType": slide_type,
        "visualIntent": {},
        "mediaIntent": {"alt": ""},
    }
    return ExtractedSlide(
        summary=summary,
        provenance=provenance,
        hierarchy=hierarchy,
    )


def _reading_order(texts: list[ExtractedText]) -> list[ExtractedText]:
    if len(texts) < 2:
        return list(texts)
    average_height = sum(text.height for text in texts) / len(texts)
    band_gap = average_height * 0.6
    bands: list[list[ExtractedText]] = []
    for text in sorted(texts, key=lambda item: (item.y, item.x)):
        if not bands or text.y - bands[-1][-1].y > band_gap:
            bands.append([text])
        else:
            bands[-1].append(text)
    return [
        text
        for band in bands
        for text in sorted(band, key=lambda item: (item.x, item.y, item.z_index))
    ]


def _number(value: object, default: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return float(value)
