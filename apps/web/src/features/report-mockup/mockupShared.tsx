export type MockupTabId =
  | "dashboard"
  | "analysis"
  | "docs"
  | "history"
  | "schedule";

export const mockupTabs: { id: MockupTabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "대시보드", icon: "▦" },
  { id: "analysis", label: "분석", icon: "▥" },
  { id: "docs", label: "문서", icon: "▤" },
  { id: "history", label: "리허설 기록", icon: "◷" },
  { id: "schedule", label: "일정", icon: "▧" }
];

export function MockupTopbar({
  active,
  onChange
}: {
  active: MockupTabId;
  onChange: (tab: MockupTabId) => void;
}) {
  return (
    <header className="rm-topbar">
      <div className="rm-brand">
        <span className="rm-brand-mark">◈</span> Orbit
      </div>
      <nav className="rm-tabs">
        {mockupTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === active ? "rm-tab active" : "rm-tab"}
            onClick={() => onChange(tab.id)}
          >
            {tab.id === active && <span className="rm-tab-icon">{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="rm-topbar-right">
        <button type="button" className="rm-round-button">
          +
        </button>
        <button type="button" className="rm-round-button dark rm-has-dot">
          🔔
        </button>
        <span className="rm-avatar">YB</span>
      </div>
    </header>
  );
}
