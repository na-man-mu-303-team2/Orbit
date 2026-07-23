const interactiveControlSelector = [
  "a[href]",
  "button",
  "input",
  "select",
  "summary",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']"
].join(",");

type ClickTarget = {
  closest?: (selector: string) => unknown;
};

/** Returns false when a click belongs to an interactive control inside a slide. */
export function shouldAdvancePresentationFromClick(target: EventTarget | null) {
  return !((target as ClickTarget | null)?.closest?.(interactiveControlSelector));
}
