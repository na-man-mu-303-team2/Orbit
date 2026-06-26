import { createDemoDeck } from "@orbit/editor-core";
import { demoIds } from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, FileUp, Play, Radio, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

interface HealthResponse {
  status: string;
  app: string;
  demo: typeof demoIds;
}

const demoDeck = createDemoDeck();

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error("API health check failed");
  }
  return response.json() as Promise<HealthResponse>;
}

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false
  });

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">platform-core</p>
          <h1>ORBIT Demo Console</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void health.refetch()}
          aria-label="상태 새로고침"
          title="상태 새로고침"
        >
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="status-strip">
        <StatusItem
          icon={<Activity size={20} />}
          label="API"
          value={health.data?.status ?? (health.isError ? "offline" : "checking")}
        />
        <StatusItem icon={<Database size={20} />} label="Project" value={demoIds.projectId} />
        <StatusItem icon={<Radio size={20} />} label="Session" value={demoIds.sessionId} />
      </section>

      <section className="workspace-grid">
        <article className="panel primary-panel">
          <div>
            <p className="panel-kicker">Deck</p>
            <h2>{demoDeck.title}</h2>
          </div>
          <div className="slide-preview">
            <span>{demoDeck.slides[0]?.elements[0]?.props.text as string}</span>
          </div>
          <dl className="meta-grid">
            <div>
              <dt>deckId</dt>
              <dd>{demoDeck.deckId}</dd>
            </div>
            <div>
              <dt>slides</dt>
              <dd>{demoDeck.slides.length}</dd>
            </div>
            <div>
              <dt>version</dt>
              <dd>{demoDeck.version}</dd>
            </div>
          </dl>
        </article>

        <article className="panel task-panel">
          <p className="panel-kicker">Sprint 1</p>
          <h2>Core Flow</h2>
          <div className="action-list">
            <button type="button">
              <Play size={18} />
              프로젝트 생성
            </button>
            <button type="button">
              <FileUp size={18} />
              파일 업로드
            </button>
            <button type="button">
              <Activity size={18} />
              Job 상태 확인
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}

function StatusItem(props: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="status-item">
      {props.icon}
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
    </div>
  );
}
