import { IconX } from "@tabler/icons-react";
import {
  cloneElement,
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";

export type OrbitButtonVariant = "primary" | "secondary" | "quiet";

export function OrbitButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode;
    variant?: OrbitButtonVariant;
  }
) {
  const { children, className = "", icon, variant = "primary", ...buttonProps } = props;
  return (
    <button
      className={`orbit-ds-button orbit-ds-button-${variant} ${className}`.trim()}
      type="button"
      {...buttonProps}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export type OrbitIconButtonVariant = "surface" | "plain" | "inverse";

export function OrbitIconButton(
  props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
    "aria-label": string;
    variant?: OrbitIconButtonVariant;
  }
) {
  const { className = "", variant = "surface", ...buttonProps } = props;
  return (
    <button
      className={`orbit-ds-icon-button orbit-ds-icon-button-${variant} ${className}`.trim()}
      type="button"
      {...buttonProps}
    />
  );
}

export type OrbitStatusTone = "neutral" | "lilac" | "success" | "warning" | "info";

export function OrbitStatus(props: { children: ReactNode; tone?: OrbitStatusTone }) {
  const { children, tone = "neutral" } = props;
  return <span className={`orbit-ds-status orbit-ds-status-${tone}`}>{children}</span>;
}

export function OrbitColorBlock(props: {
  children: ReactNode;
  icon: ReactNode;
  tone: "lilac" | "lime" | "cream";
}) {
  return (
    <article className={`orbit-ds-color-block orbit-ds-color-block-${props.tone}`}>
      {props.icon}
      <div>{props.children}</div>
    </article>
  );
}

type OrbitFieldControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  id?: string;
};

export function OrbitField(props: {
  children: ReactElement<OrbitFieldControlProps>;
  className?: string;
  error?: string;
  hint?: string;
  id: string;
  label: ReactNode;
}) {
  const helperId = `${props.id}-helper`;
  const describedBy = [props.children.props["aria-describedby"], props.hint || props.error ? helperId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  const control = cloneElement(props.children, {
    "aria-describedby": describedBy,
    "aria-invalid": props.error ? true : props.children.props["aria-invalid"],
    id: props.id
  });

  return (
    <label
      className={`orbit-ds-field${props.error ? " orbit-ds-field-invalid" : ""} ${props.className ?? ""}`.trim()}
      htmlFor={props.id}
    >
      <span>{props.label}</span>
      {control}
      {props.error || props.hint ? (
        <small id={helperId} role={props.error ? "alert" : undefined}>
          {props.error ?? props.hint}
        </small>
      ) : null}
    </label>
  );
}

export const OrbitInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function OrbitInput({ className = "", ...props }, ref) {
    return <input className={`orbit-ds-input ${className}`.trim()} ref={ref} {...props} />;
  }
);

export const OrbitSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function OrbitSelect({ className = "", ...props }, ref) {
    return <select className={`orbit-ds-select ${className}`.trim()} ref={ref} {...props} />;
  }
);

export const OrbitTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function OrbitTextarea({ className = "", ...props }, ref) {
  return <textarea className={`orbit-ds-input ${className}`.trim()} ref={ref} {...props} />;
});

export type OrbitTab = { id: string; label: ReactNode };

export function OrbitTabs(props: {
  activeTab: string;
  ariaLabel: string;
  children: ReactNode;
  onChange: (tabId: string) => void;
  tabs: readonly OrbitTab[];
}) {
  const id = useId();
  const activeTab = props.tabs.find((tab) => tab.id === props.activeTab) ?? props.tabs[0];
  if (!activeTab) return null;
  const panelId = `${id}-panel`;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = props.tabs.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? (index + 1) % props.tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + props.tabs.length) % props.tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = props.tabs[nextIndex];
    if (!nextTab) return;
    props.onChange(nextTab.id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }

  return (
    <div className="orbit-ds-tabs">
      <div aria-label={props.ariaLabel} className="orbit-ds-tab-list" role="tablist">
        {props.tabs.map((tab, index) => {
          const selected = tab.id === activeTab.id;
          return (
            <button
              aria-controls={panelId}
              aria-selected={selected}
              className="orbit-ds-tab"
              id={`${id}-${tab.id}`}
              key={tab.id}
              onClick={() => props.onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div aria-labelledby={`${id}-${activeTab.id}`} className="orbit-ds-tab-panel" id={panelId} role="tabpanel">
        {props.children}
      </div>
    </div>
  );
}

export function OrbitEmptyState(props: {
  action?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="orbit-ds-empty-state" role="status">
      {props.icon ? <span className="orbit-ds-empty-state-icon">{props.icon}</span> : null}
      <h3>{props.title}</h3>
      <p>{props.description}</p>
      {props.action ? <div className="orbit-ds-empty-state-action">{props.action}</div> : null}
    </section>
  );
}

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
    if (isOrbitDialogDismissAllowed(props.closeDisabled)) {
      props.onClose();
    }
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

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(dialogFocusableSelector)
      ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
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

  return (
    <div
      className="orbit-ds-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
      role="presentation"
    >
      <section
        aria-describedby={props.description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`orbit-ds-dialog ${props.className ?? ""}`.trim()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="orbit-ds-dialog-header">
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
        <div className="orbit-ds-dialog-body">{props.children}</div>
        {props.footer ? <footer className="orbit-ds-dialog-footer">{props.footer}</footer> : null}
      </section>
    </div>
  );
}
