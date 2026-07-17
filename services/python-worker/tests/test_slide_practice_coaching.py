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


def test_generates_bounded_coaching_and_keeps_verified_script_edit() -> None:
    client = FakeOpenAIClient(valid_response())
    result = generate_slide_practice_coaching(
        request(),
        model="gpt-test",
        api_key=None,
        client=client,
    )

    assert result.model == "gpt-test"
    assert result.items[0].script_edit is not None
    assert result.items[0].script_edit.original_text in request().speaker_notes
    sent_payload = str(client.responses.calls[0]["input"])
    assert "fillerTotalCount" in sent_payload
    assert "transcript" not in sent_payload
    assert "audio" not in sent_payload


def test_drops_script_edit_that_is_not_in_speaker_notes() -> None:
    payload = valid_response()
    payload["items"][0]["scriptEdit"]["originalText"] = "존재하지 않는 문장입니다."

    result = generate_slide_practice_coaching(
        request(),
        model="gpt-test",
        api_key=None,
        client=FakeOpenAIClient(payload),
    )

    assert result.items[0].script_edit is None


def test_rejects_coaching_for_an_unmeasured_issue_category() -> None:
    payload = valid_response()
    payload["items"][0]["category"] = "loudness"

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
        },
    })


def valid_response() -> dict[str, object]:
    return {
        "summary": "습관어를 줄이면 핵심이 더 분명해집니다.",
        "items": [{
            "category": "filler",
            "title": "습관어 줄이기",
            "reason": "연결 표현이 반복됩니다.",
            "action": "핵심 문장부터 바로 시작해 보세요.",
            "practiceTip": "추천 문장을 세 번 읽어 보세요.",
            "scriptEdit": {
                "originalText": "그러니까 이 기능을 통해서 사용자 경험을 개선할 수 있습니다.",
                "suggestedText": "이 기능은 사용자 경험을 개선합니다.",
                "reason": "핵심이 더 분명해집니다.",
            },
        }],
        "practicePlan": {
            "title": "30초 연습",
            "steps": [
                "추천 대본을 읽습니다.",
                "속도와 쉼을 조절해 읽습니다.",
                "자연스럽게 이어 말합니다.",
            ],
        },
    }
