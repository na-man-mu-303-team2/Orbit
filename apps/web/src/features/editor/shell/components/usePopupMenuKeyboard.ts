import {
  useEffect,
  useRef,
  type KeyboardEvent,
} from "react";

export function getPopupMenuTargetIndex(
  currentIndex: number,
  itemCount: number,
  key: string,
) {
  if (itemCount <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") {
    return currentIndex < 0 ? 0 : (currentIndex + 1) % itemCount;
  }
  if (key === "ArrowUp") {
    return currentIndex < 0
      ? itemCount - 1
      : (currentIndex - 1 + itemCount) % itemCount;
  }
  return null;
}

function getEnabledMenuItems(menu: HTMLDivElement | null) {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])',
    ),
  );
}

export function usePopupMenuKeyboard(args: {
  getTrigger: () => HTMLElement | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const getTriggerRef = useRef(args.getTrigger);
  const onCloseRef = useRef(args.onClose);
  getTriggerRef.current = args.getTrigger;
  onCloseRef.current = args.onClose;

  useEffect(() => {
    if (!args.isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      getEnabledMenuItems(menuRef.current)[0]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [args.isOpen]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const trigger = getTriggerRef.current();
      onCloseRef.current();
      window.requestAnimationFrame(() => trigger?.focus());
      return;
    }

    const items = getEnabledMenuItems(event.currentTarget);
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const targetIndex = getPopupMenuTargetIndex(
      currentIndex,
      items.length,
      event.key,
    );
    if (targetIndex === null) return;

    event.preventDefault();
    event.stopPropagation();
    items[targetIndex]?.focus();
  }

  return { menuRef, onKeyDown };
}
