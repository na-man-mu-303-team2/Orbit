import type {
  PresentationCompanionAnnotationAck,
  PresentationCompanionAnnotationSnapshot,
  PresentationCompanionOutputState,
  PresentationCompanionPoint,
  PresentationCompanionStroke,
} from "@orbit/shared";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { renderCompanionAnnotations } from "./annotationRender";
import {
  findHitStrokeId,
  getCompanionPointerPoints,
  shouldAcceptCompanionPointer,
  type ActiveCompanionPointer,
} from "./companionPointerInput";
import {
  CompanionToolbar,
  type CompanionDrawingTool,
  type CompanionInkColor,
} from "./CompanionToolbar";
import type { CompanionAnnotationCommandInput } from "./useCompanionSocket";

type ActiveStroke = {
  frameId: number | null;
  pendingPoints: PresentationCompanionPoint[];
  pointer: ActiveCompanionPointer;
  startedAt: number;
  strokeId: string;
};

export function CompanionAnnotationCanvas(props: {
  annotation: PresentationCompanionAnnotationSnapshot | null;
  canWrite: boolean;
  connected: boolean;
  lastAcknowledgement: PresentationCompanionAnnotationAck | null;
  output: PresentationCompanionOutputState;
  sendCommand: (command: CompanionAnnotationCommandInput) => boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const [tool, setTool] = useState<CompanionDrawingTool>("pen");
  const [color, setColor] = useState<CompanionInkColor>("ink-blue");
  const [localStrokes, setLocalStrokes] = useState<
    PresentationCompanionStroke[]
  >([]);
  const [hiddenStrokeIds, setHiddenStrokeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [clearOptimistic, setClearOptimistic] = useState(false);
  const disabled =
    !props.canWrite ||
    !props.connected ||
    props.output.outputMode === "black";
  const acceptedStrokes = props.annotation?.strokes ?? [];
  const visibleStrokes = useMemo(() => {
    const accepted = clearOptimistic
      ? []
      : acceptedStrokes.filter(
          (stroke) => !hiddenStrokeIds.has(stroke.strokeId),
        );
    return [...accepted, ...localStrokes];
  }, [
    acceptedStrokes,
    clearOptimistic,
    hiddenStrokeIds,
    localStrokes,
  ]);

  useEffect(() => {
    const acceptedIds = new Set(
      props.annotation?.strokes.map((stroke) => stroke.strokeId) ?? [],
    );
    setLocalStrokes((current) =>
      current.filter((stroke) => !acceptedIds.has(stroke.strokeId)),
    );
    setHiddenStrokeIds(new Set());
    setClearOptimistic(false);
  }, [
    props.annotation?.authorityEpochId,
    props.annotation?.surfaceId,
    props.annotation?.surfaceRevision,
  ]);

  useEffect(() => {
    if (props.lastAcknowledgement?.accepted !== false) return;
    setLocalStrokes([]);
    setHiddenStrokeIds(new Set());
    setClearOptimistic(false);
  }, [props.lastAcknowledgement]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    renderCompanionAnnotations({
      canvas,
      height: Math.max(1, bounds.height),
      strokes: visibleStrokes,
      width: Math.max(1, bounds.width),
    });
  }, [visibleStrokes]);

  useEffect(
    () => () => {
      const active = activeStrokeRef.current;
      if (active && active.frameId !== null) {
        cancelAnimationFrame(active.frameId);
      }
    },
    [],
  );

  const send = (command: CompanionAnnotationCommandInput) =>
    props.sendCommand(command);
  const flushPendingPoints = () => {
    const active = activeStrokeRef.current;
    if (!active) return;
    active.frameId = null;
    while (active.pendingPoints.length > 0) {
      const points = active.pendingPoints.splice(0, 64);
      if (
        !send({
          kind: "stroke-points",
          clientOperationId: createOpaqueId("op"),
          strokeId: active.strokeId,
          points,
        })
      ) {
        active.pendingPoints.length = 0;
        return;
      }
    }
  };
  const scheduleFlush = () => {
    const active = activeStrokeRef.current;
    if (!active || active.frameId !== null) return;
    active.frameId = requestAnimationFrame(flushPendingPoints);
  };
  const handlePointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      disabled ||
      !shouldAcceptCompanionPointer(event.nativeEvent, activeStrokeRef.current?.pointer ?? null)
    ) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const startedAt = event.timeStamp;
    const points = getCompanionPointerPoints(
      event.nativeEvent,
      bounds,
      startedAt,
    );
    const first = points[0];
    if (!first) return;

    if (tool === "eraser") {
      const strokeId = findHitStrokeId(visibleStrokes, first);
      if (
        strokeId &&
        send({
          kind: "stroke-delete",
          clientOperationId: createOpaqueId("op"),
          strokeId,
        })
      ) {
        setLocalStrokes((current) =>
          current.filter((stroke) => stroke.strokeId !== strokeId),
        );
        setHiddenStrokeIds((current) => new Set(current).add(strokeId));
      }
      return;
    }

    const strokeId = createOpaqueId("stroke");
    if (
      !send({
        kind: "stroke-begin",
        clientOperationId: createOpaqueId("op"),
        strokeId,
        tool,
        color,
        width: tool === "highlighter" ? 0.025 : 0.008,
        point: first,
      })
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = {
      frameId: null,
      pendingPoints: [],
      pointer: {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      },
      startedAt,
      strokeId,
    };
    setLocalStrokes((current) => [
      ...current,
      {
        strokeId,
        tool,
        color,
        width: tool === "highlighter" ? 0.025 : 0.008,
        points: [first],
      },
    ]);
  };
  const handlePointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const active = activeStrokeRef.current;
    if (
      disabled ||
      !active ||
      !shouldAcceptCompanionPointer(event.nativeEvent, active.pointer)
    ) {
      return;
    }
    const points = getCompanionPointerPoints(
      event.nativeEvent,
      event.currentTarget.getBoundingClientRect(),
      active.startedAt,
    );
    if (points.length === 0) return;
    active.pendingPoints.push(...points);
    setLocalStrokes((current) =>
      current.map((stroke) =>
        stroke.strokeId === active.strokeId
          ? { ...stroke, points: [...stroke.points, ...points] }
          : stroke,
      ),
    );
    scheduleFlush();
  };
  const finishPointer = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const active = activeStrokeRef.current;
    if (!active || active.pointer.pointerId !== event.pointerId) return;
    if (active.frameId !== null) cancelAnimationFrame(active.frameId);
    flushPendingPoints();
    send({
      kind: "stroke-end",
      clientOperationId: createOpaqueId("op"),
      strokeId: active.strokeId,
    });
    activeStrokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleUndo = () => {
    if (
      !send({
        kind: "undo",
        clientOperationId: createOpaqueId("op"),
      })
    ) {
      return;
    }
    if (localStrokes.length > 0) {
      setLocalStrokes((current) => current.slice(0, -1));
      return;
    }
    const lastAccepted = acceptedStrokes
      .filter((stroke) => !hiddenStrokeIds.has(stroke.strokeId))
      .at(-1);
    if (lastAccepted) {
      setHiddenStrokeIds((current) =>
        new Set(current).add(lastAccepted.strokeId),
      );
    }
  };
  const handleClear = () => {
    if (
      send({
        kind: "clear-surface",
        clientOperationId: createOpaqueId("op"),
      })
    ) {
      setLocalStrokes([]);
      setClearOptimistic(true);
    }
  };

  if (props.output.outputMode === "black") return null;

  return (
    <>
      <canvas
        aria-label="iPad 주석 입력"
        className="presenter-companion-annotation-canvas"
        onPointerCancel={finishPointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        ref={canvasRef}
      />
      <CompanionToolbar
        canClear={visibleStrokes.length > 0}
        canUndo={visibleStrokes.length > 0}
        color={color}
        disabled={disabled}
        onClear={handleClear}
        onColorChange={setColor}
        onToolChange={setTool}
        onUndo={handleUndo}
        tool={tool}
      />
    </>
  );
}

function createOpaqueId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
