import "./presentation-journey-nav.css";

export type PresentationJourneyStage = "prepare" | "practice" | "results" | "live";

const stages: Array<{
  id: PresentationJourneyStage;
  label: string;
  path: (projectId: string) => string;
}> = [
  { id: "prepare", label: "준비", path: (projectId) => `/project/${encodeURIComponent(projectId)}` },
  { id: "practice", label: "연습", path: (projectId) => `/rehearsal/${encodeURIComponent(projectId)}` },
  { id: "results", label: "결과", path: (projectId) => `/reports/${encodeURIComponent(projectId)}` },
  { id: "live", label: "실전", path: (projectId) => `/presentation/${encodeURIComponent(projectId)}` },
];

export function PresentationJourneyNav(props: {
  active: PresentationJourneyStage;
  compact?: boolean;
  projectId: string;
}) {
  return (
    <nav
      aria-label="발표 작업 단계"
      className={`presentation-journey-nav${props.compact ? " presentation-journey-nav-compact" : ""}`}
    >
      {stages.map((stage) => (
        <a
          aria-current={props.active === stage.id ? "page" : undefined}
          href={stage.path(props.projectId)}
          key={stage.id}
        >
          {stage.label}
        </a>
      ))}
    </nav>
  );
}
