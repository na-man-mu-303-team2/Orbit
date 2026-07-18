import {
  createAddAnimationPatch,
  createAddAnimationWithKeywordTriggerPatch,
  createDefaultAnimation,
  createDeleteAnimationPatch,
  createKeyword,
  createReplaceKeywordsPatch,
  createUpdateAnimationPatch,
  createUpdateElementPropsPatch,
  createUpdateSlideTransitionPatch,
  createUpsertAdvanceSlideKeywordActionPatch,
  findKeywordByTerm
} from "../../../../../../../packages/editor-core/src/index";
import { normalizeElementFrameDraft } from "../../../../../../../packages/editor-core/src/patches/elementFrame";
import { createKeywordOccurrenceId } from "@orbit/shared";
import type {
  Deck,
  DeckAnimation,
  DeckElement,
  DeckPatch,
  Keyword,
  Slide,
  SlideTransition
} from "@orbit/shared";
import type { MutableRefObject } from "react";

import type { ValidationTextOverflowAction } from "../../ai/quality/ValidationPanel";
import type { EditorValidationItem } from "../../ai/quality/editorValidation";
import {
  createExpandTextWidthToFitFrame,
  createShrinkToFitTextProps,
  createSingleLineTextFit
} from "../components/SelectionQuickBar";
import type { EditorShellUiUpdater } from "../editorShellUiStore";
import {
  getCenteredTextAutoFitFrame,
  getSingleLineTextMinimumFontSize,
  getTextAutoFitMaxWidth
} from "../utils/editorLayout";
import { createThemeCascadePatch } from "../utils/themeCascadePatch";
import type { PatchProducer } from "./useEditorPersistenceState";
import type { ElementFrameChange } from "./useEditorCanvasCommands";
import {
  getAnimationMutationDisabledReason,
  getAnimationTypeMutationDisabledReason,
  getTransitionMutationDisabledReason
} from "../utils/motionEditingPolicy";

type CommitPatch = (patch: DeckPatch | PatchProducer, baseDeck?: Deck) => boolean;

export function useEditorSlideCommands(args: {
  commitPatch: CommitPatch;
  currentSlide: Slide | null;
  currentSlideKeywordUsage: Record<
    string,
    { advancesSlide: boolean; animationIds: string[] }
  >;
  deck: Deck;
  editorValidationItems: EditorValidationItem[];
  onChangeElementFrame: (slideId: string, elementId: string, frame: ElementFrameChange) => void;
  selectedKeywordId: string | null;
  selectedKeywordOccurrenceKey: string | null;
  setAnimationPanelFocusedAnimationId: (updater: EditorShellUiUpdater<string | null>) => void;
  setLastPatchLabel: (label: string) => void;
  setSelectedElementIds: (updater: EditorShellUiUpdater<string[]>) => void;
  setSelectedKeywordId: (updater: EditorShellUiUpdater<string | null>) => void;
  setSelectedKeywordOccurrenceKey: (updater: EditorShellUiUpdater<string | null>) => void;
  workingDeckRef: MutableRefObject<Deck>;
}) {
  function changeElementProps(slideId: string, elementId: string, props: Record<string, unknown>) {
    args.commitPatch((deck) => createUpdateElementPropsPatch(deck, slideId, elementId, props));
  }

  function handleValidationTextOverflowAction(
    item: EditorValidationItem,
    action: ValidationTextOverflowAction
  ) {
    if (!args.currentSlide || !item.elementId) return;
    const element = args.currentSlide.elements.find((candidate) => candidate.elementId === item.elementId);
    if (!element || element.type !== "text") return;
    args.setSelectedElementIds([element.elementId]);
    const textFitContext = {
      fontFamily: element.props.fontFamily ?? args.currentSlide.style.fontFamily ?? args.deck.theme.typography.bodyFontFamily
    };
    if (action === "shrinkText") {
      changeElementProps(args.currentSlide.slideId, element.elementId, createShrinkToFitTextProps(element, textFitContext));
      return;
    }
    if (action === "singleLineTextBox") {
      const fit = createSingleLineTextFit(element, textFitContext, {
        maxWidth: getTextAutoFitMaxWidth(args.deck.canvas, element),
        minFontSize: getSingleLineTextMinimumFontSize(element)
      });
      const frame = getCenteredTextAutoFitFrame(args.deck.canvas, element, fit.width);
      args.commitPatch((deck) => ({
        deckId: deck.deckId,
        baseVersion: deck.version,
        source: "user",
        operations: [
          { type: "update_element_props", slideId: args.currentSlide!.slideId, elementId: element.elementId, props: fit.props },
          { type: "update_element_frame", slideId: args.currentSlide!.slideId, elementId: element.elementId, frame: normalizeElementFrameDraft(deck.canvas, element, frame) }
        ]
      }));
      return;
    }
    const nextWidth = createExpandTextWidthToFitFrame(
      element,
      args.deck.canvas.width - element.x,
      textFitContext
    );
    if (!nextWidth || nextWidth <= element.width) {
      args.setLastPatchLabel("상자 넓히기 불가 · 줄바꿈 또는 높이 확인");
      return;
    }
    args.onChangeElementFrame(args.currentSlide.slideId, element.elementId, { width: nextWidth });
  }

  function applyAllValidationTextOverflow() {
    if (!args.currentSlide) return;
    const issuesByElementId = new Map<string, Set<EditorValidationItem["issue"]>>();
    for (const item of args.editorValidationItems) {
      if (!item.elementId || !isAutoFitTextValidationIssue(item)) continue;
      const issues = issuesByElementId.get(item.elementId) ?? new Set();
      issues.add(item.issue);
      issuesByElementId.set(item.elementId, issues);
    }
    const fittedElements = args.currentSlide.elements.filter(
      (element): element is Extract<DeckElement, { type: "text" }> =>
        element.type === "text" && issuesByElementId.has(element.elementId)
    );
    const operations: DeckPatch["operations"] = [];
    for (const element of fittedElements) {
      const issues = issuesByElementId.get(element.elementId);
      const context = {
        fontFamily: element.props.fontFamily ?? args.currentSlide.style.fontFamily ?? args.deck.theme.typography.bodyFontFamily
      };
      if (issues?.has("titleWrap") || issues?.has("labelWrap")) {
        const fit = createSingleLineTextFit(element, context, {
          maxWidth: getTextAutoFitMaxWidth(args.deck.canvas, element),
          minFontSize: getSingleLineTextMinimumFontSize(element)
        });
        const frame = getCenteredTextAutoFitFrame(args.deck.canvas, element, fit.width);
        if (!fit.fits && (issues?.has("labelWrap") || issues?.has("textOverflow"))) {
          const nextProps = createShrinkToFitTextProps(element, context);
          if (hasTextPropsChange(element, nextProps)) {
            operations.push({
              type: "update_element_props",
              slideId: args.currentSlide.slideId,
              elementId: element.elementId,
              props: nextProps
            });
          }
          continue;
        }
        if (hasTextPropsChange(element, fit.props)) {
          operations.push({
            type: "update_element_props",
            slideId: args.currentSlide.slideId,
            elementId: element.elementId,
            props: fit.props
          });
        }
        if (frame.x !== element.x || frame.width !== element.width) {
          operations.push({
            type: "update_element_frame",
            slideId: args.currentSlide.slideId,
            elementId: element.elementId,
            frame: normalizeElementFrameDraft(args.deck.canvas, element, frame)
          });
        }
      } else {
        const nextProps = createShrinkToFitTextProps(element, context);
        if (hasTextPropsChange(element, nextProps)) {
          operations.push({
            type: "update_element_props",
            slideId: args.currentSlide.slideId,
            elementId: element.elementId,
            props: nextProps
          });
        }
      }
    }
    if (operations.length === 0) return;
    args.setSelectedElementIds(fittedElements.map((element) => element.elementId));
    args.commitPatch((deck) => ({
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations
    }));
  }

  function changeSlideStyle(slideId: string, style: {
    backgroundColor?: string | null;
    textColor?: string | null;
    accentColor?: string | null;
  }) {
    args.commitPatch((deck) => ({
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "user",
      operations: [{ type: "update_slide_style", slideId, style }]
    }));
  }

  function changeTheme(theme: Record<string, unknown>) {
    args.commitPatch((deck) => createThemeCascadePatch(deck, theme));
  }

  function replaceKeywords(slideId: string, update: (keywords: Keyword[]) => Keyword[]) {
    args.commitPatch((deck) => {
      const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
      if (!slide) throw new Error(`slide not found: ${slideId}`);
      return createReplaceKeywordsPatch(deck, slideId, update(slide.keywords));
    });
  }

  function clearSelectedKeyword() {
    args.setSelectedKeywordId(null);
    args.setSelectedKeywordOccurrenceKey(null);
  }

  function selectKeyword(keywordId: string, occurrenceKey: string | null = null) {
    const shouldClear = args.selectedKeywordId === keywordId && args.selectedKeywordOccurrenceKey === occurrenceKey;
    args.setSelectedKeywordId(shouldClear ? null : keywordId);
    args.setSelectedKeywordOccurrenceKey(shouldClear ? null : occurrenceKey);
  }

  function deleteSelectedKeyword(slideId: string, keywordId: string) {
    const usage = args.currentSlideKeywordUsage[keywordId];
    const hasLinkedActions = Boolean(usage?.advancesSlide) || (usage?.animationIds.length ?? 0) > 0;
    if (hasLinkedActions && typeof window !== "undefined" && !window.confirm(
      "연결된 애니메이션 또는 다음 슬라이드 트리거가 함께 제거될 수 있습니다. 삭제할까요?"
    )) return;
    replaceKeywords(slideId, (keywords) => keywords.filter((keyword) => keyword.keywordId !== keywordId));
    clearSelectedKeyword();
  }

  function selectSpeakerNotesKeyword(rawValue: string, start: number) {
    if (!args.currentSlide) return;
    const matchedKeyword = findKeywordByTerm(args.currentSlide, rawValue);
    if (matchedKeyword) {
      selectKeyword(
        matchedKeyword.keywordId,
        createKeywordOccurrenceId(args.currentSlide.slideId, matchedKeyword.keywordId, start, start + rawValue.length)
      );
      return;
    }
    const nextKeyword = createKeyword(args.workingDeckRef.current, rawValue, { required: false });
    args.setSelectedKeywordId(nextKeyword.keywordId);
    args.setSelectedKeywordOccurrenceKey(
      createKeywordOccurrenceId(args.currentSlide.slideId, nextKeyword.keywordId, start, start + rawValue.length)
    );
    replaceKeywords(args.currentSlide.slideId, (keywords) => [...keywords, nextKeyword]);
  }

  function toggleKeywordRequired(slideId: string, keywordId: string, occurrenceKey: string | null = null) {
    const keyword = args.currentSlide?.keywords.find((candidate) => candidate.keywordId === keywordId);
    if (!occurrenceKey && !keyword?.required) {
      if (typeof window !== "undefined") window.alert(
        "반복되는 단어일 수 있습니다. 발표 메모에서 필수 발화로 표시할 단어 위치를 선택하세요."
      );
      return;
    }
    replaceKeywords(slideId, (keywords) => keywords.map((candidate) => {
      if (candidate.keywordId !== keywordId) return candidate;
      if (!occurrenceKey) return { ...candidate, required: false, requiredOccurrenceIds: [] };
      const ids = candidate.requiredOccurrenceIds ?? [];
      const nextIds = ids.includes(occurrenceKey)
        ? ids.filter((id) => id !== occurrenceKey)
        : [...ids, occurrenceKey];
      return { ...candidate, required: nextIds.length > 0, requiredOccurrenceIds: nextIds };
    }));
  }

  function toggleAdvanceSlideKeyword(slideId: string, keywordId: string, enabled: boolean) {
    if (enabled && !args.selectedKeywordOccurrenceKey) {
      if (typeof window !== "undefined") window.alert(
        "반복되는 단어일 수 있습니다. 발표 메모에서 실제로 트리거할 단어 위치를 선택하세요."
      );
      return;
    }
    const patch = createUpsertAdvanceSlideKeywordActionPatch(
      args.workingDeckRef.current,
      slideId,
      keywordId,
      enabled,
      args.selectedKeywordOccurrenceKey
    );
    if (patch) args.commitPatch(patch);
  }

  function addAnimation(
    slideId: string,
    elementId: string,
    keywordId?: string | null,
    keywordOccurrenceId?: string | null,
    draft?: Partial<
      Pick<DeckAnimation, "delayMs" | "durationMs" | "startMode" | "type">
    >
  ) {
    if (!allowMotionMutation(slideId, "animation")) return;
    const typeReason = draft?.type
      ? getAnimationTypeMutationDisabledReason(draft.type)
      : null;
    if (typeReason) {
      args.setLastPatchLabel(typeReason);
      return;
    }
    let createdAnimationId: string | null = null;
    args.commitPatch((deck) => {
      const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
      if (!slide) throw new Error(`slide not found: ${slideId}`);
      const animation = { ...createDefaultAnimation(deck, slide, elementId), ...draft };
      createdAnimationId = animation.animationId;
      return keywordId
        ? createAddAnimationWithKeywordTriggerPatch(deck, slideId, animation, keywordId, keywordOccurrenceId)
        : createAddAnimationPatch(deck, slideId, animation);
    });
    if (createdAnimationId) args.setAnimationPanelFocusedAnimationId(createdAnimationId);
  }

  function updateAnimation(slideId: string, animationId: string, animation: Partial<DeckAnimation>) {
    if (!allowMotionMutation(slideId, "animation")) return;
    const typeReason = animation.type
      ? getAnimationTypeMutationDisabledReason(animation.type)
      : null;
    if (typeReason) {
      args.setLastPatchLabel(typeReason);
      return;
    }
    args.commitPatch((deck) => createUpdateAnimationPatch(deck, slideId, animationId, animation));
  }

  function deleteAnimation(slideId: string, animationId: string) {
    if (!allowMotionMutation(slideId, "animation")) return;
    args.commitPatch((deck) => createDeleteAnimationPatch(deck, slideId, animationId));
  }

  function updateSlideTransition(
    slideId: string,
    transition: SlideTransition | null
  ) {
    if (!allowMotionMutation(slideId, "transition")) return;
    args.commitPatch((deck) =>
      createUpdateSlideTransitionPatch(deck, slideId, transition)
    );
  }

  function allowMotionMutation(
    slideId: string,
    scope: "animation" | "transition"
  ) {
    const deck = args.workingDeckRef.current;
    const slide = deck.slides.find((candidate) => candidate.slideId === slideId);
    if (!slide) return false;
    const reason =
      scope === "transition"
        ? getTransitionMutationDisabledReason(deck, slide)
        : getAnimationMutationDisabledReason(deck, slide);
    if (!reason) return true;
    args.setLastPatchLabel(reason);
    return false;
  }

  return {
    addAnimation,
    applyAllValidationTextOverflow,
    changeElementProps,
    changeSlideStyle,
    changeTheme,
    clearSelectedKeyword,
    deleteAnimation,
    deleteSelectedKeyword,
    handleValidationTextOverflowAction,
    selectKeyword,
    selectSpeakerNotesKeyword,
    toggleAdvanceSlideKeyword,
    toggleKeywordRequired,
    updateAnimation,
    updateSlideTransition
  };
}

function isAutoFitTextValidationIssue(item: EditorValidationItem) {
  return item.issue === "textOverflow" || item.issue === "titleWrap" || item.issue === "labelWrap";
}

function hasTextPropsChange(
  element: Extract<DeckElement, { type: "text" }>,
  props: Record<string, unknown>
) {
  return Object.entries(props).some(
    ([key, value]) => element.props[key as keyof typeof element.props] !== value
  );
}
