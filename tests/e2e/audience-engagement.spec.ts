import { expect, test, type Page } from "@playwright/test";

const now = "2026-07-05T00:00:00.000Z";
const session = {
  sessionId: "session_1",
  projectId: "project_1",
  joinCode: "123456",
  status: "live",
  entryStatus: "open",
};
const endedSession = {
  ...session,
  status: "ended",
  entryStatus: "closed",
};
const presenterSession = {
  ...session,
  deckId: "deck_1",
  presenterUserId: "user_1",
  audienceSlideRenderMode: "image-first",
  createdAt: now,
  startedAt: now,
  endedAt: null,
  surveyClosesAt: null,
  rawDataDeleteAfter: "2026-08-04T00:00:00.000Z",
};
const draftPresenterSession = {
  ...presenterSession,
  status: "draft",
  startedAt: null,
};
const participant = {
  audienceId: "audience_00000000-0000-4000-8000-000000000001",
  sessionId: "session_1",
  nickname: "orbit",
  joinedAt: now,
  lastSeenAt: now,
  joinedBeforeEnd: true,
};
const allFeatures = {
  sessionId: "session_1",
  qnaEnabled: true,
  aiQnaEnabled: true,
  pollsEnabled: true,
  quizzesEnabled: true,
  reactionsEnabled: true,
  surveyEnabled: true,
  updatedAt: now,
};
const pollInteraction = {
  interactionId: "interaction_00000000-0000-4000-8000-000000000001",
  sessionId: "session_1",
  kind: "poll",
  title: "만족도 투표",
  questions: [
    {
      type: "scale",
      questionId: "question_00000000-0000-4000-8000-000000000001",
      prompt: "발표 만족도를 골라 주세요.",
      required: true,
      min: 1,
      max: 5,
    },
  ],
  resultVisibility: "live",
  quizScoring: "none",
  source: "ad-hoc",
  order: 0,
  activatedAt: now,
  closedAt: null,
};
const quizInteraction = {
  ...pollInteraction,
  interactionId: "interaction_00000000-0000-4000-8000-000000000002",
  kind: "quiz",
  title: "이해도 퀴즈",
  questions: [
    {
      type: "quiz-true-false",
      questionId: "question_00000000-0000-4000-8000-000000000002",
      prompt: "청중은 로그인 없이 참여한다.",
      correctAnswer: true,
    },
  ],
  resultVisibility: "after-close",
  quizScoring: "correct-count",
};
const closedQuizInteraction = {
  ...quizInteraction,
  closedAt: now,
};
const manualPollInteraction = {
  ...pollInteraction,
  interactionId: "interaction_00000000-0000-4000-8000-000000000003",
  title: "수동 공개 투표",
  questions: [
    {
      type: "choice",
      questionId: "question_00000000-0000-4000-8000-000000000003",
      prompt: "결과를 공개할까요?",
      required: true,
      allowMultiple: false,
      options: [
        { optionId: "yes", label: "예" },
        { optionId: "no", label: "아니요" },
      ],
    },
  ],
  resultVisibility: "manual",
  exposedResultQuestionIds: [],
};
const preparedPollItem = {
  libraryInteractionId: "library_interaction_00000000-0000-4000-8000-000000000001",
  projectId: "project_1",
  kind: "poll",
  title: "준비된 투표",
  questions: [
    {
      type: "scale",
      questionId: "question_00000000-0000-4000-8000-000000000004",
      prompt: "만족도",
      required: true,
      min: 1,
      max: 5,
    },
  ],
  resultVisibility: "manual",
  quizScoring: "none",
  createdAt: now,
  updatedAt: now,
};
const preparedQuizItem = {
  libraryInteractionId: "library_interaction_00000000-0000-4000-8000-000000000002",
  projectId: "project_1",
  kind: "quiz",
  title: "준비된 퀴즈",
  questions: [
    {
      type: "quiz-true-false",
      questionId: "question_00000000-0000-4000-8000-000000000005",
      prompt: "확인 문제",
      correctAnswer: true,
      timeLimitSeconds: 30,
    },
  ],
  resultVisibility: "after-close",
  quizScoring: "speed-bonus",
  createdAt: now,
  updatedAt: now,
};
const referenceAsset = {
  fileId: "file_00000000-0000-4000-8000-000000000001",
  projectId: "project_1",
  originalName: "reference.pdf",
  mimeType: "application/pdf",
  size: 1200,
  url: "/api/v1/projects/project_1/assets/file_00000000-0000-4000-8000-000000000001/content",
  purpose: "reference-material",
  createdAt: now,
};
const snapshotAsset = {
  fileId: "file_00000000-0000-4000-8000-000000000002",
  projectId: "project_1",
  originalName: "snapshot.svg",
  mimeType: "image/svg+xml",
  size: 900,
  url: "/snapshot.svg",
  purpose: "audience-slide-snapshot",
  createdAt: now,
};

test.describe("audience engagement hardened smoke", () => {
  test("rejects duplicate nicknames and then restores a mobile live audience surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAudienceSession(page, { duplicateFirstNickname: true });

    await page.goto("/join/123456");
    await page.getByLabel("닉네임").fill("orbit");
    await page.getByRole("button", { name: "입장하기" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "이미 사용 중인 닉네임입니다.",
    );

    const startedAt = Date.now();
    await page.getByLabel("닉네임").fill("orbit2");
    await page.getByRole("button", { name: "입장하기" }).click();

    await expect(
      page.getByRole("heading", { name: "현재 슬라이드 1" }),
    ).toBeVisible();
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    await expect(page.getByLabel("활성 청중 기능")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("speakerNotes");
    await expect(page.locator("main")).not.toContainText("presenterScript");
    await expect(page.locator("main")).not.toContainText("rawAudio");
  });

  test("submits Q&A, poll, and reactions from the audience UI", async ({
    page,
  }) => {
    await mockAudienceSession(page, { interaction: pollInteraction });
    await page.goto("/join/123456");
    await joinAs(page, "orbit");

    await page.getByLabel("질문").fill("AI가 답할 수 있나요?");
    await page.getByRole("button", { name: "질문 보내기" }).click();
    await expect(
      page.getByText("근거가 부족해 발표자에게 전달했습니다."),
    ).toBeVisible();
    await page.getByRole("button", { name: "발표자에게 답변 요청" }).click();
    await expect(
      page.getByText("발표자 대기열에 질문을 전달했습니다."),
    ).toBeVisible();

    await page.getByLabel("1-5").fill("5");
    await page.getByRole("button", { name: "응답 제출" }).click();
    await expect(page.getByText("응답이 저장되었습니다.")).toBeVisible();

    await page.getByRole("button", { name: "박수 반응 보내기" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "반응을 보냈습니다." }),
    ).toBeVisible();
  });

  test("submits a quiz response from the audience UI", async ({ page }) => {
    await mockAudienceSession(page, { interaction: quizInteraction });
    await page.goto("/join/123456");
    await joinAs(page, "orbit");

    await page.getByLabel("참").check();
    await page.getByRole("button", { name: "퀴즈 제출" }).click();
    await expect(page.getByText("퀴즈 응답이 제출되었습니다.")).toBeVisible();
  });

  test("shows the audience quiz answer reveal after close", async ({ page }) => {
    await mockAudienceSession(page, {
      interaction: closedQuizInteraction,
      quizReveal: [
        {
          questionId: "question_00000000-0000-4000-8000-000000000002",
          correctAnswer: { type: "quiz-true-false", answer: true },
          submittedAnswer: { type: "quiz-true-false", answer: true },
          isCorrect: true,
          score: 1000,
        },
      ],
    });
    await page.goto("/join/123456");
    await joinAs(page, "orbit");

    await expect(page.getByText("퀴즈 결과가 공개되었습니다.")).toBeVisible();
    await expect(page.getByText("정답입니다.")).toBeVisible();
    await expect(page.getByText("1000")).toBeVisible();
  });

  test("renders the Deck JSON slide fallback when snapshots are unavailable", async ({
    page,
  }) => {
    await mockAudienceSession(page, {
      interaction: null,
      effectState: {
        stepIndex: 0,
        slideFallback: {
          slideIndex: 0,
          deck: {
            deckId: "deck_1",
            projectId: "project_1",
            title: "Audience Deck",
            version: 1,
            canvas: {
              preset: "wide-16-9",
              width: 1920,
              height: 1080,
              aspectRatio: "16:9",
            },
            slides: [
              {
                slideId: "slide_1",
                order: 1,
                title: "공개 슬라이드",
                style: {},
                elements: [
                  {
                    elementId: "el_1",
                    type: "text",
                    x: 120,
                    y: 160,
                    width: 800,
                    height: 120,
                    props: { text: "청중 공개 문장" },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    await page.goto("/join/123456");
    await joinAs(page, "orbit");

    await expect(page.locator(".slideshow-renderer")).toHaveAttribute(
      "data-slide-id",
      "slide_1",
    );
    await expect(page.locator(".audience-slide-fallback")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("speakerNotes");
    await expect(page.locator("main")).not.toContainText("presenter script");
  });

  test("opens the post-session survey and submits contact-consented answers", async ({
    page,
  }) => {
    await mockAudienceSession(page, {
      activeSession: endedSession,
      interaction: null,
      restoreAudience: true,
      surveyEnabled: true,
    });

    await page.goto("/join/123456");

    await expect(page.getByText("발표 설문")).toBeVisible();
    await page.getByLabel("발표 만족도 *").fill("5");
    await page.getByLabel(/후속 연락/).check();
    await page.getByLabel("이메일").fill("person@example.com");
    await page.getByRole("button", { name: "설문 제출" }).click();
    await expect(page.getByText("설문이 제출되었습니다.")).toBeVisible();
  });

  test("shows presenter results and a survey-only CSV export link", async ({
    page,
  }) => {
    await mockPresenterResults(page);

    await page.goto("/audience/project_1/control");

    await expect(page.getByLabel("청중 결과 요약")).toContainText(
      "Q&A 2개, 미답변 1개",
    );
    await expect(page.getByLabel("청중 결과 요약")).toContainText("반응 3개");
    await expect(page.getByLabel("청중 결과 요약")).toContainText(
      "설문 응답 1개, 개별 응답 1개",
    );
    await expect(page.getByRole("link", { name: "CSV" })).toHaveAttribute(
      "href",
      "/api/v1/projects/project_1/presentation-sessions/session_1/survey.csv",
    );
  });

  test("lets the presenter expose manual poll results per question", async ({
    page,
  }) => {
    const exposureRequests: unknown[] = [];
    await mockPresenterResults(page, {
      interactions: [manualPollInteraction],
      onExposureRequest: (payload) => exposureRequests.push(payload),
    });

    await page.goto("/audience/project_1/control");
    await page.getByRole("button", { name: "결과 공개" }).click();

    await expect(page.getByRole("button", { name: "결과 숨기기" })).toBeVisible();
    expect(exposureRequests).toEqual([
      {
        questionId: "question_00000000-0000-4000-8000-000000000003",
        exposed: true,
      },
    ]);
  });

  test("lets the presenter prepare interactions and AI references", async ({
    page,
  }) => {
    const selectionRequests: string[][] = [];
    const referenceRequests: string[][] = [];
    await mockPresenterResults(page, {
      assets: [referenceAsset, snapshotAsset],
      library: [preparedPollItem, preparedQuizItem],
      onAiReferenceUpdate: (referenceIds) =>
        referenceRequests.push(referenceIds),
      onPreparedSelection: (libraryInteractionIds) =>
        selectionRequests.push(libraryInteractionIds),
      session: draftPresenterSession,
    });

    await page.goto("/audience/project_1/control");
    await page.getByLabel("준비된 투표 선택").check();
    await page.getByLabel("준비된 퀴즈 선택").check();
    await page.getByRole("button", { name: "준비된 투표 순서 내리기" }).click();
    await page.getByLabel("reference.pdf 선택").check();

    await expect(page.getByText("준비된 퀴즈 · Quiz · 1번")).toBeVisible();
    await expect(page.getByText("준비된 투표 · Poll · 2번")).toBeVisible();
    await expect(page.getByText("snapshot.svg")).toHaveCount(0);
    expect(selectionRequests).toEqual([
      ["library_interaction_00000000-0000-4000-8000-000000000001"],
      [
        "library_interaction_00000000-0000-4000-8000-000000000001",
        "library_interaction_00000000-0000-4000-8000-000000000002",
      ],
      [
        "library_interaction_00000000-0000-4000-8000-000000000002",
        "library_interaction_00000000-0000-4000-8000-000000000001",
      ],
    ]);
    expect(referenceRequests).toEqual([
      ["file_00000000-0000-4000-8000-000000000001"],
    ]);
  });
});

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.locator(".audience-participant-label")).toHaveText(
    nickname,
  );
}

async function mockAudienceSession(
  page: Page,
  options: {
    activeSession?: typeof session;
    duplicateFirstNickname?: boolean;
    effectState?: Record<string, unknown>;
    interaction?: typeof pollInteraction | typeof quizInteraction | null;
    quizReveal?: Array<Record<string, unknown>>;
    restoreAudience?: boolean;
    surveyEnabled?: boolean;
  } = {},
) {
  const activeSession = options.activeSession ?? session;
  const interaction = options.interaction ?? pollInteraction;
  let joinAttempts = 0;

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 401,
      json: { message: "Authentication required" },
    }),
  );
  await page.route("**/socket.io/**", (route) =>
    route.fulfill({
      status: 404,
      json: { message: "Socket mocked for audience smoke" },
    }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/join/123456",
    async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: { session: activeSession } });
      }

      joinAttempts += 1;
      if (options.duplicateFirstNickname && joinAttempts === 1) {
        return route.fulfill({
          status: 409,
          json: { message: "이미 사용 중인 닉네임입니다." },
        });
      }

      return route.fulfill({
        json: {
          session: activeSession,
          participant: {
            ...participant,
            nickname: joinAttempts > 1 ? "orbit2" : "orbit",
          },
        },
      });
    },
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/me",
    (route) =>
      route.fulfill(
        options.restoreAudience
          ? {
              json: {
                session: activeSession,
                participant,
              },
            }
          : {
              status: 401,
              json: { message: "Audience access required" },
            },
      ),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/state",
    (route) =>
      route.fulfill({
        json: {
          session: activeSession,
          participant,
          state: {
            sessionId: "session_1",
            slideId: "slide_1",
            slideIndex: 0,
            effectState: options.effectState ?? {
              slideSnapshotUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
            },
            activeInteractionId: interaction?.interactionId ?? null,
            updatedAt: now,
          },
          features: {
            ...allFeatures,
            surveyEnabled: options.surveyEnabled ?? allFeatures.surveyEnabled,
          },
        },
      }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/interactions/active",
    (route) =>
      route.fulfill({
        json: {
          interaction,
          results: null,
          quizReveal: options.quizReveal ?? [],
        },
      }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/interactions/*/respond",
    (route) => route.fulfill({ json: { response: { accepted: true } } }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/questions",
    (route) =>
      route.fulfill({
        json: {
          question: {
            questionId: "question_00000000-0000-4000-8000-000000000010",
            questionGroupId: "question_00000000-0000-4000-8000-000000000010",
            sessionId: "session_1",
            audienceId: participant.audienceId,
            text: "AI가 답할 수 있나요?",
            status: "pending",
            submittedAt: now,
            answeredAt: null,
          },
        },
      }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/questions/*/answer",
    (route) =>
      route.fulfill({
        json: {
          answer: {
            answerId: "answer_00000000-0000-4000-8000-000000000001",
            questionId: "question_00000000-0000-4000-8000-000000000010",
            sessionId: "session_1",
            audienceId: participant.audienceId,
            answerText: "근거가 부족해 발표자에게 전달했습니다.",
            status: "failed",
            confidence: 0,
            feedback: null,
            createdAt: now,
            updatedAt: now,
          },
        },
      }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/questions/*/feedback",
    (route) => route.fulfill({ json: { answer: null } }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/reactions",
    (route) => route.fulfill({ json: { reaction: "clap", accepted: true } }),
  );
  await page.route(
    "**/api/v1/presentation-sessions/session_1/audience/survey",
    (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          json: {
            survey: {
              surveyId: "survey_00000000-0000-4000-8000-000000000001",
              sessionId: "session_1",
              title: "발표 설문",
              questions: [
                {
                  type: "scale",
                  questionId: "question_00000000-0000-4000-8000-000000000020",
                  prompt: "발표 만족도",
                  required: true,
                  min: 1,
                  max: 5,
                },
              ],
              contact: {
                enabled: true,
                consentText: "후속 연락을 위해 연락처 제공에 동의합니다.",
                fields: [
                  {
                    type: "open-text",
                    questionId: "question_00000000-0000-4000-8000-000000000021",
                    prompt: "이메일",
                    required: false,
                    maxLength: 160,
                  },
                ],
              },
              lockedAt: now,
            },
          },
        });
      }

      return route.fulfill({
        json: {
          response: {
            responseId: "survey_response_00000000-0000-4000-8000-000000000001",
            surveyId: "survey_00000000-0000-4000-8000-000000000001",
            sessionId: "session_1",
            audienceId: participant.audienceId,
            submittedAt: now,
            answers: {},
            contactConsent: true,
            contactAnswers: {},
          },
        },
      });
    },
  );
}

async function mockPresenterResults(
  page: Page,
  options: {
    assets?: Array<Record<string, unknown>>;
    aiReferenceIds?: string[];
    interactions?: Array<typeof manualPollInteraction>;
    library?: Array<typeof preparedPollItem | typeof preparedQuizItem>;
    onAiReferenceUpdate?: (referenceIds: string[]) => void;
    onExposureRequest?: (payload: unknown) => void;
    onPreparedSelection?: (libraryInteractionIds: string[]) => void;
    session?: typeof presenterSession;
  } = {},
) {
  const presenterActiveSession = options.session ?? presenterSession;
  let interactions = options.interactions ?? [];
  let selectedReferenceIds = options.aiReferenceIds ?? [];
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          userId: "user_1",
          email: "presenter@example.com",
          createdAt: now,
        },
      },
    }),
  );
  await page.route("**/socket.io/**", (route) =>
    route.fulfill({ status: 404, json: { message: "Socket mocked" } }),
  );
  await page.route("**/api/v1/projects/project_1/access", (route) =>
    route.fulfill({
      json: {
        project: {
          projectId: "project_1",
          workspaceId: "workspace_1",
          title: "Audience Smoke",
          createdAt: now,
          updatedAt: now,
        },
        membership: {
          role: "owner",
          status: "accepted",
        },
      },
    }),
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/current",
    (route) =>
      route.fulfill({
        json: {
          session: presenterActiveSession,
          audienceUrl: "/join/123456",
        },
      }),
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/session_1/features",
    (route) => route.fulfill({ json: { features: allFeatures } }),
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/session_1/survey",
    (route) =>
      route.fulfill({
        json: {
          survey: {
            surveyId: "survey_00000000-0000-4000-8000-000000000001",
            sessionId: "session_1",
            title: "발표 설문",
            questions: [],
            contact: { enabled: false, consentText: "동의", fields: [] },
            lockedAt: null,
          },
        },
      }),
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/session_1/interactions",
    (route) => route.fulfill({ json: { interactions } }),
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/session_1/interactions/*/results/exposure",
    async (route) => {
      const payload = (await route.request().postDataJSON()) as {
        exposed?: boolean;
        questionId?: string;
      };
      options.onExposureRequest?.(payload);
      interactions = interactions.map((interaction) =>
        payload.questionId && payload.exposed
          ? {
              ...interaction,
              exposedResultQuestionIds: [
                ...new Set([
                  ...interaction.exposedResultQuestionIds,
                  payload.questionId,
                ]),
              ],
            }
          : interaction,
      );

      return route.fulfill({ json: { interaction: interactions[0] } });
    },
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/interactions/library",
    (route) =>
      route.fulfill({ json: { interactions: options.library ?? [] } }),
  );
  await page.route("**/api/v1/projects/project_1/assets", (route) =>
    route.fulfill({ json: options.assets ?? [] }),
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/session_1/ai-references",
    async (route) => {
      if (route.request().method() === "PATCH") {
        const payload = (await route.request().postDataJSON()) as {
          referenceIds?: string[];
        };
        selectedReferenceIds = payload.referenceIds ?? [];
        options.onAiReferenceUpdate?.(selectedReferenceIds);
      }

      return route.fulfill({ json: { referenceIds: selectedReferenceIds } });
    },
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/session_1/interactions/select",
    async (route) => {
      const payload = (await route.request().postDataJSON()) as {
        libraryInteractionIds?: string[];
      };
      const libraryInteractionIds = payload.libraryInteractionIds ?? [];
      options.onPreparedSelection?.(libraryInteractionIds);
      interactions = libraryInteractionIds.flatMap((libraryInteractionId, index) => {
        const libraryItem = (options.library ?? []).find(
          (item) => item.libraryInteractionId === libraryInteractionId,
        );
        if (!libraryItem) {
          return [];
        }

        return [
          {
            interactionId: `interaction_00000000-0000-4000-8000-10000000000${
              index + 1
            }`,
            sessionId: "session_1",
            libraryInteractionId: libraryItem.libraryInteractionId,
            kind: libraryItem.kind,
            title: libraryItem.title,
            questions: libraryItem.questions,
            resultVisibility: libraryItem.resultVisibility,
            quizScoring: libraryItem.quizScoring,
            exposedResultQuestionIds: [],
            source: "library",
            order: index,
            activatedAt: null,
            closedAt: null,
          },
        ];
      });

      return route.fulfill({ json: { interactions } });
    },
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/session_1/questions",
    (route) =>
      route.fulfill({
        json: {
          questions: [
            {
              questionId: "question_00000000-0000-4000-8000-000000000030",
              questionGroupId: "question_00000000-0000-4000-8000-000000000030",
              sessionId: "session_1",
              audienceId: participant.audienceId,
              text: "발표자 답변이 필요한 질문입니다.",
              status: "pending",
              submittedAt: now,
              answeredAt: null,
            },
          ],
        },
      }),
  );
  await page.route(
    "**/api/v1/projects/project_1/presentation-sessions/session_1/results",
    (route) =>
      route.fulfill({
        json: {
          report: {
            reportId: "audience_report_00000000-0000-4000-8000-000000000001",
            sessionId: "session_1",
            status: "preliminary",
            aggregate: {
              qna: { total: 2, unanswered: 1 },
              reactions: { clap: 2, heart: 1 },
              interactions: [{ title: "만족도 투표", responseCount: 1 }],
              survey: { responseCount: 1 },
            },
            generatedAt: now,
            rawDataDeletedAt: null,
          },
          surveyResponses: [
            {
              responseId:
                "survey_response_00000000-0000-4000-8000-000000000001",
              surveyId: "survey_00000000-0000-4000-8000-000000000001",
              sessionId: "session_1",
              audienceId: participant.audienceId,
              submittedAt: now,
              answers: {},
              contactConsent: false,
              contactAnswers: {},
            },
          ],
        },
      }),
  );
}
