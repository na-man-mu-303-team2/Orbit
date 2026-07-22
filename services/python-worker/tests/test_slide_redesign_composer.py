from __future__ import annotations

from app.ai.color_options import contrast_ratio
from app.ai.slide_redesign.palette import derive_palette


def test_derive_palette_repairs_low_text_contrast() -> None:
    roles = derive_palette(
        {
            "backgroundColor": "#F5F5F5",
            "textColor": "#E5E7EB",
            "accentColor": "#7C3AED",
        },
        "light",
    )

    assert contrast_ratio(roles.text, roles.dominant) >= 4.5


def test_derive_palette_preserves_theme_focal_color() -> None:
    roles = derive_palette(
        {
            "backgroundColor": "#FFFFFF",
            "textColor": "#111827",
            "accentColor": "#E11D48",
        },
        "dark",
    )

    assert roles.focal == "#E11D48"
