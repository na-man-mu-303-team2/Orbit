import type { CSSProperties } from "react";
import type { Deck, Slide } from "@orbit/shared";

import { buildSlideBackgroundStyle } from "./slideBackgroundStyle";

export function SlideBackground(props: {
  children?: React.ReactNode;
  deck: Deck;
  slide: Slide;
  style?: CSSProperties;
}) {
  const { children, deck, slide, style } = props;

  return (
    <div
      className="orbit-slide-background"
      data-testid="slide-background"
      style={{
        ...buildSlideBackgroundStyle(slide, deck),
        height: deck.canvas.height,
        overflow: "hidden",
        position: "relative",
        width: deck.canvas.width,
        ...style
      }}
    >
      {children}
    </div>
  );
}
