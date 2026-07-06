import { create } from "zustand";

import { defaultAnimationPaneWidth } from "./components/animation/utils/layout";

export const defaultSlidesPaneWidth = 176;
export const defaultRightPaneWidth = 320;

export type TopMenu = "file" | "resize" | "editMode" | "quickEdit" | "presentation";
export type SlidePanelView = "thumbnail" | "list";
export type ShapeMenuPosition = {
  left: number;
  top: number;
};

export type EditorShellUiUpdater<T> = T | ((current: T) => T);

type EditorShellUiStateValues = {
  activeTopMenu: TopMenu | null;
  animationPaneWidth: number;
  isAnimationPanelOpen: boolean;
  isAudienceLinkModalOpen: boolean;
  isDataViewOpen: boolean;
  isExitConfirmOpen: boolean;
  isPresenceDebugOpen: boolean;
  isRightPanelOpen: boolean;
  isShapeMenuOpen: boolean;
  isSlidesPaneCollapsed: boolean;
  rightPaneWidth: number;
  shapeMenuPosition: ShapeMenuPosition | null;
  showIds: boolean;
  slidePanelView: SlidePanelView;
  slidesPaneWidth: number;
};

type EditorShellUiStateActions = {
  resetProjectUiState: () => void;
  setActiveTopMenu: (updater: EditorShellUiUpdater<TopMenu | null>) => void;
  setAnimationPaneWidth: (updater: EditorShellUiUpdater<number>) => void;
  setIsAnimationPanelOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setIsAudienceLinkModalOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setIsDataViewOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setIsExitConfirmOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setIsPresenceDebugOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setIsRightPanelOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setIsShapeMenuOpen: (updater: EditorShellUiUpdater<boolean>) => void;
  setIsSlidesPaneCollapsed: (updater: EditorShellUiUpdater<boolean>) => void;
  setRightPaneWidth: (updater: EditorShellUiUpdater<number>) => void;
  setShapeMenuPosition: (
    updater: EditorShellUiUpdater<ShapeMenuPosition | null>
  ) => void;
  setShowIds: (updater: EditorShellUiUpdater<boolean>) => void;
  setSlidePanelView: (updater: EditorShellUiUpdater<SlidePanelView>) => void;
  setSlidesPaneWidth: (updater: EditorShellUiUpdater<number>) => void;
};

export type EditorShellUiState = EditorShellUiStateValues & EditorShellUiStateActions;

export const editorShellUiInitialState: EditorShellUiStateValues = {
  activeTopMenu: null,
  animationPaneWidth: defaultAnimationPaneWidth,
  isAnimationPanelOpen: false,
  isAudienceLinkModalOpen: false,
  isDataViewOpen: false,
  isExitConfirmOpen: false,
  isPresenceDebugOpen: false,
  isRightPanelOpen: true,
  isShapeMenuOpen: false,
  isSlidesPaneCollapsed: false,
  rightPaneWidth: defaultRightPaneWidth,
  shapeMenuPosition: null,
  showIds: false,
  slidePanelView: "thumbnail",
  slidesPaneWidth: defaultSlidesPaneWidth
};

export const useEditorShellUiStore = create<EditorShellUiState>((set) => ({
  ...editorShellUiInitialState,
  resetProjectUiState: () =>
    set({
      activeTopMenu: null,
      isAudienceLinkModalOpen: false,
      isExitConfirmOpen: false,
      isShapeMenuOpen: false,
      shapeMenuPosition: null
    }),
  setActiveTopMenu: (updater) =>
    set((state) => ({
      activeTopMenu: resolveUpdater(state.activeTopMenu, updater)
    })),
  setAnimationPaneWidth: (updater) =>
    set((state) => ({
      animationPaneWidth: resolveUpdater(state.animationPaneWidth, updater)
    })),
  setIsAnimationPanelOpen: (updater) =>
    set((state) => ({
      isAnimationPanelOpen: resolveUpdater(state.isAnimationPanelOpen, updater)
    })),
  setIsAudienceLinkModalOpen: (updater) =>
    set((state) => ({
      isAudienceLinkModalOpen: resolveUpdater(state.isAudienceLinkModalOpen, updater)
    })),
  setIsDataViewOpen: (updater) =>
    set((state) => ({
      isDataViewOpen: resolveUpdater(state.isDataViewOpen, updater)
    })),
  setIsExitConfirmOpen: (updater) =>
    set((state) => ({
      isExitConfirmOpen: resolveUpdater(state.isExitConfirmOpen, updater)
    })),
  setIsPresenceDebugOpen: (updater) =>
    set((state) => ({
      isPresenceDebugOpen: resolveUpdater(state.isPresenceDebugOpen, updater)
    })),
  setIsRightPanelOpen: (updater) =>
    set((state) => ({
      isRightPanelOpen: resolveUpdater(state.isRightPanelOpen, updater)
    })),
  setIsShapeMenuOpen: (updater) =>
    set((state) => ({
      isShapeMenuOpen: resolveUpdater(state.isShapeMenuOpen, updater)
    })),
  setIsSlidesPaneCollapsed: (updater) =>
    set((state) => ({
      isSlidesPaneCollapsed: resolveUpdater(state.isSlidesPaneCollapsed, updater)
    })),
  setRightPaneWidth: (updater) =>
    set((state) => ({
      rightPaneWidth: resolveUpdater(state.rightPaneWidth, updater)
    })),
  setShapeMenuPosition: (updater) =>
    set((state) => ({
      shapeMenuPosition: resolveUpdater(state.shapeMenuPosition, updater)
    })),
  setShowIds: (updater) =>
    set((state) => ({
      showIds: resolveUpdater(state.showIds, updater)
    })),
  setSlidePanelView: (updater) =>
    set((state) => ({
      slidePanelView: resolveUpdater(state.slidePanelView, updater)
    })),
  setSlidesPaneWidth: (updater) =>
    set((state) => ({
      slidesPaneWidth: resolveUpdater(state.slidesPaneWidth, updater)
    }))
}));

function resolveUpdater<T>(current: T, updater: EditorShellUiUpdater<T>) {
  return typeof updater === "function"
    ? (updater as (current: T) => T)(current)
    : updater;
}
