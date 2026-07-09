from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

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


class SlideContextRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def replace_items_for_deck(
        self,
        project_id: str,
        deck_id: str,
        items: list[ContextItem],
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM slide_context_items
                    WHERE project_id = %s AND deck_id = %s
                    """,
                    (project_id, deck_id),
                )
                for item in items:
                    cursor.execute(
                        """
                        INSERT INTO slide_context_items (
                            item_id, project_id, deck_id, slide_id,
                            item_order, label, sentence
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            item.item_id,
                            project_id,
                            deck_id,
                            item.slide_id,
                            item.item_order,
                            item.label,
                            item.sentence,
                        ),
                    )
            connection.commit()

    def update_item(
        self,
        item_id: str,
        project_id: str,
        *,
        label: str | None,
        sentence: str | None,
    ) -> ContextItem | None:
        if label is None and sentence is None:
            return self._fetch_item(item_id, project_id)

        set_clauses: list[str] = ["updated_at = now()"]
        params: list[Any] = []
        if label is not None:
            set_clauses.append("label = %s")
            params.append(label)
        if sentence is not None:
            set_clauses.append("sentence = %s")
            params.append(sentence)
            set_clauses.append("embedding = NULL")

        params.extend([item_id, project_id])
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE slide_context_items
                    SET {", ".join(set_clauses)}
                    WHERE item_id = %s AND project_id = %s
                    RETURNING item_id, slide_id, item_order, label, sentence
                    """,
                    params,
                )
                row = cursor.fetchone()
            connection.commit()

        if row is None:
            return None
        return ContextItem(
            item_id=str(row[0]),
            slide_id=str(row[1]),
            item_order=int(row[2]),
            label=str(row[3]),
            sentence=str(row[4]),
        )

    def delete_item(self, item_id: str, project_id: str) -> bool:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM slide_context_items
                    WHERE item_id = %s AND project_id = %s
                    """,
                    (item_id, project_id),
                )
                deleted = bool(cursor.rowcount > 0)
            connection.commit()
        return deleted

    def _fetch_item(self, item_id: str, project_id: str) -> ContextItem | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT item_id, slide_id, item_order, label, sentence
                    FROM slide_context_items
                    WHERE item_id = %s AND project_id = %s
                    """,
                    (item_id, project_id),
                )
                row = cursor.fetchone()
        if row is None:
            return None
        return ContextItem(
            item_id=str(row[0]),
            slide_id=str(row[1]),
            item_order=int(row[2]),
            label=str(row[3]),
            sentence=str(row[4]),
        )

    def _connect(self) -> Any:
        import psycopg

        return psycopg.connect(self.database_url)


def extract_slide_context_items(
    *,
    project_id: str,
    deck_id: str,
    slides: list[SlideInput],
    repository: SlideContextRepository | None,
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

        for raw in raw_items:
            if not isinstance(raw, dict):
                continue
            label = str(raw.get("label", "")).strip()[:200]
            sentence = str(raw.get("sentence", "")).strip()[:1000]
            if not label or not sentence:
                continue
            all_items.append(
                ContextItem(
                    item_id=str(uuid4()),
                    slide_id=slide.slide_id,
                    item_order=order_counter,
                    label=label,
                    sentence=sentence,
                )
            )
            order_counter += 1

    if repository is not None:
        repository.replace_items_for_deck(project_id, deck_id, all_items)

    return SlideContextExtractionResult(status="succeeded", items=all_items)


def _build_slide_input(slide: SlideInput) -> str:
    parts: list[str] = []
    if slide.slide_text.strip():
        parts.append(f"[슬라이드 본문]\n{slide.slide_text.strip()}")
    if slide.speaker_notes.strip():
        parts.append(f"[발표자 대본]\n{slide.speaker_notes.strip()}")
    return "\n\n".join(parts) if parts else "(내용 없음)"
