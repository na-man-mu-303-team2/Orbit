from __future__ import annotations

import base64
import json
import textwrap
from copy import deepcopy
from io import BytesIO
from typing import Any, Literal

from PIL import Image, ImageDraw
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.ai.composition_library import (
    COMPOSITION_SPECS,
    FALLBACK_COMPOSITIONS,
    compile_composition,
)
from app.ai.deck_pptx_export import DeckPptxExportRequest, export_deck_pptx
from app.ai.design_program import CompositionId, DeckDesignProgram
from app.ai.generate_deck import (
    ValidationResult,
    validate_content,
    validate_design,
    validate_layout,
    validate_presentation,
)
from app.ai.pptx_design_importer import ImportedDesignAsset
from app.ai.pptx_ooxml_generation import CanvasSpec, render_pptx_to_png_assets


VisualIssueCode = Literal[
    "FOCAL_POINT_WEAK",
    "BALANCE_WEAK",
    "IMAGE_CONTENT_MISMATCH",
    "IMAGE_CROP_WEAK",
    "LAYOUT_REPETITIVE",
    "BACKGROUND_RHYTHM_FLAT",
    "CARD_OVERUSED",
    "COLOR_HARMONY_WEAK",
    "VISUAL_STYLE_INCONSISTENT",
]
VisualRepairActionType = Literal[
    "changeComposition",
    "increaseFocalScale",
    "replaceImage",
    "changeCrop",
    "switchBackgroundMode",
    "reduceCards",
    "promoteMetric",
    "shortenCopy",
    "moveSupportingContent",
]

VISUAL_QA_INSTRUCTIONS = """
You are a strict presentation art director reviewing a rendered slide montage.
Judge visual hierarchy, balance, image-message fit, crop, repetition, background
rhythm, card overuse, color harmony, style consistency, and readability.
Return only the requested JSON. Use only the allowed issue codes and repair actions.
Do not flag factual accuracy or speaker notes. passed=true requires zero issues.
Use changeComposition only when geometry-level actions cannot solve the problem.
""".strip()


class VisualRepairAction(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    action: VisualRepairActionType
    slide_id: str = Field(alias="slideId", min_length=1)
    target_element_id: str | None = Field(default=None, alias="targetElementId")
    composition_id: CompositionId | None = Field(default=None, alias="compositionId")
    background_mode: Literal["light", "dark", "image"] | None = Field(
        default=None,
        alias="backgroundMode",
    )
    reason: str = Field(min_length=1)


class VisualQaIssue(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: VisualIssueCode
    slide_order: int = Field(alias="slideOrder", ge=1)
    message: str = Field(min_length=1)


class VisualQaReview(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    passed: bool
    issues: list[VisualQaIssue] = Field(default_factory=list)
    repair_actions: list[VisualRepairAction] = Field(
        default_factory=list,
        alias="repairActions",
    )

    @model_validator(mode="after")
    def keep_passed_consistent(self) -> VisualQaReview:
        if self.passed and self.issues:
            raise ValueError("passed review cannot contain issues")
        if not self.passed and not self.issues:
            raise ValueError("failed review must contain at least one issue")
        return self


class RenderedSlide(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slide_id: str = Field(alias="slideId")
    order: int = Field(ge=1)
    content_base64: str = Field(alias="contentBase64", min_length=1)


class VisualQaRequest(BaseModel):
    deck: dict[str, Any]


class VisualQaResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    review: VisualQaReview
    rendered_slides: list[RenderedSlide] = Field(alias="renderedSlides")
    montage_base64: str = Field(alias="montageBase64", min_length=1)
    warnings: list[str] = Field(default_factory=list)


class VisualRepairRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deck: dict[str, Any]
    actions: list[VisualRepairAction]
    drop_optional_media_slide_ids: list[str] = Field(
        default_factory=list,
        alias="dropOptionalMediaSlideIds",
    )


class VisualRepairResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deck: dict[str, Any]
    validation: ValidationResult
    asset_slide_ids: list[str] = Field(default_factory=list, alias="assetSlideIds")
    warnings: list[str] = Field(default_factory=list)


class VisualQaUnavailableError(RuntimeError):
    pass


def visual_review_response_format(slide_count: int) -> dict[str, Any]:
    issue_codes = [
        "FOCAL_POINT_WEAK",
        "BALANCE_WEAK",
        "IMAGE_CONTENT_MISMATCH",
        "IMAGE_CROP_WEAK",
        "LAYOUT_REPETITIVE",
        "BACKGROUND_RHYTHM_FLAT",
        "CARD_OVERUSED",
        "COLOR_HARMONY_WEAK",
        "VISUAL_STYLE_INCONSISTENT",
    ]
    action_types = [
        "changeComposition",
        "increaseFocalScale",
        "replaceImage",
        "changeCrop",
        "switchBackgroundMode",
        "reduceCards",
        "promoteMetric",
        "shortenCopy",
        "moveSupportingContent",
    ]
    return {
        "format": {
            "type": "json_schema",
            "name": "deck_visual_review",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "passed": {"type": "boolean"},
                    "issues": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "code": {"type": "string", "enum": issue_codes},
                                "slideOrder": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "maximum": slide_count,
                                },
                                "message": {"type": "string"},
                            },
                            "required": ["code", "slideOrder", "message"],
                        },
                    },
                    "repairActions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "action": {"type": "string", "enum": action_types},
                                "slideId": {"type": "string"},
                                "targetElementId": {
                                    "type": ["string", "null"],
                                },
                                "compositionId": {"type": ["string", "null"]},
                                "backgroundMode": {
                                    "type": ["string", "null"],
                                    "enum": ["light", "dark", "image", None],
                                },
                                "reason": {"type": "string"},
                            },
                            "required": [
                                "action",
                                "slideId",
                                "targetElementId",
                                "compositionId",
                                "backgroundMode",
                                "reason",
                            ],
                        },
                    },
                },
                "required": ["passed", "issues", "repairActions"],
            },
        }
    }


def review_deck_visuals(
    request: VisualQaRequest,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> VisualQaResponse:
    api_client = client
    if api_client is None:
        if not api_key:
            raise VisualQaUnavailableError("Vision QA model is unavailable")
        from openai import OpenAI

        api_client = OpenAI(api_key=api_key)

    deck = request.deck
    exported = export_deck_pptx(DeckPptxExportRequest(deck=deck))
    package_bytes = base64.b64decode(exported.content_base64)
    canvas_data = deck.get("canvas", {})
    canvas = CanvasSpec(
        preset=str(canvas_data.get("preset", "wide-16-9")),
        width=int(canvas_data.get("width", 1920)),
        height=int(canvas_data.get("height", 1080)),
        aspect_ratio=str(canvas_data.get("aspectRatio", "16:9")),
    )
    assets = render_pptx_to_png_assets(package_bytes, canvas)
    montage = build_montage(assets)
    image_url = "data:image/png;base64," + base64.b64encode(montage).decode("ascii")
    try:
        response = api_client.responses.create(
            model=model or "gpt-4o-mini",
            instructions=VISUAL_QA_INSTRUCTIONS,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": visual_review_prompt(deck),
                        },
                        {"type": "input_image", "image_url": image_url},
                    ],
                }
            ],
            text=visual_review_response_format(len(assets)),
        )
        review = VisualQaReview.model_validate_json(
            str(getattr(response, "output_text", "")).strip()
        )
    except Exception as error:
        raise VisualQaUnavailableError(f"Vision QA request failed: {error}") from error

    deck_slides = deck.get("slides", [])
    return VisualQaResponse(
        review=review,
        renderedSlides=[
            RenderedSlide(
                slideId=str(deck_slides[index].get("slideId", f"slide_{index + 1}")),
                order=index + 1,
                contentBase64=asset.content_base64,
            )
            for index, asset in enumerate(assets)
        ],
        montageBase64=base64.b64encode(montage).decode("ascii"),
        warnings=exported.warnings,
    )


def build_montage(assets: list[ImportedDesignAsset]) -> bytes:
    if not assets:
        raise VisualQaUnavailableError("Rendered deck contains no slides")
    columns = 2
    cell_width = 960
    image_height = 540
    label_height = 36
    rows = (len(assets) + columns - 1) // columns
    montage = Image.new("RGB", (columns * cell_width, rows * (image_height + label_height)), "white")
    draw = ImageDraw.Draw(montage)
    for index, asset in enumerate(assets):
        image = Image.open(BytesIO(base64.b64decode(asset.content_base64))).convert("RGB")
        image.thumbnail((cell_width, image_height))
        x = (index % columns) * cell_width
        y = (index // columns) * (image_height + label_height)
        montage.paste(image, (x, y + label_height))
        draw.text((x + 12, y + 10), f"SLIDE {index + 1}", fill="black")
    output = BytesIO()
    montage.save(output, format="PNG", optimize=True)
    return output.getvalue()


def visual_review_prompt(deck: dict[str, Any]) -> str:
    slides = [
        {
            "order": slide.get("order"),
            "slideId": slide.get("slideId"),
            "title": slide.get("title"),
            "composition": slide.get("aiNotes", {})
            .get("compositionPlan", {})
            .get("compositionId"),
            "focalType": slide.get("aiNotes", {})
            .get("compositionPlan", {})
            .get("focalType"),
        }
        for slide in deck.get("slides", [])
    ]
    return "Review this rendered deck montage. Slide map: " + json.dumps(
        slides,
        ensure_ascii=False,
    )


def repair_deck_visuals(request: VisualRepairRequest) -> VisualRepairResponse:
    deck = deepcopy(request.deck)
    asset_slide_ids: list[str] = []
    warnings: list[str] = []
    for slide_id in request.drop_optional_media_slide_ids:
        slide = next(
            (
                candidate
                for candidate in deck.get("slides", [])
                if candidate.get("slideId") == slide_id
            ),
            None,
        )
        if slide is None:
            warnings.append(f"Optional media fallback skipped missing slide: {slide_id}")
            continue
        try:
            drop_optional_media(deck, slide)
        except Exception as error:
            warnings.append(f"Optional media fallback skipped: {error}")
    for action in request.actions:
        slide = next(
            (
                candidate
                for candidate in deck.get("slides", [])
                if candidate.get("slideId") == action.slide_id
            ),
            None,
        )
        if slide is None:
            warnings.append(f"Visual repair skipped missing slide: {action.slide_id}")
            continue
        try:
            needs_asset = apply_visual_repair_action(deck, slide, action)
            if needs_asset and action.slide_id not in asset_slide_ids:
                asset_slide_ids.append(action.slide_id)
        except Exception as error:
            warnings.append(f"Visual repair skipped {action.action}: {error}")
    return VisualRepairResponse(
        deck=deck,
        validation=validate_repaired_deck(deck),
        assetSlideIds=asset_slide_ids,
        warnings=warnings,
    )


def validate_repaired_deck(deck: dict[str, Any]) -> ValidationResult:
    layout_issues = validate_layout(deck)
    content_issues = validate_content(deck)
    design_issues = validate_design(deck)
    presentation_issues = validate_presentation(deck)
    return ValidationResult(
        passed=not (
            layout_issues
            or content_issues
            or design_issues
            or presentation_issues
        ),
        layoutIssues=layout_issues,
        contentIssues=content_issues,
        designIssues=design_issues,
        presentationIssues=presentation_issues,
    )


def apply_visual_repair_action(
    deck: dict[str, Any],
    slide: dict[str, Any],
    action: VisualRepairAction,
) -> bool:
    if action.action == "changeComposition":
        return recompile_slide(deck, slide, action)
    if action.action == "replaceImage":
        return reset_slide_image(slide)
    if action.action == "changeCrop":
        for element in slide.get("elements", []):
            if element.get("type") == "image" and element.get("role") == "media":
                element.setdefault("props", {}).update(
                    {"fit": "cover", "focusX": 0.5, "focusY": 0.5}
                )
        return False
    if action.action == "switchBackgroundMode":
        switch_background(deck, slide, action.background_mode or "light")
        return False
    if action.action == "increaseFocalScale":
        scale_focal_element(slide, action.target_element_id)
        return False
    if action.action == "reduceCards":
        reduce_card_decoration(slide)
        return False
    if action.action == "promoteMetric":
        promote_metric(slide)
        return False
    if action.action == "shortenCopy":
        shorten_longest_body(slide)
        return False
    if action.action == "moveSupportingContent":
        align_supporting_content(slide)
    return False


def recompile_slide(
    deck: dict[str, Any],
    slide: dict[str, Any],
    action: VisualRepairAction,
) -> bool:
    if not action.composition_id:
        raise ValueError("changeComposition requires compositionId")
    program = design_program_from_deck(deck)
    slide_index = deck.get("slides", []).index(slide)
    direction = program.slides[slide_index]
    direction.composition_id = action.composition_id
    if action.background_mode:
        direction.background_mode = action.background_mode
        direction.variant = action.background_mode
    summary = slide_summary_from_deck(slide)
    compiled = compile_composition(direction, summary, program)
    old_media = next(
        (
            element
            for element in slide.get("elements", [])
            if element.get("type") == "image" and element.get("role") == "media"
        ),
        None,
    )
    elements = [
        {key: value for key, value in element.items() if key != "_contentItemIds"}
        for element in compiled.elements
    ]
    placeholder = next(
        (
            element
            for element in elements
            if str(element.get("elementId", "")).endswith("_media_placeholder")
        ),
        None,
    )
    if old_media is not None and placeholder is not None:
        elements[elements.index(placeholder)] = {
            **old_media,
            "elementId": str(placeholder["elementId"]).replace(
                "_media_placeholder",
                "_media_asset",
            ),
            "x": placeholder["x"],
            "y": placeholder["y"],
            "width": placeholder["width"],
            "height": placeholder["height"],
            "zIndex": placeholder["zIndex"],
        }
    slide["elements"] = elements
    slide.setdefault("style", {}).update(
        {
            "layout": compiled.layout,
            "backgroundColor": compiled.background_color,
        }
    )
    plan = slide.setdefault("aiNotes", {}).setdefault("compositionPlan", {})
    plan.update(
        {
            "compositionId": direction.composition_id,
            "variant": direction.variant,
            "backgroundMode": direction.background_mode,
            "primaryFocalElementId": compiled.primary_focal_element_id,
        }
    )
    update_snapshot_composition(deck, slide_index, direction.composition_id)
    if slide.get("animations"):
        slide["animations"][0]["elementId"] = compiled.primary_focal_element_id
    return old_media is None and placeholder is not None


def drop_optional_media(deck: dict[str, Any], slide: dict[str, Any]) -> None:
    plan = slide.get("aiNotes", {}).get("compositionPlan", {})
    if plan.get("requiredAsset") is True:
        raise ValueError("required media cannot use optional fallback")
    program = design_program_from_deck(deck)
    slide_index = deck.get("slides", []).index(slide)
    direction = program.slides[slide_index]
    summary = slide_summary_from_deck(slide)
    slide_type = str(summary.get("slideType", "summary"))
    item_count = len(summary.get("contentItems", []))
    candidates = (
        direction.composition_id,
        *FALLBACK_COMPOSITIONS.get(slide_type, ()),
    )
    selected: CompositionId | None = None
    for candidate in dict.fromkeys(candidates):
        spec = COMPOSITION_SPECS[candidate]
        if (
            spec.media_requirement == "none"
            and slide_type in spec.purposes
            and spec.min_items <= item_count <= spec.max_items
        ):
            selected = candidate
            break
    if selected is None:
        current = COMPOSITION_SPECS[direction.composition_id]
        if current.media_requirement != "optional":
            raise ValueError("no compatible no-media composition is available")
        selected = direction.composition_id

    direction.composition_id = selected
    direction.asset_role = "none"
    direction.required_asset = False
    selected_spec = COMPOSITION_SPECS[selected]
    if direction.background_mode not in selected_spec.variants:
        direction.background_mode = selected_spec.variants[0]
    direction.variant = direction.background_mode
    compiled = compile_composition(direction, summary, program)
    slide["elements"] = [
        {key: value for key, value in element.items() if key != "_contentItemIds"}
        for element in compiled.elements
    ]
    slide.setdefault("style", {}).update(
        {
            "layout": compiled.layout,
            "backgroundColor": compiled.background_color,
        }
    )
    composition_plan = slide.setdefault("aiNotes", {}).setdefault(
        "compositionPlan", {}
    )
    composition_plan.update(
        {
            "compositionId": selected,
            "variant": direction.variant,
            "backgroundMode": direction.background_mode,
            "primaryFocalElementId": compiled.primary_focal_element_id,
            "assetRole": "none",
            "requiredAsset": False,
        }
    )
    visual_plan = slide.setdefault("aiNotes", {}).setdefault("visualPlan", {})
    visual_plan["imageNeeded"] = False
    visual_plan.pop("asset", None)
    update_snapshot_composition(deck, slide_index, selected)
    if slide.get("animations"):
        slide["animations"][0]["elementId"] = compiled.primary_focal_element_id


def update_snapshot_composition(
    deck: dict[str, Any],
    slide_index: int,
    composition_id: CompositionId,
) -> None:
    snapshot = deck.get("metadata", {}).get("designProgramSnapshot", {})
    composition_ids = snapshot.get("compositionIds")
    if isinstance(composition_ids, list) and slide_index < len(composition_ids):
        composition_ids[slide_index] = composition_id


def design_program_from_deck(deck: dict[str, Any]) -> DeckDesignProgram:
    snapshot = deck.get("metadata", {}).get("designProgramSnapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("Deck has no Design Program snapshot")
    slide_directions = []
    for slide in deck.get("slides", []):
        plan = slide.get("aiNotes", {}).get("compositionPlan")
        if not isinstance(plan, dict):
            raise ValueError("Deck slide has no composition plan")
        slide_directions.append(
            {
                "order": slide.get("order"),
                "compositionId": plan.get("compositionId"),
                "variant": plan.get("variant"),
                "backgroundMode": plan.get("backgroundMode"),
                "focalType": plan.get("focalType"),
                "assetRole": plan.get("assetRole"),
                "requiredAsset": plan.get("requiredAsset"),
            }
        )
    return DeckDesignProgram.model_validate(
        {
            **snapshot,
            "slides": slide_directions,
        }
    )


def slide_summary_from_deck(slide: dict[str, Any]) -> dict[str, Any]:
    message = str(
        next(iter(slide.get("aiNotes", {}).get("emphasisPoints", [])), "")
    )
    claims: list[str] = []
    for entry in slide.get("aiNotes", {}).get("sourceLedger", []):
        claim = " ".join(str(entry.get("claim", "")).split())
        if claim and claim != message and claim not in claims:
            claims.append(claim)
    if not claims:
        for element in slide.get("elements", []):
            if element.get("type") != "text" or element.get("role") != "body":
                continue
            for value in str(element.get("props", {}).get("text", "")).splitlines():
                normalized = value.strip(" •·→\t")
                if normalized and normalized != message and normalized not in claims:
                    claims.append(normalized)
    return {
        "title": slide.get("title", ""),
        "message": message,
        "slideType": _slide_type_for_composition(slide),
        "contentItems": [
            {"contentItemId": f"repair-{index}", "text": claim}
            for index, claim in enumerate(claims[:6], start=1)
        ],
        "mediaIntent": {
            "alt": slide.get("aiNotes", {}).get("visualPlan", {}).get("imageAlt", "")
        },
    }


def _slide_type_for_composition(slide: dict[str, Any]) -> str:
    composition = (
        slide.get("aiNotes", {}).get("compositionPlan", {}).get("compositionId")
    )
    if slide.get("order") == 1:
        return "cover"
    if composition == "cta-closing":
        return "summary"
    return {
        "feature-comparison": "comparison",
        "process-horizontal": "process",
        "timeline": "process",
        "diagram-hub": "architecture",
        "metric-poster": "data",
        "kpi-strip-evidence": "data",
        "image-evidence": "data",
    }.get(str(composition), "solution")


def reset_slide_image(slide: dict[str, Any]) -> bool:
    for index, element in enumerate(slide.get("elements", [])):
        if element.get("type") != "image" or element.get("role") != "media":
            continue
        slide["elements"][index] = {
            **element,
            "elementId": str(element["elementId"]).replace(
                "_media_asset",
                "_media_placeholder",
            ),
            "type": "rect",
            "props": {
                "fill": "#E2E8F0",
                "stroke": "#64748B",
                "strokeWidth": 2,
                "borderRadius": 8,
            },
        }
        visual_plan = slide.setdefault("aiNotes", {}).setdefault("visualPlan", {})
        visual_plan.pop("asset", None)
        return True
    return False


def switch_background(
    deck: dict[str, Any],
    slide: dict[str, Any],
    mode: Literal["light", "dark", "image"],
) -> None:
    snapshot = deck.get("metadata", {}).get("designProgramSnapshot", {})
    roles = snapshot.get("paletteRoles", {})
    background = (
        roles.get("dominant", "#FFFFFF")
        if mode == "light"
        else roles.get("text", "#101828")
    )
    text_color = roles.get("text", "#111827") if mode == "light" else "#FFFFFF"
    slide.setdefault("style", {})["backgroundColor"] = background
    slide.setdefault("aiNotes", {}).setdefault("compositionPlan", {})[
        "backgroundMode"
    ] = mode
    for element in slide.get("elements", []):
        if element.get("role") == "background":
            element.setdefault("props", {})["fill"] = background
        elif element.get("type") == "text":
            element.setdefault("props", {})["color"] = text_color


def scale_focal_element(slide: dict[str, Any], target_id: str | None) -> None:
    plan = slide.get("aiNotes", {}).get("compositionPlan", {})
    focal_id = target_id or plan.get("primaryFocalElementId")
    element = next(
        (item for item in slide.get("elements", []) if item.get("elementId") == focal_id),
        None,
    )
    if element is None:
        raise ValueError("Focal element is unavailable")
    width = min(1680, round(float(element["width"]) * 1.12))
    height = min(904, round(float(element["height"]) * 1.12))
    center_x = float(element["x"]) + float(element["width"]) / 2
    center_y = float(element["y"]) + float(element["height"]) / 2
    element.update(
        {
            "x": max(0, min(1920 - width, round(center_x - width / 2))),
            "y": max(0, min(1080 - height, round(center_y - height / 2))),
            "width": width,
            "height": height,
        }
    )


def reduce_card_decoration(slide: dict[str, Any]) -> None:
    cards = [
        element
        for element in slide.get("elements", [])
        if element.get("type") == "rect"
        and element.get("role") == "decoration"
        and "field" in str(element.get("elementId", ""))
    ]
    removable_ids = {
        element["elementId"] for index, element in enumerate(cards) if index % 2 == 1
    }
    slide["elements"] = [
        element
        for element in slide.get("elements", [])
        if element.get("elementId") not in removable_ids
    ]


def promote_metric(slide: dict[str, Any]) -> None:
    candidates = [
        element
        for element in slide.get("elements", [])
        if element.get("type") == "text" and element.get("role") == "highlight"
    ]
    if not candidates:
        raise ValueError("Metric highlight is unavailable")
    element = candidates[0]
    props = element.setdefault("props", {})
    props["fontSize"] = min(96, max(48, int(props.get("fontSize", 24)) + 16))


def shorten_longest_body(slide: dict[str, Any]) -> None:
    candidates = [
        element
        for element in slide.get("elements", [])
        if element.get("type") == "text" and element.get("role") == "body"
    ]
    if not candidates:
        raise ValueError("Body copy is unavailable")
    element = max(candidates, key=lambda item: len(str(item.get("props", {}).get("text", ""))))
    props = element.setdefault("props", {})
    props["text"] = textwrap.shorten(
        " ".join(str(props.get("text", "")).split()),
        width=180,
        placeholder="...",
    )


def align_supporting_content(slide: dict[str, Any]) -> None:
    has_media = any(
        element.get("role") == "media" for element in slide.get("elements", [])
    )
    for element in slide.get("elements", []):
        if element.get("role") != "body":
            continue
        element["x"] = 120
        element["width"] = min(970 if has_media else 1680, 1800 - element["x"])
