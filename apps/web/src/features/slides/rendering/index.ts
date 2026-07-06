export {
  ReadOnlySlideCanvas,
  type ElementPresentationState,
  type SlideRuntimeHighlight
} from "./ReadOnlySlideCanvas";
export {
  SlideBackground
} from "./SlideBackground";
export {
  buildSlideBackgroundStyle,
  clampBackgroundOverlayOpacity,
  getSlideBackgroundSize
} from "./slideBackgroundStyle";
export { ElementNodeContent, type SlideElementFrame } from "./elementRendering";
export { getActiveHighlightElementIds, HighlightOverlay } from "./highlightOverlay";
export {
  getRenderableSlideElements,
  normalizeRenderableElement
} from "./elementNormalization";
