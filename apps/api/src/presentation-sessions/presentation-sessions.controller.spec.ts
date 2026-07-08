import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { PresentationSessionsController } from "./presentation-sessions.controller";
import { PresentationSessionsService } from "./presentation-sessions.service";

const features = {
  sessionId: "session_existing",
  qnaEnabled: false,
  aiQnaEnabled: false,
  pollsEnabled: true,
  quizzesEnabled: false,
  reactionsEnabled: false,
  surveyEnabled: false,
  updatedAt: "2026-07-05T00:04:00.000Z",
};

const realtimeState = {
  sessionId: "session_existing",
  slideId: "slide_2",
  slideIndex: 1,
  effectState: { stepIndex: 2 },
  activeInteractionId: "interaction_1",
  updatedAt: "2026-07-05T00:05:00.000Z",
};

function createController() {
  const auth = {
    me: vi.fn(async () => ({ user: { userId: "user_1" } })),
  };
  const service = {
    getAudienceFeatureSettings: vi.fn(async () => ({ features })),
    updateAudienceFeatureSettings: vi.fn(async () => ({ features })),
    startSession: vi.fn(async () => ({
      session: { sessionId: "session_existing" },
    })),
    endSession: vi.fn(async () => ({
      session: {
        sessionId: "session_existing",
        projectId: "project_1",
        presenterUserId: "user_1",
        joinCode: "123456",
        status: "ended",
        entryStatus: "closed",
      },
    })),
    exposeInteractionQuestionResults: vi.fn(async () => ({
      interaction: {
        interactionId: "interaction_1",
        exposedResultQuestionIds: ["question_1"],
      },
    })),
    touchAudienceRealtimeState: vi.fn(async () => realtimeState),
    getSessionSurveyForm: vi.fn(async () => ({ survey: null })),
    upsertSessionSurveyForm: vi.fn(async () => ({ survey: null })),
    exportSessionSurveyCsv: vi.fn(async () => "submittedAt,nickname\n"),
    getSessionResults: vi.fn(async () => ({
      report: {
        reportId: "audience_report_00000000-0000-4000-8000-000000000001",
        sessionId: "session_existing",
        status: "preliminary",
        aggregate: { qna: { total: 0, unanswered: 0 } },
        generatedAt: "2026-07-05T00:00:00.000Z",
        rawDataDeletedAt: null,
      },
      surveyResponses: [],
    })),
  } as unknown as PresentationSessionsService;
  const projects = {
    assertCanReadProject: vi.fn(async () => ({ projectId: "project_1" })),
    assertCanWriteProject: vi.fn(async () => ({ projectId: "project_1" })),
  };
  const audienceRealtimeGateway = {
    broadcastFeatureSettings: vi.fn(),
    broadcastSessionEnded: vi.fn(),
    broadcastSlideState: vi.fn(),
  };
  const controller = new PresentationSessionsController(
    auth as any,
    service,
    projects as any,
    audienceRealtimeGateway as any,
  );

  return { audienceRealtimeGateway, auth, controller, projects, service };
}

function createRequest(sessionId: string | false | undefined = "auth_1") {
  return {
    signedCookies: {
      orbit_session: sessionId,
    },
  } as any;
}

describe("PresentationSessionsController", () => {
  it("returns feature settings after project read permission", async () => {
    const { controller, projects, service } = createController();

    await expect(
      controller.getFeatureSettings(
        "project_1",
        "session_existing",
        createRequest(),
      ),
    ).resolves.toEqual({ features });

    expect(projects.assertCanReadProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.getAudienceFeatureSettings).toHaveBeenCalledWith(
      "project_1",
      "session_existing",
    );
  });

  it("updates feature settings after project write permission", async () => {
    const { audienceRealtimeGateway, controller, projects, service } =
      createController();

    await expect(
      controller.updateFeatureSettings(
        "project_1",
        "session_existing",
        { pollsEnabled: true },
        createRequest(),
      ),
    ).resolves.toEqual({ features });

    expect(projects.assertCanWriteProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.updateAudienceFeatureSettings).toHaveBeenCalledWith({
      projectId: "project_1",
      sessionId: "session_existing",
      actorId: "user_1",
      settings: { pollsEnabled: true },
    });
    expect(
      audienceRealtimeGateway.broadcastFeatureSettings,
    ).toHaveBeenCalledWith({
      sessionId: "session_existing",
      userId: "user_1",
      features,
    });
  });

  it("rejects invalid feature update bodies before service calls", async () => {
    const { controller, service } = createController();

    await expect(
      controller.updateFeatureSettings(
        "project_1",
        "session_existing",
        {},
        createRequest(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.updateAudienceFeatureSettings).not.toHaveBeenCalled();
  });

  it("rejects presenter feature endpoints without auth", async () => {
    const { controller, projects, service } = createController();

    await expect(
      controller.getFeatureSettings(
        "project_1",
        "session_existing",
        createRequest(false),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(projects.assertCanReadProject).not.toHaveBeenCalled();
    expect(service.getAudienceFeatureSettings).not.toHaveBeenCalled();
  });

  it("starts and ends sessions through presenter project write access", async () => {
    const { audienceRealtimeGateway, controller, projects, service } =
      createController();

    await expect(
      controller.startSession("project_1", "session_existing", createRequest()),
    ).resolves.toMatchObject({ session: { sessionId: "session_existing" } });
    await expect(
      controller.endSession("project_1", "session_existing", createRequest()),
    ).resolves.toMatchObject({ session: { status: "ended" } });

    expect(projects.assertCanWriteProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.startSession).toHaveBeenCalledWith({
      projectId: "project_1",
      sessionId: "session_existing",
      actorId: "user_1",
    });
    expect(audienceRealtimeGateway.broadcastSessionEnded).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session_existing" }),
    );
  });

  it("routes survey form and CSV presenter endpoints", async () => {
    const { controller, projects, service } = createController();

    await expect(
      controller.getSurveyForm("project_1", "session_existing", createRequest()),
    ).resolves.toEqual({ survey: null });
    await expect(
      controller.upsertSurveyForm(
        "project_1",
        "session_existing",
        { title: "설문", questions: [], contact: { enabled: false, consentText: "동의", fields: [] } },
        createRequest(),
      ),
    ).resolves.toEqual({ survey: null });
    await expect(
      controller.exportSurveyCsv(
        "project_1",
        "session_existing",
        createRequest(),
      ),
    ).resolves.toBe("submittedAt,nickname\n");

    expect(projects.assertCanReadProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.upsertSessionSurveyForm).toHaveBeenCalledWith({
      projectId: "project_1",
      sessionId: "session_existing",
      body: expect.objectContaining({ title: "설문" }),
    });
  });

  it("routes presenter results endpoint behind project read access", async () => {
    const { controller, projects, service } = createController();

    await expect(
      controller.getSessionResults(
        "project_1",
        "session_existing",
        createRequest(),
      ),
    ).resolves.toMatchObject({ report: { status: "preliminary" } });

    expect(projects.assertCanReadProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.getSessionResults).toHaveBeenCalledWith({
      projectId: "project_1",
      sessionId: "session_existing",
    });
  });

  it("broadcasts realtime state after manual interaction result exposure", async () => {
    const { audienceRealtimeGateway, controller, projects, service } =
      createController();

    await expect(
      controller.exposeInteractionQuestionResults(
        "project_1",
        "session_existing",
        "interaction_1",
        { questionId: "question_1", exposed: true },
        createRequest(),
      ),
    ).resolves.toMatchObject({
      interaction: { exposedResultQuestionIds: ["question_1"] },
    });

    expect(projects.assertCanWriteProject).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(service.exposeInteractionQuestionResults).toHaveBeenCalledWith({
      projectId: "project_1",
      sessionId: "session_existing",
      interactionId: "interaction_1",
      actorId: "user_1",
      body: { questionId: "question_1", exposed: true },
    });
    expect(service.touchAudienceRealtimeState).toHaveBeenCalledWith(
      "session_existing",
    );
    expect(audienceRealtimeGateway.broadcastSlideState).toHaveBeenCalledWith({
      sessionId: "session_existing",
      userId: "user_1",
      state: realtimeState,
    });
  });
});
