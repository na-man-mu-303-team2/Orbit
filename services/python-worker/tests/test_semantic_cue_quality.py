import json
from typing import Any

from app.ai.semantic_cues import (
    SemanticCueExtractionRequest,
    _llm_input_payload,
    extract_semantic_cues,
)


def test_quality_golden_splits_compound_slide_into_atomic_cues() -> None:
    client = FakeOpenAIClient(
        {
            "slides": [
                {
                    "slideId": "slide_growth",
                    "semanticCues": [
                        cue_payload(
                            meaning="ARR 감소의 원인은 온보딩 이탈이다",
                            report_label="온보딩 이탈 원인",
                            cue_type="cause",
                            importance="core",
                            keywords=["ARR"],
                            aliases=[{"term": "ARR", "values": ["에이알알"]}],
                            concepts=["온보딩 이탈"],
                            hypothesis="발표자는 ARR 감소 원인이 온보딩 이탈이라고 설명했다",
                            target_ids=["el_table"],
                        ),
                        cue_payload(
                            meaning="체크리스트 도입으로 활성화율이 개선됐다",
                            report_label="체크리스트 성과",
                            cue_type="result",
                            importance="supporting",
                            keywords=["활성화율"],
                            concepts=["체크리스트 도입", "활성화율 개선"],
                            hypothesis="발표자는 체크리스트가 활성화율을 개선했다고 설명했다",
                            target_ids=["el_chart"],
                        ),
                    ],
                }
            ]
        }
    )
    payload = request_payload(
        title="성장 병목과 개선 결과",
        notes=(
            "신규 고객의 온보딩 이탈이 반복 매출 감소의 주요 원인입니다. "
            "체크리스트를 도입한 뒤 첫 주 활성화율이 42퍼센트에서 61퍼센트로 개선됐습니다."
        ),
        elements=[
            {
                "elementId": "el_table",
                "type": "table",
                "role": "table",
                "visible": True,
                "props": {
                    "rows": [
                        [{"text": "이탈 구간"}, {"text": "온보딩"}],
                        [{"text": "ARR 영향"}, {"text": "-18%"}],
                    ]
                },
            },
            {
                "elementId": "el_chart",
                "type": "chart",
                "role": "chart",
                "visible": True,
                "props": {
                    "type": "bar",
                    "title": "첫 주 활성화율",
                    "data": [
                        {"label": "도입 전", "value": 42},
                        {"label": "도입 후", "value": 61},
                    ],
                },
            },
        ],
    )

    result = extract_semantic_cues(payload, client=client, model="gpt-test")
    slide = result.model_dump(by_alias=True)["slides"][0]

    assert [cue["cueType"] for cue in slide["semanticCues"]] == ["cause", "result"]
    assert [cue["revision"] for cue in slide["semanticCues"]] == [1, 1]
    assert slide["warnings"] == []
    assert all(cue["sourceRefs"] for cue in slide["semanticCues"])
    assert all(len(ref["sourceHash"]) == 64 for cue in slide["semanticCues"] for ref in cue["sourceRefs"])


def test_llm_input_ranks_semantic_elements_and_keeps_structured_sources() -> None:
    decorations = [
        {
            "elementId": f"el_decoration_{index}",
            "type": "text",
            "role": "decoration",
            "visible": True,
            "props": {"text": f"장식 {index}"},
        }
        for index in range(32)
    ]
    payload = request_payload(
        title="시장 변화",
        notes="시장 변화의 원인과 결과를 설명합니다.",
        elements=[
            *decorations,
            {
                "elementId": "el_hidden",
                "type": "text",
                "role": "title",
                "visible": False,
                "props": {"text": "숨긴 제목"},
            },
            {
                "elementId": "el_table",
                "type": "table",
                "role": "table",
                "visible": True,
                "props": {"rows": [[{"text": "Enterprise"}, {"text": "+28%"}]]},
            },
            {
                "elementId": "el_chart",
                "type": "chart",
                "role": "chart",
                "visible": True,
                "props": {
                    "type": "line",
                    "title": "전환율",
                    "data": [{"label": "6월", "value": 18}],
                },
            },
        ],
    )

    llm_input = _llm_input_payload(payload)
    elements = llm_input["slides"][0]["elements"]

    assert len(elements) == 32
    assert elements[0]["elementId"] == "el_table"
    assert elements[0]["tableCells"] == ["Enterprise", "+28%"]
    assert elements[1]["elementId"] == "el_chart"
    assert elements[1]["chart"]["points"] == [{"label": "6월", "value": 18}]
    assert llm_input["deckVersion"] == 7
    assert llm_input["audience"] == "technical"
    assert llm_input["purpose"] == "persuade"
    assert llm_input["targetDurationMinutes"] == 12
    assert llm_input["slides"][0]["estimatedSeconds"] == 45


def test_quality_validator_warns_and_retries_only_once() -> None:
    client = FakeOpenAIClient(
        {
            "slides": [
                {
                    "slideId": "slide_growth",
                    "semanticCues": [
                        cue_payload(
                            meaning="원인을 설명하고 또한 해결책을 제시했다",
                            cue_type="solution",
                            importance="core",
                            keywords=["ARR API"],
                            concepts=["원인", "해결책"],
                            hypothesis="이 슬라이드는 원인과 해결책을 설명한다",
                        )
                    ],
                }
            ]
        }
    )
    payload = request_payload(
        title="복합 개선 계획",
        notes=(
            "고객군별 반복 매출 감소 원인을 분석하고 온보딩 API 병목을 제거하는 해결책과 "
            "실행 순서, 담당 조직, 기대 전환율 개선 폭을 구체적으로 설명합니다."
        ),
    )

    result = extract_semantic_cues(payload, client=client, model="gpt-test")
    cue = result.model_dump(by_alias=True)["slides"][0]["semanticCues"][0]

    assert len(client.requests) == 2
    retry_input = json.loads(client.requests[1]["input"])
    assert "missing-technical-alias" in retry_input["qualityFeedback"]
    assert set(cue["qualityWarnings"]) >= {
        "broad-cue",
        "missing-technical-alias",
        "slide-centric-hypothesis",
        "content-rich-slide-too-few-cues",
    }
    assert cue["reviewStatus"] == "suggested"


def test_image_only_slide_without_analysis_remains_unverified() -> None:
    client = FakeOpenAIClient(
        {
            "slides": [
                {
                    "slideId": "slide_growth",
                    "semanticCues": [
                        cue_payload(
                            meaning="고객 여정의 이탈 구간을 설명했다",
                            cue_type="problem",
                            keywords=["고객 여정"],
                            concepts=["이탈 구간"],
                            hypothesis="발표자는 고객 여정의 이탈 구간을 설명했다",
                            target_ids=["el_image"],
                        )
                    ],
                }
            ]
        }
    )
    payload = request_payload(
        title="Slide 1",
        notes="",
        elements=[
            {
                "elementId": "el_image",
                "type": "image",
                "role": "media",
                "visible": True,
                "props": {"alt": "Image 1"},
            }
        ],
    )

    result = extract_semantic_cues(payload, client=client, model="gpt-test")
    cue = result.model_dump(by_alias=True)["slides"][0]["semanticCues"][0]

    assert cue["sourceRefs"] == []
    assert set(cue["qualityWarnings"]) >= {
        "ungrounded-source",
        "image-source-unverified",
    }


def test_long_hypothesis_is_truncated_and_qna_is_optional() -> None:
    hypothesis = "발표자는 " + "매우 구체적인 고객 근거를 설명했다 " * 20
    client = FakeOpenAIClient(
        {
            "slides": [
                {
                    "slideId": "slide_growth",
                    "semanticCues": [
                        cue_payload(
                            meaning="질문을 받는 시간을 안내했다",
                            cue_type="closing",
                            importance="core",
                            keywords=["질의응답"],
                            concepts=["질문 시간"],
                            hypothesis=hypothesis,
                        )
                    ],
                }
            ]
        }
    )
    payload = request_payload(title="Q&A", notes="질문을 받겠습니다.")

    result = extract_semantic_cues(payload, client=client, model="gpt-test")
    cue = result.model_dump(by_alias=True)["slides"][0]["semanticCues"][0]

    assert len(cue["nliHypotheses"][0]) == 300
    assert cue["importance"] == "optional"
    assert cue["required"] is False
    assert cue["priority"] == 3


def request_payload(
    *,
    title: str,
    notes: str,
    elements: list[dict[str, Any]] | None = None,
) -> SemanticCueExtractionRequest:
    return SemanticCueExtractionRequest.model_validate(
        {
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "version": 7,
                "targetDurationMinutes": 12,
                "metadata": {"audience": "technical", "purpose": "persuade"},
                "slides": [
                    {
                        "slideId": "slide_growth",
                        "title": title,
                        "speakerNotes": notes,
                        "estimatedSeconds": 45,
                        "elements": elements or [],
                    }
                ],
            },
        }
    )


def cue_payload(
    *,
    meaning: str,
    cue_type: str,
    keywords: list[str],
    concepts: list[str],
    hypothesis: str,
    report_label: str = "핵심 의미",
    importance: str = "supporting",
    aliases: list[dict[str, object]] | None = None,
    target_ids: list[str] | None = None,
) -> dict[str, object]:
    return {
        "meaning": meaning,
        "reportLabel": report_label,
        "presenterTag": report_label[:20],
        "cueType": cue_type,
        "importance": importance,
        "candidateKeywords": keywords,
        "aliasEntries": aliases or [],
        "requiredConcepts": concepts,
        "nliHypotheses": [hypothesis],
        "negativeHints": [],
        "targetElementIds": target_ids or [],
        "triggerActionIds": [],
    }


class FakeOpenAIClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.requests: list[dict[str, Any]] = []
        self.responses = FakeResponses(self, payload)


class FakeResponses:
    def __init__(self, parent: FakeOpenAIClient, payload: dict[str, object]) -> None:
        self.parent = parent
        self.payload = payload

    def create(self, **kwargs: Any) -> object:
        self.parent.requests.append(kwargs)
        return type(
            "Response",
            (),
            {"output_text": json.dumps(self.payload, ensure_ascii=False)},
        )()
