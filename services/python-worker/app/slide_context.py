from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from app.ai.semantic_cue_filters import compact_meaningful_phrases, is_meaningful_phrase

EXTRACT_INSTRUCTIONS = """
You are an expert Korean presentation coach analyzing slides for ORBIT.
Given a slide's body text and the speaker's script (speaker notes), identify 2-4 semantic context units that the presenter MUST cover on this slide.

Each unit represents a distinct concept or argument the presenter needs to communicate — not a keyword, but a meaningful claim or explanation.

Return only JSON with a "items" array. Each item has:
- "label": short Korean noun phrase (max 30 chars) naming the concept
- "sentence": 1-2 Korean sentences (max 150 chars total) describing what must be said, written as the core claim the presenter should make

Rules:
- Focus on substance, not structure ("첫 번째로" etc.)
- Items must be distinct — no overlapping concepts
- If the slide has no meaningful content, return an empty "items" array
- Write sentences as factual statements the presenter should assert, not as instructions
""".strip()

EXTRACT_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "slide_context_extraction",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "label": {"type": "string"},
                            "sentence": {"type": "string"},
                        },
                        "required": ["label", "sentence"],
                    },
                    "minItems": 0,
                    "maxItems": 4,
                }
            },
            "required": ["items"],
        },
    }
}


@dataclass(frozen=True)
class SlideInput:
    slide_id: str
    slide_text: str
    speaker_notes: str


@dataclass(frozen=True)
class ContextItem:
    item_id: str
    slide_id: str
    item_order: int
    label: str
    sentence: str


@dataclass(frozen=True)
class SlideContextExtractionResult:
    status: str
    items: list[ContextItem] = field(default_factory=list)
    message: str = ""


def extract_slide_context_items(
    *,
    slides: list[SlideInput],
    client: Any | None = None,
    model: str,
    api_key: str | None,
) -> SlideContextExtractionResult:
    if not slides:
        return SlideContextExtractionResult(
            status="skipped",
            message="No slides provided.",
        )

    api_client: Any = client
    if api_client is None:
        if not api_key:
            return SlideContextExtractionResult(
                status="unavailable",
                message="OPENAI_API_KEY is not configured.",
            )
        from openai import OpenAI

        api_client = OpenAI(api_key=api_key)

    all_items: list[ContextItem] = []
    order_counter = 0

    for slide in slides:
        input_text = _build_slide_input(slide)
        try:
            response = api_client.responses.create(
                model=model,
                instructions=EXTRACT_INSTRUCTIONS,
                input=input_text,
                text=EXTRACT_RESPONSE_FORMAT,
            )
        except Exception as error:
            return SlideContextExtractionResult(
                status="failed",
                message=f"LLM call failed for slide {slide.slide_id}: {error}",
            )

        output_text = str(getattr(response, "output_text", "")).strip()
        if not output_text:
            continue

        try:
            payload = json.loads(output_text)
        except json.JSONDecodeError:
            continue

        raw_items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(raw_items, list):
            continue

        normalized_items = _normalize_context_items(raw_items)
        for item in normalized_items:
            all_items.append(
                ContextItem(
                    item_id=str(uuid4()),
                    slide_id=slide.slide_id,
                    item_order=order_counter,
                    label=item["label"],
                    sentence=item["sentence"],
                )
            )
            order_counter += 1

    return SlideContextExtractionResult(status="succeeded", items=all_items)


def _build_slide_input(slide: SlideInput) -> str:
    parts: list[str] = []
    if slide.slide_text.strip():
        parts.append(f"[슬라이드 본문]\n{slide.slide_text.strip()}")
    if slide.speaker_notes.strip():
        parts.append(f"[발표자 대본]\n{slide.speaker_notes.strip()}")
    return "\n\n".join(parts) if parts else "(내용 없음)"


def _normalize_context_items(raw_items: list[object]) -> list[dict[str, str]]:
    normalized_items: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for raw in raw_items:
        if not isinstance(raw, dict):
            continue

        raw_label = _normalize_space(str(raw.get("label", "")))[:200]
        label_candidates = compact_meaningful_phrases(
            [raw_label],
            max_items=1,
            max_length=200,
        )
        label = label_candidates[0] if label_candidates else ""
        sentence = _normalize_space(str(raw.get("sentence", "")))[:1000]
        if not label or not sentence:
            continue
        if not _has_meaningful_sentence_content(sentence):
            continue

        dedupe_key = (label.casefold(), sentence.casefold())
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized_items.append({"label": label, "sentence": sentence})

    return normalized_items


def _normalize_space(value: str) -> str:
    return " ".join(value.strip().split())


def _has_meaningful_sentence_content(value: str) -> bool:
    if len(value.strip()) < 4:
        return False
    return is_meaningful_phrase(value, max_length=1000)
