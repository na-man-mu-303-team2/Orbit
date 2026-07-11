from __future__ import annotations

import json
from typing import Any


SEMANTIC_CUE_EXTRACTION_INSTRUCTIONS = """
You are ORBIT's semantic cue extraction planner for Korean presentation rehearsal.
Return compact semantic cue definitions for each slide.

Rules:
- Use only the supplied slide title, visible structured element sources, speaker notes,
  existing keywords, element IDs, and action IDs.
- Ignore generic imported titles such as "Slide 1", "Slide 2", or "슬라이드 3".
- Do not create cues from filler or discourse-marker phrases such as "먼저", "여기서",
  "저희는", "이를", "이번에는", "마지막으로", or "본격적인".
- Each cue must represent one atomic business or semantic obligation that a presenter can
  communicate in roughly 3-8 seconds. Split causes, solutions, results, and warnings into
  independently judgeable cues instead of joining them with conjunctions.
- candidateKeywords are retrieval hints, not proof of coverage. Return 1-4 distinctive,
  cue-specific noun phrases; exclude generic context words that could match neighboring cues.
- requiredConcepts are the non-overlapping canonical concepts that must all be conveyed.
  Return 1-4 concepts. Do not list translations, abbreviations, pronunciations, or synonyms as
  separate concepts; place those variants in aliasEntries under one canonical concept instead.
- aliasEntries group any-of surface forms for candidateKeywords and requiredConcepts. For every
  technical term, code identifier, acronym, English term, or mixed Korean-English phrase, include
  Korean pronunciation, common STT variants, and a semantic Korean equivalent. Keep entries empty
  only when the cue contains no term that benefits from alternate surface forms.
- nliHypotheses must be 1-3 speaker-centric Korean paraphrases of the SAME COMPLETE cue, each
  independently entailing every requiredConcept and their relationship. Start each with
  "발표자는" or "발표자가". Never split one cue's obligations across hypotheses and never start
  with "이 슬라이드는".
- Return 0 cues for slides with no meaningful content.
- Prefer 3-7 cues for content-rich slides, but never force filler-only slides.
- targetElementIds and triggerActionIds may only reference IDs listed in the input.
- negativeHints must be 0-3 complete speaker-centric Korean statements that are plausible but
  incompatible with the cue because they reverse or replace its essential relationship. Do not
  return fragments, unrelated topics, or statements that can also be true when the cue is covered.
- Use importance=core only for claims essential to the deck purpose and timing. Title, agenda,
  Q&A, transition, and closing slides are optional by default.
- reportLabel is a compact audience-facing label, presenterTag is an even shorter rehearsal tag,
  and cueType describes the semantic role. Do not return lifecycle or source hash fields.
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
                                        "reportLabel": {"type": "string"},
                                        "presenterTag": {"type": "string"},
                                        "cueType": {
                                            "type": "string",
                                            "enum": [
                                                "definition",
                                                "problem",
                                                "cause",
                                                "solution",
                                                "result",
                                                "warning",
                                                "lesson",
                                                "transition",
                                                "closing",
                                            ],
                                        },
                                        "importance": {
                                            "type": "string",
                                            "enum": ["core", "supporting", "optional"],
                                        },
                                        "candidateKeywords": {
                                            "type": "array",
                                            "maxItems": 4,
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
                                            "maxItems": 4,
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
                                            "maxItems": 3,
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
                                        "reportLabel",
                                        "presenterTag",
                                        "cueType",
                                        "importance",
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


class SemanticCueLlmError(RuntimeError):
    pass


def generate_semantic_cue_payload(
    input_payload: dict[str, Any],
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    api_client: Any = client
    if api_client is None:
        if not api_key:
            raise SemanticCueLlmError(
                "OpenAI API key is required for semantic cue extraction."
            )

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
        raise SemanticCueLlmError("OpenAI semantic cue generation request failed.")

    output_text = str(getattr(response, "output_text", "")).strip()
    if not output_text:
        raise SemanticCueLlmError("OpenAI semantic cue generation returned no output.")

    try:
        payload = json.loads(output_text)
    except json.JSONDecodeError:
        raise SemanticCueLlmError(
            "OpenAI semantic cue generation returned invalid JSON."
        )

    if not isinstance(payload, dict):
        raise SemanticCueLlmError(
            "OpenAI semantic cue generation returned an invalid payload."
        )
    return payload
