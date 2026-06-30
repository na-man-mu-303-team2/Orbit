import type { Deck, DeckElement, Slide } from "@orbit/shared";

import { getCssFontWeight } from "./textLayout";

export function InlineTextEditorOverlay(props: {
  deck: Deck;
  element: DeckElement | null;
  slide: Slide;
  stageScale: number;
  onCommitProps: (elementId: string, props: Record<string, unknown>) => void;
  onFinishEditing: (options?: { clearSelection?: boolean }) => void;
}) {
  const { deck, element, slide, stageScale, onCommitProps, onFinishEditing } = props;

  if (!element || element.type !== "text") {
    return null;
  }

  return (
    <textarea
      autoFocus
      className="inline-text-editor"
      defaultValue={element.props.text}
      style={{
        left: `${element.x * stageScale}px`,
        top: `${element.y * stageScale}px`,
        width: `${element.width * stageScale}px`,
        height: `${element.height * stageScale}px`,
        color: element.props.color ?? slide.style.textColor ?? deck.theme.textColor,
        fontFamily:
          element.props.fontFamily ??
          slide.style.fontFamily ??
          deck.theme.typography.bodyFontFamily,
        fontSize: `${element.props.fontSize * stageScale}px`,
        fontWeight: String(getCssFontWeight(element.props.fontWeight)),
        lineHeight: String(element.props.lineHeight),
        textAlign: element.props.align,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "top left"
      }}
      onBlur={(event) => {
        onCommitProps(element.elementId, { text: event.target.value });
        onFinishEditing();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onFinishEditing();
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onCommitProps(element.elementId, { text: event.currentTarget.value });
          onFinishEditing();
        }
      }}
    />
  );
}
