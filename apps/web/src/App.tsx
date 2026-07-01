import {
  demoIds,
  type DeckElement,
  type GenerateDeckJobResult,
  type Job,
  type Project,
  type ProjectMemberRole,
  type ProjectMemberStatus,
  type RehearsalReport,
  type RehearsalRun
} from "@orbit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  FolderOpen,
  Home,
  LayoutTemplate,
  LogIn,
  LogOut,
  MessageSquareText,
  Monitor,
  Plus,
  Search,
  Sparkles
} from "lucide-react";
import type { CSSProperties, ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createDemoDeck } from "../../../packages/editor-core/src/index";
import orbitLogo from "./assets/orbit-logo.png";
import {
  createProject,
  fetchProjects,
  ProjectAssetWorkspace
} from "./features/projects/ProjectAssetWorkspace";
import {
  RehearsalReportPage,
  RehearsalWorkspace
} from "./features/rehearsal/RehearsalWorkspace";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ExtractedFile = {
  referenceDocumentId?: string;
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

type ExtractResponse = {
  files: ExtractedFile[];
  job: Job;
};

type GenerateDeckResponse = {
  job: Job;
};

type ReferenceGenerationInput = {
  references: Array<{ fileId: string }>;
  referenceKeywords: Array<{ text: string }>;
  succeededFiles: ExtractedFile[];
  failedFiles: ExtractedFile[];
};

type GenerateDeckPayloadInput = {
  topic: string;
  prompt: string;
  designPrompt?: string;
  duration: number;
  minSlides: number;
  maxSlides: number;
  template: string;
  metadata: {
    audience: string;
    purpose: string;
    tone: string;
  };
  design: GenerateDeckDesignDirection;
  referenceInput: ReferenceGenerationInput;
};

type GenerateDeckDesignDirection = {
  profile?:
    | "executive-report"
    | "startup-pitch"
    | "editorial"
    | "technical"
    | "training";
  visualRhythm: "auto" | "clean" | "editorial" | "bold" | "technical";
  densityTarget: "low" | "medium" | "high";
  mediaPolicy: "avoid" | "balanced" | "placeholder-ok";
  layoutDiversity: "stable" | "varied";
};

type GenerateDeckTargetProject = {
  created: boolean;
  project: Project | null;
  projectId: string;
};

type PresentationKeyword = {
  keyword: string;
  reason: string;
  priority: "high" | "medium" | "low" | string;
};

type UploadFile = {
  id: string;
  file: File;
};

type RejectedFile = {
  name: string;
  reason: string;
};

export type Route =
  | { name: "login" }
  | { name: "home" }
  | { name: "create-deck" }
  | { name: "upload" }
  | { name: "project-list" }
  | { name: "project-editor"; projectId: string }
  | { name: "project-request"; projectId: string }
  | { name: "rehearsal"; projectId: string }
  | { name: "rehearsal-report"; projectId: string; runId: string }
  | { name: "report-mockup" };

type AuthUser = {
  userId: string;
  email?: string;
  displayName?: string;
};

type ProjectAccessResponse = {
  project: Project;
  membership: {
    role: ProjectMemberRole;
    status: ProjectMemberStatus;
  } | null;
};

const EditorShell = lazy(() =>
  import("./features/editor/shell/EditorShell").then((module) => ({
    default: module.EditorShell
  }))
);

const templates = [
  { id: "blank", title: "새 프레젠테이션", description: "빈 슬라이드에서 시작" },
  { id: "pitch", title: "피치덱", description: "문제, 해결책, 시장 흐름" },
  { id: "lesson", title: "수업 자료", description: "학습 목표와 활동 중심" },
  { id: "report", title: "보고서", description: "요약과 근거 중심" },
  { id: "workshop", title: "워크숍", description: "진행 순서와 실습 구성" }
];
const demoDeck = createDemoDeck();
const reportMockupRunId = "run_report_mockup";
const reportMockupGeneratedAt = "2026-07-01T09:00:00.000Z";
const reportMockupRun: RehearsalRun = {
  runId: reportMockupRunId,
  projectId: demoIds.projectId,
  deckId: demoIds.deckId,
  audioFileId: "file_report_mockup_audio",
  jobId: "job_report_mockup_stt",
  status: "succeeded",
  error: null,
  rawAudioDeletedAt: null,
  createdAt: "2026-07-01T08:54:12.000Z",
  updatedAt: reportMockupGeneratedAt
};
const reportMockupReport: RehearsalReport = {
  reportId: "report_mockup",
  runId: reportMockupRunId,
  projectId: demoIds.projectId,
  deckId: demoIds.deckId,
  transcriptRetained: false,
  transcript: null,
  metrics: {
    durationSeconds: 286,
    wordsPerMinute: 128,
    fillerWordCount: 3,
    pauseCount: 2,
    keywordCoverage: 0.86
  },
  coaching: {
    status: "succeeded",
    summary: "핵심 메시지는 안정적으로 전달됐고, 속도도 발표 시간에 잘 맞습니다.",
    strengths: [
      "도입부에서 발표 목적을 빠르게 제시했습니다.",
      "중요 키워드를 반복해 청중이 흐름을 따라가기 좋았습니다.",
      "슬라이드 전환 사이의 멈춤이 과하지 않았습니다."
    ],
    improvements: [
      "중간 설명에서 일부 filler 표현이 반복됩니다.",
      "마무리 전에 다음 행동을 더 명확하게 요청하면 좋습니다.",
      "수치가 있는 문장은 한 번 더 천천히 읽는 편이 좋습니다."
    ],
    nextPracticeFocus:
      "다음 연습에서는 결론 슬라이드의 CTA 문장을 먼저 고정하고, 수치 설명 구간의 호흡을 조금 더 길게 가져가세요.",
    message: ""
  },
  generatedAt: reportMockupGeneratedAt
};
const allowedExtensions = ["pdf", "docx", "pptx"];
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
const imagePrefix = "image/";
const accept = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/*",
  ".pdf",
  ".docx",
  ".pptx"
].join(",");

async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await fetch("/api/v1/auth/me", {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error("Unauthenticated");
  }
  const payload = (await response.json()) as AuthUser | { user: AuthUser };
  return "user" in payload ? payload.user : payload;
}

async function fetchProjectAccess(projectId: string): Promise<ProjectAccessResponse> {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/access`, {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "프로젝트 권한을 확인하지 못했습니다."));
  }
  return response.json() as Promise<ProjectAccessResponse>;
}

async function requestProjectAccess(
  projectId: string,
  role: Exclude<ProjectMemberRole, "owner">
): Promise<ProjectAccessResponse> {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/access-requests`,
    {
      body: JSON.stringify({ role }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
  if (!response.ok) {
    throw new Error(await readApiError(response, "프로젝트 권한 요청에 실패했습니다."));
  }
  return response.json() as Promise<ProjectAccessResponse>;
}

function getRoute(pathname = window.location.pathname): Route {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/login") return { name: "login" };
  if (normalized === "/createdeck") return { name: "create-deck" };
  if (normalized === "/upload") return { name: "upload" };
  if (normalized === "/project") return { name: "project-list" };
  if (normalized === "/report_mockup") return { name: "report-mockup" };

  const projectRequestMatch = normalized.match(/^\/project\/([^/]+)\/request$/);
  if (projectRequestMatch) {
    return { name: "project-request", projectId: decodeURIComponent(projectRequestMatch[1]) };
  }

  const projectMatch = normalized.match(/^\/project\/([^/]+)$/);
  if (projectMatch) {
    return { name: "project-editor", projectId: decodeURIComponent(projectMatch[1]) };
  }

  const rehearsalReportMatch = normalized.match(/^\/rehearsal\/([^/]+)\/report\/([^/]+)$/);
  if (rehearsalReportMatch) {
    return {
      name: "rehearsal-report",
      projectId: decodeURIComponent(rehearsalReportMatch[1]),
      runId: decodeURIComponent(rehearsalReportMatch[2])
    };
  }

  const rehearsalMatch = normalized.match(/^\/rehearsal\/([^/]+)$/);
  if (rehearsalMatch) {
    return { name: "rehearsal", projectId: decodeURIComponent(rehearsalMatch[1]) };
  }

  return { name: "home" };
}

function navigateTo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [route, setRoute] = useState(() => getRoute());

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  const auth = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchCurrentUser,
    retry: false
  });

  useEffect(() => {
    if (route.name === "home" && auth.isError) {
      window.history.replaceState({}, "", "/login");
      setRoute({ name: "login" });
    }
  }, [auth.isError, route.name]);

  if (!shouldRenderAppFrame(route)) {
    return renderRoute(route, auth.data);
  }

  return (
    <AppFrame
      isAuthenticated={auth.isSuccess}
      route={route}
      user={auth.data}
    >
      {renderRoute(route, auth.data)}
    </AppFrame>
  );
}

export function shouldRenderAppFrame(route: Route) {
  return route.name !== "login" && route.name !== "rehearsal-report" && route.name !== "report-mockup";
}

function renderRoute(route: Route, user?: AuthUser) {
  if (route.name === "login") return <LoginPage isAuthenticated={Boolean(user)} />;
  if (route.name === "create-deck") return <GenerateDeckView />;
  if (route.name === "upload") return <ProjectAssetWorkspace />;
  if (route.name === "project-list") return <ProjectListPage />;
  if (route.name === "project-editor") {
    return (
      <ProjectAccessGate projectId={route.projectId}>
        <Suspense fallback={<EditorLoadingFallback />}>
          <EditorShell projectId={route.projectId} />
        </Suspense>
      </ProjectAccessGate>
    );
  }
  if (route.name === "project-request") return <ProjectAccessRequestPage projectId={route.projectId} />;
  if (route.name === "rehearsal") {
    return (
      <RehearsalWorkspace
        projectId={route.projectId}
        fallbackDeck={route.projectId === demoIds.projectId ? demoDeck : undefined}
      />
    );
  }
  if (route.name === "rehearsal-report") {
    return <RehearsalReportPage projectId={route.projectId} runId={route.runId} />;
  }
  if (route.name === "report-mockup") {
    return (
      <RehearsalReportPage
        initialDeck={demoDeck}
        initialReport={reportMockupReport}
        initialRun={reportMockupRun}
        projectId={demoIds.projectId}
        runId={reportMockupRunId}
      />
    );
  }
  return <HomePage user={user} />;
}

function AppFrame(props: {
  children: ReactNode;
  isAuthenticated: boolean;
  route: Route;
  user?: AuthUser;
}) {
  const { children, isAuthenticated, route, user } = props;
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const activeProjectId =
    route.name === "project-editor" ||
    route.name === "project-request" ||
    route.name === "rehearsal" ||
    route.name === "rehearsal-report"
      ? route.projectId
      : demoIds.projectId;
  const isHomeDashboard = route.name === "home";
  const userLabel = user ? getUserLabel(user) : "로그인";
  const userInitial = user ? getUserInitial(user) : "U";

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await fetch("/api/v1/auth/logout", {
        credentials: "include",
        method: "POST"
      });
      queryClient.setQueryData(["auth", "me"], undefined);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigateTo("/login");
    } finally {
      setIsLoggingOut(false);
    }
  }
  return (
    <main
      className={`orbit-layout orbit-product-shell orbit-headerless-shell${
        isHomeDashboard ? " orbit-home-shell" : ""
      }`}
    >
      <div className="orbit-product-body">
        <aside className="orbit-product-nav" aria-label="Orbit navigation">
          <button
            className="orbit-product-nav-brand"
            type="button"
            onClick={() => navigateTo("/")}
            aria-label="Orbit AI 홈"
          >
            <img alt="Orbit" className="brand-mark" src={orbitLogo} />
          </button>
          <SidebarButton
            active={route.name === "home"}
            icon={<Home size={15} />}
            label="홈"
            onClick={() => navigateTo("/")}
          />
          <SidebarButton
            active={
              route.name === "project-list" ||
              route.name === "project-editor" ||
              route.name === "project-request"
            }
            icon={<FolderOpen size={15} />}
            label="프로젝트 목록"
            onClick={() => navigateTo("/project")}
          />
          <SidebarButton
            active={route.name === "create-deck"}
            icon={<Sparkles size={15} />}
            label="AI 덱 생성"
            onClick={() => navigateTo("/createdeck")}
          />
          <SidebarButton
            active={route.name === "rehearsal" || route.name === "rehearsal-report"}
            icon={<Monitor size={15} />}
            label="리허설 시작"
            onClick={() => navigateTo(`/rehearsal/${activeProjectId}`)}
          />
          <div className="orbit-product-nav-account">
            {isAuthenticated ? (
              <>
                <div className="report-user-trigger" aria-label="현재 사용자">
                  <span className="report-avatar" aria-hidden="true">{userInitial}</span>
                  <span>{userLabel}</span>
                </div>
                <button
                  className="orbit-product-nav-logout"
                  type="button"
                  disabled={isLoggingOut}
                  onClick={() => void handleLogout()}
                >
                  <LogOut size={16} />
                  {isLoggingOut ? "로그아웃 중" : "로그아웃"}
                </button>
              </>
            ) : (
              <button
                className="orbit-product-nav-logout"
                type="button"
                onClick={() => navigateTo("/login")}
              >
                <LogIn size={16} />
                로그인
              </button>
            )}
          </div>
        </aside>
        <section className="orbit-page">{children}</section>
      </div>
    </main>
  );
}

function SidebarButton(props: {
  active: boolean;
  icon: ReactNode;
  detail?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={props.active ? "rehearsal-report-nav-item active" : "rehearsal-report-nav-item"}
      type="button"
      onClick={props.onClick}
    >
      <strong>
        {props.icon}
        {props.label}
      </strong>
      {props.detail ? <span>{props.detail}</span> : null}
    </button>
  );
}

function getUserInitial(user: AuthUser) {
  const source = user.displayName?.trim() || getUserLabel(user) || "U";
  return source.slice(0, 1).toUpperCase();
}

function getUserLabel(user: AuthUser) {
  return user.email?.trim() || user.userId;
}

function LoginPage(props: { isAuthenticated: boolean }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1/auth/${mode}`, {
        body: JSON.stringify({ email, password }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(await readAuthError(response));
      }

      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigateTo("/");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : mode === "register"
            ? "회원가입에 실패했습니다."
            : "로그인에 실패했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-page">
      <form className="login-card" onSubmit={handleLogin}>
        <img alt="Orbit" src={orbitLogo} />
        <h1>{mode === "register" ? "회원가입" : "로그인"}</h1>
        <p>
          {mode === "register"
            ? "처음 사용하는 환경이라면 계정을 먼저 생성하세요."
            : "계정으로 로그인하면 Orbit 작업 공간으로 이동합니다."}
        </p>
        <div className="login-mode-switch" role="tablist" aria-label="인증 방식">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            회원가입
          </button>
        </div>
        <label>
          <span>이메일</span>
          <input
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@orbit.dev"
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          <span>비밀번호</span>
          <input
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            required
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "register"
              ? "가입 중..."
              : "로그인 중..."
            : mode === "register"
              ? "계정 만들기"
              : "로그인"}
        </button>
      </form>
      {props.isAuthenticated ? (
        <button
          className="login-next-button"
          type="button"
          onClick={() => navigateTo("/")}
          aria-label="다음 화면으로 이동"
          title="다음 화면으로 이동"
        >
          <ArrowRight size={34} strokeWidth={2.4} />
        </button>
      ) : null}
    </section>
  );
}

async function readAuthError(response: Response) {
  const fallback = "로그인에 실패했습니다.";
  const text = await response.text();
  if (!text) return fallback;

  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.join(", ");
  } catch {
    return text;
  }

  return fallback;
}

async function readApiError(response: Response, fallback: string) {
  const text = await response.text();
  if (!text) return fallback;

  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.join(", ");
    if (typeof body.error === "string") return body.error;
  } catch {
    return text;
  }

  return fallback;
}

function ProjectAccessGate(props: { children: ReactNode; projectId: string }) {
  const access = useQuery({
    queryKey: ["project-access", props.projectId],
    queryFn: () => fetchProjectAccess(props.projectId),
    retry: false
  });

  useEffect(() => {
    const membership = access.data?.membership;
    if (access.isSuccess && membership?.status !== "accepted") {
      navigateTo(`/project/${encodeURIComponent(props.projectId)}/request`);
    }
  }, [access.data?.membership, access.isSuccess, props.projectId]);

  if (access.isLoading) return <EditorLoadingFallback />;
  if (access.isError) return <ProjectAccessError onRetry={() => void access.refetch()} />;
  if (access.data?.membership?.status !== "accepted") return <EditorLoadingFallback />;

  return <>{props.children}</>;
}

function ProjectAccessError(props: { onRetry: () => void }) {
  return (
    <section className="project-request-page">
      <article className="project-request-card">
        <span className="eyebrow">Project access</span>
        <h1>프로젝트 권한을 확인하지 못했습니다.</h1>
        <p>잠시 후 다시 시도하거나 프로젝트 소유자에게 권한 상태를 확인해 주세요.</p>
        <button type="button" onClick={props.onRetry}>
          다시 확인
        </button>
      </article>
    </section>
  );
}

function ProjectAccessRequestPage(props: { projectId: string }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Exclude<ProjectMemberRole, "owner">>("editor");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const access = useQuery({
    queryKey: ["project-access", props.projectId],
    queryFn: () => fetchProjectAccess(props.projectId),
    retry: false
  });

  const membership = access.data?.membership;

  useEffect(() => {
    if (membership?.status === "accepted") {
      navigateTo(`/project/${encodeURIComponent(props.projectId)}`);
    }
  }, [membership?.status, props.projectId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await requestProjectAccess(props.projectId, role);
      queryClient.setQueryData(["project-access", props.projectId], response);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "프로젝트 권한 요청에 실패했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (access.isLoading) return <EditorLoadingFallback />;

  if (membership?.status === "pending") {
    return (
      <section className="project-request-page">
        <article className="project-request-card">
          <span className="eyebrow">Project access</span>
          <h1>권한 요청을 보냈습니다.</h1>
          <p>
            프로젝트 소유자가 요청을 확인하고 있습니다. 승인되면 이 프로젝트에
            접근할 수 있습니다.
          </p>
          <dl className="project-request-meta">
            <div>
              <dt>요청 권한</dt>
              <dd>{membership.role}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>대기 중</dd>
            </div>
          </dl>
        </article>
      </section>
    );
  }

  return (
    <section className="project-request-page">
      <form className="project-request-card" onSubmit={handleSubmit}>
        <span className="eyebrow">Project access</span>
        <h1>프로젝트 접근 권한이 필요합니다.</h1>
        <p>
          이 프로젝트는 승인된 사용자만 열 수 있습니다. 필요한 권한을 선택해서
          프로젝트 소유자에게 요청하세요.
        </p>
        <div className="project-request-options" role="radiogroup" aria-label="요청 권한">
          <label className={role === "editor" ? "active" : ""}>
            <input
              checked={role === "editor"}
              name="project-role"
              onChange={() => setRole("editor")}
              type="radio"
              value="editor"
            />
            <strong>editor</strong>
            <span>프로젝트를 열고 슬라이드를 수정할 수 있습니다.</span>
          </label>
          <label className={role === "viewer" ? "active" : ""}>
            <input
              checked={role === "viewer"}
              name="project-role"
              onChange={() => setRole("viewer")}
              type="radio"
              value="viewer"
            />
            <strong>viewer</strong>
            <span>프로젝트 내용을 읽고 확인할 수 있습니다.</span>
          </label>
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "요청 중..." : "권한 요청하기"}
        </button>
      </form>
    </section>
  );
}

function HomePage(props: { user?: AuthUser }) {
  return (
    <section className="home-page">
      <header className="page-heading">
        <h1>{props.user?.displayName ?? "Orbit"} 작업 공간</h1>
      </header>

      <section className="home-chat-panel" aria-label="AI 대화">
        <div className="chat-orb">
          <MessageSquareText size={30} />
        </div>
        <h2>무엇을 발표 자료로 만들까요?</h2>
        <div className="chat-input-shell">
          <input placeholder="발표 주제, 자료 구성, 슬라이드 방향을 입력하세요" />
          <button type="button">전송</button>
        </div>
        <button className="link-action" type="button" onClick={() => navigateTo("/upload")}>
          기존 PPT 사용하기
        </button>
      </section>

      <TemplateRail title="최근 열어본 템플릿" />
    </section>
  );
}

function ProjectListPage() {
  const [isCreating, setIsCreating] = useState(false);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
    retry: false
  });

  async function handleCreateProject() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const project = await createProject("새 프레젠테이션");
      await projects.refetch();
      navigateTo(`/project/${project.projectId}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="project-page">
      <header className="page-heading row">
        <div>
          <span>프로젝트</span>
          <h1>프로젝트 불러오기</h1>
        </div>
        <button type="button" className="ghost-button" onClick={() => void projects.refetch()}>
          <Search size={16} />
          새로고침
        </button>
      </header>

      <TemplateRail title="템플릿" onCreateProject={handleCreateProject} isCreating={isCreating} />

      <section className="project-history">
        <div className="section-heading">
          <h2>최근 에디팅한 프로젝트</h2>
          <span>{projects.data?.length ?? 0}개</span>
        </div>
        {projects.isLoading ? <p className="empty-state">프로젝트를 불러오는 중입니다.</p> : null}
        {projects.isError ? <p className="empty-state">프로젝트 목록을 불러오지 못했습니다.</p> : null}
        <div className="project-grid">
          {(projects.data ?? []).map((project) => (
            <ProjectCard key={project.projectId} project={project} />
          ))}
        </div>
      </section>
    </section>
  );
}

function TemplateRail(props: {
  title: string;
  isCreating?: boolean;
  onCreateProject?: () => void;
}) {
  return (
    <section className="template-section">
      <div className="section-heading">
        <h2>{props.title}</h2>
      </div>
      <div className="template-row">
        <button
          className="new-template-card"
          type="button"
          onClick={props.onCreateProject ?? (() => navigateTo("/project"))}
          disabled={props.isCreating}
        >
          <Plus size={28} />
          <span>새 프레젠테이션</span>
        </button>
        {templates.slice(1).map((template) => (
          <button className="template-card" type="button" key={template.id}>
            <LayoutTemplate size={18} />
            <strong>{template.title}</strong>
            <span>{template.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProjectCard(props: { project: Project }) {
  const createdAt = new Date(props.project.createdAt);
  return (
    <button
      className="project-card"
      type="button"
      onClick={() => navigateTo(`/project/${props.project.projectId}`)}
    >
      <div className="project-thumb">
        <span />
      </div>
      <strong>{props.project.title}</strong>
      <span>
        {Number.isNaN(createdAt.getTime())
          ? props.project.projectId
          : createdAt.toLocaleDateString("ko-KR")}
      </span>
    </button>
  );
}

function GenerateDeckView() {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("AI 덱 생성 파이프라인");
  const [prompt, setPrompt] = useState("참고자료를 바탕으로 발표 흐름과 핵심 메시지를 정리");
  const [designPrompt, setDesignPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [minSlides, setMinSlides] = useState(5);
  const [maxSlides, setMaxSlides] = useState(8);
  const [template, setTemplate] = useState("report");
  const [audience, setAudience] = useState("general");
  const [purpose, setPurpose] = useState("inform");
  const [tone, setTone] = useState("professional");
  const [designProfile, setDesignProfile] =
    useState<NonNullable<GenerateDeckDesignDirection["profile"]>>("executive-report");
  const [visualRhythm, setVisualRhythm] =
    useState<GenerateDeckDesignDirection["visualRhythm"]>("auto");
  const [densityTarget, setDensityTarget] =
    useState<GenerateDeckDesignDirection["densityTarget"]>("medium");
  const [mediaPolicy, setMediaPolicy] =
    useState<GenerateDeckDesignDirection["mediaPolicy"]>("balanced");
  const [layoutDiversity, setLayoutDiversity] =
    useState<GenerateDeckDesignDirection["layoutDiversity"]>("varied");
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<
    "idle" | "extracting" | "generating"
  >("idle");
  const [generateError, setGenerateError] = useState("");
  const [extractJob, setExtractJob] = useState<Job | null>(null);
  const [generateJob, setGenerateJob] = useState<Job | null>(null);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [result, setResult] = useState<GenerateDeckJobResult | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("AI 생성 발표자료");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const projectsQuery = useQuery({
    queryKey: ["projects", "generate-deck"],
    queryFn: () => fetchProjects(),
    retry: false
  });
  const totalSize = useMemo(
    () => uploads.reduce((sum, upload) => sum + upload.file.size, 0),
    [uploads]
  );
  const referenceSummary = useMemo(
    () => buildReferenceGenerationInput(extractedFiles),
    [extractedFiles]
  );

  const handleCreateProject = async () => {
    const trimmedTitle = newProjectTitle.trim();
    if (!trimmedTitle || isCreatingProject) {
      return;
    }

    setIsCreatingProject(true);
    setProjectError("");

    try {
      const project = await createProject(trimmedTitle);
      setSelectedProjectId(project.projectId);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await projectsQuery.refetch();
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "프로젝트를 만들지 못했습니다."
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  const addFiles = (fileList: FileList | File[]) => {
    const { acceptedFiles, rejectedFiles } = collectUploadFiles(fileList);

    setUploads((current) => appendUniqueUploads(current, acceptedFiles));
    setRejected(rejectedFiles);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files);
    }

    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const removeUpload = (id: string) => {
    setUploads((current) => current.filter((upload) => upload.id !== id));
    setExtractedFiles([]);
    setExtractJob(null);
    setGenerateError("");
  };

  const extractReferences = async (
    projectId: string
  ): Promise<ReferenceGenerationInput> => {
    if (uploads.length === 0) {
      return {
        references: [],
        referenceKeywords: [],
        succeededFiles: [],
        failedFiles: []
      };
    }

    const formData = new FormData();
    formData.append("projectId", projectId);
    uploads.forEach(({ file }) => formData.append("files", file));

    setGenerationStep("extracting");
    setExtractJob(null);
    setExtractedFiles([]);

    const response = await fetch("/api/extract", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "참고자료 처리에 실패했습니다.");
    }

    const data = (await response.json()) as ExtractResponse;
    setExtractJob(data.job);

    const job = await pollExtractJob(data.job.jobId, {
      onUpdate: setExtractJob
    });

    if (job.status === "failed") {
      throw new Error(
        job.error?.message || job.message || "참고자료 처리에 실패했습니다."
      );
    }

    const files = getJobResultFiles(job);
    setExtractedFiles(files);
    const input = buildReferenceGenerationInput(files);
    if (input.references.length === 0) {
      throw new Error("참고자료 처리에 성공한 파일이 없어 덱 생성을 중단했습니다.");
    }

    return input;
  };

  const generateDeck = async () => {
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerationStep("idle");
    setGenerateError("");
    setProjectError("");
    setExtractJob(null);
    setGenerateJob(null);
    setExtractedFiles([]);
    setResult(null);

    try {
      const targetProject = await resolveGenerateDeckTargetProject({
        projects: projectsQuery.data ?? [],
        selectedProjectId,
        topic
      });
      const referenceInput = await extractReferences(targetProject.projectId);
      setGenerationStep("generating");
      const payload = buildGenerateDeckPayload({
        topic,
        prompt,
        designPrompt,
        duration,
        minSlides,
        maxSlides,
        template,
        metadata: { audience, purpose, tone },
        design: {
          profile: designProfile,
          visualRhythm,
          densityTarget,
          mediaPolicy,
          layoutDiversity
        },
        referenceInput
      });
      const response = await fetch(
        `/api/v1/projects/${targetProject.projectId}/jobs/generate-deck`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "AI 덱 생성에 실패했습니다.");
      }

      const data = (await response.json()) as GenerateDeckResponse;
      setGenerateJob(data.job);

      const job = await pollExtractJob(data.job.jobId, {
        onUpdate: setGenerateJob
      });

      if (job.status === "failed") {
        throw new Error(job.error?.message || job.message || "AI 덱 생성에 실패했습니다.");
      }

      const generatedResult = getGenerateDeckJobResult(job);
      if (!generatedResult) {
        throw new Error("AI 덱 생성 결과를 읽지 못했습니다.");
      }

      setResult(generatedResult);
      if (targetProject.created && targetProject.project) {
        queryClient.setQueryData<Project[]>(["projects"], (current) =>
          mergeGeneratedProjectList(current, targetProject.project as Project)
        );
      }
      queryClient.setQueryData(["deck", generatedResult.deck.projectId], generatedResult.deck);
      navigateTo(getGeneratedDeckProjectPath(generatedResult));
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "AI 덱 생성에 실패했습니다."
      );
    } finally {
      setIsGenerating(false);
      setGenerationStep("idle");
    }
  };
  const submitLabel =
    generationStep === "extracting"
      ? "참고자료 처리 중..."
      : generationStep === "generating"
        ? "덱 생성 중..."
        : "덱 생성";

  return (
    <main className="app-shell generate-app-shell">
      <section className="generate-layout" aria-labelledby="generate-title">
        <form
          className="generate-form"
          onSubmit={(event) => {
            event.preventDefault();
            void generateDeck();
          }}
        >
          <div className="panel-copy">
            <span className="eyebrow">Orbit issue #26</span>
            <h1 id="generate-title">AI 덱 생성</h1>
          </div>

          <section className="generate-reference-panel" aria-labelledby="generate-project-title">
            <div className="reference-panel-heading">
              <span className="eyebrow" id="generate-project-title">
                Target project
              </span>
              <p>AI 생성 결과를 저장하고 바로 에디터에서 열 프로젝트</p>
            </div>

            <label>
              <span>Project</span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                disabled={isGenerating || projectsQuery.isLoading}
              >
                <option value="">프로젝트 선택</option>
                {(projectsQuery.data ?? []).map((project) => (
                  <option key={project.projectId} value={project.projectId}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-grid">
              <label>
                <span>New project</span>
                <input
                  value={newProjectTitle}
                  onChange={(event) => setNewProjectTitle(event.target.value)}
                  disabled={isGenerating || isCreatingProject}
                  placeholder="AI 생성 발표자료"
                />
              </label>
            </div>

            <button
              className="extract-button"
              type="button"
              onClick={() => void handleCreateProject()}
              disabled={isGenerating || isCreatingProject || !newProjectTitle.trim()}
            >
              {isCreatingProject ? "프로젝트 생성 중..." : "새 프로젝트 만들고 선택"}
            </button>

            {projectsQuery.isError ? (
              <div className="rejection-list" role="alert">
                <p>프로젝트 목록을 불러오지 못했습니다.</p>
              </div>
            ) : null}

            {projectError ? (
              <div className="rejection-list" role="alert">
                <p>{projectError}</p>
              </div>
            ) : null}
          </section>

          <label>
            <span>Topic</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} />
          </label>

          <label>
            <span>내용</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="예: 테트리스의 역사, 기본 규칙, 유명한 전략을 소개하는 발표자료"
            />
          </label>

          <div className="form-grid">
            <label>
              <span>Duration</span>
              <input
                min={1}
                max={120}
                type="number"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Min slides</span>
              <input
                min={1}
                max={20}
                type="number"
                value={minSlides}
                onChange={(event) => setMinSlides(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Max slides</span>
              <input
                min={1}
                max={20}
                type="number"
                value={maxSlides}
                onChange={(event) => setMaxSlides(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="form-grid">
            <SelectField
              label="Template"
              value={template}
              onChange={setTemplate}
              options={["default", "pitch", "report", "lesson"]}
            />
            <SelectField
              label="Audience"
              value={audience}
              onChange={setAudience}
              options={["general", "executive", "technical", "sales"]}
            />
            <SelectField
              label="Purpose"
              value={purpose}
              onChange={setPurpose}
              options={["inform", "persuade", "teach", "report"]}
            />
          </div>

          <div className="form-grid">
            <SelectField
              label="Tone"
              value={tone}
              onChange={setTone}
              options={["professional", "friendly", "confident", "concise"]}
            />
          </div>

          <section
            className="generate-reference-panel"
            aria-labelledby="generate-design-title"
          >
            <div className="reference-panel-heading">
              <span className="eyebrow" id="generate-design-title">
                Design Direction
              </span>
            </div>

            <label>
              <span>디자인 방향</span>
              <textarea
                value={designPrompt}
                onChange={(event) => setDesignPrompt(event.target.value)}
                placeholder="예: 테트리스 색감, 고전 게임, 픽셀 아트 느낌"
              />
            </label>

            <div className="form-grid">
              <SelectField
                label="Profile"
                value={designProfile}
                onChange={(value) =>
                  setDesignProfile(value as NonNullable<GenerateDeckDesignDirection["profile"]>)
                }
                options={[
                  "executive-report",
                  "startup-pitch",
                  "editorial",
                  "technical",
                  "training"
                ]}
              />
              <SelectField
                label="Visual rhythm"
                value={visualRhythm}
                onChange={(value) =>
                  setVisualRhythm(value as GenerateDeckDesignDirection["visualRhythm"])
                }
                options={["auto", "clean", "editorial", "bold", "technical"]}
              />
              <SelectField
                label="Density"
                value={densityTarget}
                onChange={(value) =>
                  setDensityTarget(value as GenerateDeckDesignDirection["densityTarget"])
                }
                options={["low", "medium", "high"]}
              />
            </div>

            <div className="form-grid">
              <SelectField
                label="Media"
                value={mediaPolicy}
                onChange={(value) =>
                  setMediaPolicy(value as GenerateDeckDesignDirection["mediaPolicy"])
                }
                options={["avoid", "balanced", "placeholder-ok"]}
              />
              <SelectField
                label="Layout diversity"
                value={layoutDiversity}
                onChange={(value) =>
                  setLayoutDiversity(value as GenerateDeckDesignDirection["layoutDiversity"])
                }
                options={["stable", "varied"]}
              />
            </div>
          </section>

          <section
            className="generate-reference-panel"
            aria-labelledby="generate-reference-title"
          >
            <div className="reference-panel-heading">
              <span className="eyebrow" id="generate-reference-title">
                References
              </span>
              <p>PDF, DOCX, PPTX와 이미지 파일</p>
            </div>

            <label
              className={`drop-zone${isDragging ? " is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept={accept} multiple onChange={handleFileChange} />
              <span className="upload-mark" aria-hidden="true">
                +
              </span>
              <span className="drop-title">파일을 끌어오거나 선택하세요</span>
              <span className="drop-meta">PDF · DOCX · PPTX · JPG · PNG · GIF · WEBP</span>
            </label>

            <div className="upload-summary" aria-live="polite">
              <span>{uploads.length}개 파일</span>
              <span>{formatBytes(totalSize)}</span>
            </div>

            {rejected.length > 0 && (
              <div className="rejection-list" role="alert">
                {rejected.map((file) => (
                  <p key={file.name}>
                    <strong>{file.name}</strong> {file.reason}
                  </p>
                ))}
              </div>
            )}

            {uploads.length > 0 && (
              <ul className="file-list" aria-label="덱 생성 참고자료 파일">
                {uploads.map(({ id, file }) => (
                  <li key={id}>
                    <div>
                      <span className="file-name">{file.name}</span>
                      <span className="file-detail">
                        {getExtension(file.name).toUpperCase()} · {formatBytes(file.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUpload(id)}
                      aria-label={`${file.name} 제거`}
                      disabled={isGenerating}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button className="extract-button" type="submit" disabled={isGenerating}>
            {isGenerating ? submitLabel : "덱 생성"}
          </button>

          {extractJob && (
            <div className="job-status" aria-live="polite">
              <div>
                <strong>reference {extractJob.status}</strong>
                <span>{extractJob.progress}%</span>
              </div>
              {extractJob.message && <p>{extractJob.message}</p>}
            </div>
          )}

          {extractedFiles.length > 0 && (
            <div className="job-status" aria-live="polite">
              <p>
                참고자료 {referenceSummary.succeededFiles.length}개 사용
                {referenceSummary.failedFiles.length > 0
                  ? ` · ${referenceSummary.failedFiles.length}개 실패`
                  : ""}
              </p>
            </div>
          )}

          {generateJob && (
            <div className="job-status" aria-live="polite">
              <div>
                <strong>deck {generateJob.status}</strong>
                <span>{generateJob.progress}%</span>
              </div>
              {generateJob.message && <p>{generateJob.message}</p>}
            </div>
          )}

          {generateError && (
            <div className="rejection-list" role="alert">
              <p>{generateError}</p>
            </div>
          )}
        </form>

        <section className="generate-result" aria-live="polite">
          {result ? <GeneratedDeckResult result={result} /> : <DeckPreviewPlaceholder />}
        </section>
      </section>
    </main>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}


function DeckPreviewPlaceholder() {
  return (
    <div className="deck-preview-placeholder">
      <Sparkles size={28} />
      <span>AI deck</span>
    </div>
  );
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function isAllowedFile(file: File) {
  const extension = getExtension(file.name);
  const isAllowedDocument =
    allowedExtensions.includes(extension) && allowedMimeTypes.has(file.type);
  const isImage = file.type.startsWith(imagePrefix);

  return isAllowedDocument || isImage;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function createUploadId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function collectUploadFiles(fileList: FileList | File[]) {
  const acceptedFiles: UploadFile[] = [];
  const rejectedFiles: RejectedFile[] = [];

  Array.from(fileList).forEach((file) => {
    if (isAllowedFile(file)) {
      acceptedFiles.push({ id: createUploadId(file), file });
      return;
    }

    rejectedFiles.push({
      name: file.name,
      reason: "PDF, DOCX, PPTX 또는 이미지 파일만 업로드할 수 있습니다."
    });
  });

  return { acceptedFiles, rejectedFiles };
}

function appendUniqueUploads(current: UploadFile[], acceptedFiles: UploadFile[]) {
  const existingIds = new Set(current.map((upload) => upload.id));
  const nextFiles = acceptedFiles.filter((upload) => !existingIds.has(upload.id));

  return [...current, ...nextFiles];
}
function EditorLoadingFallback() {
  return (
    <section className="loading-page">
      <h1>에디터를 불러오는 중</h1>
    </section>
  );
}
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

export function getGenerateDeckJobResult(job: Job): GenerateDeckJobResult | null {
  const result = job.result as GenerateDeckJobResult | null;
  return result?.deck ? result : null;
}

export function getGeneratedDeckProjectPath(result: GenerateDeckJobResult) {
  return `/project/${encodeURIComponent(result.deck.projectId)}`;
}

export function getGeneratedDeckProjectTitle(topic: string) {
  return topic.trim() || "AI 덱";
}

export function createGeneratedDeckProject(topic: string, fetcher: Fetcher = fetch) {
  return createProject(getGeneratedDeckProjectTitle(topic), fetcher);
}

export async function resolveGenerateDeckTargetProject(args: {
  fetcher?: Fetcher;
  projects: Project[];
  selectedProjectId: string;
  topic: string;
}): Promise<GenerateDeckTargetProject> {
  const selectedProjectId = args.selectedProjectId.trim();
  if (selectedProjectId) {
    return {
      created: false,
      project:
        args.projects.find((project) => project.projectId === selectedProjectId) ??
        null,
      projectId: selectedProjectId
    };
  }

  const project = await createGeneratedDeckProject(args.topic, args.fetcher);
  return { created: true, project, projectId: project.projectId };
}

export function buildGenerateDeckPayload(input: GenerateDeckPayloadInput) {
  return {
    topic: input.topic,
    prompt: input.prompt,
    designPrompt: input.designPrompt ?? "",
    targetDurationMinutes: input.duration,
    slideCountRange: { min: input.minSlides, max: input.maxSlides },
    template: input.template,
    metadata: input.metadata,
    design: input.design,
    references: input.referenceInput.references,
    referenceKeywords: input.referenceInput.referenceKeywords
  };
}

export function mergeGeneratedProjectList(
  current: Project[] | undefined,
  project: Project
) {
  return current?.some((item) => item.projectId === project.projectId)
    ? current
    : [project, ...(current ?? [])];
}

export function buildReferenceGenerationInput(
  files: ExtractedFile[]
): ReferenceGenerationInput {
  const references: Array<{ fileId: string }> = [];
  const referenceKeywords: Array<{ text: string }> = [];
  const succeededFiles: ExtractedFile[] = [];
  const failedFiles: ExtractedFile[] = [];
  const seenFileIds = new Set<string>();
  const seenKeywords = new Set<string>();

  for (const file of files) {
    const fileId = file.referenceDocumentId?.trim() ?? "";
    if (file.status.toLowerCase() !== "succeeded" || !fileId) {
      failedFiles.push(file);
      continue;
    }

    succeededFiles.push(file);
    if (!seenFileIds.has(fileId)) {
      seenFileIds.add(fileId);
      references.push({ fileId });
    }

    for (const keyword of file.keywords ?? []) {
      const text = keyword.keyword.trim();
      const key = text.toLowerCase();
      if (!text || seenKeywords.has(key)) continue;

      seenKeywords.add(key);
      referenceKeywords.push({ text });
    }
  }

  return { references, referenceKeywords, succeededFiles, failedFiles };
}

export function GeneratedDeckResult(props: { result: GenerateDeckJobResult }) {
  const { deck, validation, warnings } = props.result;

  return (
    <div className="generated-deck">
      <header className="result-heading">
        <div>
          <span>Generated deck</span>
          <h2>{deck.title}</h2>
        </div>
        <strong>{deck.slides.length} slides</strong>
      </header>
      {warnings.length > 0 ? <p>{warnings.join(" · ")}</p> : null}
      {validation.designIssues.length > 0 ? (
        <ul>
          {validation.designIssues.map((issue, index) => (
            <li key={`${issue.path}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      <p>validation {validation.passed ? "passed" : "failed"}</p>
      <div className="generated-slide-grid">
        {deck.slides.map((slide) => (
          <article key={slide.slideId} className="generated-slide-card">
            <GeneratedSlidePreview
              canvas={deck.canvas}
              elements={slide.elements}
              title={slide.title}
            />
            <strong>{slide.title}</strong>
            {slide.aiNotes?.sourceEvidence.length ? (
              <ul>
                {slide.aiNotes.sourceEvidence.map((evidence) => (
                  <li key={`${slide.slideId}-${evidence.fileId}`}>
                    {evidence.fileId}
                    {evidence.note ? ` 쨌 ${evidence.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function GeneratedSlidePreview(props: {
  canvas: { width: number; height: number };
  elements: DeckElement[];
  title: string;
}) {
  return (
    <div
      className="generated-slide-preview"
      aria-label={props.title}
      style={{ aspectRatio: `${props.canvas.width} / ${props.canvas.height}` }}
    >
      {props.elements
        .filter((element) => element.visible)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((element) => (
          <GeneratedSlideElement
            key={element.elementId}
            canvas={props.canvas}
            element={element}
          />
        ))}
    </div>
  );
}

function GeneratedSlideElement(props: {
  canvas: { width: number; height: number };
  element: DeckElement;
}) {
  const { canvas, element } = props;
  const baseStyle: CSSProperties = {
    left: `${(element.x / canvas.width) * 100}%`,
    top: `${(element.y / canvas.height) * 100}%`,
    width: `${(element.width / canvas.width) * 100}%`,
    height: `${(element.height / canvas.height) * 100}%`,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg)`,
    zIndex: element.zIndex
  };

  if (element.type === "text") {
    return (
      <div
        className="generated-slide-element generated-slide-text"
        style={{
          ...baseStyle,
          color: element.props.color,
          fontSize: `max(8px, ${(element.props.fontSize / canvas.width) * 100}cqw)`,
          fontWeight: element.props.fontWeight,
          lineHeight: element.props.lineHeight,
          textAlign: element.props.align
        }}
      >
        {element.props.text}
      </div>
    );
  }

  return <div className="generated-slide-element generated-slide-shape" style={baseStyle} />;
}

export function ExtractResultItem(props: { result: ExtractedFile }) {
  const { result } = props;

  return (
    <article className="result-item">
      <header>
        <h3>{result.fileName}</h3>
        <p>
          {result.kind.toUpperCase()} 쨌 {result.status}
        </p>
      </header>
      {result.indexingStatus ? (
        <p>
          {result.indexingStatus}
          {typeof result.chunkCount === "number" ? ` 쨌 ${result.chunkCount} chunks` : ""}
          {result.indexingMessage ? ` 쨌 ${result.indexingMessage}` : ""}
        </p>
      ) : null}
      <pre>{result.cleanedText || result.cleanupMessage || result.rawText}</pre>
      {result.keywords?.length ? (
        <ul>
          {result.keywords.map((keyword) => (
            <li key={`${result.fileName}-${keyword.keyword}`}>
              <strong>{keyword.keyword}</strong> {keyword.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
