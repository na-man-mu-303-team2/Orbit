import { applyDeckPatch } from "@orbit/editor-core";
import type {
  Deck,
  DeckElement,
  DeckPatch,
  DeckPatchOperation,
  Slide,
} from "@orbit/shared";

export type OoxmlEditFeature =
  | "add-element"
  | "add-slide"
  | "animation-main-sequence"
  | "crop"
  | "delete-element"
  | "duplicate-element"
  | "duplicate-slide"
  | "element-appearance"
  | "element-frame"
  | "element-properties"
  | "image-source"
  | "rich-text-content"
  | "rich-text-style"
  | "slide-properties"
  | "table-cell-text"
  | "transition";

export type OoxmlEditCapabilityReasonCode =
  | "ANIMATION_SERIALIZER_NOT_READY"
  | "AUTHORED_SERIALIZER_UNSUPPORTED"
  | "ELEMENT_REQUIRED"
  | "GENERIC_EXPORT_UNSUPPORTED"
  | "IMPORTED_CAPABILITY_MISSING"
  | "IMPORTED_FEATURE_UNSUPPORTED"
  | "IMPORTED_PROVENANCE_MISSING"
  | "MOTION_COVERAGE_UNSAFE"
  | "SLIDE_REQUIRED"
  | "SUPPORTED";

export type OoxmlEditCapability = {
  enabled: boolean;
  reasonCode: OoxmlEditCapabilityReasonCode;
  reason: string | null;
};

type ResolveOoxmlEditCapabilityInput = {
  deck: Deck;
  feature: OoxmlEditFeature;
  slide?: Slide | null;
  element?: DeckElement | null;
};

const supported = Object.freeze<OoxmlEditCapability>({
  enabled: true,
  reasonCode: "SUPPORTED",
  reason: null,
});

const importedAnimationMainSequenceSerializerReady = false;

export function resolveOoxmlEditCapability(
  input: ResolveOoxmlEditCapabilityInput,
): OoxmlEditCapability {
  if (input.deck.metadata.sourceType !== "import") {
    return resolveGenericExportCapability(
      input.feature,
      input.element,
      input.slide,
    );
  }

  if (isElementFeature(input.feature)) {
    if (input.feature === "add-element") {
      if (!input.slide) {
        return denied("SLIDE_REQUIRED", "요소를 추가할 슬라이드가 필요합니다.");
      }
      if (!input.slide.ooxmlOrigin) {
        return denied(
          "IMPORTED_PROVENANCE_MISSING",
          "가져온 슬라이드의 OOXML 출처 정보가 없어 요소를 추가할 수 없습니다.",
        );
      }
      if (input.slide.ooxmlOrigin !== "imported") {
        return denied(
          "AUTHORED_SERIALIZER_UNSUPPORTED",
          "이 슬라이드에 요소를 추가하는 OOXML serializer가 아직 없습니다.",
        );
      }
    }
    if (!input.element) {
      return denied("ELEMENT_REQUIRED", "편집할 요소가 필요합니다.");
    }
    if (!input.element.ooxmlOrigin) {
      return denied(
        "IMPORTED_PROVENANCE_MISSING",
        "가져온 요소의 OOXML 출처 정보가 없어 안전하게 편집할 수 없습니다.",
      );
    }
    if (input.element.ooxmlOrigin === "authored") {
      return resolveAuthoredElementCapability(input.feature, input.element);
    }
    return resolveImportedElementCapability(input.feature, input.element);
  }

  if (!input.slide) {
    return denied("SLIDE_REQUIRED", "편집할 슬라이드가 필요합니다.");
  }
  if (!input.slide.ooxmlOrigin) {
    return denied(
      "IMPORTED_PROVENANCE_MISSING",
      "가져온 슬라이드의 OOXML 출처 정보가 없어 안전하게 편집할 수 없습니다.",
    );
  }
  if (input.slide.ooxmlOrigin === "authored") {
    return denied(
      "AUTHORED_SERIALIZER_UNSUPPORTED",
      "이 슬라이드를 OOXML에 추가하거나 갱신하는 serializer가 아직 없습니다.",
    );
  }
  return resolveImportedSlideCapability(input.feature, input.slide);
}

export function resolveOoxmlPatchCapability(
  deck: Deck,
  patch: DeckPatch,
): OoxmlEditCapability {
  if (deck.metadata.sourceType !== "import") return supported;

  let workingDeck = deck;
  for (const operation of patch.operations) {
    const capability = resolveOoxmlOperationCapability(workingDeck, operation);
    if (!capability.enabled) {
      return {
        ...capability,
        reason: `${operation.type}: ${capability.reason ?? "지원하지 않는 OOXML 편집입니다."}`,
      };
    }
    const projectionOperation =
      operation.type === "add_element"
        ? {
            ...operation,
            element: {
              ...operation.element,
              ooxmlOrigin: "authored" as const,
              ooxmlEditCapabilities: undefined,
            },
          }
        : operation;
    const projection = applyDeckPatch(workingDeck, {
      ...patch,
      baseVersion: workingDeck.version,
      operations: [projectionOperation],
    });
    if (projection.ok) workingDeck = projection.deck;
  }
  return supported;
}

function resolveOoxmlOperationCapability(
  deck: Deck,
  operation: DeckPatchOperation,
): OoxmlEditCapability {
  if (
    operation.type === "update_deck" ||
    operation.type === "update_slide" ||
    operation.type === "update_speaker_notes" ||
    operation.type === "replace_keywords" ||
    operation.type === "replace_semantic_cues" ||
    operation.type === "add_slide_action" ||
    operation.type === "update_slide_action" ||
    operation.type === "delete_slide_action"
  ) {
    return supported;
  }

  if (operation.type === "add_element") {
    const authoredElement = {
      ...operation.element,
      ooxmlOrigin: "authored" as const,
      ooxmlEditCapabilities: undefined,
    };
    return resolveOoxmlEditCapability({
      deck,
      element: authoredElement,
      feature: "add-element",
      slide: findDeckSlide(deck, operation.slideId),
    });
  }

  if (
    operation.type === "update_element_frame" ||
    operation.type === "update_element_props" ||
    operation.type === "delete_element"
  ) {
    const element = findDeckElement(
      deck,
      operation.slideId,
      operation.elementId,
    );
    if (operation.type === "update_element_props") {
      return resolveElementPropsCapability(deck, element, operation.props);
    }
    const feature =
      operation.type === "delete_element"
        ? "delete-element"
        : Object.keys(operation.frame).some((key) =>
              ["locked", "opacity", "role", "visible"].includes(key),
            )
          ? "element-appearance"
          : "element-frame";
    return resolveOoxmlEditCapability({ deck, element, feature });
  }

  if (
    operation.type === "add_animation" ||
    operation.type === "update_animation" ||
    operation.type === "delete_animation"
  ) {
    return resolveOoxmlEditCapability({
      deck,
      feature: "animation-main-sequence",
      slide: findDeckSlide(deck, operation.slideId),
    });
  }

  if (operation.type === "add_slide") {
    return resolveOoxmlEditCapability({
      deck,
      feature: "add-slide",
      slide: operation.slide,
    });
  }

  if (operation.type === "delete_slide") {
    return resolveOoxmlEditCapability({
      deck,
      feature: "slide-properties",
      slide: findDeckSlide(deck, operation.slideId),
    });
  }

  if (operation.type === "reorder_slides") {
    return resolveOoxmlEditCapability({
      deck,
      feature: "slide-properties",
      slide: findDeckSlide(deck, operation.slideOrders[0]?.slideId),
    });
  }

  return resolveOoxmlEditCapability({
    deck,
    feature: "slide-properties",
    slide:
      "slideId" in operation
        ? findDeckSlide(deck, operation.slideId)
        : (deck.slides[0] ?? null),
  });
}

function resolveElementPropsCapability(
  deck: Deck,
  element: DeckElement | null,
  props: Record<string, unknown>,
): OoxmlEditCapability {
  if (element?.type === "image") {
    const propKeys = Object.keys(props);
    const supportedImageKeys = ["alt", "crop", "src"];
    if (
      propKeys.length > 0 &&
      propKeys.every((key) => supportedImageKeys.includes(key))
    ) {
      const features: OoxmlEditFeature[] = [];
      if (propKeys.some((key) => key === "alt" || key === "src")) {
        features.push("image-source");
      }
      if (propKeys.includes("crop")) features.push("crop");

      for (const feature of features) {
        const capability = resolveOoxmlEditCapability({
          deck,
          element,
          feature,
        });
        if (!capability.enabled) return capability;
      }
      return supported;
    }
  }

  return resolveOoxmlEditCapability({
    deck,
    element,
    feature: resolveElementPropsFeature(element, props),
  });
}

function resolveElementPropsFeature(
  element: DeckElement | null,
  props: Record<string, unknown>,
): OoxmlEditFeature {
  if (
    element?.type === "image" &&
    Object.keys(props).every((key) => ["alt", "src"].includes(key))
  ) {
    return "image-source";
  }
  if (element?.type === "table" && "data" in props) return "table-cell-text";
  if (element?.type === "text") {
    return Object.keys(props).some((key) =>
      ["paragraphs", "runs", "text"].includes(key),
    )
      ? "rich-text-content"
      : "rich-text-style";
  }
  return "element-properties";
}

function findDeckSlide(deck: Deck, slideId: string | undefined) {
  return deck.slides.find((slide) => slide.slideId === slideId) ?? null;
}

function findDeckElement(deck: Deck, slideId: string, elementId: string) {
  return (
    findDeckSlide(deck, slideId)?.elements.find(
      (element) => element.elementId === elementId,
    ) ?? null
  );
}

function resolveGenericExportCapability(
  feature: OoxmlEditFeature,
  element?: DeckElement | null,
  slide?: Slide | null,
): OoxmlEditCapability {
  if (isElementFeature(feature)) {
    if (!element)
      return denied("ELEMENT_REQUIRED", "편집할 요소가 필요합니다.");
    if (feature === "crop") {
      return element.type === "image"
        ? supported
        : denied(
            "GENERIC_EXPORT_UNSUPPORTED",
            "래스터 이미지 자르기만 일반 PPTX 내보내기에서 보존할 수 있습니다.",
          );
    }
    if (feature === "add-element" || feature === "duplicate-element") {
      return genericExportSupportsElement(element)
        ? supported
        : denied(
            "GENERIC_EXPORT_UNSUPPORTED",
            "이 요소 유형은 일반 PPTX 내보내기에서 보존되지 않습니다.",
          );
    }
    return supported;
  }
  if (
    feature === "animation-main-sequence" ||
    feature === "slide-properties" ||
    feature === "transition"
  ) {
    return slide
      ? supported
      : denied("SLIDE_REQUIRED", "편집할 슬라이드가 필요합니다.");
  }
  if (feature === "add-slide" || feature === "duplicate-slide")
    return supported;
  return denied(
    "GENERIC_EXPORT_UNSUPPORTED",
    "이 기능은 일반 PPTX 내보내기에서 아직 보존되지 않습니다.",
  );
}

function resolveImportedElementCapability(
  feature: OoxmlEditFeature,
  element: DeckElement,
): OoxmlEditCapability {
  const capabilities = element.ooxmlEditCapabilities;
  if (!capabilities) {
    return denied(
      "IMPORTED_CAPABILITY_MISSING",
      "가져온 요소의 OOXML 편집 가능 범위가 없어 편집을 중단했습니다.",
    );
  }

  if (feature === "rich-text-style") {
    return capabilities.richText === "style-only" ||
      capabilities.richText === "full"
      ? supported
      : importedFeatureUnsupported();
  }
  if (feature === "rich-text-content") {
    return capabilities.richText === "full"
      ? supported
      : importedFeatureUnsupported();
  }
  if (feature === "crop") {
    return element.type === "image" &&
      (capabilities.crop === "picture" || capabilities.crop === "picture-fill")
      ? supported
      : importedCropUnsupported();
  }
  if (feature === "table-cell-text") {
    return capabilities.tableCellText
      ? supported
      : importedFeatureUnsupported();
  }
  if (feature === "image-source") {
    return element.type === "image" && capabilities.imageSource === true
      ? supported
      : importedFeatureUnsupported();
  }
  if (feature === "element-frame") {
    return capabilities.frame === true
      ? supported
      : importedFeatureUnsupported();
  }
  if (feature === "delete-element") {
    return capabilities.delete === true
      ? supported
      : importedFeatureUnsupported();
  }
  if (feature === "duplicate-element" || feature === "add-element") {
    return resolveAuthoredElementCapability(feature, element);
  }
  return importedFeatureUnsupported();
}

function resolveAuthoredElementCapability(
  feature: OoxmlEditFeature,
  element: DeckElement,
): OoxmlEditCapability {
  if (feature === "crop") {
    return element.type === "image" &&
      authoredSerializerSupportsElement(element)
      ? supported
      : denied(
          "AUTHORED_SERIALIZER_UNSUPPORTED",
          "이 이미지 자르기를 OOXML에 보존하는 serializer가 아직 없습니다.",
        );
  }
  if (feature === "rich-text-content" && element.type === "text") {
    return !element.props.paragraphs?.length && !element.props.runs?.length
      ? supported
      : denied(
          "AUTHORED_SERIALIZER_UNSUPPORTED",
          "이 텍스트 구조를 OOXML에 갱신하는 serializer가 아직 없습니다.",
        );
  }
  if (feature === "image-source") {
    return element.type === "image" &&
      authoredSerializerSupportsElement(element)
      ? supported
      : denied(
          "AUTHORED_SERIALIZER_UNSUPPORTED",
          "이 이미지 원본 변경을 OOXML에 보존하는 serializer가 아직 없습니다.",
        );
  }
  if (feature === "add-element" || feature === "duplicate-element") {
    return authoredSerializerSupportsElement(element)
      ? supported
      : denied(
          "AUTHORED_SERIALIZER_UNSUPPORTED",
          "이 요소 유형을 OOXML에 새로 추가하는 serializer가 아직 없습니다.",
        );
  }
  if (feature === "element-frame" || feature === "delete-element") {
    return authoredSerializerSupportsElement(element)
      ? supported
      : denied(
          "AUTHORED_SERIALIZER_UNSUPPORTED",
          "이 요소 편집을 OOXML에 보존하는 serializer가 아직 없습니다.",
        );
  }
  return denied(
    "AUTHORED_SERIALIZER_UNSUPPORTED",
    "ORBIT에서 추가한 요소의 이 편집을 OOXML에 보존하는 serializer가 아직 없습니다.",
  );
}

function resolveImportedSlideCapability(
  feature: OoxmlEditFeature,
  slide: Slide,
): OoxmlEditCapability {
  const capabilities = slide.ooxmlMotionCapabilities;
  if (!capabilities) {
    return denied(
      "IMPORTED_CAPABILITY_MISSING",
      "가져온 슬라이드의 OOXML 편집 가능 범위가 없어 편집을 중단했습니다.",
    );
  }
  if (feature === "transition") {
    return capabilities.transitionWritable
      ? supported
      : importedFeatureUnsupported();
  }
  if (feature === "animation-main-sequence") {
    if (
      capabilities.importedMainSequenceCoverage === "unknown" ||
      capabilities.importedMainSequenceCoverage === "partial"
    ) {
      return denied(
        "MOTION_COVERAGE_UNSAFE",
        "원본 애니메이션 시퀀스를 완전히 해석하지 못해 편집할 수 없습니다.",
      );
    }
    return importedAnimationMainSequenceSerializerReady
      ? supported
      : denied(
          "ANIMATION_SERIALIZER_NOT_READY",
          "가져온 애니메이션 시퀀스를 저장하는 serializer가 아직 준비되지 않았습니다.",
        );
  }
  if (feature === "slide-properties") return importedFeatureUnsupported();
  return denied(
    "AUTHORED_SERIALIZER_UNSUPPORTED",
    "이 슬라이드 작업을 OOXML에 반영하는 serializer가 아직 없습니다.",
  );
}

function authoredSerializerSupportsElement(element: DeckElement): boolean {
  if (element.opacity !== 1 || element.locked || !element.visible) return false;
  if (element.type === "text") {
    return (
      !element.props.paragraphs?.length &&
      !element.props.runs?.length &&
      element.props.writingMode === undefined &&
      element.props.bullet === undefined &&
      (element.props.fontWeight === "normal" ||
        element.props.fontWeight === "bold")
    );
  }
  if (element.type === "image") {
    return (
      element.props.fit === "contain" &&
      element.props.focusX === 0.5 &&
      element.props.focusY === 0.5
    );
  }
  return (
    element.type === "rect" &&
    typeof element.props.fill === "string" &&
    (element.props.fill === "transparent" ||
      /^#[0-9a-f]{6}$/i.test(element.props.fill)) &&
    element.props.stroke === "transparent" &&
    element.props.strokeWidth === 0 &&
    element.props.borderRadius === 0 &&
    element.props.dash === undefined &&
    element.props.shadow === undefined
  );
}

function genericExportSupportsElement(element: DeckElement): boolean {
  return [
    "text",
    "rect",
    "ellipse",
    "line",
    "arrow",
    "image",
    "chart",
    "table",
  ].includes(element.type);
}

function isElementFeature(feature: OoxmlEditFeature): boolean {
  return [
    "add-element",
    "crop",
    "delete-element",
    "duplicate-element",
    "element-appearance",
    "element-frame",
    "element-properties",
    "image-source",
    "rich-text-content",
    "rich-text-style",
    "table-cell-text",
  ].includes(feature);
}

function importedFeatureUnsupported(): OoxmlEditCapability {
  return denied(
    "IMPORTED_FEATURE_UNSUPPORTED",
    "원본 OOXML 구조에서 이 편집을 안전하게 보존할 수 없습니다.",
  );
}

function importedCropUnsupported(): OoxmlEditCapability {
  return denied(
    "IMPORTED_FEATURE_UNSUPPORTED",
    "이 이미지의 원본 OOXML 자르기 영역은 읽기 전용이거나 안전한 source mapping이 없어 편집할 수 없습니다.",
  );
}

function denied(
  reasonCode: Exclude<OoxmlEditCapabilityReasonCode, "SUPPORTED">,
  reason: string,
): OoxmlEditCapability {
  return { enabled: false, reasonCode, reason };
}
