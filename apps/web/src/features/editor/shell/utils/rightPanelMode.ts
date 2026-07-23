export type EditorRightPanelMode =
  | "assistant"
  | "animation"
  | "icons"
  | "properties";

export function getInitialEditorRightPanelMode(options: {
  isAnimationPropertiesOpen: boolean;
  isIconPanelOpen: boolean;
}): EditorRightPanelMode {
  if (options.isIconPanelOpen) return "icons";
  if (options.isAnimationPropertiesOpen) return "animation";
  return "assistant";
}
