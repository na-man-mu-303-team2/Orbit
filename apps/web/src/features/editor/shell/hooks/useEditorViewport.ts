import type { DeckCanvas } from "@orbit/shared";
import { useEffect, useRef, useState } from "react";

import {
  persistProjectEditorZoom,
  readProjectEditorZoom,
  resolveEditorStageScale,
  stepEditorZoom,
  type EditorZoomState,
} from "../editorZoom";

export function useEditorViewport(args: {
  canvas: DeckCanvas;
  isRightPanelOpen: boolean;
  projectId: string;
  setIsRightPanelOpen: (open: boolean) => void;
}) {
  const { canvas, isRightPanelOpen, projectId, setIsRightPanelOpen } = args;
  const [zoom, setZoom] = useState<EditorZoomState>(() =>
    readProjectEditorZoom(projectId),
  );
  const [editorViewportWidth, setEditorViewportWidth] = useState<number | null>(null);
  const [canvasViewport, setCanvasViewport] = useState<{
    height: number;
    width: number;
  } | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const wasCompactEditorLayoutRef = useRef(false);

  useEffect(() => {
    setZoom(readProjectEditorZoom(projectId));
  }, [projectId]);

  useEffect(() => {
    persistProjectEditorZoom(projectId, zoom);
  }, [projectId, zoom]);

  useEffect(() => {
    const syncEditorViewportWidth = () => setEditorViewportWidth(window.innerWidth);
    syncEditorViewportWidth();
    window.addEventListener("resize", syncEditorViewportWidth);
    return () => window.removeEventListener("resize", syncEditorViewportWidth);
  }, []);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const syncCanvasViewport = () => {
      setCanvasViewport({
        height: viewport.clientHeight,
        width: viewport.clientWidth
      });
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncCanvasViewport);

    syncCanvasViewport();
    resizeObserver?.observe(viewport);
    window.addEventListener("resize", syncCanvasViewport);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncCanvasViewport);
    };
  }, []);

  useEffect(() => {
    if (editorViewportWidth === null) return;

    const isCompactLayout = editorViewportWidth <= 860;
    if (
      isCompactLayout &&
      !wasCompactEditorLayoutRef.current &&
      isRightPanelOpen
    ) {
      setIsRightPanelOpen(false);
    }
    wasCompactEditorLayoutRef.current = isCompactLayout;
  }, [editorViewportWidth, isRightPanelOpen, setIsRightPanelOpen]);

  return {
    canvasViewportRef,
    editorViewportWidth,
    stageScale: resolveEditorStageScale(
      zoom,
      canvas.width,
      canvasViewport?.width ?? editorViewportWidth,
      canvas.height,
      canvasViewport?.height
    ),
    zoom,
    zoomIn: () =>
      setZoom({
        mode: "manual",
        scale: stepEditorZoom(
          resolveEditorStageScale(
            zoom,
            canvas.width,
            canvasViewport?.width ?? editorViewportWidth,
            canvas.height,
            canvasViewport?.height,
          ),
          "in",
        ),
      }),
    zoomOut: () =>
      setZoom({
        mode: "manual",
        scale: stepEditorZoom(
          resolveEditorStageScale(
            zoom,
            canvas.width,
            canvasViewport?.width ?? editorViewportWidth,
            canvas.height,
            canvasViewport?.height,
          ),
          "out",
        ),
      }),
    zoomToFit: () => setZoom({ mode: "fit" }),
    zoomToActualSize: () => setZoom({ mode: "manual", scale: 1 }),
  };
}
