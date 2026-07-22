import type { Deck, DeckElement, Slide } from "@orbit/shared";

export const motionReasonCodes = [
  "SPECIAL_SLIDE",
  "SNAPSHOT_SLIDE",
  "IMPORT_RENDER_MODE_UNKNOWN",
  "IMPORT_SOURCE_MISSING",
  "IMPORT_COVERAGE_UNSAFE",
  "NO_STABLE_TARGETS",
  "NO_VISIBLE_CONTENT_TARGETS",
] as const;

export type MotionReasonCode = (typeof motionReasonCodes)[number];

export type MotionEligibility =
  | {
      outcome: "applicable";
      allowedTargetElementIds: string[];
      source: "authored" | "imported-editable" | "imported-hybrid";
    }
  | {
      outcome: "not-needed" | "refused-unsafe";
      reasonCode: MotionReasonCode;
    };

export type MotionEligibilityOptions = {
  /**
   * API callers pass the allowlist derived from the authoritative
   * TemplateBlueprint. Web callers may omit it and use the conservative Deck
   * capability projection for an early, non-authoritative gate.
   */
  stableTargetElementIds?: Iterable<string>;
  requireAuthoritativeImportedTargets?: boolean;
};

const excludedRoles = new Set<DeckElement["role"]>([
  "background",
  "decoration",
  "footer",
]);

const excludedElementTypes = new Set<DeckElement["type"]>([
  "activity-qr",
  "arrow",
  "group",
  "line",
]);

export function evaluateMotionEligibility(
  deck: Deck,
  slide: Slide,
  options: MotionEligibilityOptions = {},
): MotionEligibility {
  if (slide.kind !== "content") {
    return refused("SPECIAL_SLIDE");
  }

  if (slide.importRenderMode === "snapshot") {
    return refused("SNAPSHOT_SLIDE");
  }

  const visibleTargetIds = slide.elements
    .filter(isVisibleContentTarget)
    .map((element) => element.elementId);
  const imported = isImportedSlide(deck, slide);

  if (!imported) {
    return visibleTargetIds.length > 0
      ? {
          outcome: "applicable",
          allowedTargetElementIds: visibleTargetIds,
          source: "authored",
        }
      : { outcome: "not-needed", reasonCode: "NO_VISIBLE_CONTENT_TARGETS" };
  }

  if (
    slide.importRenderMode !== "editable" &&
    slide.importRenderMode !== "hybrid"
  ) {
    return refused("IMPORT_RENDER_MODE_UNKNOWN");
  }

  if (!slide.ooxmlSourceSlidePart) {
    return refused("IMPORT_SOURCE_MISSING");
  }

  const coverage =
    slide.ooxmlMotionCapabilities?.importedMainSequenceCoverage;
  if (coverage !== "absent" && coverage !== "complete") {
    return refused("IMPORT_COVERAGE_UNSAFE");
  }

  const stableTargetIds = resolveStableTargetIds(
    slide,
    options,
  );
  const allowedTargetElementIds = visibleTargetIds.filter((elementId) =>
    stableTargetIds.has(elementId),
  );

  if (allowedTargetElementIds.length === 0) {
    return refused("NO_STABLE_TARGETS");
  }

  return {
    outcome: "applicable",
    allowedTargetElementIds,
    source:
      slide.importRenderMode === "hybrid"
        ? "imported-hybrid"
        : "imported-editable",
  };
}

export function getMotionEligibilityReasonMessage(
  reasonCode: MotionReasonCode,
): string {
  switch (reasonCode) {
    case "SPECIAL_SLIDE":
      return "참여 장표와 결과 장표에는 애니메이션을 추천할 수 없습니다.";
    case "SNAPSHOT_SLIDE":
      return "이미지로 가져온 슬라이드에는 애니메이션을 안전하게 적용할 수 없습니다.";
    case "IMPORT_RENDER_MODE_UNKNOWN":
      return "가져온 슬라이드의 편집 모드를 확인할 수 없어 애니메이션 추천을 사용할 수 없습니다.";
    case "IMPORT_SOURCE_MISSING":
      return "가져온 슬라이드의 안정적인 OOXML 위치 정보가 없습니다.";
    case "IMPORT_COVERAGE_UNSAFE":
      return "가져온 애니메이션 구조를 완전하게 보존할 수 없어 추천을 사용할 수 없습니다.";
    case "NO_STABLE_TARGETS":
      return "원본에 안전하게 저장할 수 있는 애니메이션 대상이 없습니다.";
    case "NO_VISIBLE_CONTENT_TARGETS":
      return "애니메이션을 추천할 본문 요소가 없습니다.";
  }
}

function resolveStableTargetIds(
  slide: Extract<Slide, { kind: "content" }>,
  options: MotionEligibilityOptions,
): Set<string> {
  if (options.stableTargetElementIds !== undefined) {
    return new Set(options.stableTargetElementIds);
  }
  if (options.requireAuthoritativeImportedTargets) {
    return new Set();
  }
  return new Set(
    slide.elements
      .filter(
        (element) => element.ooxmlEditCapabilities?.frame === true,
      )
      .map((element) => element.elementId),
  );
}

function isImportedSlide(deck: Deck, slide: Slide): boolean {
  return (
    deck.metadata.sourceType === "import" ||
    slide.importRenderMode !== undefined ||
    slide.ooxmlOrigin === "imported" ||
    slide.ooxmlSourceSlidePart !== undefined ||
    slide.elements.some((element) => element.ooxmlOrigin === "imported")
  );
}

function isVisibleContentTarget(element: DeckElement): boolean {
  return (
    element.visible !== false &&
    element.opacity > 0 &&
    element.locked !== true &&
    !excludedRoles.has(element.role) &&
    !excludedElementTypes.has(element.type)
  );
}

function refused(reasonCode: MotionReasonCode): MotionEligibility {
  return { outcome: "refused-unsafe", reasonCode };
}
