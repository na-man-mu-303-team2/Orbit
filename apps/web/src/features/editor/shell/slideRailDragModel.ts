export type SlideRailDropEdge = "after" | "before";

export type SlideRailDragState = {
  pointerId: number;
  sourceSlideId: string;
  target: {
    edge: SlideRailDropEdge;
    slideId: string;
  } | null;
};

export function beginSlideRailDrag(pointerId: number, sourceSlideId: string): SlideRailDragState {
  return { pointerId, sourceSlideId, target: null };
}

export function updateSlideRailDragTarget(
  state: SlideRailDragState,
  slideId: string,
  edge: SlideRailDropEdge,
): SlideRailDragState {
  return { ...state, target: { edge, slideId } };
}

export function cancelSlideRailDrag() {
  return null;
}

export function resolveSlideRailDrop(
  state: SlideRailDragState,
  slideIds: readonly string[],
): string[] | null {
  if (!state.target || state.target.slideId === state.sourceSlideId) return null;
  if (!slideIds.includes(state.sourceSlideId) || !slideIds.includes(state.target.slideId)) {
    return null;
  }

  const withoutSource = slideIds.filter((slideId) => slideId !== state.sourceSlideId);
  const targetIndex = withoutSource.indexOf(state.target.slideId);
  if (targetIndex < 0) return null;

  const insertionIndex = targetIndex + (state.target.edge === "after" ? 1 : 0);
  const reordered = [...withoutSource];
  reordered.splice(insertionIndex, 0, state.sourceSlideId);

  return reordered.every((slideId, index) => slideId === slideIds[index])
    ? null
    : reordered;
}
