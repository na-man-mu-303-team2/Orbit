import type { Deck } from "@orbit/shared";
import { useEffect, useRef, useState } from "react";

import { ReadOnlySlideCanvas } from "../slides/rendering";

export default function FocusedSlidePreview(props: { deck: Deck; label?: string; slideId: string }) {
  const shell = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.4);
  const slide = props.deck.slides.find((candidate) => candidate.slideId === props.slideId);

  useEffect(() => {
    const target = shell.current;
    if (!target) return;
    const update = () => setScale(Math.min(0.4, target.clientWidth / props.deck.canvas.width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => observer.disconnect();
  }, [props.deck.canvas.width]);

  if (!slide) return null;
  return <section className="focused-slide-preview" aria-labelledby="focused-slide-title"><div><small>{props.label ?? "현재 장표"}</small><h2 id="focused-slide-title">{slide.title}</h2></div><div className="focused-slide-preview-canvas" ref={shell}><ReadOnlySlideCanvas deck={props.deck} slide={slide} scale={scale} /></div></section>;
}
