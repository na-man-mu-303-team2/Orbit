import type { CSSProperties } from "react";
import type { Deck, Slide } from "@orbit/shared";

import { resolveEditorAssetUrl } from "../../editor/shared/editorAssetUrl";

export function buildSlideBackgroundStyle(
  slide: Slide,
  deck: Deck
): CSSProperties {
  const backgroundColor = slide.style.backgroundColor ?? deck.theme.backgroundColor;
  const backgroundImage = slide.style.backgroundImage;

  if (!backgroundImage?.src) {
    return {
      backgroundColor,
      borderRadius: 0
    };
  }

  const size = getSlideBackgroundSize(backgroundImage.fit);
  const overlayOpacity = clampBackgroundOverlayOpacity(backgroundImage.opacity);

  return {
    backgroundColor,
    backgroundImage: `linear-gradient(rgba(255,255,255,${overlayOpacity}), rgba(255,255,255,${overlayOpacity})), url("${resolveEditorAssetUrl(backgroundImage.src)}")`,
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: `100% 100%, ${size}`,
    borderRadius: 0
  };
}

export function getSlideBackgroundSize(
  fit: NonNullable<Slide["style"]["backgroundImage"]>["fit"]
) {
  if (fit === "stretch") {
    return "100% 100%";
  }

  return fit;
}

export function clampBackgroundOverlayOpacity(opacity: number) {
  return Math.max(0, Math.min(1, 1 - opacity));
}
