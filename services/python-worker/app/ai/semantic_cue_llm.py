from __future__ import annotations

import json
from typing import Any


SEMANTIC_CUE_EXTRACTION_INSTRUCTIONS = """
You are ORBIT's semantic cue extraction planner for Korean presentation rehearsal.
Return compact semantic cue definitions for each slide.

Rules:
- Use only slide title, visible slide text, speaker notes, existing keywords, element IDs,
  and action IDs from the input.
- Ignore generic imported titles such as "Slide 1", "Slide 2", or "슬라이드 3".
- Do not create cues from filler or discourse-marker phrases such as "먼저", "여기서",
  "저희는", "이를", "이번에는", "마지막으로", or "본격적인".
- Each cue must represent one business or semantic obligation, not a sentence variant.
- Prefer existing keywords as lexical hints when they are meaningful.
- Use candidateKeywords as short exact-match hints and requiredConcepts as semantic concepts.
- Use aliasEntries for optional alias groups and keep it empty when aliases are not needed.
- nliHypotheses must be Korean natural-language hypotheses suitable for NLI.
- Return 0 cues for slides with no meaningful content.
- Prefer 3-7 cues for content-rich slides, but never force filler-only slides.
- targetElementIds and triggerActionIds may only reference IDs listed in the input.
""".strip()


SEMANTIC_CUE_EXTRACTION_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "semantic_cue_extraction",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "slides": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "slideId": {"type": "string"},
                            "semanticCues": {
                                "type": "array",
                                "maxItems": 7,
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "meaning": {"type": "string"},
                                        "required": {"type": "boolean"},
                                        "priority": {
                                            "type": "integer",
                                            "enum": [1, 2, 3],
                                        },
                                        "candidateKeywords": {
                                            "type": "array",
                                            "maxItems": 6,
                                            "items": {"type": "string"},
                                        },
                                        "aliasEntries": {
                                            "type": "array",
                                            "maxItems": 6,
                                            "items": {
                                                "type": "object",
                                                "additionalProperties": False,
                                                "properties": {
                                                    "term": {"type": "string"},
                                                    "values": {
                                                        "type": "array",
                                                        "maxItems": 6,
                                                        "items": {"type": "string"},
                                                    },
                                                },
                                                "required": ["term", "values"],
                                            },
                                        },
                                        "requiredConcepts": {
                                            "type": "array",
                                            "maxItems": 8,
                                            "items": {"type": "string"},
                                        },
                                        "nliHypotheses": {
                                            "type": "array",
                                            "minItems": 1,
                                            "maxItems": 3,
                                            "items": {"type": "string"},
                                        },
                                        "negativeHints": {
                                            "type": "array",
                                            "maxItems": 5,
                                            "items": {"type": "string"},
                                        },
                                        "targetElementIds": {
                                            "type": "array",
                                            "maxItems": 8,
                                            "items": {"type": "string"},
                                        },
                                        "triggerActionIds": {
                                            "type": "array",
                                            "maxItems": 8,
                                            "items": {"type": "string"},
                                        },
                                    },
                                    "required": [
                                        "meaning",
                                        "required",
                                        "priority",
                                        "candidateKeywords",
                                        "aliasEntries",
                                        "requiredConcepts",
                                        "nliHypotheses",
                                        "negativeHints",
                                        "targetElementIds",
                                        "triggerActionIds",
                                    ],
                                },
                            },
                        },
                        "required": ["slideId", "semanticCues"],
                    },
                }
            },
            "required": ["slides"],
        },
    }
}


def generate_semantic_cue_payload(
    input_payload: dict[str, Any],
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any] | None:
    api_client: Any = client
    if api_client is None:
        if not api_key:
            return None

        from openai import OpenAI

        api_client = OpenAI(api_key=api_key)

    try:
        response = api_client.responses.create(
            model=model or "gpt-4.1-mini",
            instructions=SEMANTIC_CUE_EXTRACTION_INSTRUCTIONS,
            input=json.dumps(input_payload, ensure_ascii=False),
            text=SEMANTIC_CUE_EXTRACTION_RESPONSE_FORMAT,
        )
    except Exception:
        return None

    output_text = str(getattr(response, "output_text", "")).strip()
    if not output_text:
        return None

    try:
        payload = json.loads(output_text)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None
    return payload
