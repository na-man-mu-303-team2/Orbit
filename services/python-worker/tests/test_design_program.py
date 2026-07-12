import json
from collections import Counter
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.composition_library import COMPOSITION_SPECS, normalize_design_program
from app.ai.design_program import (
    ArtDirectorContext,
    DeckDesignProgram,
    DesignProgramError,
    art_director_prompt,
    create_design_program,
    design_program_response_format,
)
from app.ai.generate_deck import (
    DeckGenerationOrchestrator,
    GenerateDeckRequest,
    GeneratedContentItem,
    MediaIntent,
    SlidePlan,
    SourceRecord,
    VisualIntent,
    analyze_input,
    initial_source_records,
    is_expected_media_placeholder,
    program_v2_visual_plan,
    program_v2_slide_summary,
    validate_presentation,
)


def context() -> ArtDirectorContext:
    return ArtDirectorContext(
        topic="Splatoon Raiders",
        presentationProfile="product-launch",
        brief={"presentationType": "제품 공개", "audience": "게임 팬"},
        palette={"background": "#FFFFFF", "primary": "#6D28D9"},
        typography={"headingFont": "Pretendard", "bodyFont": "Pretendard"},
        forbiddenStyles=["gradient", "pastel"],
        mediaPolicy="hybrid",
        mediaBudget=4,
    )


def slides() -> list[dict[str, Any]]:
    return [
        {
            "title": "새로운 모험",
            "message": "스플래툰 레이더스가 새로운 경험을 연다",
            "contentItems": [{"text": "공식 공개 정보"}],
            "slideType": "cover",
            "mediaIntent": {
                "kind": "generate",
                "prompt": "ink island adventure",
                "alt": "게임 세계",
                "required": True,
            },
            "speakerNotes": "프롬프트에 포함되면 안 되는 전체 발표 메모",
            "sourceRecords": ["프롬프트에 포함되면 안 되는 연구 원문"],
        },
        {
            "title": "지금 확인하세요",
            "message": "공식 채널에서 다음 소식을 확인한다",
            "contentItems": [{"text": "공식 사이트"}],
            "slideType": "summary",
            "mediaIntent": {"kind": "none", "required": False},
        },
    ]


def valid_program() -> dict[str, Any]:
    return {
        "version": "program-v2",
        "visualConcept": "Energetic ink expedition",
        "paletteRoles": {
            "dominant": "#FFFFFF",
            "surface": "#F3F4F6",
            "text": "#111827",
            "focal": "#6D28D9",
            "secondary": "#22D3EE",
        },
        "typography": {
            "headingFont": "Pretendard",
            "bodyFont": "Pretendard",
            "typeScale": {"cover": 64, "title": 40, "body": 22, "caption": 14},
        },
        "backgroundSequence": ["image", "dark"],
        "imageStyle": "Official key art with clean crops",
        "surfaceStyle": "Flat ink color fields",
        "slides": [
            {
                "order": 1,
                "compositionId": "hero-full-bleed",
                "variant": "image",
                "backgroundMode": "image",
                "focalType": "hero-image",
                "assetRole": "atmosphere",
                "requiredAsset": True,
            },
            {
                "order": 2,
                "compositionId": "cta-closing",
                "variant": "dark",
                "backgroundMode": "dark",
                "focalType": "cta",
                "assetRole": "none",
                "requiredAsset": False,
            },
        ],
    }


class FakeResponses:
    def __init__(self, payloads: list[dict[str, Any]]) -> None:
        self.payloads = payloads
        self.requests: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.requests.append(kwargs)
        payload = self.payloads[min(len(self.requests) - 1, len(self.payloads) - 1)]
        return SimpleNamespace(output_text=json.dumps(payload, ensure_ascii=False))


def test_art_director_prompt_uses_only_compact_slide_summaries() -> None:
    prompt = art_director_prompt(context(), slides())

    assert "프롬프트에 포함되면 안 되는 전체 발표 메모" not in prompt
    assert "프롬프트에 포함되면 안 되는 연구 원문" not in prompt
    assert "hero-split" in prompt
    assert "mediaBudget" in prompt


def test_response_format_requires_exact_slide_count() -> None:
    schema = design_program_response_format(10)["format"]["schema"]

    assert schema["properties"]["slides"]["minItems"] == 10
    assert schema["properties"]["slides"]["maxItems"] == 10
    assert schema["properties"]["backgroundSequence"]["minItems"] == 10


def test_hybrid_official_asset_placeholder_is_expected_before_resolution() -> None:
    slide = {
        "aiNotes": {
            "visualPlan": {
                "imageNeeded": True,
                "imageSourcePolicy": "official-assets",
            }
        }
    }

    assert is_expected_media_placeholder(slide) is True


def test_program_v2_visual_plan_replaces_generic_media_prompt_with_slide_subject() -> None:
    raw_input = analyze_input(
        GenerateDeckRequest(
            projectId="project_program_v2",
            generationMode="design-pack",
            topic="Splatoon Raiders",
            design={
                "engineVersion": "program-v2",
                "mediaPolicy": "hybrid",
                "constraints": {
                    "forbiddenStyles": ["gradient", "pastel"],
                },
            },
        )
    )
    slide = SlidePlan(
        order=2,
        slide_type="data",
        title="Nintendo Switch 2 전용 경험",
        message="공식 발표 사실을 확인한다",
        speaker_notes="공식 발표 내용을 설명합니다.",
        keywords=[],
        evidence=[],
        content_items=[
            GeneratedContentItem(contentItemId="item-1", text="전용 플랫폼")
        ],
        media_intent=MediaIntent(prompt="none", alt="공식 제품 이미지"),
        visual_intent=VisualIntent(mediaStyle="clean"),
    )
    design_program = DeckDesignProgram.model_validate(valid_program())
    direction = design_program.slides[0].model_copy(
        update={"asset_role": "evidence", "required_asset": True}
    )

    plan = program_v2_visual_plan(
        raw_input,
        slide,
        design_program,
        direction,
    )

    assert plan["imageSourcePolicy"] == "official-assets"
    assert "Splatoon Raiders" in plan["imagePrompt"]
    assert "Nintendo Switch 2 전용 경험" in plan["imagePrompt"]
    assert "official product evidence" in plan["imagePrompt"]
    assert "none" not in plan["imagePrompt"]
    assert "avoid gradient and pastel" in plan["imagePrompt"]


def test_program_v2_visual_plan_omits_icon_style_from_large_media_prompt() -> None:
    raw_input = analyze_input(
        GenerateDeckRequest(
            projectId="project_program_v2",
            generationMode="design-pack",
            topic="Splatoon Raiders",
            design={"engineVersion": "program-v2", "mediaPolicy": "hybrid"},
        )
    )
    slide = SlidePlan(
        order=2,
        slide_type="solution",
        title="차별화된 협동 모험",
        message="협동 탐험 경험을 강조한다",
        speaker_notes="협동 탐험 경험을 설명합니다.",
        keywords=[],
        evidence=[],
        content_items=[
            GeneratedContentItem(contentItemId="item-1", text="협동 탐험")
        ],
        media_intent=MediaIntent(alt="협동 모험 장면"),
        visual_intent=VisualIntent(mediaStyle="icon"),
    )
    design_program = DeckDesignProgram.model_validate(valid_program())
    direction = design_program.slides[0].model_copy(
        update={"asset_role": "atmosphere", "required_asset": False}
    )

    plan = program_v2_visual_plan(raw_input, slide, design_program, direction)

    assert "atmospheric key visual" in plan["imagePrompt"]
    assert "icon" not in plan["imagePrompt"]


def test_program_v2_slide_summary_reports_official_source_availability() -> None:
    raw_input = analyze_input(
        GenerateDeckRequest(
            projectId="project_program_v2",
            generationMode="design-pack",
            topic="Splatoon Raiders",
        )
    )
    raw_input.source_records = [
        SourceRecord(
            sourceType="web",
            sourceId="web:official",
            url="https://example.com/official",
            title="Official announcement",
            content="Official product facts",
            authority="official",
        )
    ]
    slide = SlidePlan(
        order=1,
        slide_type="cover",
        title="Official reveal",
        message="The official reveal is available.",
        speaker_notes="Introduce the official reveal.",
        keywords=[],
        evidence=[],
        content_items=[
            GeneratedContentItem(contentItemId="item-1", text="Official reveal")
        ],
        source_refs=["web:official"],
    )

    summary = program_v2_slide_summary(slide, raw_input)

    assert summary["officialSourceAvailable"] is True


def test_normalize_replaces_adjacent_comparison_silhouettes() -> None:
    plans = golden_slide_plans()
    plans[6].slide_type = "comparison"
    payload = golden_design_program()
    payload["slides"][6]["compositionId"] = "feature-comparison"
    program = DeckDesignProgram.model_validate(payload)

    normalized = normalize_design_program(
        program,
        [program_v2_slide_summary(plan) for plan in plans],
        media_policy="hybrid",
    )

    assert normalized.slides[5].composition_id == "feature-comparison"
    assert normalized.slides[6].composition_id == "editorial-split"


def test_create_design_program_retries_one_invalid_response() -> None:
    invalid = {**valid_program(), "backgroundSequence": ["image"]}
    responses = FakeResponses([invalid, valid_program()])
    client = SimpleNamespace(responses=responses)

    program = create_design_program(context(), slides(), client=client)

    assert program.visual_concept == "Energetic ink expedition"
    assert len(responses.requests) == 2


def test_create_design_program_fails_after_one_retry() -> None:
    invalid = {**valid_program(), "slides": []}
    responses = FakeResponses([invalid, invalid])

    with pytest.raises(DesignProgramError):
        create_design_program(
            context(),
            slides(),
            client=SimpleNamespace(responses=responses),
        )


def test_program_v2_orchestrator_compiles_design_program_deck() -> None:
    responses = FakeResponses([valid_program()])
    orchestrator = DeckGenerationOrchestrator(
        GenerateDeckRequest(
            projectId="project_program_v2",
            generationMode="design-pack",
            topic="Splatoon Raiders",
            targetDurationMinutes=2,
            slideCountRange={"min": 2, "max": 2},
            design={"engineVersion": "program-v2", "mediaPolicy": "hybrid"},
            visualPlanPolicy={"mediaPolicy": "hybrid"},
        ),
        client=SimpleNamespace(responses=responses),
    )
    raw_input = orchestrator.run_brief_agent()
    raw_input.source_records = initial_source_records(raw_input)
    slide_plans = [
        SlidePlan(
            order=1,
            slide_type="cover",
            title="새로운 모험",
            message="스플래툰 레이더스가 새로운 경험을 연다",
            speaker_notes="공식 공개 내용을 소개합니다.",
            keywords=["Splatoon Raiders"],
            evidence=[],
            content_items=[
                GeneratedContentItem(
                    contentItemId="item-1",
                    text="스플래툰 레이더스가 새로운 경험을 연다",
                )
            ],
            source_refs=["topic:brief"],
            media_intent=MediaIntent(
                kind="generate",
                prompt="ink island adventure",
                alt="게임 세계",
                required=True,
            ),
        ),
        SlidePlan(
            order=2,
            slide_type="summary",
            title="지금 확인하세요",
            message="공식 채널에서 다음 소식을 확인한다",
            speaker_notes="공식 채널 확인을 요청합니다.",
            keywords=["공식 채널"],
            evidence=[],
            content_items=[
                GeneratedContentItem(contentItemId="item-2", text="공식 사이트")
            ],
            source_refs=["topic:brief"],
        ),
    ]

    slide_plans, theme = orchestrator.run_design_director_agent(
        raw_input,
        slide_plans,
    )
    compiled_slides = orchestrator.run_layout_agent(
        raw_input,
        slide_plans,
        theme,
        [],
    )
    deck = orchestrator.build_deck(
        raw_input,
        type("Outline", (), {"title": "Splatoon Raiders"})(),
        theme,
        compiled_slides,
    )

    assert deck["metadata"]["designProgramSnapshot"]["version"] == "program-v2"
    assert deck["slides"][0]["aiNotes"]["compositionPlan"]["compositionId"] == (
        "hero-full-bleed"
    )
    assert deck["slides"][0]["aiNotes"]["visualPlan"]["imageSourcePolicy"] == (
        "ai-generated"
    )
    assert sum(
        element.get("props", {}).get("text")
        == "스플래툰 레이더스가 새로운 경험을 연다"
        for element in deck["slides"][0]["elements"]
    ) == 1
    assert all(
        "_design_pack_" not in element["elementId"]
        for slide in deck["slides"]
        for element in slide["elements"]
    )


def test_splatoon_product_launch_golden_composition_contract() -> None:
    fixture_path = (
        Path(__file__).parent
        / "fixtures"
        / "splatoon_product_launch_golden_request.json"
    )
    request = GenerateDeckRequest.model_validate_json(fixture_path.read_text("utf-8"))
    slide_plans = golden_slide_plans()
    responses = FakeResponses([golden_design_program()])
    orchestrator = DeckGenerationOrchestrator(
        request,
        client=SimpleNamespace(responses=responses),
    )
    raw_input = orchestrator.run_brief_agent()
    raw_input.source_records = [
        *initial_source_records(raw_input),
        SourceRecord(
            sourceType="web",
            sourceId="web:official",
            url="https://example.com/splatoon-official",
            title="Official Splatoon Raiders announcement",
            content="Official product reveal images and facts",
            authority="official",
        ),
    ]
    for slide_order in (2, 8):
        slide_plans[slide_order - 1].source_refs = ["web:official"]

    normalized_plans, theme = orchestrator.run_design_director_agent(
        raw_input,
        slide_plans,
    )
    compiled_slides = orchestrator.run_layout_agent(
        raw_input,
        normalized_plans,
        theme,
        [],
    )
    deck = orchestrator.build_deck(
        raw_input,
        type("Outline", (), {"title": "스플래툰 레이더스"})(),
        theme,
        compiled_slides,
    )

    composition_ids = [
        slide["aiNotes"]["compositionPlan"]["compositionId"]
        for slide in deck["slides"]
    ]
    silhouettes = [COMPOSITION_SPECS[value].silhouette for value in composition_ids]
    asset_roles = [
        slide["aiNotes"]["compositionPlan"]["assetRole"]
        for slide in deck["slides"]
    ]
    backgrounds = {
        slide["aiNotes"]["compositionPlan"]["backgroundMode"]
        for slide in deck["slides"]
    }

    assert len(deck["slides"]) == 10
    assert deck["metadata"]["presentationProfile"] == "product-launch"
    assert max(Counter(composition_ids).values()) <= 2
    assert all(left != right for left, right in zip(silhouettes, silhouettes[1:]))
    assert len(backgrounds) >= 2
    assert 3 <= sum(role != "none" for role in asset_roles) <= 5
    for slide in deck["slides"]:
        focal_id = slide["aiNotes"]["compositionPlan"]["primaryFocalElementId"]
        assert focal_id in {element["elementId"] for element in slide["elements"]}
        assert all(
            "_program_v2_" in element["elementId"]
            for element in slide["elements"]
        )
    guarded_issue_codes = {
        "CONTENT_DUPLICATED",
        "VISUAL_HIERARCHY_WEAK",
        "GRID_ALIGNMENT_INCONSISTENT",
        "LINE_HEIGHT_OUT_OF_RANGE",
    }
    quality_issues = [
        issue
        for issue in validate_presentation(deck)
        if issue.code in guarded_issue_codes
    ]
    assert quality_issues == [], [
        (issue.code, issue.path, issue.message) for issue in quality_issues
    ]


def golden_slide_plans() -> list[SlidePlan]:
    definitions = [
        ("cover", "미지의 군도로", "레이더스는 탐험 중심의 새 경험을 연다", ["공식 공개", "새로운 무대"]),
        ("solution", "혼자 떠나는 탐사", "익숙한 잉크 액션이 단독 탐험으로 확장된다", ["단독 플레이", "탐사 루프", "잉크 이동"]),
        ("feature-grid", "발견이 플레이가 된다", "섬의 발견과 수집이 진행 동기를 만든다", ["탐색", "수집", "성장"]),
        ("data", "공식 정보 한눈에", "확인된 정보와 미정 정보를 분리해 전달한다", ["플랫폼", "공개 상태"]),
        ("architecture", "탐험 루프", "이동과 발견, 대응, 귀환이 하나의 루프를 이룬다", ["이동", "발견", "대응", "귀환"]),
        ("comparison", "시리즈의 새 축", "대전 중심 경험과 다른 탐험 가치를 제안한다", ["기존 대전", "레이더스 탐험", "공통 잉크 액션"]),
        ("process", "한 번의 원정", "준비부터 귀환까지 선택이 이어진다", ["준비", "진입", "탐사", "귀환"]),
        ("data", "공식 장면이 증거다", "공식 키 아트와 트레일러 장면으로 변화를 보여준다", ["공식 키 아트", "트레일러 장면"]),
        ("solution", "팬이 기대할 이유", "익숙함과 새로움이 동시에 진입 동기를 만든다", ["세계관", "조작감", "새 목표"]),
        ("summary", "다음 공개를 확인하세요", "공식 채널에서 출시 정보를 이어서 확인한다", ["공식 사이트", "공식 채널"]),
    ]
    plans: list[SlidePlan] = []
    for order, (slide_type, title, message, items) in enumerate(definitions, start=1):
        media = None
        if order in {1, 2, 8, 10}:
            media = MediaIntent(
                kind="generate",
                prompt=f"Splatoon Raiders official visual for {title}",
                alt=title,
                required=order in {1, 8},
            )
        plans.append(
            SlidePlan(
                order=order,
                slide_type=slide_type,
                title=title,
                message=message,
                speaker_notes=f"{order}번 슬라이드에서 {message}는 점을 설명합니다.",
                keywords=[title],
                evidence=[],
                content_items=[
                    GeneratedContentItem(
                        contentItemId=f"item-{order}-{index}",
                        text=value,
                    )
                    for index, value in enumerate(items, start=1)
                ],
                source_refs=["topic:brief"],
                **({"media_intent": media} if media is not None else {}),
            )
        )
    return plans


def golden_design_program() -> dict[str, Any]:
    composition_ids = [
        "hero-full-bleed",
        "editorial-split",
        "feature-comparison",
        "metric-poster",
        "diagram-hub",
        "feature-comparison",
        "process-horizontal",
        "image-evidence",
        "kpi-strip-evidence",
        "cta-closing",
    ]
    background_modes = [
        "image",
        "light",
        "dark",
        "light",
        "dark",
        "light",
        "dark",
        "light",
        "dark",
        "light",
    ]
    asset_roles = [
        "atmosphere",
        "evidence",
        "none",
        "none",
        "none",
        "none",
        "none",
        "evidence",
        "none",
        "atmosphere",
    ]
    return {
        "version": "program-v2",
        "visualConcept": "Playful ink expedition with editorial evidence",
        "paletteRoles": {
            "dominant": "#FFFFFF",
            "surface": "#F3F4F6",
            "text": "#111827",
            "focal": "#6D28D9",
            "secondary": "#22D3EE",
        },
        "typography": {
            "headingFont": "Pretendard",
            "bodyFont": "Pretendard",
            "typeScale": {"cover": 64, "title": 40, "body": 22, "caption": 14},
        },
        "backgroundSequence": background_modes,
        "imageStyle": "Official game art with bold clean crops",
        "surfaceStyle": "Flat ink fields without gradients",
        "slides": [
            {
                "order": order,
                "compositionId": composition_id,
                "variant": background,
                "backgroundMode": background,
                "focalType": "primary-message",
                "assetRole": asset_role,
                "requiredAsset": order in {1, 8},
            }
            for order, (composition_id, background, asset_role) in enumerate(
                zip(composition_ids, background_modes, asset_roles, strict=True),
                start=1,
            )
        ],
    }
