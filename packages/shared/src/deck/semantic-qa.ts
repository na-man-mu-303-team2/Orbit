import type { Deck, Slide } from "./deck.schema";
import type { GenerateDeckValidationIssue } from "./generate-deck.schema";

export const semanticQaIssueCodes = [
  "SLIDE_MESSAGE_MULTIPLE",
  "NARRATIVE_FLOW_WEAK",
  "EVIDENCE_MISMATCH",
  "IMAGE_RELEVANCE_WEAK",
  "BRAND_KIT_VIOLATION",
  "IMAGE_LICENSE_MISSING",
  "SPEAKER_NOTES_REPEATED"
] as const;

export type SemanticQaIssueCode = (typeof semanticQaIssueCodes)[number];

export function getSemanticQaIssues(deck: Deck): GenerateDeckValidationIssue[] {
  if (!deck.metadata.presentationProfile) return [];
  return [
    ...slideMessageIssues(deck),
    ...narrativeIssues(deck),
    ...evidenceIssues(deck),
    ...imageIssues(deck),
    ...brandKitIssues(deck),
    ...speakerNotesIssues(deck)
  ];
}

export function repairSemanticQaOnce(deck: Deck): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      const emphasisPoints = slide.aiNotes?.emphasisPoints ?? [];
      const visualPlan = slide.aiNotes?.visualPlan;
      const repairedElements = slide.elements.map((element) => {
        if (element.type !== "image" || !visualPlan?.reason) return element;
        if (hasTokenOverlap(element.props.alt, `${slide.title} ${visualPlan.reason}`)) {
          return element;
        }
        return {
          ...element,
          props: { ...element.props, alt: visualPlan.reason }
        };
      });
      if (!slide.aiNotes || emphasisPoints.length <= 1) {
        return { ...slide, elements: repairedElements };
      }
      return {
        ...slide,
        elements: repairedElements,
        aiNotes: {
          ...slide.aiNotes,
          emphasisPoints: emphasisPoints.slice(0, 1)
        }
      };
    })
  };
}

function slideMessageIssues(deck: Deck) {
  return deck.slides.flatMap((slide, index) => {
    const points = uniqueNormalized(slide.aiNotes?.emphasisPoints ?? []);
    return points.length > 1
      ? [issue("SLIDE_MESSAGE_MULTIPLE", "slide", `slides.${index}.aiNotes.emphasisPoints`, "한 슬라이드에 둘 이상의 핵심 메시지가 지정되어 있습니다.")]
      : [];
  });
}

function narrativeIssues(deck: Deck) {
  for (let index = 1; index < deck.slides.length; index += 1) {
    const previous = primaryMessage(deck.slides[index - 1]);
    const current = primaryMessage(deck.slides[index]);
    if (previous && current && similarity(previous, current) >= 0.8) {
      return [
        issue(
          "NARRATIVE_FLOW_WEAK",
          "deck",
          `slides.${index}`,
          "인접 슬라이드가 같은 메시지를 반복해 발표 흐름이 정체됩니다."
        )
      ];
    }
  }
  return [];
}

function evidenceIssues(deck: Deck) {
  return deck.slides.flatMap((slide, index) => {
    const ledger = slide.aiNotes?.sourceLedger ?? [];
    const message = primaryMessage(slide);
    if (!message || ledger.length === 0) return [];
    const claims = ledger.map((entry) => entry.claim).join(" ");
    const messageTokens = tokens(message);
    if (messageTokens.length < 2 || tokens(claims).length < 2) return [];
    return hasTokenOverlap(message, claims)
      ? []
      : [
          issue(
            "EVIDENCE_MISMATCH",
            "slide",
            `slides.${index}.aiNotes.sourceLedger`,
            "핵심 메시지와 연결된 근거 claim의 주제가 일치하지 않습니다."
          )
        ];
  });
}

function imageIssues(deck: Deck) {
  return deck.slides.flatMap((slide, index) => {
    const plan = slide.aiNotes?.visualPlan;
    const images = slide.elements.filter(
      (
        element
      ): element is Extract<Slide["elements"][number], { type: "image" }> =>
        element.visible && element.type === "image" && element.role === "media"
    );
    if (!plan || images.length === 0) return [];
    const issues: GenerateDeckValidationIssue[] = [];
    const context = `${slide.title} ${plan.reason} ${primaryMessage(slide)}`;
    if (images.some((image) => !hasTokenOverlap(image.props.alt, context))) {
      issues.push(
        issue(
          "IMAGE_RELEVANCE_WEAK",
          "slide",
          `slides.${index}.elements`,
          "이미지 대체 텍스트와 슬라이드 핵심 메시지의 관련성이 낮습니다."
        )
      );
    }
    if (
      plan.imageSourcePolicy === "public-assets" &&
      plan.asset &&
      (!plan.asset.sourceUrl || !plan.asset.license)
    ) {
      issues.push(
        issue(
          "IMAGE_LICENSE_MISSING",
          "slide",
          `slides.${index}.aiNotes.visualPlan.asset`,
          "공개 이미지의 원본 URL과 라이선스 정보가 필요합니다."
        )
      );
    }
    return issues;
  });
}

function brandKitIssues(deck: Deck) {
  const snapshot = deck.metadata.brandKitSnapshot;
  if (!snapshot) return [];
  const locked = new Set(snapshot.values.lockedFields);
  const violations: string[] = [];
  if (locked.has("palette")) {
    const expected = snapshot.values.palette;
    const themePalette = deck.theme.palette;
    if (
      deck.theme.backgroundColor !== expected.background ||
      deck.theme.textColor !== expected.text ||
      deck.theme.accentColor !== expected.accentColor ||
      themePalette.primary !== expected.primary ||
      themePalette.secondary !== expected.secondary
    ) {
      violations.push("palette");
    }
  }
  if (locked.has("tone") && deck.metadata.tone !== snapshot.values.tone) {
    violations.push("tone");
  }
  if (locked.has("typography")) {
    const allowed = new Set([
      snapshot.values.typography.headingFontFamily.toLocaleLowerCase(),
      snapshot.values.typography.bodyFontFamily.toLocaleLowerCase()
    ]);
    const invalid = deck.slides.some((slide) =>
      slide.elements.some(
        (element) =>
          element.visible &&
          element.type === "text" &&
          Boolean(element.props.fontFamily) &&
          !allowed.has(element.props.fontFamily!.toLocaleLowerCase())
      )
    );
    if (invalid) violations.push("typography");
  }
  if (
    locked.has("logo") &&
    snapshot.values.logoAssetId &&
    deck.slides.some(
      (slide) =>
        !slide.elements.some(
          (element) =>
            element.visible &&
            element.type === "image" &&
            element.elementId.endsWith("_brand_kit_logo")
        )
    )
  ) {
    violations.push("logo");
  }
  return violations.length > 0
    ? [
        issue(
          "BRAND_KIT_VIOLATION",
          "deck",
          "metadata.brandKitSnapshot",
          `잠긴 Brand Kit 필드가 결과물에 유지되지 않았습니다: ${violations.join(", ")}`
        )
      ]
    : [];
}

function speakerNotesIssues(deck: Deck) {
  const seen = new Map<string, number>();
  for (const [slideIndex, slide] of deck.slides.entries()) {
    const sentences = speakerNoteSentences(slide.speakerNotes);
    const acceptedSentences: string[] = [];
    for (const [sentenceIndex, sentence] of sentences.entries()) {
      const key = normalize(sentence).replaceAll(" ", "");
      if (key.length < 20) {
        acceptedSentences.push(sentence);
        continue;
      }
      if (seen.has(key)) {
        return [
          issue(
            "SPEAKER_NOTES_REPEATED",
            "slide",
            `slides.${slideIndex}.speakerNotes`,
            "발표자 메모에 동일한 문장이 반복되어 있습니다."
          )
        ];
      }
      seen.set(key, slideIndex);
      const previous = sentences[sentenceIndex - 1];
      if (previous && tokenSimilarity(previous, sentence) >= 0.8) {
        return [
          issue(
            "SPEAKER_NOTES_REPEATED",
            "slide",
            `slides.${slideIndex}.speakerNotes`,
            "발표자 메모의 인접 문장이 같은 내용을 반복합니다."
          )
        ];
      }
      if (speakerNoteRepeatsPrior(sentence, acceptedSentences)) {
        return [
          issue(
            "SPEAKER_NOTES_REPEATED",
            "slide",
            `slides.${slideIndex}.speakerNotes`,
            "발표자 메모가 앞선 설명을 다른 표현으로 반복합니다."
          )
        ];
      }
      acceptedSentences.push(sentence);
    }
  }
  return [];
}

function speakerNoteSentences(value: string) {
  return value
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function speakerNoteRepeatsPrior(sentence: string, priorSentences: string[]) {
  if (priorSentences.length === 0 || !/[가-힣]/u.test(sentence)) return false;
  const sentenceTokens = new Set(tokens(sentence));
  const priorTokens = new Set(tokens(priorSentences.join(" ")));
  if (sentenceTokens.size >= 6) {
    const novelCount = [...sentenceTokens].filter(
      (token) => !priorTokens.has(token)
    ).length;
    if (novelCount / sentenceTokens.size <= 0.4) return true;
  }
  if (
    priorSentences.some(
      (prior) => characterPairSimilarity(sentence, prior) >= 0.65
    )
  ) {
    return true;
  }
  return ["안녕하세요", "오늘은"].some(
    (marker) =>
      sentence.includes(marker) &&
      priorSentences.some((prior) => prior.includes(marker))
  );
}

function characterPairSimilarity(left: string, right: string) {
  const leftKey = normalize(left).replaceAll(" ", "");
  const rightKey = normalize(right).replaceAll(" ", "");
  if (leftKey.length < 2 || rightKey.length < 2) return 0;
  const leftPairs = new Set(
    Array.from({ length: leftKey.length - 1 }, (_, index) =>
      leftKey.slice(index, index + 2)
    )
  );
  const rightPairs = new Set(
    Array.from({ length: rightKey.length - 1 }, (_, index) =>
      rightKey.slice(index, index + 2)
    )
  );
  const intersection = [...leftPairs].filter((pair) => rightPairs.has(pair)).length;
  return (2 * intersection) / (leftPairs.size + rightPairs.size);
}

function issue(
  code: SemanticQaIssueCode,
  scope: "deck" | "slide" | "element",
  path: string,
  message: string
): GenerateDeckValidationIssue {
  return { code, scope, severity: "warning", blocking: false, path, message };
}

function primaryMessage(slide: Slide) {
  return slide.aiNotes?.emphasisPoints?.[0] || slide.title;
}

function uniqueNormalized(values: string[]) {
  return Array.from(new Set(values.map(normalize).filter(Boolean)));
}

function similarity(left: string, right: string) {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function hasTokenOverlap(left: string, right: string) {
  const rightTokens = new Set(tokens(right));
  return tokens(left).some((token) => rightTokens.has(token));
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "대한",
  "위한",
  "통한",
  "있는",
  "하는",
  "핵심",
  "슬라이드"
]);
