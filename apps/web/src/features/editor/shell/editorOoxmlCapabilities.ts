import { applyDeckPatch, getRichTextSemanticText } from "@orbit/editor-core";
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
  | "table-structure"
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

const importedAnimationMainSequenceSerializerReady = true;
const genericExportAnimationTypes = new Set(["appear", "fade-in", "zoom-in"]);

const supportedAuthoredTextProps = new Set([
  "text",
  "runs",
  "paragraphs",
  "bodyInset",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "italic",
  "underline",
  "color",
  "align",
  "verticalAlign",
  "writingMode",
  "lineHeight",
  "bullet",
]);

const supportedAuthoredTablePatchProps = new Set([
  "rows",
  "rowHeights",
  "columnWidths",
]);

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
      workingDeck.metadata.sourceType === "import" &&
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
    const slide = findDeckSlide(deck, operation.slideId);
    if (!slide) {
      return denied("SLIDE_REQUIRED", "편집할 슬라이드가 필요합니다.");
    }
    if (operation.type === "delete_animation") return supported;

    const animationType =
      operation.type === "add_animation"
        ? operation.animation.type
        : (operation.animation.type ??
          slide.animations.find(
            (animation) => animation.animationId === operation.animationId,
          )?.type);
    if (animationType && !genericExportAnimationTypes.has(animationType)) {
      return denied(
        "GENERIC_EXPORT_UNSUPPORTED",
        `${animationType} 효과는 PPTX motion serializer에서 보존할 수 없습니다.`,
      );
    }
    if (deck.metadata.sourceType !== "import") return supported;

    return resolveOoxmlEditCapability({
      deck,
      feature: "animation-main-sequence",
      slide,
    });
  }

  if (operation.type === "update_slide_transition") {
    return resolveOoxmlEditCapability({
      deck,
      feature: "transition",
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

  if (element?.type === "text") {
    const propKeys = Object.keys(props);
    if (
      propKeys.length === 0 ||
      propKeys.some((key) => !supportedAuthoredTextProps.has(key))
    ) {
      return resolveOoxmlEditCapability({
        deck,
        element,
        feature: "element-properties",
      });
    }
    const nextProps = { ...element.props, ...props } as typeof element.props;
    if (!textProjectionIsConsistent(element.props, props, nextProps)) {
      return resolveOoxmlEditCapability({
        deck,
        element: { ...element, props: nextProps },
        feature: "element-properties",
      });
    }
    if (!textPropsFontWeightsAreSupported(nextProps)) {
      return resolveOoxmlEditCapability({
        deck,
        element: { ...element, props: nextProps },
        feature: "element-properties",
      });
    }
    return resolveOoxmlEditCapability({
      deck,
      element: { ...element, props: nextProps },
      feature:
        getRichTextSemanticText(element.props) ===
        getRichTextSemanticText(nextProps)
          ? "rich-text-style"
          : "rich-text-content",
    });
  }

  if (element?.type === "table") {
    const nextProps = { ...element.props, ...props } as typeof element.props;
    const targetElement = { ...element, props: nextProps };
    if (element.ooxmlOrigin === "imported") {
      return resolveOoxmlEditCapability({
        deck,
        element: targetElement,
        feature: importedTableCellTextPatchIsSafe(
          element.props,
          props,
          nextProps,
        )
          ? "table-cell-text"
          : "element-properties",
      });
    }
    if (
      Object.keys(props).length === 0 ||
      !Object.prototype.hasOwnProperty.call(props, "rows") ||
      (element.props.rows.length !== nextProps.rows.length &&
        !Object.prototype.hasOwnProperty.call(props, "rowHeights")) ||
      ((element.props.rows[0]?.length ?? 0) !==
        (nextProps.rows[0]?.length ?? 0) &&
        !Object.prototype.hasOwnProperty.call(props, "columnWidths")) ||
      Object.keys(props).some(
        (key) => !supportedAuthoredTablePatchProps.has(key),
      ) ||
      valuesEqual(element.props, nextProps) ||
      !authoredSerializerSupportsElement(targetElement)
    ) {
      return resolveOoxmlEditCapability({
        deck,
        element: targetElement,
        feature: "element-properties",
      });
    }
    return resolveOoxmlEditCapability({
      deck,
      element: targetElement,
      feature: "table-cell-text",
    });
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
    return element.type === "table" && capabilities.tableCellText
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
  if (
    (feature === "rich-text-content" || feature === "rich-text-style") &&
    element.type === "text"
  ) {
    return authoredSerializerSupportsElement(element)
      ? supported
      : denied(
          "AUTHORED_SERIALIZER_UNSUPPORTED",
          "이 텍스트 구조를 OOXML에 갱신하는 serializer가 아직 없습니다.",
        );
  }
  if (
    (feature === "table-cell-text" || feature === "table-structure") &&
    element.type === "table"
  ) {
    return authoredSerializerSupportsElement(element)
      ? supported
      : denied(
          "AUTHORED_SERIALIZER_UNSUPPORTED",
          "이 표 구조를 OOXML에 갱신하는 serializer가 아직 없습니다.",
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
  if (
    (feature === "transition" || feature === "animation-main-sequence") &&
    !slide.ooxmlSourceSlidePart
  ) {
    return denied(
      "IMPORTED_CAPABILITY_MISSING",
      "가져온 슬라이드의 안정적인 OOXML 위치 정보가 없어 편집을 중단했습니다.",
    );
  }
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
      Object.keys(element.props).every((key) =>
        supportedAuthoredTextProps.has(key),
      ) &&
      textPropsFontWeightsAreSupported(element.props) &&
      textPropsProjectionIsConsistent(element.props)
    );
  }
  if (element.type === "image") {
    return (
      element.props.fit === "contain" &&
      element.props.focusX === 0.5 &&
      element.props.focusY === 0.5
    );
  }
  if (element.type === "table") {
    return tableGridIsSupported(element.props);
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

function importedTableCellTextPatchIsSafe(
  current: Extract<DeckElement, { type: "table" }>["props"],
  patch: Record<string, unknown>,
  next: Extract<DeckElement, { type: "table" }>["props"],
): boolean {
  if (
    Object.keys(patch).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(patch, "rows") ||
    !tableGridIsSupported(current) ||
    !tableGridIsSupported(next) ||
    !valuesEqual(current.columnWidths, next.columnWidths) ||
    !valuesEqual(current.rowHeights, next.rowHeights) ||
    current.rows.length !== next.rows.length
  ) {
    return false;
  }

  let changedCellCount = 0;
  for (let rowIndex = 0; rowIndex < current.rows.length; rowIndex += 1) {
    const currentRow = current.rows[rowIndex]!;
    const nextRow = next.rows[rowIndex]!;
    if (currentRow.length !== nextRow.length) return false;
    for (
      let columnIndex = 0;
      columnIndex < currentRow.length;
      columnIndex += 1
    ) {
      const currentCell = currentRow[columnIndex]!;
      const nextCell = nextRow[columnIndex]!;
      const { text: currentText, ...currentStyle } = currentCell;
      const { text: nextText, ...nextStyle } = nextCell;
      if (!valuesEqual(currentStyle, nextStyle)) return false;
      if (currentText !== nextText) {
        if (currentText.split("\n").length !== nextText.split("\n").length) {
          return false;
        }
        changedCellCount += 1;
      }
      if (changedCellCount > 1) return false;
    }
  }
  return changedCellCount === 1;
}

function tableGridIsSupported(
  props: Extract<DeckElement, { type: "table" }>["props"],
): boolean {
  const columnCount = props.rows[0]?.length ?? 0;
  if (
    props.rows.length === 0 ||
    props.rows.length > 1_000 ||
    columnCount === 0 ||
    columnCount > 1_000 ||
    props.rows.length * columnCount > 10_000
  ) {
    return false;
  }
  if (props.rows.some((row) => row.length !== columnCount)) return false;
  if (
    props.columnWidths !== undefined &&
    props.columnWidths.length !== columnCount
  ) {
    return false;
  }
  if (
    props.rowHeights !== undefined &&
    props.rowHeights.length !== props.rows.length
  ) {
    return false;
  }
  return props.rows.every((row) =>
    row.every(
      (cell) =>
        cell.colSpan === 1 &&
        cell.rowSpan === 1 &&
        (cell.fill === "transparent" ||
          (typeof cell.fill === "string" &&
            /^#[0-9a-f]{6}$/i.test(cell.fill))) &&
        tableFontWeightIsSupported(cell.fontWeight),
    ),
  );
}

function tableFontWeightIsSupported(
  value: Extract<
    DeckElement,
    { type: "table" }
  >["props"]["rows"][number][number]["fontWeight"],
): boolean {
  return value === "normal" || value === "bold";
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        valuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function textPropsFontWeightsAreSupported(
  props: Extract<DeckElement, { type: "text" }>["props"],
): boolean {
  return (
    textFontWeightIsSupported(props.fontWeight) &&
    (props.runs ?? []).every((run) =>
      textFontWeightIsSupported(run.fontWeight),
    ) &&
    (props.paragraphs ?? []).every(
      (paragraph) =>
        textFontWeightIsSupported(paragraph.fontWeight) &&
        (paragraph.runs ?? []).every((run) =>
          textFontWeightIsSupported(run.fontWeight),
        ),
    )
  );
}

function textProjectionIsConsistent(
  current: Extract<DeckElement, { type: "text" }>["props"],
  patch: Record<string, unknown>,
  next: Extract<DeckElement, { type: "text" }>["props"],
): boolean {
  if (
    current.paragraphs !== undefined &&
    Object.prototype.hasOwnProperty.call(patch, "runs") &&
    Array.isArray(patch.runs) &&
    patch.runs.length > 0 &&
    !Object.prototype.hasOwnProperty.call(patch, "paragraphs")
  ) {
    return false;
  }
  return textPropsProjectionIsConsistent(next);
}

function textPropsProjectionIsConsistent(
  props: Extract<DeckElement, { type: "text" }>["props"],
): boolean {
  if (
    props.paragraphs?.some((paragraph) => {
      const projection = paragraph.runs?.length
        ? paragraph.runs.map((run) => run.text).join("")
        : paragraph.text;
      return paragraph.text !== projection;
    })
  ) {
    return false;
  }
  const semantic = getRichTextSemanticText(props);
  if (props.text !== semantic) return false;
  return !(
    props.paragraphs?.length === 1 &&
    props.runs?.length &&
    props.runs.map((run) => run.text).join("") !== semantic
  );
}

function textFontWeightIsSupported(
  value:
    | Extract<DeckElement, { type: "text" }>["props"]["fontWeight"]
    | undefined,
): boolean {
  return value === undefined || value === "normal" || value === "bold";
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
    "table-structure",
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
