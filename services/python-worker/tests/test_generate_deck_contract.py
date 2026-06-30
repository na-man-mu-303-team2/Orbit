import json
from typing import Any

from fastapi.testclient import TestClient

import app.main as api_module
from app.ai.generate_deck import GenerateDeckRequest, ReferenceContext, generate_deck
from tests.test_config import VALID_ENV


def client() -> TestClient:
    api_module.app.state.config = api_module.load_config(VALID_ENV)
    return TestClient(api_module.app)


def test_generate_deck_endpoint_returns_deck_contract() -> None:
    response = client().post(
        "/ai/generate-deck",
        json={
            "projectId": "project_demo_1",
            "topic": "AI 덱 생성",
            "targetDurationMinutes": 8,
            "slideCountRange": {"min": 4, "max": 5},
            "template": "report",
            "metadata": {
                "audience": "technical",
                "purpose": "inform",
                "tone": "professional",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    deck = payload["deck"]

    assert payload["validation"]["passed"] is True
    assert payload["warnings"] == [
        "참고자료 없이 topic-only generation으로 생성했습니다."
    ]
    assert deck["deckId"].startswith("deck_")
    assert deck["projectId"] == "project_demo_1"
    assert deck["metadata"]["generatedBy"] == "ai"
    assert deck["metadata"]["createdFrom"]["references"] == []
    assert 4 <= len(deck["slides"]) <= 5
    assert deck["slides"][0]["aiNotes"]["sourceEvidence"] == []
    assert all(
        element["x"] + element["width"] <= deck["canvas"]["width"]
        for slide in deck["slides"]
        for element in slide["elements"]
    )
    assert all(
        any(element["role"] == "decoration" for element in slide["elements"])
        for slide in deck["slides"]
    )
    assert any(
        sum(1 for element in slide["elements"] if element["type"] != "text") >= 3
        for slide in deck["slides"]
    )


def test_generate_deck_endpoint_supports_topic_only_generation() -> None:
    response = client().post(
        "/ai/generate-deck",
        json={"projectId": "project_demo_1", "topic": "ORBIT"},
    )

    assert response.status_code == 200
    payload = response.json()
    speaker_notes = payload["deck"]["slides"][0]["speakerNotes"]
    assert payload["warnings"] == [
        "참고자료 없이 topic-only generation으로 생성했습니다."
    ]
    assert "안녕하세요. 오늘은 ORBIT" in speaker_notes
    assert "슬라이드에서는" not in speaker_notes
    assert "설명합니다" not in speaker_notes
    assert "제공합니다" not in speaker_notes


def test_generate_deck_applies_content_aware_theme_and_fonts() -> None:
    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Google Speech-to-Text 언어 및 방언 지원",
            slideCountRange={"min": 2, "max": 2},
        )
    )

    deck = response.deck
    title_element = next(
        element
        for element in deck["slides"][0]["elements"]
        if element["type"] == "text" and element["role"] == "title"
    )
    assert deck["theme"]["name"] == "default-voice-tech-ai"
    assert deck["theme"]["backgroundColor"] == "#f7fbff"
    assert deck["theme"]["accentColor"] == "#1a73e8"
    assert deck["theme"]["typography"]["headingFontFamily"] == "Noto Sans KR"
    assert title_element["props"]["fontFamily"] == "Noto Sans KR"
    assert title_element["props"]["fontSize"] == 64


def test_generate_deck_design_rhythm_overrides_theme_profile() -> None:
    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Quarterly roadmap",
            slideCountRange={"min": 2, "max": 2},
            design={"visualRhythm": "technical"},
        )
    )

    assert response.deck["theme"]["name"] == "default-voice-tech-ai"
    assert response.deck["theme"]["accentColor"] == "#1a73e8"


def test_generate_deck_applies_prompt_color_theme() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Prompt colors",
            "slides": [
                slide_payload(
                    "Visual plan",
                    "Prompt colors should drive the theme.",
                    "Use the generated visual intent.",
                    slide_type="title",
                    slot_preset="title_center",
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Quarterly roadmap",
            prompt="흰색과 노란색으로 디자인",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    theme = response.deck["theme"]
    assert theme["backgroundColor"] == "#ffffff"
    assert theme["textColor"] == "#111827"
    assert theme["accentColor"] == "#facc15"
    assert theme["palette"]["surface"] == "#ffffff"
    assert theme["palette"]["primary"] == "#facc15"
    assert theme["palette"]["secondary"] == "#facc15"
    assert theme["palette"]["muted"] == "#fef9c3"
    assert theme["palette"]["border"] == "#fde68a"


def test_generate_deck_applies_palette_hint_color_theme() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Palette hint",
            "slides": [
                slide_payload(
                    "Visual plan",
                    "Palette hint should drive explicit colors.",
                    "Use the generated visual intent.",
                    slide_type="title",
                    slot_preset="title_center",
                    visual_intent={
                        "emphasis": "color",
                        "mood": "bright",
                        "structure": "cover",
                        "paletteHint": "white yellow",
                        "emphasisStyle": "",
                        "composition": "",
                        "decorationDensity": "medium",
                        "mediaStyle": "",
                    },
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Quarterly roadmap",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    theme = response.deck["theme"]
    assert theme["backgroundColor"] == "#ffffff"
    assert theme["accentColor"] == "#facc15"


def test_generate_deck_separates_design_prompt_from_content_prompt() -> None:
    design_prompt = "retro tetris colors, classic game, pixel art"
    fake_client = FakeOpenAIClient(
        {
            "title": "Tetris history",
            "slides": [
                slide_payload(
                    "Origins",
                    "Tetris became a global puzzle game.",
                    "Explain the origin story without visual style words.",
                    slide_type="title",
                    slot_preset="title_center",
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Tetris",
            prompt="History and core rules",
            designPrompt=design_prompt,
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    llm_input = str(fake_client.requests[0]["input"])
    deck_text = json.dumps(response.deck, ensure_ascii=False)
    assert "User prompt: History and core rules" in llm_input
    assert f"Design prompt: {design_prompt}" in llm_input
    assert design_prompt not in deck_text


def test_generate_deck_applies_keyed_theme_tokens_from_palette_hint() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Token palette",
            "slides": [
                slide_payload(
                    "Visual plan",
                    "Tokens should drive the theme.",
                    "Use the generated visual intent.",
                    slide_type="title",
                    slot_preset="title_center",
                    visual_intent={
                        "emphasis": "color",
                        "mood": "arcade",
                        "structure": "cover",
                        "paletteHint": (
                            "background:#111827 text:#f8fafc accent:#00f0f0 "
                            "secondary:#facc15 surface:#1f2937 muted:#0f172a "
                            "border:#a855f7 style:retro-pixel-arcade"
                        ),
                        "emphasisStyle": "",
                        "composition": "",
                        "decorationDensity": "medium",
                        "mediaStyle": "",
                    },
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Quarterly roadmap",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    theme = response.deck["theme"]
    assert theme["backgroundColor"] == "#111827"
    assert theme["textColor"] == "#f8fafc"
    assert theme["accentColor"] == "#00f0f0"
    assert theme["palette"]["primary"] == "#00f0f0"
    assert theme["palette"]["secondary"] == "#facc15"
    assert theme["palette"]["surface"] == "#1f2937"
    assert theme["palette"]["muted"] == "#0f172a"
    assert theme["palette"]["border"] == "#a855f7"


def test_generate_deck_ignores_invalid_theme_tokens() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Invalid tokens",
            "slides": [
                slide_payload(
                    "Visual plan",
                    "Invalid tokens should not drive the theme.",
                    "Use the generated visual intent.",
                    slide_type="title",
                    slot_preset="title_center",
                    visual_intent={
                        "emphasis": "color",
                        "mood": "plain",
                        "structure": "cover",
                        "paletteHint": "accent:yellow unknown:#111111 background:rgb(0, 0, 0)",
                        "emphasisStyle": "",
                        "composition": "",
                        "decorationDensity": "medium",
                        "mediaStyle": "",
                    },
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Quarterly roadmap",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    theme = response.deck["theme"]
    assert theme["backgroundColor"] == "#ffffff"
    assert theme["accentColor"] == "#2563eb"


def test_generate_deck_falls_back_when_token_contrast_is_low() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Low contrast",
            "slides": [
                slide_payload(
                    "Visual plan",
                    "Low contrast text should be corrected.",
                    "Use the generated visual intent.",
                    slide_type="title",
                    slot_preset="title_center",
                    visual_intent={
                        "emphasis": "color",
                        "mood": "dark",
                        "structure": "cover",
                        "paletteHint": "background:#111827 text:#111827",
                        "emphasisStyle": "",
                        "composition": "",
                        "decorationDensity": "medium",
                        "mediaStyle": "",
                    },
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Quarterly roadmap",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    theme = response.deck["theme"]
    assert theme["backgroundColor"] == "#111827"
    assert theme["textColor"] == "#f8fafc"


def test_generate_deck_keeps_visual_rhythm_typography_with_color_theme() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Technical colors",
            "slides": [
                slide_payload(
                    "Visual plan",
                    "Prompt colors should not replace typography.",
                    "Use the generated visual intent.",
                    slide_type="title",
                    slot_preset="title_center",
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Quarterly roadmap",
            prompt="white and yellow theme",
            slideCountRange={"min": 1, "max": 1},
            design={"visualRhythm": "technical"},
        ),
        client=fake_client,
    )

    theme = response.deck["theme"]
    assert theme["name"] == "default-voice-tech-ai"
    assert theme["backgroundColor"] == "#ffffff"
    assert theme["accentColor"] == "#facc15"
    assert theme["typography"]["headingFontFamily"] == "Noto Sans KR"


def test_generate_deck_matches_game_ink_neon_profile_without_color_hints() -> None:
    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Platoon ink neon game raiders",
            slideCountRange={"min": 2, "max": 2},
        )
    )

    theme = response.deck["theme"]
    assert theme["name"] == "default-game-ink-neon-ai"
    assert theme["backgroundColor"] == "#07111f"
    assert theme["accentColor"] == "#00e5ff"
    assert theme["palette"]["secondary"] == "#b6ff00"
    assert theme["accentColor"] != "#2563eb"


def test_generate_deck_matches_game_ink_neon_profile_for_korean_hints() -> None:
    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="스플래툰 잉크 네온 게임 캠페인",
            slideCountRange={"min": 2, "max": 2},
        )
    )

    assert response.deck["theme"]["name"] == "default-game-ink-neon-ai"


def test_generate_deck_report_template_keeps_explicit_game_prompt_theme() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "네온 게임 리포트",
            "slides": [
                slide_payload(
                    "캠페인 방향",
                    "잉크와 네온이 중심인 캐주얼 게임 캠페인입니다.",
                    "밝은 네온 톤을 중심으로 소개합니다.",
                    slide_type="title",
                    slot_preset="title_center",
                ),
                slide_payload(
                    "핵심 정리",
                    "비비드한 잉크 대비를 유지합니다.",
                    "게임 프롬프트가 리포트 템플릿보다 우선합니다.",
                    slide_type="summary",
                    slot_preset="insight_with_evidence",
                ),
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="분기 디자인 리포트",
            prompt="스플래툰처럼 잉크와 네온이 강한 게임 발표 자료",
            template="report",
            slideCountRange={"min": 2, "max": 2},
        ),
        client=fake_client,
    )

    assert response.deck["theme"]["name"] == "report-game-ink-neon-ai"


def test_generate_deck_uses_visual_intent_palette_hint_for_theme() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Palette hint",
            "slides": [
                slide_payload(
                    "Visual plan",
                    "Palette hint should drive the theme.",
                    "Use the generated visual intent.",
                    slide_type="title",
                    slot_preset="title_center",
                    visual_intent={
                        "emphasis": "color",
                        "mood": "energetic",
                        "structure": "cover",
                        "paletteHint": "neon ink",
                        "emphasisStyle": "",
                        "composition": "",
                        "decorationDensity": "medium",
                        "mediaStyle": "",
                    },
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Quarterly roadmap",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    assert response.deck["theme"]["name"] == "default-game-ink-neon-ai"


def test_generate_deck_uses_safe_fallback_for_unknown_style_prompt() -> None:
    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT asymptotic nebula",
            slideCountRange={"min": 2, "max": 2},
        )
    )

    assert response.deck["theme"]["name"] == "default-startup-clean-ai"
    assert response.validation.passed is True


def test_generate_deck_uses_llm_slot_preset_before_code_fallback() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Stable fallback",
            "slides": [
                slide_payload(
                    "Metric slide",
                    "Metric message",
                    "Metric speaker note.",
                    slide_type="data",
                    slot_preset="metric_cards",
                    metric_card_caption="반복 작업 시간을 줄이는 핵심 지표입니다.",
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    slide = response.deck["slides"][0]
    body = element_by_role(slide, "body")
    metric_card = element_by_id(slide, "el_1_metric_card")
    metric_caption = element_by_id(slide, "el_1_metric_card_caption")
    assert slide["style"]["layout"] == "two-column"
    assert body["width"] == 760
    assert has_element(slide, "el_1_metric_card")
    assert metric_caption["props"]["text"] == "반복 작업 시간을 줄이는 핵심 지표입니다."
    assert metric_caption["x"] == metric_card["x"] + 44
    assert metric_caption["y"] == metric_card["y"] + 44
    assert metric_caption["width"] == metric_card["width"] - 88
    assert metric_caption["height"] == metric_card["height"] - 88
    assert metric_caption["zIndex"] == metric_card["zIndex"] + 1


def test_generate_deck_skips_metric_card_without_caption() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "No empty card",
            "slides": [
                slide_payload(
                    "Metric slide",
                    "Metric message",
                    "Metric speaker note.",
                    slide_type="data",
                    slot_preset="metric_cards",
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    slide = response.deck["slides"][0]
    assert not has_element(slide, "el_1_metric_card")
    assert not has_element(slide, "el_1_metric_card_caption")


def test_generate_deck_varied_layout_keeps_stable_title_anchors() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Layout diversity",
            "slides": [
                slide_payload(
                    "First title slide",
                    "First title message",
                    "First speaker note.",
                    slide_type="title",
                    slot_preset="title_center",
                ),
                slide_payload(
                    "Second title slide",
                    "Second title message",
                    "Second speaker note.",
                    slide_type="title",
                    slot_preset="title_center",
                ),
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 2, "max": 2},
            design={"layoutDiversity": "varied"},
        ),
        client=fake_client,
    )

    first_title = element_by_role(response.deck["slides"][0], "title")
    second_title = element_by_role(response.deck["slides"][1], "title")
    assert response.deck["slides"][0]["style"]["layout"] == "title"
    assert response.deck["slides"][1]["style"]["layout"] == "title"
    for key in ("x", "y", "width", "height"):
        assert second_title[key] == first_title[key]


def test_generate_deck_limits_footer_and_keyword_chips_to_first_slide() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Deck chrome",
            "slides": [
                slide_payload(
                    "Title slide",
                    "Title message",
                    "Title speaker note.",
                    slide_type="title",
                    slot_preset="title_center",
                    keywords=["alpha"],
                ),
                slide_payload(
                    "Content slide",
                    "Content message",
                    "Content speaker note.",
                    slide_type="summary",
                    slot_preset="insight_with_evidence",
                    keywords=["beta"],
                    visual_intent={
                        "emphasis": "keywords",
                        "mood": "focused",
                        "structure": "chips",
                        "paletteHint": "",
                        "emphasisStyle": "keyword-chips",
                        "composition": "data",
                        "decorationDensity": "medium",
                        "mediaStyle": "",
                    },
                ),
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 2, "max": 2},
        ),
        client=fake_client,
    )

    first_slide, second_slide = response.deck["slides"]
    assert has_element(first_slide, "el_1_footer")
    assert has_element(first_slide, "el_1_keyword_chip_1")
    assert not has_element(second_slide, "el_2_footer")
    assert not has_element(second_slide, "el_2_keyword_chip_1")
    assert not has_element(second_slide, "el_2_keyword_chip_1_text")


def test_generate_deck_keeps_feature_grid_metric_cards_with_varied_layout() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Feature grid layout",
            "slides": [
                slide_payload(
                    "First feature grid",
                    "First feature message",
                    "First speaker note.",
                    slide_type="feature-grid",
                    slot_preset="metric_cards",
                ),
                slide_payload(
                    "Second feature grid",
                    "Second feature message",
                    "Second speaker note.",
                    slide_type="feature-grid",
                    slot_preset="title_left_visual_right",
                ),
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 2, "max": 2},
            design={"layoutDiversity": "varied"},
        ),
        client=fake_client,
    )

    for slide in response.deck["slides"]:
        title = element_by_role(slide, "title")
        assert slide["style"]["layout"] == "two-column"
        assert title["x"] == 120
        assert title["y"] == 88
        assert title["width"] == 1680
        assert title["height"] == 128


def test_generate_deck_summary_prefers_content_preset_over_quote() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Summary preset",
            "slides": [
                slide_payload(
                    "Summary bullets",
                    "- First point\n- Second point",
                    "Wrap up with two concrete points.",
                    slide_type="summary",
                    slot_preset="quote_with_source",
                    visual_intent={
                        "emphasis": "bullet list",
                        "mood": "concise",
                        "structure": "summary",
                        "paletteHint": "",
                        "emphasisStyle": "",
                        "composition": "data",
                        "decorationDensity": "medium",
                        "mediaStyle": "",
                    },
                    metric_card_caption="본문과 겹치면 안 되는 카드 설명입니다.",
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    slide = response.deck["slides"][0]
    assert slide["style"]["layout"] == "title-content"
    assert not has_element(slide, "el_1_metric_card")
    assert not has_element(slide, "el_1_metric_card_caption")
    assert not has_element(slide, "el_1_quote_block")


def test_generate_deck_avoid_media_policy_suppresses_placeholders() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Media policy",
            "slides": [
                slide_payload(
                    "Media slide",
                    "Media message",
                    "Media speaker note.",
                    slide_type="title",
                    slot_preset="title_left_visual_right",
                    media_intent={
                        "kind": "generate",
                        "prompt": "A generated image",
                        "alt": "Generated image",
                        "caption": "Generated image",
                        "rationale": "Visual support",
                        "required": True,
                        "placement": "right",
                        "src": "",
                    },
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
            design={"mediaPolicy": "avoid"},
        ),
        client=fake_client,
    )

    assert not has_element(response.deck["slides"][0], "el_1_media_placeholder")


def test_generate_deck_does_not_choose_media_preset_without_media() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Missing media",
            "slides": [
                slide_payload(
                    "No media slide",
                    "The model requested a media composition without usable media.",
                    "Keep the title layout stable.",
                    slide_type="title",
                    slot_preset="title_center",
                    media_intent={
                        "kind": "provided",
                        "prompt": "",
                        "alt": "",
                        "caption": "",
                        "rationale": "",
                        "required": False,
                        "placement": "right",
                        "src": "",
                    },
                    visual_intent={
                        "emphasis": "visual",
                        "mood": "clean",
                        "structure": "cover",
                        "paletteHint": "",
                        "emphasisStyle": "",
                        "composition": "media",
                        "decorationDensity": "medium",
                        "mediaStyle": "",
                    },
                )
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 1, "max": 1},
        ),
        client=fake_client,
    )

    slide = response.deck["slides"][0]
    assert slide["style"]["layout"] == "title"
    assert not has_element(slide, "el_1_media_placeholder")


def test_generate_deck_endpoint_requires_llm_for_reference_generation() -> None:
    response = client().post(
        "/ai/generate-deck",
        json={
            "projectId": "project_demo_1",
            "topic": "피카츄 소개",
            "slideCountRange": {"min": 2, "max": 2},
            "references": [{"fileId": "file_1"}],
            "referenceKeywords": [
                {"text": "전기 타입"},
                {"text": " 전기 타입 "},
                {"text": "볼주머니"},
            ],
        },
    )

    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


def test_generate_deck_uses_llm_content_plan_with_reference_context() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "전기 타입 포켓몬",
            "slides": [
                {
                    "title": "피카츄란?",
                    "message": "피카츄는 볼주머니에 전기를 저장하는 전기 타입 포켓몬입니다.",
                    "speakerNotes": "볼주머니와 전기 타입 특징을 연결해 소개합니다.",
                    "keywords": ["피카츄", "전기 타입"],
                },
                {
                    "title": "핵심 특징",
                    "message": "볼주머니, 번개 모양 꼬리, 친근한 이미지가 대표 특징입니다.",
                    "speakerNotes": "참고자료의 특징을 청중이 기억하기 쉽게 설명합니다.",
                    "keywords": ["볼주머니", "꼬리"],
                },
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="피카츄 소개",
            slideCountRange={"min": 2, "max": 2},
            references=[{"fileId": "file_1"}],
            referenceKeywords=[{"text": "전기 타입"}, {"text": "볼주머니"}],
        ),
        client=fake_client,
        model="gpt-test",
        reference_context=[
            ReferenceContext(
                fileId="file_1",
                title="pikachu.pdf",
                content="피카츄는 볼주머니에 전기를 저장하는 전기 타입 포켓몬이다.",
            )
        ],
    )

    body_texts = [
        element["props"]["text"]
        for slide in response.deck["slides"]
        for element in slide["elements"]
        if element["type"] == "text" and element["role"] == "body"
    ]
    slide_keywords = [
        keyword["text"]
        for keyword in response.deck["slides"][0]["keywords"]
    ]
    assert response.deck["title"] == "피카츄 소개: 전기 타입 포켓몬"
    assert response.validation.passed is True
    assert body_texts[0] == "피카츄는 볼주머니에 전기를 저장하는 전기 타입 포켓몬입니다."
    assert slide_keywords == ["전기 타입", "볼주머니", "피카츄"]
    assert has_element(response.deck["slides"][0], "el_1_keyword_chip_1")
    assert "피카츄는 볼주머니" in fake_client.requests[0]["input"]
    assert "actual Korean presenter script" in fake_client.requests[0]["instructions"]
    assert "목적과 기대 결과" not in "\n".join(body_texts)
    assert "결정 사항, 실행 순서" not in "\n".join(body_texts)


def test_generate_deck_uses_design_intents_without_schema_leak() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "디자인 고도화",
            "slides": [
                slide_payload(
                    "한눈에 보는 ORBIT",
                    "발표 흐름을 먼저 보여주고 핵심 메시지를 고정합니다.",
                    "첫 장에서는 ORBIT의 목적과 흐름을 짧게 소개합니다.",
                    slide_type="title",
                    slot_preset="title_left_visual_right",
                    media_intent={
                        "kind": "generate",
                        "prompt": "생성형 발표 도구의 작업 흐름",
                        "alt": "AI 발표 자료 생성 흐름",
                        "caption": "AI 생성 흐름 이미지",
                        "rationale": "시각 자료가 이해를 돕기 때문입니다.",
                        "required": True,
                        "placement": "right",
                        "src": "",
                    },
                ),
                slide_payload(
                    "핵심 지표",
                    "반복 작업 시간을 줄이고 발표 준비 속도를 높이는 점을 강조합니다.",
                    "숫자와 근거를 함께 설명합니다.",
                    slide_type="data",
                    slot_preset="metric_cards",
                    metric_card_caption="반복 작업 시간을 줄인다는 지표 카드입니다.",
                ),
                slide_payload(
                    "이전 방식과 ORBIT",
                    "수동 정리와 자동 초안 생성의 차이를 비교합니다.",
                    "두 방식의 차이를 기준별로 설명합니다.",
                    slide_type="comparison",
                    slot_preset="before_after",
                ),
                slide_payload(
                    "사용자가 기억할 한 문장",
                    "발표자는 내용에 집중하고 ORBIT는 반복 작업을 줄입니다.",
                    "마무리에서는 기억할 문장을 중심으로 정리합니다.",
                    slide_type="quote",
                    slot_preset="quote_with_source",
                ),
                slide_payload(
                    "기존 chart 동작",
                    "차트 슬라이드는 기존 chart-focus 레이아웃을 유지합니다.",
                    "기존 차트 생성 경로가 유지되는지 확인합니다.",
                    slide_type="chart",
                    slot_preset="insight_with_evidence",
                ),
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="AI 덱 생성 디자인 고도화",
            slideCountRange={"min": 5, "max": 5},
            design={"mediaPolicy": "placeholder-ok"},
        ),
        client=fake_client,
    )

    deck_text = json.dumps(response.deck, ensure_ascii=False)
    assert "visualIntent" not in deck_text
    assert "metricCardCaption" not in deck_text
    assert "mediaIntent" not in deck_text
    assert "slotPreset" not in deck_text
    assert "layoutCandidates" not in deck_text
    assert has_element(response.deck["slides"][0], "el_1_media_placeholder")
    assert response.deck["slides"][1]["style"]["layout"] == "two-column"
    assert has_element(response.deck["slides"][1], "el_2_metric_card")
    assert has_element(response.deck["slides"][1], "el_2_metric_card_caption")
    generated_texts = [
        element["props"]["text"]
        for slide in response.deck["slides"]
        for element in slide["elements"]
        if element["type"] == "text"
    ]
    assert all(not text.startswith("핵심\n") for text in generated_texts)
    assert has_element(response.deck["slides"][2], "el_3_comparison_divider")
    assert has_element(response.deck["slides"][3], "el_4_quote_block")
    assert any(
        element["type"] == "chart"
        for element in response.deck["slides"][4]["elements"]
    )
    assert response.deck["slides"][4]["style"]["layout"] == "chart-focus"
    assert response.validation.passed is True
    assert response.validation.design_issues[0].message == (
        "이미지 소스가 없어 자리 표시자를 생성했습니다."
    )
    assert "\ufffd" not in json.dumps(
        response.model_dump(by_alias=True),
        ensure_ascii=False,
    )


def test_generate_deck_applies_visual_intent_decorations_and_caps_elements() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "Visual intent",
            "slides": [
                slide_payload(
                    "Keyword chips",
                    "Use chips to emphasize the generated keywords.",
                    "Call out the keywords without changing the deck schema.",
                    slide_type="data",
                    slot_preset="metric_cards",
                    keywords=["속도", "품질", "협업"],
                    visual_intent={
                        "emphasis": "keywords",
                        "mood": "energetic",
                        "structure": "chips",
                        "paletteHint": "neon",
                        "emphasisStyle": "키워드 강조",
                        "composition": "data",
                        "decorationDensity": "high",
                        "mediaStyle": "",
                    },
                    metric_card_caption="속도, 품질, 협업 지표를 한 카드로 요약합니다.",
                ),
                slide_payload(
                    "Callout",
                    "This sentence should become a callout. Extra details stay in body.",
                    "Use the callout as an editable text element.",
                    slide_type="solution",
                    slot_preset="title_left_visual_right",
                    visual_intent={
                        "emphasis": "main sentence",
                        "mood": "focused",
                        "structure": "callout",
                        "paletteHint": "",
                        "emphasisStyle": "콜아웃",
                        "composition": "split",
                        "decorationDensity": "high",
                        "mediaStyle": "",
                    },
                ),
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 2, "max": 2},
        ),
        client=fake_client,
    )

    first_slide = response.deck["slides"][0]
    second_slide = response.deck["slides"][1]
    assert has_element(first_slide, "el_1_top_stripe")
    assert has_element(first_slide, "el_1_metric_card")
    assert has_element(first_slide, "el_1_metric_card_caption")
    for index in range(1, 4):
        assert has_element(first_slide, f"el_1_keyword_chip_{index}")
        assert has_element(first_slide, f"el_1_keyword_chip_{index}_text")
    assert has_element(second_slide, "el_2_diagonal_block")
    assert not has_element(second_slide, "el_2_callout_box")
    assert not has_element(second_slide, "el_2_callout_text")
    assert all(len(slide["elements"]) <= 14 for slide in response.deck["slides"])
    assert response.validation.passed is True


def test_generate_deck_creates_diagram_elements_from_composition() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "ORBIT diagrams",
            "slides": [
                slide_payload(
                    "프로세스",
                    "수집, 분석, 생성, 검증 순서로 진행합니다.",
                    "네 단계를 차례로 소개합니다.",
                    slide_type="process",
                    slot_preset="before_after",
                    keywords=["수집", "분석", "생성", "검증"],
                    visual_intent={
                        "emphasis": "steps",
                        "mood": "structured",
                        "structure": "process",
                        "paletteHint": "",
                        "emphasisStyle": "",
                        "composition": "process",
                        "decorationDensity": "low",
                        "mediaStyle": "",
                    },
                ),
                slide_payload(
                    "허브 구조",
                    "중앙 허브에서 네 개의 노드로 확장됩니다.",
                    "핵심 허브와 주변 노드를 설명합니다.",
                    slide_type="architecture",
                    slot_preset="insight_with_evidence",
                    keywords=["입력", "분류", "생성", "검증"],
                    visual_intent={
                        "emphasis": "hub",
                        "mood": "systematic",
                        "structure": "radial",
                        "paletteHint": "",
                        "emphasisStyle": "",
                        "composition": "radial",
                        "decorationDensity": "low",
                        "mediaStyle": "",
                    },
                ),
                slide_payload(
                    "버블 클러스터",
                    "다섯 개의 키워드가 한 화면에 모입니다.",
                    "키워드를 버블로 묶어 보여줍니다.",
                    slide_type="solution",
                    slot_preset="insight_with_evidence",
                    keywords=["초안", "편집", "공유", "연습", "실행"],
                    visual_intent={
                        "emphasis": "cluster",
                        "mood": "clear",
                        "structure": "bubble",
                        "paletteHint": "",
                        "emphasisStyle": "",
                        "composition": "bubble",
                        "decorationDensity": "low",
                        "mediaStyle": "",
                    },
                ),
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="Use generated plan.",
            slideCountRange={"min": 3, "max": 3},
        ),
        client=fake_client,
    )

    process_slide, radial_slide, bubble_slide = response.deck["slides"]
    process_steps = [
        element
        for element in process_slide["elements"]
        if element["elementId"].startswith("el_1_process_step_")
        and element["type"] == "customShape"
    ]
    radial_nodes = [
        element
        for element in radial_slide["elements"]
        if element["elementId"].startswith("el_2_radial_node_")
        and element["type"] == "ellipse"
    ]
    bubbles = [
        element
        for element in bubble_slide["elements"]
        if element["elementId"].startswith("el_3_bubble_")
        and element["type"] == "ellipse"
    ]

    assert process_slide["style"]["layout"] == "two-column"
    assert len(process_steps) == 4
    assert element_by_id(process_slide, "el_1_process_step_1_label")["props"]["text"] == "수집"
    assert element_by_id(radial_slide, "el_2_radial_hub")["type"] == "ellipse"
    assert len(radial_nodes) == 4
    assert element_by_id(radial_slide, "el_2_radial_node_1_label")["props"]["text"] == "입력"
    assert len(bubbles) == 5
    assert element_by_id(bubble_slide, "el_3_bubble_1_label")["props"]["text"] == "초안"
    assert response.validation.passed is True


def slide_payload(
    title: str,
    message: str,
    speaker_notes: str,
    *,
    slide_type: str,
    slot_preset: str,
    keywords: list[str] | None = None,
    media_intent: dict[str, object] | None = None,
    visual_intent: dict[str, object] | None = None,
    metric_card_caption: str = "",
) -> dict[str, object]:
    visual_intent_payload = dict(
        visual_intent
        or {
            "emphasis": "핵심 메시지",
            "mood": "professional",
            "structure": "safe slots",
            "paletteHint": "",
            "emphasisStyle": "",
            "composition": "",
            "decorationDensity": "medium",
            "mediaStyle": "",
        }
    )
    visual_intent_payload.setdefault("metricCardCaption", metric_card_caption)
    return {
        "title": title,
        "message": message,
        "speakerNotes": speaker_notes,
        "keywords": keywords or ["ORBIT"],
        "slideType": slide_type,
        "layoutVariant": slot_preset.split("_", maxsplit=1)[0],
        "slotPreset": slot_preset,
        "visualIntent": visual_intent_payload,
        "mediaIntent": media_intent
        or {
            "kind": "none",
            "prompt": "",
            "alt": "",
            "caption": "",
            "rationale": "",
            "required": False,
            "placement": "auto",
            "src": "",
        },
    }


def has_element(slide: dict[str, Any], element_id: str) -> bool:
    return any(
        element["elementId"] == element_id
        for element in slide["elements"]
    )


def element_by_id(slide: dict[str, Any], element_id: str) -> dict[str, Any]:
    return next(
        element
        for element in slide["elements"]
        if element["elementId"] == element_id
    )


def element_by_role(slide: dict[str, Any], role: str) -> dict[str, Any]:
    return next(
        element
        for element in slide["elements"]
        if element["role"] == role
    )


class FakeOpenAIClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.requests: list[dict[str, object]] = []
        self.responses = FakeResponses(self, payload)


class FakeResponses:
    def __init__(self, parent: FakeOpenAIClient, payload: dict[str, object]) -> None:
        self.parent = parent
        self.payload = payload

    def create(self, **kwargs: object) -> object:
        self.parent.requests.append(kwargs)
        return type(
            "Response",
            (),
            {"output_text": json.dumps(self.payload, ensure_ascii=False)},
        )()
