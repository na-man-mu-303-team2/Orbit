import base64
import json
from io import BytesIO
from types import SimpleNamespace
from typing import Any

import pytest
from PIL import Image

import app.ai.visual_qa as visual_qa_module
from app.ai.pptx_design_importer import ImportedDesignAsset
from app.ai.visual_qa import (
    VisualQaRequest,
    VisualQaReview,
    VisualRepairRequest,
    build_montage,
    repair_deck_visuals,
    review_deck_visuals,
    visual_review_response_format,
)


def png_base64(color: str = "#FFFFFF") -> str:
    image = Image.new("RGB", (1920, 1080), color)
    output = BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def rendered_asset(order: int) -> ImportedDesignAsset:
    return ImportedDesignAsset(
        assetId=f"slide_render_{order}",
        fileName=f"slide-{order:02d}.png",
        mimeType="image/png",
        contentBase64=png_base64("#FFFFFF" if order % 2 else "#111827"),
    )


def deck() -> dict[str, Any]:
    return {
        "deckId": "deck_visual",
        "projectId": "project_visual",
        "title": "Visual deck",
        "version": 1,
        "metadata": {
            "language": "ko",
            "locale": "ko-KR",
            "sourceType": "ai",
            "generatedBy": "ai",
            "createdFrom": {
                "topic": "Visual deck",
                "references": [],
                "designReferences": [],
            },
            "designProgramSnapshot": {
                "version": "program-v2",
                "visualConcept": "Bold product reveal",
                "paletteRoles": {
                    "dominant": "#FFFFFF",
                    "surface": "#F3F4F6",
                    "text": "#111827",
                    "focal": "#6D28D9",
                    "secondary": "#06B6D4",
                },
                "typography": {
                    "headingFont": "Pretendard",
                    "bodyFont": "Pretendard",
                    "typeScale": {
                        "cover": 64,
                        "title": 40,
                        "body": 22,
                        "caption": 14,
                    },
                },
                "backgroundSequence": ["light"],
                "imageStyle": "Official evidence",
                "surfaceStyle": "Flat ink fields",
                "compositionIds": ["minimal-cover"],
            },
        },
        "canvas": {
            "preset": "wide-16-9",
            "width": 1920,
            "height": 1080,
            "aspectRatio": "16:9",
        },
        "targetDurationMinutes": 5,
        "theme": {
            "name": "program-v2",
            "fontFamily": "Pretendard",
            "backgroundColor": "#FFFFFF",
            "textColor": "#111827",
            "accentColor": "#6D28D9",
            "palette": {
                "primary": "#6D28D9",
                "secondary": "#06B6D4",
                "surface": "#F3F4F6",
                "muted": "#E2E8F0",
                "border": "#CBD5E1",
            },
            "typography": {
                "headingFontFamily": "Pretendard",
                "bodyFontFamily": "Pretendard",
                "titleSize": 64,
                "headingSize": 40,
                "bodySize": 22,
                "captionSize": 14,
            },
            "effects": {"borderRadius": 8},
        },
        "slides": [
            {
                "slideId": "slide_1",
                "order": 1,
                "title": "새로운 모험",
                "style": {"backgroundColor": "#FFFFFF"},
                "speakerNotes": "공식 공개 내용을 소개합니다.",
                "elements": [
                    {
                        "elementId": "el_1_program_v2_background",
                        "type": "rect",
                        "role": "background",
                        "x": 0,
                        "y": 0,
                        "width": 1920,
                        "height": 1080,
                        "zIndex": 0,
                        "props": {"fill": "#FFFFFF"},
                    },
                    {
                        "elementId": "el_1_program_v2_title",
                        "type": "text",
                        "role": "title",
                        "x": 220,
                        "y": 300,
                        "width": 1480,
                        "height": 250,
                        "zIndex": 4,
                        "props": {
                            "text": "새로운 모험",
                            "fontFamily": "Pretendard",
                            "fontSize": 64,
                            "color": "#111827",
                        },
                    },
                ],
                "animations": [],
                "aiNotes": {
                    "emphasisPoints": ["새로운 경험을 연다"],
                    "sourceLedger": [
                        {
                            "claim": "공식 공개 정보",
                            "source": "topic",
                            "sourceType": "topic",
                            "confidence": 0.8,
                            "usedInSlideId": "slide_1",
                        }
                    ],
                    "visualPlan": {
                        "visualType": "minimal-cover",
                        "imageNeeded": False,
                        "imageSourcePolicy": "minimal",
                        "reason": "Native composition",
                    },
                    "compositionPlan": {
                        "compositionId": "minimal-cover",
                        "variant": "light",
                        "backgroundMode": "light",
                        "focalType": "title",
                        "primaryFocalElementId": "el_1_program_v2_title",
                        "assetRole": "none",
                        "requiredAsset": False,
                    },
                },
            }
        ],
    }


class FakeResponses:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.requests: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.requests.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payload))


def test_review_uses_exported_pptx_render_and_montage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        visual_qa_module,
        "export_deck_pptx",
        lambda _request: SimpleNamespace(
            content_base64=base64.b64encode(b"pptx").decode("ascii"),
            warnings=[],
        ),
    )
    monkeypatch.setattr(
        visual_qa_module,
        "render_pptx_to_png_assets",
        lambda _content, _canvas: [rendered_asset(1)],
    )
    responses = FakeResponses({"passed": True, "issues": [], "repairActions": []})

    result = review_deck_visuals(
        VisualQaRequest(deck=deck()),
        client=SimpleNamespace(responses=responses),
    )

    assert result.review.passed is True
    assert len(result.rendered_slides) == 1
    request_content = responses.requests[0]["input"][0]["content"]
    assert request_content[1]["type"] == "input_image"
    assert request_content[1]["image_url"].startswith("data:image/png;base64,")


def test_visual_review_prompt_includes_design_program_contract() -> None:
    prompt = visual_qa_module.visual_review_prompt(deck())

    assert '"allowedBackgroundModes": ["light"]' in prompt
    assert '"focal": "#6D28D9"' in prompt
    assert '"compositionUsage": {"minimal-cover": 1}' in prompt
    assert '"hasMedia": false' in prompt


def test_visual_review_requires_issues_when_failed() -> None:
    with pytest.raises(ValueError):
        VisualQaReview(passed=False, issues=[], repairActions=[])


def test_visual_response_schema_limits_slide_order() -> None:
    issue = visual_review_response_format(10)["format"]["schema"]["properties"][
        "issues"
    ]["items"]["properties"]["slideOrder"]

    assert issue["minimum"] == 1
    assert issue["maximum"] == 10


def test_montage_contains_all_rendered_slides() -> None:
    montage = Image.open(BytesIO(build_montage([rendered_asset(1), rendered_asset(2)])))

    assert montage.width == 1920
    assert montage.height == 576


def test_replace_image_repair_creates_resolvable_asset_slot() -> None:
    candidate = deck()
    slide = candidate["slides"][0]
    slide["elements"].append(
        {
            "elementId": "el_1_program_v2_media_asset",
            "type": "image",
            "role": "media",
            "x": 1090,
            "y": 120,
            "width": 710,
            "height": 840,
            "zIndex": 5,
            "props": {"src": "data:image/png;base64,AA==", "alt": "old"},
        }
    )
    slide["aiNotes"]["visualPlan"].update(
        {
            "imageNeeded": True,
            "imageSourcePolicy": "ai-generated",
            "asset": {"fileId": "file_old", "provider": "openai"},
        }
    )
    slide["aiNotes"]["compositionPlan"]["primaryFocalElementId"] = (
        "el_1_program_v2_media_asset"
    )
    slide["animations"] = [
        {"animationId": "anim-1", "elementId": "el_1_program_v2_media_asset"}
    ]
    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": candidate,
                "actions": [
                    {
                        "action": "replaceImage",
                        "slideId": "slide_1",
                        "reason": "Image is unrelated",
                    }
                ],
            }
        )
    )

    assert result.asset_slide_ids == ["slide_1"]
    assert any(
        element["elementId"].endswith("_media_placeholder")
        for element in result.deck["slides"][0]["elements"]
    )
    assert "asset" not in result.deck["slides"][0]["aiNotes"]["visualPlan"]
    assert result.deck["slides"][0]["aiNotes"]["compositionPlan"][
        "primaryFocalElementId"
    ].endswith("_media_placeholder")
    assert result.deck["slides"][0]["animations"][0]["elementId"].endswith(
        "_media_placeholder"
    )
    assert isinstance(result.validation.passed, bool)


def test_dark_background_repair_uses_dark_palette_roles() -> None:
    candidate = deck()
    snapshot = candidate["metadata"]["designProgramSnapshot"]
    snapshot["paletteRoles"].update(
        {
            "dominant": "#050505",
            "surface": "#111827",
            "text": "#F8FAFC",
        }
    )
    snapshot["backgroundSequence"] = ["dark"]

    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": candidate,
                "actions": [
                    {
                        "action": "switchBackgroundMode",
                        "slideId": "slide_1",
                        "backgroundMode": "dark",
                        "reason": "Restore the declared dark palette",
                    }
                ],
            }
        )
    )
    repaired = result.deck["slides"][0]
    background = next(
        element for element in repaired["elements"] if element["role"] == "background"
    )
    text = next(
        element for element in repaired["elements"] if element["type"] == "text"
    )

    assert repaired["style"]["backgroundColor"] == "#050505"
    assert background["props"]["fill"] == "#050505"
    assert text["props"]["color"] == "#F8FAFC"


def test_change_crop_repair_escalates_weak_official_asset_to_ai_generation() -> None:
    candidate = deck()
    candidate["slides"][0]["elements"].append(
        {
            "elementId": "el_1_program_v2_media_asset",
            "type": "image",
            "role": "media",
            "x": 972,
            "y": 120,
            "width": 828,
            "height": 840,
            "zIndex": 5,
            "props": {
                "src": "/api/v1/projects/project_visual/assets/file_visual/content",
                "alt": "Official hero",
                "fit": "cover",
                "focusX": 0.5,
                "focusY": 0.5,
            },
        }
    )
    candidate["slides"][0]["aiNotes"]["visualPlan"].update(
        {
            "imageNeeded": True,
            "imageSourcePolicy": "official-assets",
            "asset": {"fileId": "file_visual", "provider": "official-web"},
        }
    )
    request = {
        "actions": [
            {
                "action": "changeCrop",
                "slideId": "slide_1",
                "reason": "Remove excessive image whitespace",
            }
        ]
    }

    first = repair_deck_visuals(
        VisualRepairRequest.model_validate({"deck": candidate, **request})
    )
    second = repair_deck_visuals(
        VisualRepairRequest.model_validate({"deck": first.deck, **request})
    )
    first_image = next(
        element
        for element in first.deck["slides"][0]["elements"]
        if element.get("type") == "image"
    )
    second_placeholder = next(
        element
        for element in second.deck["slides"][0]["elements"]
        if str(element.get("elementId", "")).endswith("_media_placeholder")
    )

    assert first_image["props"]["crop"] == {
        "left": 0.12,
        "top": 0.12,
        "right": 0.12,
        "bottom": 0.12,
    }
    assert second_placeholder["type"] == "rect"
    assert second.asset_slide_ids == ["slide_1"]
    assert second.deck["slides"][0]["aiNotes"]["visualPlan"][
        "imageSourcePolicy"
    ] == "ai-generated"


def test_change_composition_recompiles_from_snapshot() -> None:
    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": deck(),
                "actions": [
                    {
                        "action": "changeComposition",
                        "slideId": "slide_1",
                        "compositionId": "hero-split",
                        "backgroundMode": "light",
                        "reason": "Cover needs stronger hierarchy",
                    }
                ],
            }
        )
    )

    plan = result.deck["slides"][0]["aiNotes"]["compositionPlan"]
    assert plan["compositionId"] == "hero-split"
    assert any(
        element["elementId"] == plan["primaryFocalElementId"]
        for element in result.deck["slides"][0]["elements"]
    )
    assert result.deck["metadata"]["designProgramSnapshot"]["compositionIds"] == [
        "hero-split"
    ]


def test_change_composition_without_id_uses_compatible_alternative() -> None:
    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": deck(),
                "actions": [
                    {
                        "action": "changeComposition",
                        "slideId": "slide_1",
                        "reason": "Cover silhouette is too repetitive",
                    }
                ],
            }
        )
    )

    plan = result.deck["slides"][0]["aiNotes"]["compositionPlan"]
    assert plan["compositionId"] == "hero-split"
    assert not any("requires compositionId" in warning for warning in result.warnings)


def test_change_composition_preserves_resolved_media_focal_id() -> None:
    candidate = deck()
    candidate["slides"][0]["aiNotes"]["compositionPlan"].update(
        {
            "compositionId": "hero-split",
            "primaryFocalElementId": "el_1_program_v2_media_asset",
            "assetRole": "atmosphere",
            "requiredAsset": False,
        }
    )
    candidate["metadata"]["designProgramSnapshot"]["compositionIds"] = [
        "hero-split"
    ]
    candidate["slides"][0]["aiNotes"]["visualPlan"].update(
        {
            "imageNeeded": True,
            "imageSourcePolicy": "hybrid",
            "reason": "Hero atmosphere",
        }
    )
    candidate["slides"][0]["elements"].append(
        {
            "elementId": "el_1_program_v2_media_asset",
            "type": "image",
            "role": "media",
            "x": 972,
            "y": 120,
            "width": 828,
            "height": 840,
            "zIndex": 5,
            "props": {
                "src": "/api/v1/projects/project_visual/assets/file_visual/content",
                "alt": "Official hero",
                "fit": "cover",
            },
        }
    )

    action = visual_qa_module.VisualRepairAction.model_validate(
        {
            "action": "changeComposition",
            "slideId": "slide_1",
            "compositionId": "hero-split",
            "backgroundMode": "light",
            "reason": "Rebalance resolved hero",
        }
    )
    visual_qa_module.recompile_slide(candidate, candidate["slides"][0], action)

    plan = candidate["slides"][0]["aiNotes"]["compositionPlan"]
    element_ids = {
        element["elementId"] for element in candidate["slides"][0]["elements"]
    }

    assert plan["primaryFocalElementId"].endswith("_media_asset")
    assert plan["primaryFocalElementId"] in element_ids


def test_increase_text_focal_scale_preserves_grid_frame() -> None:
    candidate = deck()
    before = next(
        element
        for element in candidate["slides"][0]["elements"]
        if element["elementId"] == "el_1_program_v2_title"
    )
    frame = tuple(before[key] for key in ("x", "y", "width", "height"))
    font_size = before["props"]["fontSize"]

    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": candidate,
                "actions": [
                    {
                        "action": "increaseFocalScale",
                        "slideId": "slide_1",
                        "reason": "Cover title needs more emphasis",
                    }
                ],
            }
        )
    )

    after = next(
        element
        for element in result.deck["slides"][0]["elements"]
        if element["elementId"] == "el_1_program_v2_title"
    )
    assert tuple(after[key] for key in ("x", "y", "width", "height")) == frame
    assert after["props"]["fontSize"] > font_size


def test_visual_repair_rejects_background_outside_program_contract() -> None:
    candidate = deck()

    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": candidate,
                "actions": [
                    {
                        "action": "switchBackgroundMode",
                        "slideId": "slide_1",
                        "backgroundMode": "dark",
                        "reason": "Create stronger rhythm",
                    }
                ],
            }
        )
    )

    assert result.deck["slides"][0]["style"]["backgroundColor"] == "#FFFFFF"
    assert result.deck["slides"][0]["aiNotes"]["compositionPlan"][
        "backgroundMode"
    ] == "light"
    assert result.warnings == [
        "Visual repair skipped switchBackgroundMode: background mode dark is outside the design program contract"
    ]


def test_visual_repair_rolls_back_new_deterministic_issue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidate = deck()
    initial_size = candidate["slides"][0]["elements"][1]["props"]["fontSize"]

    def validation_for(candidate_deck: dict[str, Any]) -> Any:
        font_size = candidate_deck["slides"][0]["elements"][1]["props"]["fontSize"]
        issues = (
            [
                {
                    "code": "TEXT_OVERFLOW",
                    "scope": "element",
                    "severity": "warning",
                    "blocking": False,
                    "path": "slides.0.elements.1",
                    "message": "Text exceeds its frame.",
                }
            ]
            if font_size > initial_size
            else []
        )
        return visual_qa_module.ValidationResult(
            passed=not issues,
            layoutIssues=[],
            contentIssues=[],
            designIssues=issues,
            presentationIssues=[],
        )

    monkeypatch.setattr(visual_qa_module, "validate_repaired_deck", validation_for)

    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": candidate,
                "actions": [
                    {
                        "action": "increaseFocalScale",
                        "slideId": "slide_1",
                        "reason": "Increase title emphasis",
                    }
                ],
            }
        )
    )

    assert result.deck["slides"][0]["elements"][1]["props"]["fontSize"] == initial_size
    assert result.validation.passed is True
    assert result.warnings == [
        "Visual repair skipped increaseFocalScale: introduced deterministic issue(s): TEXT_OVERFLOW"
    ]


def test_optional_media_failure_recompiles_to_no_media_composition() -> None:
    candidate = deck()
    candidate["slides"][0]["aiNotes"]["compositionPlan"].update(
        {
            "compositionId": "hero-split",
            "assetRole": "atmosphere",
            "requiredAsset": False,
        }
    )
    candidate["metadata"]["designProgramSnapshot"]["compositionIds"] = [
        "hero-split"
    ]
    with_media = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": candidate,
                "actions": [
                    {
                        "action": "changeComposition",
                        "slideId": "slide_1",
                        "compositionId": "hero-split",
                        "backgroundMode": "light",
                        "reason": "Prepare an optional hero image",
                    }
                ],
            }
        )
    ).deck

    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": with_media,
                "actions": [],
                "dropOptionalMediaSlideIds": ["slide_1"],
            }
        )
    )

    repaired = result.deck["slides"][0]
    assert repaired["aiNotes"]["compositionPlan"]["compositionId"] == "minimal-cover"
    assert repaired["aiNotes"]["compositionPlan"]["assetRole"] == "none"
    assert repaired["aiNotes"]["visualPlan"]["imageNeeded"] is False
    assert not any(element.get("role") == "media" for element in repaired["elements"])
    assert result.asset_slide_ids == []


def test_required_media_cannot_use_optional_fallback() -> None:
    candidate = deck()
    candidate["slides"][0]["aiNotes"]["compositionPlan"]["requiredAsset"] = True

    result = repair_deck_visuals(
        VisualRepairRequest.model_validate(
            {
                "deck": candidate,
                "actions": [],
                "dropOptionalMediaSlideIds": ["slide_1"],
            }
        )
    )

    assert result.warnings == [
        "Optional media fallback skipped: required media cannot use optional fallback"
    ]
