import { createHash } from "node:crypto";
import { deckSchema, type Deck, type Slide } from "@orbit/shared";

export type SlideSnapshotRenderInput = {
  deck: Deck;
  slideId: string;
  effectState?: Record<string, unknown>;
};

export type SlideSnapshotRenderResult = {
  body: string;
  contentHash: string;
  contentType: "image/svg+xml";
  slideId: string;
};

const forbiddenAudienceFields = [
  "speakerNotes",
  "presenterScript",
  "rawTranscript",
  "rawAudio",
  "fileBase64",
  "token",
  "cookie",
  "password",
  "secret",
];

export function renderSlideSnapshot(
  input: SlideSnapshotRenderInput,
): SlideSnapshotRenderResult {
  const deck = deckSchema.parse(input.deck);
  const slide = deck.slides.find((candidate) => candidate.slideId === input.slideId);
  if (!slide) {
    throw new Error(`Slide not found: ${input.slideId}`);
  }

  const body = renderSlideSvg(deck, slide, input.effectState ?? {});
  assertNoForbiddenAudienceFields(body);

  return {
    body,
    contentHash: createHash("sha256").update(body).digest("hex"),
    contentType: "image/svg+xml",
    slideId: slide.slideId,
  };
}

function renderSlideSvg(
  deck: Deck,
  slide: Slide,
  effectState: Record<string, unknown>,
) {
  const width = deck.canvas.width;
  const height = deck.canvas.height;
  const background =
    slide.style.backgroundColor ?? deck.theme.backgroundColor ?? "#ffffff";
  const textColor = slide.style.textColor ?? deck.theme.textColor ?? "#111827";
  const accentColor =
    slide.style.accentColor ?? deck.theme.accentColor ?? "#2563eb";
  const visibleElements = slide.elements.slice(0, 8);
  const effectSummary = summarizeEffectState(effectState);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(slide.title || deck.title)}">`,
    `<rect width="100%" height="100%" fill="${escapeXml(background)}"/>`,
    `<rect x="64" y="64" width="${width - 128}" height="${height - 128}" rx="28" fill="none" stroke="${escapeXml(accentColor)}" stroke-width="6" opacity="0.28"/>`,
    `<text x="96" y="150" fill="${escapeXml(textColor)}" font-family="Inter, Arial, sans-serif" font-size="64" font-weight="700">${escapeXml(slide.title || deck.title)}</text>`,
    ...visibleElements.map((element, index) =>
      renderElementSummary(element, index, textColor),
    ),
    effectSummary
      ? `<text x="96" y="${height - 96}" fill="${escapeXml(accentColor)}" font-family="Inter, Arial, sans-serif" font-size="28">${escapeXml(effectSummary)}</text>`
      : "",
    "</svg>",
  ].join("");
}

function renderElementSummary(
  element: unknown,
  index: number,
  textColor: string,
) {
  const record = typeof element === "object" && element !== null ? element as Record<string, unknown> : {};
  const props = typeof record.props === "object" && record.props !== null
    ? record.props as Record<string, unknown>
    : {};
  const label =
    typeof props.text === "string"
      ? props.text
      : typeof record.alt === "string"
        ? record.alt
        : typeof record.type === "string"
          ? record.type
          : "요소";
  return `<text x="120" y="${240 + index * 58}" fill="${escapeXml(textColor)}" font-family="Inter, Arial, sans-serif" font-size="34">${escapeXml(label).slice(0, 180)}</text>`;
}

function summarizeEffectState(effectState: Record<string, unknown>) {
  const stepIndex = effectState.stepIndex;
  const triggerAnimationIds = effectState.triggerAnimationIds;
  const parts: string[] = [];
  if (typeof stepIndex === "number") {
    parts.push(`step ${stepIndex}`);
  }
  if (Array.isArray(triggerAnimationIds)) {
    parts.push(`${triggerAnimationIds.length} effects`);
  }
  return parts.join(" · ");
}

function assertNoForbiddenAudienceFields(value: string) {
  for (const field of forbiddenAudienceFields) {
    if (value.includes(field)) {
      throw new Error(`slide snapshot includes forbidden audience field: ${field}`);
    }
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
