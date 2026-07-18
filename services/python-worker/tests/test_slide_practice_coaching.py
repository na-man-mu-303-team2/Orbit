import json
from types import SimpleNamespace

import pytest

from app.slide_practice_coaching import (
    SlidePracticeCoachingError,
    SlidePracticeCoachingRequest,
    generate_slide_practice_coaching,
)


class FakeResponses:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payload, ensure_ascii=False))


class FakeOpenAIClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.responses = FakeResponses(payload)


def test_selects_one_verified_script_metric_evidence() -> None:
    client = FakeOpenAIClient(valid_response())
    result = generate_slide_practice_coaching(
        request(),
        model="gpt-test",
        api_key=None,
        client=client,
    )

    assert result.model == "gpt-test"
    assert result.item.evidence_id == "evidence-1"
    sent_payload = str(client.responses.calls[0]["input"])
    assert "fillerTotalCount" in sent_payload
    assert "loudnessVariationDb" in sent_payload
    assert "rhythmRegularity" in sent_payload
    assert "transcript" not in sent_payload
    assert "audio" not in sent_payload


def test_rejects_unknown_evidence_id() -> None:
    payload = valid_response()
    payload["item"]["evidenceId"] = "evidence-unknown"

    with pytest.raises(SlidePracticeCoachingError):
        generate_slide_practice_coaching(
            request(),
            model="gpt-test",
            api_key=None,
            client=FakeOpenAIClient(payload),
        )


def test_rejects_coaching_for_an_unmeasured_issue_category() -> None:
    payload = valid_response()
    payload["item"]["category"] = "loudness"

    with pytest.raises(SlidePracticeCoachingError):
        generate_slide_practice_coaching(
            request(),
            model="gpt-test",
            api_key=None,
            client=FakeOpenAIClient(payload),
        )


def request() -> SlidePracticeCoachingRequest:
    return SlidePracticeCoachingRequest.model_validate({
        "speakerNotes": "그러니까 이 기능을 통해서 사용자 경험을 개선할 수 있습니다.",
        "issueCodes": ["filler-use"],
        "metrics": {
            "fillerDetails": [{"word": "그러니까", "count": 2}],
            "fillerTotalCount": 2,
            "syllablesPerSecond": 4.3,
            "pauseRatio": 0.29,
            "pitchSpanHz": 50,
            "loudnessDb": -35.4,
            "loudnessVariationDb": 2.1,
            "rhythmRegularity": 0.78,
        },
        "evidenceCandidates": [{
            "evidenceId": "evidence-1",
            "originalText": "그러니까 이 기능을 통해서 사용자 경험을 개선할 수 있습니다.",
            "alignment": "matched",
            "startMs": 0,
            "endMs": 4_000,
            "issueCodes": ["filler-use"],
            "metrics": {
                "syllablesPerSecond": 4.3,
                "loudnessDb": -35.4,
                "pauseBeforeMs": None,
                "pauseAfterMs": 300,
                "pitchSpanHz": 50,
                "fillerTotalCount": 2,
                "fillerWords": ["그러니까"],
                "loudnessVariationDb": 2.1,
                "rhythmRegularity": 0.78,
            },
        }],
    })


def valid_response() -> dict[str, object]:
    return {
        "summary": "습관어를 줄이면 핵심이 더 분명해집니다.",
        "item": {
            "evidenceId": "evidence-1",
            "category": "filler",
            "title": "습관어 줄이기",
            "reason": "연결 표현이 반복됩니다.",
            "action": "핵심 문장부터 바로 시작해 보세요.",
            "practiceTip": "추천 문장을 세 번 읽어 보세요.",
        },
    }
