export const CONTEXT_WINDOW_CHARS = 300;

export type ContextSlidingWindow = {
  slideId: string;
  buffer: string;
};

export function createContextSlidingWindow(): ContextSlidingWindow {
  return { slideId: "", buffer: "" };
}

export function appendToContextWindow(
  window: ContextSlidingWindow,
  slideId: string,
  finalText: string,
  maxChars = CONTEXT_WINDOW_CHARS
): ContextSlidingWindow {
  if (window.slideId !== slideId) {
    const trimmed = finalText.slice(-maxChars).trim();
    return { slideId, buffer: trimmed };
  }
  const next = (window.buffer + " " + finalText).trim();
  return {
    slideId,
    buffer: next.length > maxChars ? next.slice(-maxChars).trim() : next
  };
}

export function getContextWindowText(
  window: ContextSlidingWindow,
  slideId: string
): string {
  return window.slideId === slideId ? window.buffer : "";
}
