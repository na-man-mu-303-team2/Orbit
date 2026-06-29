from __future__ import annotations

from pathlib import Path
from typing import Any

from app.extraction import ExtractConfig, SlideStatus, extract_pptx_slides


def import_pptx_as_deck(
    source_path: Path,
    *,
    project_id: str,
    file_id: str,
    config: ExtractConfig | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    extract_config = config or ExtractConfig()
    slides = extract_pptx_slides(source_path, extract_config)
    warnings: list[dict[str, Any]] = []

    deck = {
        "deckId": deck_id_for_project(project_id),
        "projectId": project_id,
        "title": title_from_filename(source_path.name),
        "version": 1,
        "metadata": {
            "language": "ko",
            "locale": "ko-KR",
            "sourceType": "import",
        },
        "canvas": {
            "preset": "wide-16-9",
            "width": 1920,
            "height": 1080,
            "aspectRatio": "16:9",
        },
        "theme": default_theme(),
        "slides": [],
    }

    for slide in slides:
        title, body = split_slide_content(slide.text, slide.index)
        if slide.status != SlideStatus.TEXT_SLIDE:
            warnings.append(
                {
                    "code": f"PPTX_{slide.status.value}".upper(),
                    "message": warning_message(slide.status),
                    "slideIndex": slide.index,
                }
            )

        elements: list[dict[str, Any]] = [
            text_element(
                element_id=f"el_{slide.index}_title",
                role="title",
                x=140,
                y=120,
                width=1640,
                height=96,
                text=title,
                font_size=44,
                font_weight="bold",
                color="#111827",
            )
        ]
        if body:
            elements.append(
                text_element(
                    element_id=f"el_{slide.index}_body",
                    role="body",
                    x=140,
                    y=260,
                    width=1640,
                    height=680,
                    text=body,
                    font_size=26,
                    font_weight="normal",
                    color="#334155",
                )
            )

        deck["slides"].append(
            {
                "slideId": f"slide_{slide.index}",
                "order": slide.index,
                "title": title,
                "thumbnailUrl": "",
                "style": {
                    "layout": "title-content",
                    "backgroundColor": "#ffffff",
                    "textColor": "#111827",
                    "accentColor": "#2563eb",
                },
                "speakerNotes": slide.text.strip(),
                "elements": elements,
                "keywords": [],
                "animations": [],
                "aiNotes": {
                    "emphasisPoints": [],
                    "sourceEvidence": [{"fileId": file_id}],
                },
            }
        )

    return deck, warnings


def deck_id_for_project(project_id: str) -> str:
    normalized = project_id.removeprefix("project_")
    return f"deck_{normalized}"


def title_from_filename(file_name: str) -> str:
    stem = Path(file_name).stem.strip()
    return stem or "Imported PPTX"


def split_slide_content(text: str, slide_index: int) -> tuple[str, str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    if not lines:
        return f"Slide {slide_index}", ""

    title = lines[0][:80]
    body = "\n".join(lines[1:]).strip()
    return title or f"Slide {slide_index}", body


def warning_message(status: SlideStatus) -> str:
    if status == SlideStatus.MIXED_SLIDE:
        return "텍스트와 이미지가 섞인 슬라이드라 일부 레이아웃이 단순화되었습니다."
    if status == SlideStatus.OCR_NEEDED_SLIDE:
        return "이미지 중심 슬라이드라 OCR 텍스트 기준으로 가져왔습니다."
    if status == SlideStatus.BLANK_SLIDE:
        return "텍스트가 거의 없는 슬라이드라 빈 슬라이드로 가져왔습니다."
    return "슬라이드 가져오기 중 경고가 발생했습니다."


def text_element(
    *,
    element_id: str,
    role: str,
    x: int,
    y: int,
    width: int,
    height: int,
    text: str,
    font_size: int,
    font_weight: str,
    color: str,
) -> dict[str, Any]:
    return {
        "elementId": element_id,
        "type": "text",
        "role": role,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": 0,
        "locked": False,
        "visible": True,
        "props": {
            "text": text,
            "fontFamily": "Inter",
            "fontSize": font_size,
            "fontWeight": font_weight,
            "color": color,
            "align": "left",
            "verticalAlign": "top",
            "lineHeight": 1.3,
        },
    }


def default_theme() -> dict[str, Any]:
    return {
        "name": "Orbit Import",
        "fontFamily": "Inter",
        "backgroundColor": "#ffffff",
        "textColor": "#111827",
        "accentColor": "#2563eb",
        "palette": {
            "primary": "#2563eb",
            "secondary": "#7c3aed",
            "surface": "#ffffff",
            "muted": "#f3f4f6",
            "border": "#dbe3f0",
        },
        "typography": {
            "headingFontFamily": "Inter",
            "bodyFontFamily": "Inter",
            "titleSize": 56,
            "headingSize": 36,
            "bodySize": 22,
            "captionSize": 16,
        },
        "effects": {
            "borderRadius": 10,
            "shadow": {
                "color": "#111827",
                "blur": 18,
                "offsetX": 0,
                "offsetY": 8,
                "opacity": 0.16,
            }
        },
    }
