import type {
  AudienceFeatureSettings,
  PresentationSession,
  ProjectInteractionLibraryItem,
  ReactionType,
  SessionInteraction,
} from "@orbit/shared";
import { BarChart3, ExternalLink, QrCode, Users } from "lucide-react";
import { useEffect, useState } from "react";

import {
  activateSessionInteraction,
  closeSessionInteraction,
  createAdHocSessionInteraction,
  exposeInteractionQuestionResults,
  fetchAudienceFeatureSettings,
  fetchCurrentAudienceAccessSession,
  fetchInteractionLibrary,
  fetchPresenterQuestionQueue,
  fetchSessionInteractions,
  fetchSessionResults,
  fetchSessionSurveyForm,
  selectSessionInteractions,
  sessionSurveyCsvUrl,
  updateAudienceAccessEntryStatus,
  updateAudienceFeatureSettings,
  upsertSessionSurveyForm,
} from "../editor/audience-link/audienceLinkApi";
import {
  createQrDataUrl,
  resolveAbsoluteAudienceUrl,
  toAudienceLinkErrorMessage,
} from "../editor/audience-link/audienceLinkUtils";
import type { AudiencePresenterRealtimePublisher } from "./audiencePresenterRealtime";
import { createAudiencePresenterRealtimePublisher } from "./audiencePresenterRealtime";
import {
  applyAudienceFeaturePatch,
  AudienceFeatureSettingsControls,
  type AudienceFeatureKey,
  normalizeAudienceFeaturePatch,
  PreparedInteractionLibrarySelector,
} from "./AudienceFeatureSettingsControls";

import "./audienceFeatureControls.css";

type AudiencePresenterPanelProps = {
  projectId: string;
  publisher?: AudiencePresenterRealtimePublisher | null;
  recentReactions?: ReactionType[];
  sessionId?: string;
  variant?: "overlay" | "page";
};

export function AudiencePresenterPanel({
  projectId,
  publisher = null,
  recentReactions: controlledRecentReactions,
  sessionId: requestedSessionId,
  variant = "overlay",
}: AudiencePresenterPanelProps) {
  const [session, setSession] = useState<PresentationSession | null>(null);
  const [audienceUrl, setAudienceUrl] = useState("");
  const [audienceQrDataUrl, setAudienceQrDataUrl] = useState("");
  const [features, setFeatures] = useState<AudienceFeatureSettings | null>(
    null,
  );
  const [surveyTitle, setSurveyTitle] = useState("");
  const [results, setResults] =
    useState<Awaited<ReturnType<typeof fetchSessionResults>> | null>(null);
  const [interactions, setInteractions] = useState<SessionInteraction[]>([]);
  const [interactionLibrary, setInteractionLibrary] = useState<
    ProjectInteractionLibraryItem[] | null
  >(null);
  const [selectedLibraryInteractionIds, setSelectedLibraryInteractionIds] =
    useState<string[]>([]);
  const [pendingQuestionCount, setPendingQuestionCount] = useState(0);
  const [fallbackPublisher, setFallbackPublisher] =
    useState<AudiencePresenterRealtimePublisher | null>(null);
  const [recentReactions, setRecentReactions] = useState<ReactionType[]>([]);
  const [busyKey, setBusyKey] = useState<AudienceFeatureKey | null>(null);
  const [isEntryBusy, setIsEntryBusy] = useState(false);
  const [isSelectionBusy, setIsSelectionBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setErrorMessage("");

    void fetchCurrentAudienceAccessSession(projectId)
      .then(async (payload) => {
        if (isCancelled) {
          return;
        }

        const nextSession = payload.session;
        setSession(nextSession);
        const nextAudienceUrl = payload.audienceUrl
          ? resolveAbsoluteAudienceUrl(payload.audienceUrl)
          : "";
        setAudienceUrl(nextAudienceUrl);
        setAudienceQrDataUrl(
          nextAudienceUrl ? await createQrDataUrl(nextAudienceUrl) : "",
        );

        if (!nextSession) {
          setFeatures(null);
          return;
        }
        if (
          requestedSessionId &&
          nextSession.sessionId !== requestedSessionId
        ) {
          setErrorMessage("현재 프로젝트의 활성 청중 세션을 표시합니다.");
        }

        const settings = await fetchAudienceFeatureSettings({
          projectId,
          sessionId: nextSession.sessionId,
        });
        const survey = await fetchSessionSurveyForm({
          projectId,
          sessionId: nextSession.sessionId,
        });
        const nextInteractions = await fetchSessionInteractions({
          projectId,
          sessionId: nextSession.sessionId,
        });
        const library = await fetchInteractionLibrary(projectId);
        const questionQueue = await fetchPresenterQuestionQueue({
          projectId,
          sessionId: nextSession.sessionId,
        }).catch(() => ({ questions: [] }));
        const nextResults = await fetchSessionResults({
          projectId,
          sessionId: nextSession.sessionId,
        }).catch(() => null);
        if (!isCancelled) {
          setFeatures(settings.features);
          setSurveyTitle(survey.survey?.title ?? "");
          setInteractions(nextInteractions.interactions);
          setInteractionLibrary(library.interactions);
          setSelectedLibraryInteractionIds(
            libraryIdsFromSessionInteractions(nextInteractions.interactions),
          );
          setPendingQuestionCount(
            questionQueue.questions.filter(
              (question) => question.status === "pending",
            ).length,
          );
          setResults(nextResults);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setErrorMessage(toAudienceLinkErrorMessage(error));
          setSession(null);
          setAudienceUrl("");
          setAudienceQrDataUrl("");
          setFeatures(null);
          setInteractions([]);
          setInteractionLibrary(null);
          setSelectedLibraryInteractionIds([]);
          setPendingQuestionCount(0);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [projectId, requestedSessionId]);

  useEffect(() => {
    if (publisher || !session) {
      setFallbackPublisher(null);
      return;
    }

    const nextPublisher = createAudiencePresenterRealtimePublisher({
      onReaction: (payload) => {
        setRecentReactions((current) =>
          [payload.reaction, ...current].slice(0, 5),
        );
      },
      sessionId: session.sessionId,
    });
    setFallbackPublisher(nextPublisher);

    return () => {
      nextPublisher.disconnect();
    };
  }, [publisher, session?.sessionId]);

  async function handleEntryStatus(nextEntryStatus: "open" | "closed") {
    if (!session || isEntryBusy) {
      return;
    }

    setIsEntryBusy(true);
    setErrorMessage("");
    try {
      const nextSession = await updateAudienceAccessEntryStatus({
        entryStatus: nextEntryStatus,
        projectId,
        sessionId: session.sessionId,
      });
      setSession(nextSession);
    } catch (error) {
      setErrorMessage(toAudienceLinkErrorMessage(error));
    } finally {
      setIsEntryBusy(false);
    }
  }

  async function handleFeatureToggle(
    key: AudienceFeatureKey,
    enabled: boolean,
  ) {
    if (!features || !session || busyKey) {
      return;
    }

    const patch = normalizeAudienceFeaturePatch(key, enabled);
    setBusyKey(key);
    setErrorMessage("");

    const effectivePublisher = publisher ?? fallbackPublisher;
    if (effectivePublisher) {
      setFeatures((current) =>
        current ? applyAudienceFeaturePatch(current, patch) : current,
      );
      effectivePublisher.publishFeatureSettings(patch);
      setBusyKey(null);
      return;
    }

    try {
      const response = await updateAudienceFeatureSettings({
        projectId,
        sessionId: session.sessionId,
        settings: patch,
      });
      setFeatures(response.features);
    } catch (error) {
      setErrorMessage(toAudienceLinkErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePrepareDefaultSurvey() {
    if (!session || session.status !== "draft") {
      return;
    }

    setErrorMessage("");
    try {
      const response = await upsertSessionSurveyForm({
        projectId,
        sessionId: session.sessionId,
        form: createDefaultSurveyForm(),
      });
      setSurveyTitle(response.survey?.title ?? "");
    } catch (error) {
      setErrorMessage(toAudienceLinkErrorMessage(error));
    }
  }

  async function refreshInteractions() {
    if (!session) {
      return;
    }

    const response = await fetchSessionInteractions({
      projectId,
      sessionId: session.sessionId,
    });
    setInteractions(response.interactions);
    setSelectedLibraryInteractionIds(
      libraryIdsFromSessionInteractions(response.interactions),
    );
  }

  async function handlePreparedSelection(libraryInteractionIds: string[]) {
    if (!session || session.status !== "draft" || isSelectionBusy) {
      return;
    }

    const previousIds = selectedLibraryInteractionIds;
    setSelectedLibraryInteractionIds(libraryInteractionIds);
    setIsSelectionBusy(true);
    setErrorMessage("");
    try {
      const response = await selectSessionInteractions({
        projectId,
        sessionId: session.sessionId,
        libraryInteractionIds,
      });
      setInteractions(response.interactions);
      setSelectedLibraryInteractionIds(
        libraryIdsFromSessionInteractions(response.interactions),
      );
    } catch (error) {
      setSelectedLibraryInteractionIds(previousIds);
      setErrorMessage(toAudienceLinkErrorMessage(error));
    } finally {
      setIsSelectionBusy(false);
    }
  }

  async function handleCreateAdHoc(kind: "poll" | "quiz") {
    if (!session) {
      return;
    }

    setErrorMessage("");
    try {
      await createAdHocSessionInteraction({
        projectId,
        sessionId: session.sessionId,
        interaction:
          kind === "poll" ? createDefaultPollInteraction() : createDefaultQuizInteraction(),
      });
      await refreshInteractions();
    } catch (error) {
      setErrorMessage(toAudienceLinkErrorMessage(error));
    }
  }

  async function handleInteractionCommand(
    interaction: SessionInteraction,
    command: "activate" | "close",
  ) {
    if (!session) {
      return;
    }

    setErrorMessage("");
    try {
      if (command === "activate") {
        await activateSessionInteraction({
          projectId,
          sessionId: session.sessionId,
          interactionId: interaction.interactionId,
        });
      } else {
        await closeSessionInteraction({
          projectId,
          sessionId: session.sessionId,
          interactionId: interaction.interactionId,
        });
      }
      await refreshInteractions();
    } catch (error) {
      setErrorMessage(toAudienceLinkErrorMessage(error));
    }
  }

  async function handleExposeQuestion(
    interaction: SessionInteraction,
    questionId: string,
    exposed: boolean,
  ) {
    if (!session) {
      return;
    }

    setErrorMessage("");
    try {
      await exposeInteractionQuestionResults({
        projectId,
        sessionId: session.sessionId,
        interactionId: interaction.interactionId,
        questionId,
        exposed,
      });
      await refreshInteractions();
    } catch (error) {
      setErrorMessage(toAudienceLinkErrorMessage(error));
    }
  }

  const isOpen = session?.entryStatus === "open";
  const visibleRecentReactions = controlledRecentReactions ?? recentReactions;
  const titleId =
    variant === "page"
      ? "audience-presenter-control-title"
      : "audience-presenter-overlay-title";

  return (
    <section
      className={`audience-presenter-panel audience-presenter-panel-${variant}`}
      aria-labelledby={titleId}
    >
      <header>
        <span>
          <Users size={16} />
          <strong id={titleId}>청중 제어</strong>
        </span>
        {audienceUrl ? (
          <a
            aria-label="청중 상세 제어와 결과 열기"
            href={`/presentations/${encodeURIComponent(
              session?.sessionId ?? "",
            )}/audience?projectId=${encodeURIComponent(projectId)}`}
          >
            <ExternalLink size={15} />
          </a>
        ) : null}
      </header>

      {isLoading ? (
        <p className="audience-presenter-muted" role="status">
          청중 세션 확인 중
        </p>
      ) : null}

      {!isLoading && !session ? (
        <p className="audience-presenter-muted">활성 청중 세션 없음</p>
      ) : null}

      {session ? (
        <>
          <div className="audience-presenter-access">
            <div className="audience-presenter-code">
              <span>입장 코드</span>
              <strong>{session.joinCode}</strong>
            </div>
            <div className="audience-presenter-qr">
              {audienceQrDataUrl ? (
                <img alt="청중 입장 QR 코드" src={audienceQrDataUrl} />
              ) : (
                <QrCode size={24} />
              )}
            </div>
            <div className="audience-presenter-entry-actions">
              <button
                type="button"
                disabled={isEntryBusy || isOpen}
                onClick={() => void handleEntryStatus("open")}
              >
                입장 열기
              </button>
              <button
                type="button"
                disabled={isEntryBusy || !isOpen}
                onClick={() => void handleEntryStatus("closed")}
              >
                입장 닫기
              </button>
            </div>
          </div>

          <AudienceFeatureSettingsControls
            busyKey={busyKey}
            features={features}
            onToggle={(key, enabled) => void handleFeatureToggle(key, enabled)}
          />

          {features?.reactionsEnabled ? (
            <AudiencePresenterReactionStrip reactions={visibleRecentReactions} />
          ) : null}

          {features?.surveyEnabled ? (
            <div className="audience-presenter-survey" aria-label="설문 설정">
              <span>설문</span>
              <p>{surveyTitle || "저장된 설문 없음"}</p>
              <button
                disabled={session.status !== "draft"}
                type="button"
                onClick={() => void handlePrepareDefaultSurvey()}
              >
                기본 설문 저장
              </button>
              {surveyTitle ? (
                <a
                  href={sessionSurveyCsvUrl({
                    projectId,
                    sessionId: session.sessionId,
                  })}
                >
                  CSV
                </a>
              ) : null}
            </div>
          ) : null}

          <PreparedInteractionLibrarySelector
            disabled={session.status !== "draft" || isSelectionBusy}
            library={interactionLibrary}
            selectedLibraryInteractionIds={selectedLibraryInteractionIds}
            onChange={(libraryInteractionIds) =>
              void handlePreparedSelection(libraryInteractionIds)
            }
          />

          <AudiencePresenterInteractionControls
            interactions={interactions}
            onActivate={(interaction) =>
              void handleInteractionCommand(interaction, "activate")
            }
            onClose={(interaction) =>
              void handleInteractionCommand(interaction, "close")
            }
            onCreateAdHoc={(kind) => void handleCreateAdHoc(kind)}
            onExposeQuestion={(interaction, questionId, exposed) =>
              void handleExposeQuestion(interaction, questionId, exposed)
            }
          />

          <div className="audience-presenter-results" aria-label="Q&A 대기열">
            <span>Q&A 대기열</span>
            <p>답변 대기 {pendingQuestionCount}개</p>
          </div>

          <div
            className="audience-presenter-results"
            aria-label="청중 결과 요약"
          >
            <span>
              <BarChart3 size={15} />
              결과
            </span>
            <AudiencePresenterResultsSummary results={results} />
          </div>
        </>
      ) : null}

      {errorMessage ? (
        <p className="audience-presenter-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

export function AudiencePresenterResultsSummary({
  results,
}: {
  results: Awaited<ReturnType<typeof fetchSessionResults>> | null;
}) {
  if (!results) {
    return (
      <>
        <p>결과 준비 중</p>
        <p>Q&A 대기열 0개</p>
      </>
    );
  }

  const aggregate = results.report.aggregate as {
    interactions?: Array<{ title: string; responseCount: number }>;
    qna?: { total: number; unanswered: number };
    reactions?: Record<string, number>;
    survey?: { responseCount: number };
  };
  const reactionTotal = Object.values(aggregate.reactions ?? {}).reduce(
    (sum, count) => sum + Number(count),
    0,
  );

  return (
    <>
      <p>
        Q&A {aggregate.qna?.total ?? 0}개, 미답변{" "}
        {aggregate.qna?.unanswered ?? 0}개
      </p>
      <p>반응 {reactionTotal}개</p>
      <p>상호작용 {aggregate.interactions?.length ?? 0}개</p>
      <p>
        설문 응답 {aggregate.survey?.responseCount ?? 0}개, 개별 응답{" "}
        {results.surveyResponses.length}개
      </p>
    </>
  );
}

function AudiencePresenterInteractionControls({
  interactions,
  onActivate,
  onClose,
  onCreateAdHoc,
  onExposeQuestion,
}: {
  interactions: SessionInteraction[];
  onActivate: (interaction: SessionInteraction) => void;
  onClose: (interaction: SessionInteraction) => void;
  onCreateAdHoc: (kind: "poll" | "quiz") => void;
  onExposeQuestion: (
    interaction: SessionInteraction,
    questionId: string,
    exposed: boolean,
  ) => void;
}) {
  const orderedInteractions = [...interactions].sort(
    (left, right) => left.order - right.order,
  );

  return (
    <div
      className="audience-presenter-results"
      aria-label="상호작용 라이브 제어"
    >
      <span>Poll/Quiz</span>
      <div className="audience-presenter-entry-actions">
        <button type="button" onClick={() => onCreateAdHoc("poll")}>
          Poll 추가
        </button>
        <button type="button" onClick={() => onCreateAdHoc("quiz")}>
          Quiz 추가
        </button>
      </div>
      {orderedInteractions.length === 0 ? <p>준비된 상호작용 없음</p> : null}
      {orderedInteractions.map((interaction) => {
        const isActive =
          interaction.activatedAt !== null && interaction.closedAt === null;
        return (
          <section key={interaction.interactionId}>
            <p>
              {interaction.title} · {interaction.kind === "poll" ? "Poll" : "Quiz"}
            </p>
            <div className="audience-presenter-entry-actions">
              <button
                type="button"
                disabled={isActive || interaction.closedAt !== null}
                onClick={() => onActivate(interaction)}
              >
                활성화
              </button>
              <button
                type="button"
                disabled={!isActive}
                onClick={() => onClose(interaction)}
              >
                닫기
              </button>
            </div>
            {interaction.resultVisibility === "manual" ? (
              <div className="audience-session-order-row" role="list">
                {interaction.questions.map((question) => {
                  const exposed = interaction.exposedResultQuestionIds.includes(
                    question.questionId,
                  );
                  return (
                    <button
                      key={question.questionId}
                      type="button"
                      onClick={() =>
                        onExposeQuestion(
                          interaction,
                          question.questionId,
                          !exposed,
                        )
                      }
                    >
                      {exposed ? "결과 숨기기" : "결과 공개"}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function createDefaultSurveyForm() {
  return {
    title: "발표 설문",
    questions: [
      {
        type: "scale" as const,
        questionId: "question_00000000-0000-4000-8000-000000000901",
        prompt: "발표 만족도",
        required: true,
        min: 1 as const,
        max: 5 as const,
      },
      {
        type: "open-text" as const,
        questionId: "question_00000000-0000-4000-8000-000000000902",
        prompt: "좋았던 점이나 개선 의견",
        required: false,
        maxLength: 500,
      },
    ],
    contact: {
      enabled: true,
      consentText: "후속 연락을 위해 연락처를 제공하는 데 동의합니다.",
      fields: [
        {
          type: "open-text" as const,
          questionId: "question_00000000-0000-4000-8000-000000000903",
          prompt: "이메일",
          required: false,
          maxLength: 160,
        },
      ],
    },
  };
}

function createDefaultPollInteraction() {
  return {
    kind: "poll" as const,
    title: "즉석 투표",
    resultVisibility: "manual" as const,
    quizScoring: "none" as const,
    questions: [
      {
        type: "choice" as const,
        questionId: "question_00000000-0000-4000-8000-000000000911",
        prompt: "어떤 선택지가 가장 적절한가요?",
        required: true,
        allowMultiple: false,
        options: [
          { optionId: "a", label: "A" },
          { optionId: "b", label: "B" },
        ],
      },
    ],
  };
}

function createDefaultQuizInteraction() {
  return {
    kind: "quiz" as const,
    title: "즉석 퀴즈",
    resultVisibility: "after-close" as const,
    quizScoring: "speed-bonus" as const,
    questions: [
      {
        type: "quiz-true-false" as const,
        questionId: "question_00000000-0000-4000-8000-000000000912",
        prompt: "오늘 발표의 핵심 문장을 확인했습니다.",
        correctAnswer: true,
        timeLimitSeconds: 30,
      },
    ],
  };
}

function libraryIdsFromSessionInteractions(interactions: SessionInteraction[]) {
  return [...interactions]
    .sort((left, right) => left.order - right.order)
    .flatMap((interaction) =>
      interaction.source === "library" && interaction.libraryInteractionId
        ? [interaction.libraryInteractionId]
        : [],
    );
}

const presenterReactionSymbols: Record<ReactionType, string> = {
  clap: "👏",
  heart: "❤",
  laugh: "ㅎㅎ",
  wow: "!",
};

function AudiencePresenterReactionStrip({
  reactions,
}: {
  reactions: ReactionType[];
}) {
  return (
    <div className="audience-presenter-reactions" aria-label="최근 청중 반응">
      <span>최근 반응</span>
      <div>
        {reactions.length > 0
          ? reactions.map((reaction, index) => (
              <strong key={`${reaction}-${index}`}>
                {presenterReactionSymbols[reaction]}
              </strong>
            ))
          : "대기 중"}
      </div>
    </div>
  );
}

export function AudiencePresenterControlPage({
  projectId,
  sessionId,
  variant,
}: {
  projectId?: string;
  sessionId?: string;
  variant?: "missing-project";
}) {
  if (!projectId) {
    return (
      <main className="audience-presenter-control-page">
        <section
          className="audience-presenter-panel audience-presenter-panel-page"
          aria-labelledby="audience-presenter-control-title"
        >
          <header>
            <span>
              <Users size={16} />
              <strong id="audience-presenter-control-title">청중 제어</strong>
            </span>
          </header>
          <p className="audience-presenter-muted">
            {variant === "missing-project" && sessionId
              ? "프로젝트 정보를 포함한 상세 제어 링크로 다시 열어 주세요."
              : "활성 청중 세션 없음"}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="audience-presenter-control-page">
      <AudiencePresenterPanel
        projectId={projectId}
        sessionId={sessionId}
        variant="page"
      />
    </main>
  );
}
