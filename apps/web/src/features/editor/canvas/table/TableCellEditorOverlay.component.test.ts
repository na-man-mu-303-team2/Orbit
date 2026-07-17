import type { TableCellProps } from "@orbit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const effectHarness = vi.hoisted(() => {
  type Effect = () => void | (() => void);
  type Slot = {
    cleanup?: () => void;
    deps?: readonly unknown[];
  };

  const slots: Slot[] = [];
  const refs = new Map<number, { current: unknown }>();
  let cursor = 0;
  let pending: Array<{
    deps?: readonly unknown[];
    effect: Effect;
    index: number;
  }> = [];

  function depsChanged(
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined,
  ) {
    if (!previous || !next || previous.length !== next.length) return true;
    return next.some((value, index) => !Object.is(value, previous[index]));
  }

  return {
    beginRender() {
      cursor = 0;
      pending = [];
    },
    flushEffects() {
      for (const entry of pending) {
        slots[entry.index]?.cleanup?.();
        const cleanup = entry.effect();
        slots[entry.index] = {
          cleanup: typeof cleanup === "function" ? cleanup : undefined,
          deps: entry.deps,
        };
      }
      pending = [];
    },
    reset() {
      for (const slot of slots) slot?.cleanup?.();
      slots.length = 0;
      refs.clear();
      cursor = 0;
      pending = [];
    },
    useEffect(effect: Effect, deps?: readonly unknown[]) {
      const index = cursor;
      cursor += 1;
      if (depsChanged(slots[index]?.deps, deps)) {
        pending.push({ deps, effect, index });
      }
    },
    useRef<T>(initialValue: T) {
      const index = cursor;
      cursor += 1;
      const current = refs.get(index);
      if (current) return current as { current: T };
      const ref = { current: initialValue };
      refs.set(index, ref);
      return ref;
    },
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: effectHarness.useEffect,
  useRef: effectHarness.useRef,
}));

import { TableCellEditorOverlay } from "./TableCellEditorOverlay";

class FakeTextarea {
  className = "";
  dataset: Record<string, string> = {};
  parent: FakeStage | null = null;
  spellcheck = false;
  style: Record<string, string> = {};
  value = "";

  private listeners = new Map<string, Set<(event?: unknown) => void>>();

  addEventListener(type: string, listener: (event?: unknown) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, event?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  focus() {}

  remove() {
    this.parent?.remove(this);
  }

  removeEventListener(type: string, listener: (event?: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  select() {}

  setAttribute(name: string, value: string) {
    if (name === "aria-label") this.dataset.ariaLabel = value;
  }
}

class FakeStage {
  children: FakeTextarea[] = [];

  append(textarea: FakeTextarea) {
    textarea.parent = this;
    this.children.push(textarea);
  }

  remove(textarea: FakeTextarea) {
    this.children = this.children.filter((child) => child !== textarea);
    textarea.parent = null;
  }
}

function cell(overrides: Partial<TableCellProps> = {}): TableCellProps {
  return {
    align: "left",
    borderColor: "#CBD5E1",
    borderWidth: 1,
    colSpan: 1,
    fill: "#FFFFFF",
    fontSize: 18,
    fontWeight: "normal",
    rowSpan: 1,
    text: "초기",
    textColor: "#111827",
    verticalAlign: "middle",
    ...overrides,
  };
}

function renderOverlay(props: Parameters<typeof TableCellEditorOverlay>[0]) {
  effectHarness.beginRender();
  TableCellEditorOverlay(props);
  effectHarness.flushEffects();
}

describe("TableCellEditorOverlay component lifecycle", () => {
  afterEach(() => {
    effectHarness.reset();
    vi.unstubAllGlobals();
  });

  it("preserves one draft session across parent rerenders while refreshing geometry, style, and callbacks", () => {
    const stage = new FakeStage();
    vi.stubGlobal("document", {
      createElement: () => new FakeTextarea(),
      querySelector: () => stage,
    });
    const firstCommit = vi.fn();
    const nextCommit = vi.fn();
    const firstFinish = vi.fn();
    const nextFinish = vi.fn();
    const identity = {
      columnIndex: 1,
      elementId: "el_table",
      rowIndex: 0,
    };

    renderOverlay({
      cell: cell(),
      cellLayout: { height: 60, width: 120, x: 100, y: 0 },
      columnIndex: identity.columnIndex,
      element: { elementId: identity.elementId, rotation: 0, x: 40, y: 80 },
      rowIndex: identity.rowIndex,
      stageScale: 1,
      onCommit: firstCommit,
      onFinish: firstFinish,
    });
    const textarea = stage.children[0]!;
    textarea.value = "작성 중인 초안";
    textarea.emit("input");

    renderOverlay({
      cell: cell({
        fontSize: 24,
        text: "부모의 새 텍스트",
        textColor: "#DC2626",
      }),
      cellLayout: { height: 80, width: 180, x: 120, y: 20 },
      columnIndex: identity.columnIndex,
      element: { elementId: identity.elementId, rotation: 30, x: 60, y: 100 },
      rowIndex: identity.rowIndex,
      stageScale: 2,
      onCommit: nextCommit,
      onFinish: nextFinish,
    });

    expect(stage.children).toHaveLength(1);
    expect(stage.children[0]).toBe(textarea);
    expect(textarea.value).toBe("작성 중인 초안");
    expect(textarea.style.fontSize).toBe("48px");
    expect(textarea.style.transform).toBe("rotate(30deg)");
    expect(textarea.style.width).toBe("360px");

    textarea.emit("blur");

    expect(firstCommit).not.toHaveBeenCalled();
    expect(firstFinish).not.toHaveBeenCalled();
    expect(nextCommit).toHaveBeenCalledWith("작성 중인 초안");
    expect(nextFinish).toHaveBeenCalledTimes(1);
  });
});
