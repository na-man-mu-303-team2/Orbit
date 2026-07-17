import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { forwardRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  App,
  deckRenderPayloadStorageKey,
  getProjectAccessRoleLabel,
  getProjectRouteCapability,
  getAppNavigationItem,
  getRoute,
  shouldRenderAppFrame,
  parseProjectAccessResponse,
  shouldWaitForAuthResolution
} from "./App";
import { OrbitAppHeader } from "./components/OrbitAppHeader";
import {
  OrbitAuthPage,
  OrbitPublicLandingPage,
  submitOrbitAuth
} from "./features/auth/OrbitAuthPage";
import { authMeQueryKey } from "./features/auth/auth-session";
import {
  OrbitProjectExplorer,
  OrbitWorkspaceHome
} from "./features/projects/OrbitProjectHub";

vi.mock("react-konva", () => {
  const Group = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>
  );
  const Stage = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>
  );
  const Text = ({ text }: { text?: string }) => <span>{text}</span>;

  return {
    Arrow: () => <span data-konva-arrow="true" />,
    Circle: () => <span data-konva-circle="true" />,
    Group,
    Image: () => <span data-konva-image="true" />,
    Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Line: () => <span data-konva-line="true" />,
    Rect: () => <span data-konva-rect="true" />,
    RegularPolygon: () => <span data-konva-polygon="true" />,
    Shape: () => <span data-konva-shape="true" />,
    Star: () => <span data-konva-star="true" />,
    Stage,
    Text
  };
});
describe("App shell routing", () => {
  it("모든 editor trust route를 같은 membership gate에 연결한다", () => {
    expect(getProjectRouteCapability({ name: "project-editor", projectId: "project-1" })).toBe(
      null,
    );
    expect(getProjectRouteCapability({ name: "project-brief", projectId: "project-1" })).toBe(
      null,
    );
    expect(getProjectRouteCapability({ name: "project-history", projectId: "project-1" })).toBe(
      null,
    );
    expect(getProjectRouteCapability({ name: "story-plan-review", projectId: "project-1", jobId: "job-1" })).toBe(
      "canUseAiMutations",
    );
    expect(getProjectRouteCapability({ name: "rehearsal", projectId: "project-1" })).toBe(
      "canStartPersonalRehearsal",
    );
    expect(getProjectRouteCapability({ name: "presentation", projectId: "project-1" })).toBe(
      "canCreatePresentationSession",
    );
  });

  it("access 응답의 project가 직접 route와 다르면 fail closed 처리한다", () => {
    expect(() =>
      parseProjectAccessResponse("project-1", {
        project: {
          projectId: "project-other",
          workspaceId: "workspace_demo_1",
          title: "다른 프로젝트",
          createdBy: "user_owner",
          createdAt: "2026-07-16T00:00:00.000Z",
        },
        membership: { role: "owner", status: "accepted" },
      }),
    ).toThrow("Project access response mismatch");
  });

  it("keeps the product navigation order and active state consistent", () => {
    const html = renderToStaticMarkup(
      <OrbitAppHeader
        activeItem="reports"
        isAuthenticated
        isLoggingOut={false}
        onLogout={() => undefined}
        onNavigate={() => undefined}
        userInitial="김"
        userLabel="kim@orbit.test"
      />
    );

    expect(html.indexOf(">홈<")).toBeLessThan(html.indexOf(">프로젝트<"));
    expect(html.indexOf(">프로젝트<")).toBeLessThan(html.indexOf(">리허설<"));
    expect(html.indexOf(">리허설<")).toBeLessThan(html.indexOf(">리포트<"));
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-haspopup="menu"');
  });

  it("resolves the header active item from production routes", () => {
    expect(getAppNavigationItem({ name: "home" })).toBe("home");
    expect(getAppNavigationItem({ name: "project-list" }, "")).toBe("project");
    expect(getAppNavigationItem({ name: "project-list" }, "?intent=rehearsal")).toBe(
      "rehearsal"
    );
    expect(getAppNavigationItem({ name: "report-list" })).toBe("reports");
    expect(getAppNavigationItem({ name: "create-deck" })).toBe("project");
  });

  it("keeps the login page outside the shared navigation shell", () => {
    expect(shouldRenderAppFrame({ name: "login" })).toBe(false);
    expect(shouldRenderAppFrame({ name: "signup" })).toBe(false);
    expect(
      shouldRenderAppFrame({
        name: "project-editor",
        projectId: "project_demo_1"
      })
    ).toBe(false);
    expect(
      shouldRenderAppFrame({
        name: "presentation",
        projectId: "project_demo_1"
      })
    ).toBe(false);
    expect(
      shouldRenderAppFrame({
        name: "rehearsal",
        projectId: "project_demo_1"
      })
    ).toBe(false);
    expect(
      shouldRenderAppFrame({
        name: "rehearsal-report",
        projectId: "project_demo_1",
        runId: "run_demo_1"
      })
    ).toBe(true);
    expect(
      shouldRenderAppFrame({
        name: "report-project-overview",
        projectId: "project_demo_1"
      })
    ).toBe(true);
    expect(
      shouldRenderAppFrame({
        name: "present",
        deckId: "deck_demo_1",
        sessionId: "session_demo_1"
      })
    ).toBe(false);
    expect(shouldRenderAppFrame({ name: "home" })).toBe(true);
  });

  it("renders public routes without waiting for the current-user request", () => {
    expect(shouldWaitForAuthResolution({ name: "login" })).toBe(false);
    expect(shouldWaitForAuthResolution({ name: "signup" })).toBe(false);
    expect(shouldWaitForAuthResolution({ name: "report-mockup" })).toBe(false);
    expect(shouldWaitForAuthResolution({ name: "not-found" })).toBe(false);
    expect(
      shouldWaitForAuthResolution({ name: "audience-session", sessionId: "session-1" })
    ).toBe(false);
    expect(
      shouldWaitForAuthResolution({
        name: "audience-activity",
        sessionId: "session-1",
        activityId: "activity-1"
      })
    ).toBe(false);
  });

  it("waits for authentication before rendering workspace routes", () => {
    expect(shouldWaitForAuthResolution({ name: "home" })).toBe(true);
    expect(shouldWaitForAuthResolution({ name: "project-list" })).toBe(true);
    expect(
      shouldWaitForAuthResolution({ name: "project-editor", projectId: "project-1" })
    ).toBe(true);
  });

  it("exposes the design-system preview outside the product shell", () => {
    const route = getRoute("/design-system");

    expect(route).toEqual({ name: "design-system" });
    expect(shouldRenderAppFrame(route)).toBe(false);
  });

  it("parses the isolated mockup flow routes outside the product shell", () => {
    expect(getRoute("/mockup")).toEqual({ name: "mockup", screen: "public" });
    expect(getRoute("/mockup/home")).toEqual({ name: "mockup", screen: "home" });
    expect(getRoute("/mockup/create")).toEqual({ name: "mockup", screen: "create" });
    expect(getRoute("/mockup/editor")).toEqual({ name: "mockup", screen: "editor" });
    expect(getRoute("/mockup/microphone-check")).toEqual({ name: "mockup", screen: "microphone-check" });
    expect(getRoute("/mockup/project-request")).toEqual({ name: "mockup", screen: "project-request" });
    expect(getRoute("/mockup/rehearsal")).toEqual({ name: "mockup", screen: "rehearsal" });
    expect(getRoute("/mockup/rehearsal-complete")).toEqual({ name: "mockup", screen: "rehearsal-complete" });
    expect(getRoute("/mockup/reports")).toEqual({ name: "mockup", screen: "reports" });
    expect(getRoute("/mockup/report")).toEqual({ name: "mockup", screen: "report" });
    expect(getRoute("/mockup/report-project")).toEqual({ name: "mockup", screen: "report-project" });
    expect(getRoute("/mockup/live")).toEqual({ name: "mockup", screen: "live" });
    expect(getRoute("/mockup/live-presenter")).toEqual({ name: "mockup", screen: "live-presenter" });
    expect(getRoute("/mockup/login")).toEqual({ name: "mockup", screen: "login" });
    expect(getRoute("/mockup/signup")).toEqual({ name: "mockup", screen: "signup" });
    expect(getRoute("/mockup/presenter")).toEqual({ name: "mockup", screen: "presenter" });
    expect(getRoute("/mockup/catalog")).toEqual({ name: "mockup", screen: "catalog" });
    expect(getRoute("/mockup/brief")).toEqual({ name: "mockup", screen: "brief" });
    expect(getRoute("/mockup/practice-plan")).toEqual({ name: "mockup", screen: "practice-plan" });
    expect(getRoute("/mockup/focused-practice")).toEqual({ name: "mockup", screen: "focused-practice" });
    expect(getRoute("/mockup/challenge-qna")).toEqual({ name: "mockup", screen: "challenge-qna" });
    expect(getRoute("/mockup/audience")).toEqual({ name: "mockup", screen: "audience" });
    expect(getRoute("/mockup/version-history")).toEqual({ name: "mockup", screen: "version-history" });
    expect(getRoute("/mockup/ai-ppt")).toEqual({ name: "not-found" });
    expect(shouldRenderAppFrame({ name: "mockup", screen: "public" })).toBe(false);
  });

  it("exposes separate production login and signup routes", () => {
    expect(getRoute("/login")).toEqual({ name: "login" });
    expect(getRoute("/signup")).toEqual({ name: "signup" });
  });

  it("parses the canonical direct audience activity route", () => {
    expect(getRoute("/audience/session_1/a/activity_1")).toEqual({
      name: "audience-activity",
      sessionId: "session_1",
      activityId: "activity_1"
    });
  });

  it("renders the production AI PPT wizard from the createdeck route", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authMeQueryKey, {
      userId: "user_demo_1",
      email: "demo@orbit.test"
    });
    vi.stubGlobal("window", {
      location: { pathname: "/createdeck", search: "" }
    });

    try {
      expect(getRoute()).toEqual({ name: "create-deck" });
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      );

      expect(html).toContain("발표 내용부터 빠르게 시작하세요");
      expect(html).toContain("Style &amp; Color");
    } finally {
      vi.unstubAllGlobals();
      queryClient.clear();
    }
  });

  it("parses project brief and version history production routes", () => {
    expect(getRoute("/project/project_demo_1/brief")).toEqual({
      name: "project-brief",
      projectId: "project_demo_1"
    });
    expect(getRoute("/project/project_demo_1/history")).toEqual({
      name: "project-history",
      projectId: "project_demo_1"
    });
    expect(
      getRoute(
        "/project/project_demo_1/presentation-sessions/session_demo_1/results",
      ),
    ).toEqual({
      name: "activity-results",
      projectId: "project_demo_1",
      sessionId: "session_demo_1",
    });
  });

  it("matches Story Review before the generic project route", () => {
    expect(getRoute("/project/project_demo_1/story-plan/job-1")).toEqual({
      name: "story-plan-review",
      projectId: "project_demo_1",
      jobId: "job-1",
    });
    expect(getRoute("/project/project_demo_1/style-color/job-1")).toEqual({
      name: "story-style-color",
      projectId: "project_demo_1",
      jobId: "job-1",
    });
    expect(getRoute("/project/project_demo_1/generation/job-1")).toEqual({
      name: "ai-deck-generation",
      projectId: "project_demo_1",
      jobId: "job-1",
    });
  });

  it("parses presenter slide-window routes with an optional session id", () => {
    expect(getRoute("/present/deck_demo_1", "?sessionId=session_demo_1")).toEqual({
      name: "present",
      deckId: "deck_demo_1",
      sessionId: "session_demo_1"
    });
    expect(getRoute("/present/deck_demo_1")).toEqual({
      name: "present",
      deckId: "deck_demo_1",
      sessionId: undefined
    });
  });

  it("parses presentation workspace routes", () => {
    expect(getRoute("/presentation/project_demo_1")).toEqual({
      name: "presentation",
      projectId: "project_demo_1"
    });
  });

  it("parses rehearsal presenter-window session query parameters", () => {
    expect(
      getRoute(
        "/rehearsal/project_demo_1",
        "?presenterSessionId=session-presenter-1&presenterWindow=1&slideIndex=2&stepIndex=1"
      )
    ).toEqual({
      name: "rehearsal",
      presenterInitialSlideIndex: 2,
      presenterInitialStepIndex: 1,
      presenterSessionId: "session-presenter-1",
      presenterWindow: true,
      projectId: "project_demo_1"
    });
  });

  it("keeps the deck render fixture outside the shared navigation shell", () => {
    const route = getRoute("/__deck-render");

    expect(route).toEqual({ name: "deck-render" });
    expect(shouldRenderAppFrame(route)).toBe(false);
    expect(deckRenderPayloadStorageKey).toBe("orbit.deckRenderPayload.v1");
  });

  it("does not expose the old upload workspace route", () => {
    expect(getRoute("/upload")).toEqual({ name: "not-found" });
  });

  it("returns a recoverable not-found route for unknown and malformed paths", () => {
    expect(getRoute("/missing-page")).toEqual({ name: "not-found" });
    expect(getRoute("/project/%E0%A4%A")).toEqual({ name: "not-found" });
  });

  it("preserves rehearsal intent in the project selection route", () => {
    expect(getRoute("/project", "?intent=rehearsal")).toEqual({
      name: "project-list",
      intent: "rehearsal"
    });
  });

  it("ignores the removed home template style query route", () => {
    expect(getRoute("/", "?templateStyle=presentation-document")).toEqual({
      name: "home"
    });
  });
});
describe("public and authentication surfaces", () => {
  it("renders the public landing conversion path without unsupported auth actions", () => {
    const html = renderToStaticMarkup(
      <OrbitPublicLandingPage onNavigate={() => undefined} />
    );

    expect(html).toContain("생각을 발표로 바꾸는 가장 빠른 캔버스");
    expect(html).toContain("무료로 발표 만들기");
    expect(html).toContain("생성");
    expect(html).toContain("편집");
    expect(html).toContain("리허설");
    expect(html).not.toContain("Google");
    expect(html).not.toContain("비밀번호를 잊으셨나요");
  });

  it("renders email/password-only login and signup forms", () => {
    const queryClient = new QueryClient();
    const loginHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <OrbitAuthPage isAuthenticated={false} mode="login" onNavigate={() => undefined} />
      </QueryClientProvider>
    );
    const signupHtml = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <OrbitAuthPage isAuthenticated={false} mode="register" onNavigate={() => undefined} />
      </QueryClientProvider>
    );

    expect(loginHtml).toContain("다시 만나서 반가워요.");
    expect(signupHtml).toContain("첫 발표를 시작해 볼까요?");
    expect(loginHtml).toContain('type="email"');
    expect(loginHtml).toContain('type="password"');
    expect(signupHtml).not.toContain("Google");
    expect(signupHtml).not.toContain('autocomplete="name"');
  });

  it("submits the existing auth contract and surfaces API errors", async () => {
    const successFetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await submitOrbitAuth({
      email: "kim@orbit.test",
      fetcher: successFetcher,
      mode: "login",
      password: "password123"
    });

    expect(successFetcher).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );

    const errorFetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "이메일 또는 비밀번호를 확인하세요." }), {
        status: 401
      })
    );
    await expect(
      submitOrbitAuth({
        email: "kim@orbit.test",
        fetcher: errorFetcher,
        mode: "register",
        password: "password123"
      })
    ).rejects.toThrow("이메일 또는 비밀번호를 확인하세요.");
  });
});

describe("workspace project surfaces", () => {
  it("uses localized project access roles", () => {
    expect(getProjectAccessRoleLabel("owner")).toBe("소유자");
    expect(getProjectAccessRoleLabel("editor")).toBe("편집 가능");
    expect(getProjectAccessRoleLabel("viewer")).toBe("보기 전용");
  });

  it("keeps a single AI presentation primary action on workspace home", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <OrbitWorkspaceHome onNavigate={() => undefined} userName="지윤" />
      </QueryClientProvider>
    );

    expect(html).toContain("지윤님,");
    expect(html.match(/<button class="orbit-ds-button/g)).toHaveLength(1);
    expect(html).toContain("프로젝트를 불러오는 중입니다.");
    expect(html).toContain("리허설 시작하기");
  });

  it("renders search, sorting, refresh and creation controls in project explorer", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <OrbitProjectExplorer onNavigate={() => undefined} />
      </QueryClientProvider>
    );

    expect(html).toContain('aria-label="프로젝트 검색"');
    expect(html).toContain('aria-label="프로젝트 정렬"');
    expect(html).toContain('aria-label="프로젝트 새로고침"');
    expect(html).toContain("빈 프로젝트");
  });

  it("renders a dedicated rehearsal project picker without creation or delete actions", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <OrbitProjectExplorer intent="rehearsal" onNavigate={() => undefined} />
      </QueryClientProvider>
    );

    expect(html).toContain("리허설할 프로젝트 선택");
    expect(html).toContain("마이크 점검");
    expect(html).not.toContain("빈 프로젝트");
  });
});
