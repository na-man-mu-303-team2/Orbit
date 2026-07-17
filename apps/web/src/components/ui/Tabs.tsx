import { useId, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import "./tabs.css";

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
    const nextIndex = event.key === "ArrowRight"
      ? (index + 1) % props.tabs.length
      : event.key === "ArrowLeft"
        ? (index - 1 + props.tabs.length) % props.tabs.length
        : event.key === "Home" ? 0 : event.key === "End" ? lastIndex : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = props.tabs[nextIndex];
    if (!nextTab) return;
    props.onChange(nextTab.id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus();
  }

  return (
    <div className="redesign-tabs">
      <div aria-label={props.ariaLabel} className="redesign-tab-list" role="tablist">
        {props.tabs.map((tab, index) => {
          const selected = tab.id === activeTab.id;
          return (
            <button
              aria-controls={panelId}
              aria-selected={selected}
              className="redesign-tab"
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
      <div aria-labelledby={`${id}-${activeTab.id}`} className="redesign-tab-panel" id={panelId} role="tabpanel">
        {props.children}
      </div>
    </div>
  );
}
