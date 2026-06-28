import { type Job } from "@orbit/shared";
import {
  FolderOpen,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  SendHorizontal
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import orbitLogo from "./assets/orbit-logo.png";
import { AuthPanel } from "./features/auth/AuthPanel";
import { ProjectGallery } from "./features/projects/ProjectGallery";

type ExtractedFile = {
  fileName: string;
  kind: string;
  status: string;
  message?: string;
  rawText: string;
  cleanedText?: string;
  cleanupStatus?: string;
  cleanupMessage?: string;
  keywords?: PresentationKeyword[];
  keywordStatus?: string;
  keywordMessage?: string;
  indexingStatus?: string;
  indexingMessage?: string;
  chunkCount?: number;
};

type JobResult = {
  files?: ExtractedFile[];
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type PresentationKeyword = {
  keyword: string;
  reason: string;
  priority: "high" | "medium" | "low" | string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type AppRoute =
  | { name: "home"; path: "/" }
  | { name: "login"; path: "/login" }
  | { name: "project"; path: "/project" }
  | { name: "project-room"; path: string; roomId: string };

const EditorShell = lazy(() =>
  import("./features/editor/EditorShell").then((module) => ({
    default: module.EditorShell
  }))
);

export async function pollExtractJob(
  jobId: string,
  options: {
    delayMs?: number;
    fetcher?: Fetcher;
    onUpdate?: (job: Job) => void;
    timeoutMs?: number;
  } = {}
): Promise<Job> {
  const delayMs = options.delayMs ?? 1000;
  const fetcher = options.fetcher ?? fetch;
  const timeoutAt = Date.now() + (options.timeoutMs ?? 120_000);

  for (;;) {
    const response = await fetcher(`/api/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error((await response.text()) || "Job status lookup failed.");
    }

    const job = (await response.json()) as Job;
    options.onUpdate?.(job);
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() > timeoutAt) {
      throw new Error("Reference extraction timed out.");
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export function getJobResultFiles(job: Job): ExtractedFile[] {
  const result = job.result as JobResult | null;
  return Array.isArray(result?.files) ? result.files : [];
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(location.pathname));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    function handlePopState() {
      setRoute(parseRoute(location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path: string) {
    history.pushState(null, "", path);
    setRoute(parseRoute(path));
  }

  return (
    <SharedSidebarShell
      currentRoute={route.name}
      isCollapsed={isSidebarCollapsed}
      onNavigate={navigate}
      onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
    >
      {route.name === "login" ? (
        <LoginRoute />
      ) : route.name === "project" ? (
        <ProjectGallery
          onOpenEditor={(projectId) => {
            navigate(`/project/${encodeURIComponent(projectId)}`);
          }}
        />
      ) : route.name === "project-room" ? (
        <Suspense fallback={<EditorLoadingFallback />}>
          <EditorShell projectId={route.roomId} />
        </Suspense>
      ) : (
        <HomeChatView />
      )}
    </SharedSidebarShell>
  );
}

function SharedSidebarShell(props: {
  children: ReactNode;
  currentRoute: AppRoute["name"];
  isCollapsed: boolean;
  onNavigate: (path: string) => void;
  onToggleCollapsed: () => void;
}) {
  const isProjectRoute =
    props.currentRoute === "project" || props.currentRoute === "project-room";

  return (
    <main className={`orbit-home-shell${props.isCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="orbit-sidebar" aria-label="Orbit navigation">
        <div className="orbit-sidebar-header">
          <button
            className={`orbit-sidebar-brand${props.currentRoute === "home" ? " active" : ""}`}
            type="button"
            onClick={() => props.onNavigate("/")}
            title="홈"
          >
            <img alt="Orbit" src={orbitLogo} />
            <strong>Orbit</strong>
          </button>
          <button
            className="orbit-sidebar-toggle"
            type="button"
            onClick={props.onToggleCollapsed}
            aria-label={props.isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            title={props.isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {props.isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="orbit-sidebar-list" aria-label="Primary">
          <button
            className={isProjectRoute ? "active" : ""}
            type="button"
            onClick={() => props.onNavigate("/project")}
          >
            <FolderOpen size={18} />
            <span>프로젝트 불러오기</span>
          </button>
        </nav>

        <div className="orbit-sidebar-footer">
          <button
            className={props.currentRoute === "login" ? "active" : ""}
            type="button"
            onClick={() => props.onNavigate("/login")}
            title="로그인"
          >
            <LogIn size={18} />
            <span>로그인</span>
          </button>
        </div>
      </aside>

      <section className="orbit-route-content">{props.children}</section>
    </main>
  );
}

function HomeChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "안녕하세요. 발표 자료 초안, 프로젝트 구성, 저장 흐름에 대해 물어보세요."
    }
  ]);
  const [draft, setDraft] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: "아직 GPT API 응답은 연결되지 않았습니다. 지금은 홈 대화 UI 흐름만 확인할 수 있습니다."
      }
    ]);
    setDraft("");
  }

  return (
    <section className="orbit-chat-home">
      <div className="orbit-chat-heading">
        <p className="eyebrow">home</p>
        <h1>Orbit</h1>
        <p>발표 자료를 만들고, 프로젝트를 불러오고, 이어서 편집할 수 있는 작업 공간입니다.</p>
      </div>

      <div className="orbit-chat-panel">
        <div className="orbit-chat-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`orbit-chat-message ${message.role}`} key={message.id}>
              <span>{message.role === "assistant" ? "Orbit" : "나"}</span>
              <p>{message.text}</p>
            </div>
          ))}
        </div>

        <form className="orbit-chat-composer" onSubmit={handleSubmit}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Orbit에게 메시지 보내기"
            aria-label="Orbit에게 메시지 보내기"
          />
          <button type="submit" aria-label="메시지 보내기" disabled={!draft.trim()}>
            <SendHorizontal size={18} />
          </button>
        </form>
      </div>
    </section>
  );
}

function LoginRoute() {
  return (
    <main className="app-shell orbit-login-route">
      <section className="orbit-login-copy">
        <p className="eyebrow">login</p>
        <h1>로그인</h1>
        <p>프로젝트를 저장하고 이어서 작업하려면 계정으로 접속하세요.</p>
      </section>
      <AuthPanel />
    </main>
  );
}

function EditorLoadingFallback() {
  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">editor</p>
          <h1>편집기를 불러오는 중</h1>
        </div>
      </section>
    </main>
  );
}

export function ExtractResultItem(props: { result: ExtractedFile }) {
  const { result } = props;

  return (
    <article className="result-item">
      <header className="result-item-header">
        <div>
          <h3>{result.fileName}</h3>
          <p>
            {result.kind.toUpperCase()} · {result.status}
          </p>
        </div>
        {result.message && <span>{result.message}</span>}
      </header>
      {result.indexingStatus && (
        <p className="indexing-summary">
          {result.indexingStatus}
          {typeof result.chunkCount === "number" ? ` · ${result.chunkCount} chunks` : ""}
          {result.indexingMessage ? ` · ${result.indexingMessage}` : ""}
        </p>
      )}
      <div className="text-comparison">
        <div className="text-column">
          <h4>OCR 원문</h4>
          <pre>{result.rawText || "추출된 텍스트가 없습니다."}</pre>
        </div>
        <div className="text-column">
          <h4>AI 정제본</h4>
          <pre>
            {result.cleanedText ||
              result.cleanupMessage ||
              "AI 정제 결과가 없습니다."}
          </pre>
          {result.cleanupStatus && (
            <span className={`cleanup-status cleanup-status-${result.cleanupStatus}`}>
              {result.cleanupStatus}
            </span>
          )}
        </div>
      </div>
      <div className="keyword-panel">
        <div className="keyword-panel-header">
          <h4>발표 주요 키워드</h4>
          {result.keywordStatus && (
            <span className={`cleanup-status cleanup-status-${result.keywordStatus}`}>
              {result.keywordStatus}
            </span>
          )}
        </div>

        {result.keywords && result.keywords.length > 0 ? (
          <ul className="keyword-list">
            {result.keywords.map((keyword) => (
              <li key={`${result.fileName}-${keyword.keyword}`}>
                <div>
                  <strong>{keyword.keyword}</strong>
                  <p>{keyword.reason}</p>
                </div>
                <span className={`priority priority-${keyword.priority}`}>
                  {keyword.priority}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="keyword-empty">
            {result.keywordMessage || "추출된 발표 키워드가 없습니다."}
          </p>
        )}
      </div>
    </article>
  );
}

function parseRoute(pathname: string): AppRoute {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === "/login") {
    return { name: "login", path: "/login" };
  }

  if (normalizedPath === "/project") {
    return { name: "project", path: "/project" };
  }

  if (normalizedPath.startsWith("/project/")) {
    const roomId = decodeURIComponent(normalizedPath.slice("/project/".length));
    return { name: "project-room", path: normalizedPath, roomId };
  }

  return { name: "home", path: "/" };
}
