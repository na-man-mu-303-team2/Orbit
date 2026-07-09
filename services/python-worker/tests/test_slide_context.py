from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from app.slide_context import (
    ContextItem,
    SlideContextExtractionResult,
    SlideInput,
    _build_slide_input,
    extract_slide_context_items,
)


def _make_llm_response(items: list[dict[str, str]]) -> Any:
    import json

    mock = MagicMock()
    mock.output_text = json.dumps({"items": items})
    return mock


def _make_client(items: list[dict[str, str]]) -> Any:
    client = MagicMock()
    client.responses.create.return_value = _make_llm_response(items)
    return client


class TestBuildSlideInput:
    def test_both_fields(self) -> None:
        slide = SlideInput("slide_1", "제목 슬라이드", "안녕하세요 저는...")
        text = _build_slide_input(slide)
        assert "[슬라이드 본문]" in text
        assert "[발표자 대본]" in text

    def test_only_notes(self) -> None:
        slide = SlideInput("slide_1", "", "발표자 대본만")
        text = _build_slide_input(slide)
        assert "[발표자 대본]" in text
        assert "[슬라이드 본문]" not in text

    def test_empty(self) -> None:
        slide = SlideInput("slide_1", "", "")
        assert _build_slide_input(slide) == "(내용 없음)"


class TestExtractSlideContextItems:
    def test_no_api_key_returns_unavailable(self) -> None:
        slides = [SlideInput("slide_1", "본문", "대본")]
        result = extract_slide_context_items(
            slides=slides,
            model="gpt-4o",
            api_key=None,
        )
        assert result.status == "unavailable"
        assert result.items == []

    def test_empty_slides_returns_skipped(self) -> None:
        result = extract_slide_context_items(
            slides=[],
            model="gpt-4o",
            api_key="key",
        )
        assert result.status == "skipped"

    def test_successful_extraction(self) -> None:
        client = _make_client([
            {"label": "문제 배경", "sentence": "기존 방식은 성능 병목이 발생합니다."},
            {"label": "해결책 소개", "sentence": "Redis를 도입하면 응답 시간이 단축됩니다."},
        ])
        slides = [SlideInput("slide_1", "Redis 도입", "Redis 없으면 느립니다")]
        result = extract_slide_context_items(
            slides=slides,
            client=client,
            model="gpt-4o",
            api_key=None,
        )
        assert result.status == "succeeded"
        assert len(result.items) == 2
        assert result.items[0].label == "문제 배경"
        assert result.items[0].slide_id == "slide_1"
        assert result.items[0].item_order == 0
        assert result.items[1].item_order == 1

    def test_item_order_spans_multiple_slides(self) -> None:
        call_count = 0

        def side_effect(**_: Any) -> Any:
            nonlocal call_count
            import json
            mock = MagicMock()
            if call_count == 0:
                mock.output_text = json.dumps({"items": [
                    {"label": "A", "sentence": "문장 A"},
                ]})
            else:
                mock.output_text = json.dumps({"items": [
                    {"label": "B", "sentence": "문장 B"},
                    {"label": "C", "sentence": "문장 C"},
                ]})
            call_count += 1
            return mock

        client = MagicMock()
        client.responses.create.side_effect = side_effect

        slides = [
            SlideInput("slide_1", "내용 1", "대본 1"),
            SlideInput("slide_2", "내용 2", "대본 2"),
        ]
        result = extract_slide_context_items(
            slides=slides,
            client=client,
            model="gpt-4o",
            api_key=None,
        )
        assert result.status == "succeeded"
        orders = [item.item_order for item in result.items]
        assert orders == [0, 1, 2]

    def test_invalid_llm_json_is_skipped(self) -> None:
        client = MagicMock()
        client.responses.create.return_value = MagicMock(output_text="not-json")
        slides = [SlideInput("slide_1", "본문", "대본")]
        result = extract_slide_context_items(
            slides=slides,
            client=client,
            model="gpt-4o",
            api_key=None,
        )
        assert result.status == "succeeded"
        assert result.items == []

    def test_llm_exception_returns_failed(self) -> None:
        client = MagicMock()
        client.responses.create.side_effect = RuntimeError("network error")
        slides = [SlideInput("slide_1", "본문", "대본")]
        result = extract_slide_context_items(
            slides=slides,
            client=client,
            model="gpt-4o",
            api_key=None,
        )
        assert result.status == "failed"

    def test_items_trimmed_to_length_limits(self) -> None:
        long_label = "가" * 300
        long_sentence = "나" * 1100
        client = _make_client([{"label": long_label, "sentence": long_sentence}])
        slides = [SlideInput("slide_1", "본문", "대본")]
        result = extract_slide_context_items(
            slides=slides,
            client=client,
            model="gpt-4o",
            api_key=None,
        )
        assert len(result.items[0].label) <= 200
        assert len(result.items[0].sentence) <= 1000
