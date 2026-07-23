export type CompanionDrawingTool =
  | "eraser"
  | "highlighter"
  | "laser"
  | "pen";
export type CompanionInkColor =
  | "ink-black"
  | "ink-blue"
  | "ink-green"
  | "ink-red"
  | "ink-yellow";

export function CompanionToolbar(props: {
  canClear: boolean;
  canUndo: boolean;
  color: CompanionInkColor;
  disabled: boolean;
  onClear: () => void;
  onColorChange: (color: CompanionInkColor) => void;
  onToolChange: (tool: CompanionDrawingTool) => void;
  onUndo: () => void;
  tool: CompanionDrawingTool;
}) {
  return (
    <nav aria-label="iPad 주석 도구" className="presenter-companion-toolbar">
      {(["pen", "highlighter", "eraser", "laser"] as const).map((tool) => (
        <button
          aria-pressed={props.tool === tool}
          disabled={props.disabled}
          key={tool}
          onClick={() => props.onToolChange(tool)}
          type="button"
        >
          {getToolLabel(tool)}
        </button>
      ))}
      <span className="presenter-companion-color-tools">
        {(
          [
            "ink-black",
            "ink-blue",
            "ink-red",
            "ink-green",
            "ink-yellow",
          ] as const
        ).map((color) => (
          <button
            aria-label={getColorLabel(color)}
            aria-pressed={props.color === color}
            className={`presenter-companion-color presenter-companion-color--${color}`}
            disabled={
              props.disabled ||
              props.tool === "eraser" ||
              props.tool === "laser"
            }
            key={color}
            onClick={() => props.onColorChange(color)}
            type="button"
          />
        ))}
      </span>
      <button
        disabled={props.disabled || !props.canUndo}
        onClick={props.onUndo}
        type="button"
      >
        실행 취소
      </button>
      <button
        disabled={props.disabled || !props.canClear}
        onClick={props.onClear}
        type="button"
      >
        모두 지우기
      </button>
    </nav>
  );
}

function getColorLabel(color: CompanionInkColor): string {
  return {
    "ink-black": "검정",
    "ink-blue": "파랑",
    "ink-red": "빨강",
    "ink-green": "초록",
    "ink-yellow": "노랑",
  }[color];
}

function getToolLabel(tool: CompanionDrawingTool): string {
  if (tool === "pen") return "펜";
  if (tool === "highlighter") return "형광펜";
  if (tool === "laser") return "레이저";
  return "지우개";
}
