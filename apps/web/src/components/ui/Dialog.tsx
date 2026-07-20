import { IconX } from "@tabler/icons-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OrbitIconButton } from "./IconButton";
import "./dialog.css";

const dialogFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export function isOrbitDialogDismissAllowed(closeDisabled = false) {
  return !closeDisabled;
}

export function OrbitDialog(props: {
  children: ReactNode;
  className?: string;
  closeDisabled?: boolean;
  description?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(props.onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  onCloseRef.current = () => {
    if (isOrbitDialogDismissAllowed(props.closeDisabled)) props.onClose();
  };

  useEffect(() => {
    if (!props.open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>("[data-orbit-dialog-initial]");
      const first = dialogRef.current?.querySelector<HTMLElement>(dialogFocusableSelector);
      (preferred ?? first ?? dialogRef.current)?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(dialogFocusableSelector))
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [props.open]);

  if (!props.open) return null;

  const dialog = (
    <div
      className="redesign-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
      role="presentation"
    >
      <section
        aria-describedby={props.description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`redesign-dialog ${props.className ?? ""}`.trim()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="redesign-dialog-header">
          <div>
            <h2 id={titleId}>{props.title}</h2>
            {props.description ? <p id={descriptionId}>{props.description}</p> : null}
          </div>
          <OrbitIconButton
            aria-label="닫기"
            data-orbit-dialog-initial
            disabled={props.closeDisabled}
            onClick={() => onCloseRef.current()}
            variant="plain"
          >
            <IconX aria-hidden="true" size={20} stroke={1.8} />
          </OrbitIconButton>
        </header>
        <div className="redesign-dialog-body">{props.children}</div>
        {props.footer ? <footer className="redesign-dialog-footer">{props.footer}</footer> : null}
      </section>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
