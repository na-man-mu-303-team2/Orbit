import { validateSlideAnimations } from "../../../../../../../packages/editor-core/src/index";
import type {
  CustomShapeElementProps,
  Deck,
  DeckAnimation,
  DeckElement,
  Slide,
} from "@orbit/shared";
import type { ComponentProps } from "react";

import { getCustomShapeAbsoluteNodes } from "../../canvas/custom-shape/geometry";
import { resolveOoxmlEditCapability } from "../editorOoxmlCapabilities";
import { SelectionQuickBar } from "./SelectionQuickBar";

type EditorSelectionPropertiesProps = {
  animations: DeckAnimation[];
  animationDiagnostics: ReturnType<typeof validateSlideAnimations> | null;
  canvas: Deck["canvas"];
  customShapeEditActive: boolean;
  deck: Deck;
  element: DeckElement | null;
  instanceKey: string;
  onChangeElementFrame: (
    slideId: string,
    elementId: string,
    frame: Parameters<
      ComponentProps<typeof SelectionQuickBar>["onChangeFrame"]
    >[0],
  ) => void;
  onChangeElementProps: (
    slideId: string,
    elementId: string,
    props: Parameters<
      ComponentProps<typeof SelectionQuickBar>["onChangeProps"]
    >[0],
  ) => void;
  onChangeSlideStyle: ComponentProps<
    typeof SelectionQuickBar
  >["onChangeSlideStyle"];
  onChangeTheme: ComponentProps<typeof SelectionQuickBar>["onChangeTheme"];
  onCloseInlineEditing: () => void;
  onCommitCustomShapeGeometry: (
    slideId: string,
    elementId: string,
    nodes: ReturnType<typeof getCustomShapeAbsoluteNodes>,
    closed: boolean,
  ) => void;
  onDeleteAnimation: (slideId: string, animationId: string) => void;
  onOpenAnimationEditor: () => void;
  onStartImageCrop: (elementId: string) => void;
  onToggleCustomShapeEdit: (elementId: string) => void;
  selectedKeywordLabel: string | null;
  showIds: boolean;
  slide: Slide | null;
  theme: Deck["theme"];
};

export function EditorSelectionProperties(
  props: EditorSelectionPropertiesProps,
) {
  const { element, slide } = props;
  const imageCropCapability = element
    ? resolveOoxmlEditCapability({
        deck: props.deck,
        element,
        feature: "crop",
      })
    : null;
  const animationCapability = slide
    ? resolveOoxmlEditCapability({
        deck: props.deck,
        feature: "animation-main-sequence",
        slide,
      })
    : null;
  const elementAppearanceCapability = element
    ? resolveOoxmlEditCapability({
        deck: props.deck,
        element,
        feature: "element-appearance",
      })
    : null;
  const elementFrameCapability = element
    ? resolveOoxmlEditCapability({
        deck: props.deck,
        element,
        feature: "element-frame",
      })
    : null;
  const elementPropertiesCapability = element
    ? resolveOoxmlEditCapability({
        deck: props.deck,
        element,
        feature:
          element.type === "text"
            ? "rich-text-style"
            : element.type === "table"
              ? "table-cell-text"
              : "element-properties",
      })
    : null;
  const slidePropertiesCapability = slide
    ? resolveOoxmlEditCapability({
        deck: props.deck,
        feature: "slide-properties",
        slide,
      })
    : null;
  return (
    <SelectionQuickBar
      animations={element ? props.animations : []}
      animationCapability={animationCapability}
      animationDiagnostics={
        props.animationDiagnostics ?? {
          danglingAnimations: [],
          duplicateOrders: [],
          selectedElementEmpty: false,
        }
      }
      canCreateAnimation={Boolean(slide && element)}
      canvas={props.canvas}
      customShapeEditActive={props.customShapeEditActive}
      element={element}
      elementAppearanceCapability={elementAppearanceCapability}
      elementFrameCapability={elementFrameCapability}
      elementPropertiesCapability={elementPropertiesCapability}
      imageCropCapability={imageCropCapability}
      key={`${props.instanceKey}-${element?.elementId ?? slide?.slideId ?? "none"}`}
      selectedKeywordLabel={props.selectedKeywordLabel}
      showIds={props.showIds}
      slide={slide}
      slidePropertiesCapability={slidePropertiesCapability}
      theme={props.theme}
      onChangeFrame={(frame) => {
        if (element && slide)
          props.onChangeElementFrame(slide.slideId, element.elementId, frame);
      }}
      onChangeProps={(nextProps) => {
        if (element && slide)
          props.onChangeElementProps(
            slide.slideId,
            element.elementId,
            nextProps,
          );
      }}
      onChangeSlideStyle={props.onChangeSlideStyle}
      onChangeTheme={props.onChangeTheme}
      onDeleteAnimation={(animationId) => {
        if (slide) props.onDeleteAnimation(slide.slideId, animationId);
      }}
      onOpenAnimationEditor={props.onOpenAnimationEditor}
      onStartImageCrop={() => {
        if (element?.type === "image")
          props.onStartImageCrop(element.elementId);
      }}
      onToggleCustomShapeClosed={() => {
        if (!element || !slide || element.type !== "customShape") return;
        props.onCommitCustomShapeGeometry(
          slide.slideId,
          element.elementId,
          getCustomShapeAbsoluteNodes(element),
          !(element.props as CustomShapeElementProps).closed,
        );
      }}
      onToggleCustomShapeEdit={() => {
        if (!element || element.type !== "customShape") return;
        props.onCloseInlineEditing();
        props.onToggleCustomShapeEdit(element.elementId);
      }}
    />
  );
}
