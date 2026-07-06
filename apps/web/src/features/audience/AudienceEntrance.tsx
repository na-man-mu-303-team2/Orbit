import type {
  AudienceActiveInteractionResponse,
  AudienceFeatureSettings,
  AudienceParticipant,
  AudiencePublicSession,
  AudienceQuestionAnswerResponse,
  AudienceReactionPayload,
  AudienceRealtimeState,
  Deck,
  AudienceStateResponse,
  InteractionAnswer,
  InteractionQuestion,
  QuizAnswerRevealItem,
  AudienceQuestion,
  ReactionType,
  SessionInteraction,
  SurveyForm,
} from "@orbit/shared";
import { deckSchema } from "@orbit/shared";
import { CheckCircle2, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  fetchAudienceActiveInteraction,
  fetchAudienceQuestionAnswer,
  fetchAudienceSurvey,
  fetchAudienceState,
  fetchAudienceMe,
  joinAudienceSession,
  lookupAudienceSession,
  submitAudienceInteractionResponse,
  submitAudienceQuestion,
  submitAudienceReaction,
  submitAudienceSurvey,
  updateAiAnswerFeedback,
} from "./audienceApi";
import { audienceCopy } from "./audienceCopy";
import { SlideshowRenderer } from "../rehearsal/presenter/SlideshowRenderer";
import {
  connectAudienceRealtime,
  type AudienceRealtimeStatus,
} from "./audienceRealtime";
import "./audience.css";

type AudienceEntranceProps = {
  initialJoinCode?: string;
};

type LoadingState = "idle" | "lookup" | "join" | "restore";

export function AudienceEntrance({ initialJoinCode }: AudienceEntranceProps) {
  const [joinCode, setJoinCode] = useState(() => initialJoinCode ?? "");
  const [nickname, setNickname] = useState("");
  const [session, setSession] = useState<AudiencePublicSession | null>(null);
  const [participant, setParticipant] = useState<AudienceParticipant | null>(
    null,
  );
  const [audienceState, setAudienceState] =
    useState<AudienceStateResponse | null>(null);
  const [activeInteraction, setActiveInteraction] =
    useState<AudienceActiveInteractionResponse | null>(null);
  const [surveyForm, setSurveyForm] = useState<SurveyForm | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<AudienceRealtimeStatus>("idle");
  const [recentReactions, setRecentReactions] = useState<ReactionType[]>([]);
  const [privateAnswer, setPrivateAnswer] =
    useState<AudienceQuestionAnswerResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingState, setLoadingState] = useState<LoadingState>(
    initialJoinCode ? "lookup" : "idle",
  );

  const normalizedJoinCode = useMemo(
    () => joinCode.replace(/\D/g, "").slice(0, 6),
    [joinCode],
  );
  const canLookup = normalizedJoinCode.length === 6 && loadingState === "idle";
  const canJoin =
    Boolean(session) && nickname.trim().length > 0 && loadingState === "idle";

  useEffect(() => {
    if (!initialJoinCode) {
      return;
    }

    let isCancelled = false;
    void loadSession(initialJoinCode, isCancelled);

    return () => {
      isCancelled = true;
    };
  }, [initialJoinCode]);

  async function loadSession(code: string, isCancelled = false) {
    setLoadingState("lookup");
    setErrorMessage("");

    try {
      const payload = await lookupAudienceSession(code);
      if (isCancelled) {
        return;
      }

      setJoinCode(payload.session.joinCode);
      setSession(payload.session);
      setLoadingState("restore");

      try {
        const restored = await fetchAudienceMe({
          sessionId: payload.session.sessionId,
        });
        if (!isCancelled) {
          setParticipant(restored.participant);
          setSession(restored.session);
        }
      } catch {
        // No existing audience cookie; continue with nickname entry.
      }
    } catch (error) {
      if (!isCancelled) {
        setSession(null);
        setParticipant(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : audienceCopy["join.error.notFound"],
        );
      }
    } finally {
      if (!isCancelled) {
        setLoadingState("idle");
      }
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canLookup) {
      return;
    }

    await loadSession(normalizedJoinCode);
  }

  async function handleJoinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canJoin) {
      return;
    }

    setLoadingState("join");
    setErrorMessage("");

    try {
      const payload = await joinAudienceSession({
        joinCode: session.joinCode,
        nickname,
      });
      setSession(payload.session);
      setParticipant(payload.participant);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : audienceCopy["join.error.notFound"],
      );
    } finally {
      setLoadingState("idle");
    }
  }

  useEffect(() => {
    if (!session || !participant) {
      setAudienceState(null);
      setActiveInteraction(null);
      setSurveyForm(null);
      setConnectionStatus("idle");
      setRecentReactions([]);
      setPrivateAnswer(null);
      return;
    }

    let isCancelled = false;
    setConnectionStatus("connecting");
    void fetchAudienceState({ sessionId: session.sessionId })
      .then((payload) => {
        if (!isCancelled) {
          setSession(payload.session);
          setParticipant(payload.participant);
          setAudienceState(payload);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "청중 화면 상태를 불러오지 못했습니다.",
          );
          setConnectionStatus("error");
        }
      });

    const connection = connectAudienceRealtime({
      onError: (message) => {
        if (!isCancelled) {
          setErrorMessage(message);
        }
      },
      onFeatureSettings: (features) => {
        if (!isCancelled) {
          setAudienceState((current) =>
            current ? { ...current, features } : current,
          );
        }
      },
      onPrivateAnswer: (payload) => {
        if (!isCancelled) {
          setPrivateAnswer(payload);
        }
      },
      onReaction: (payload) => {
        if (!isCancelled) {
          setRecentReactions((current) => toRecentReactions(current, payload));
        }
      },
      onSessionEnded: (payload) => {
        if (!isCancelled) {
          setSession(payload.session);
          setAudienceState((current) =>
            current ? { ...current, session: payload.session } : current,
          );
        }
      },
      onSlideState: (state) => {
        if (!isCancelled) {
          setAudienceState((current) =>
            current ? { ...current, state } : current,
          );
        }
      },
      onState: (payload) => {
        if (!isCancelled) {
          setSession(payload.session);
          setParticipant(payload.participant);
          setAudienceState(payload);
        }
      },
      onStatus: (status) => {
        if (!isCancelled) {
          setConnectionStatus(status);
        }
      },
      sessionId: session.sessionId,
    });

    return () => {
      isCancelled = true;
      connection.disconnect();
    };
  }, [participant?.audienceId, session?.sessionId]);

  useEffect(() => {
    if (
      !session ||
      !participant ||
      session.status !== "ended" ||
      !audienceState?.features.surveyEnabled
    ) {
      setSurveyForm(null);
      return;
    }

    let isCancelled = false;
    void fetchAudienceSurvey({ sessionId: session.sessionId })
      .then((payload) => {
        if (!isCancelled) {
          setSurveyForm(payload.survey);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "설문을 불러오지 못했습니다.",
          );
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    audienceState?.features.surveyEnabled,
    participant?.audienceId,
    session?.sessionId,
    session?.status,
  ]);

  useEffect(() => {
    const sessionId = session?.sessionId;
    const activeInteractionId = audienceState?.state.activeInteractionId;
    const features = audienceState?.features;
    const hasEnabledInteractionFeature =
      Boolean(features?.pollsEnabled) || Boolean(features?.quizzesEnabled);
    if (
      !sessionId ||
      !participant ||
      !activeInteractionId ||
      !hasEnabledInteractionFeature
    ) {
      setActiveInteraction(null);
      return;
    }

    let isCancelled = false;
    void fetchAudienceActiveInteraction({ sessionId })
      .then((payload) => {
        if (!isCancelled) {
          setActiveInteraction(payload);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setActiveInteraction(null);
          setErrorMessage("활성 Poll/Quiz를 불러오지 못했습니다.");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    audienceState?.features.pollsEnabled,
    audienceState?.features.quizzesEnabled,
    audienceState?.state.activeInteractionId,
    audienceState?.state.updatedAt,
    participant,
    session?.sessionId,
  ]);

  const isLoading = loadingState !== "idle";

  return (
    <main className="audience-page">
      <section
        className="audience-entry-panel"
        aria-labelledby="audience-title"
      >
        <div className="audience-entry-heading">
          <span>ORBIT Audience</span>
          <h1 id="audience-title">청중 입장</h1>
        </div>

        {!session ? (
          <form className="audience-form" onSubmit={handleCodeSubmit}>
            <label className="audience-field" htmlFor="audience-join-code">
              <span>{audienceCopy["join.code.label"]}</span>
              <input
                autoComplete="one-time-code"
                id="audience-join-code"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder={audienceCopy["join.code.placeholder"]}
                value={normalizedJoinCode}
                onChange={(event) => setJoinCode(event.target.value)}
              />
            </label>
            <button
              className="audience-enter-button"
              type="submit"
              disabled={!canLookup}
            >
              {loadingState === "lookup" ? "확인 중" : "코드 확인"}
            </button>
          </form>
        ) : null}

        {session && !participant ? (
          <form className="audience-form" onSubmit={handleJoinSubmit}>
            <div className="audience-session-code">
              <span>{audienceCopy["join.code.label"]}</span>
              <strong>{session.joinCode}</strong>
            </div>
            {session.entryStatus === "closed" ? (
              <p className="audience-error" role="alert">
                {audienceCopy["join.error.closed"]}
              </p>
            ) : (
              <>
                <label className="audience-field" htmlFor="audience-nickname">
                  <span>{audienceCopy["join.nickname.label"]}</span>
                  <input
                    autoComplete="nickname"
                    id="audience-nickname"
                    maxLength={40}
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                  />
                </label>
                <button
                  className="audience-enter-button"
                  type="submit"
                  disabled={!canJoin}
                >
                  {loadingState === "join"
                    ? "입장 중"
                    : audienceCopy["join.submit"]}
                </button>
              </>
            )}
          </form>
        ) : null}

        {participant ? (
          <>
            <AudienceLiveShell
              activeInteraction={activeInteraction?.interaction ?? null}
              connectionStatus={connectionStatus}
              features={audienceState?.features ?? null}
              participant={participant}
              privateAnswer={privateAnswer}
              quizReveal={activeInteraction?.quizReveal ?? []}
              recentReactions={recentReactions}
              state={audienceState?.state ?? null}
              survey={surveyForm}
            />
            <section className="audience-waiting-room" aria-live="polite">
              <CheckCircle2 size={24} />
              <div>
                <h2>{audienceCopy["waiting.title"]}</h2>
                <p>{audienceCopy["waiting.body"]}</p>
                <small>{participant.nickname}</small>
              </div>
            </section>
          </>
        ) : null}

        {isLoading ? (
          <p className="audience-access-loading" role="status">
            <Loader2 size={16} aria-hidden="true" />
            {loadingState === "restore"
              ? audienceCopy["connection.reconnecting"]
              : "확인 중"}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="audience-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}

export function AudienceLiveShell(props: {
  activeInteraction: SessionInteraction | null;
  connectionStatus: AudienceRealtimeStatus;
  features: AudienceFeatureSettings | null;
  participant: AudienceParticipant;
  privateAnswer?: AudienceQuestionAnswerResponse | null;
  quizReveal?: QuizAnswerRevealItem[];
  recentReactions?: ReactionType[];
  state: AudienceRealtimeState | null;
  survey?: SurveyForm | null;
}) {
  const {
    activeInteraction,
    connectionStatus,
    features,
    participant,
    privateAnswer = null,
    quizReveal = [],
    recentReactions = [],
    state,
    survey = null,
  } = props;
  const effectState = state?.effectState ?? {};
  const slideSnapshotUrl = readSlideSnapshotUrl(effectState);
  const slideFallback = readSlideFallback(effectState);
  const slideLabel =
    state?.slideIndex !== null && state?.slideIndex !== undefined
      ? `현재 슬라이드 ${state.slideIndex + 1}`
      : "현재 슬라이드 대기 중";

  return (
    <section
      className="audience-live-shell"
      aria-labelledby="audience-current-slide-title"
    >
      <div className="audience-slide-frame">
        <h2 id="audience-current-slide-title">{slideLabel}</h2>
        {slideSnapshotUrl ? (
          <img
            alt={slideLabel}
            className="audience-slide-snapshot"
            src={slideSnapshotUrl}
          />
        ) : slideFallback ? (
          <div className="audience-slide-deck-fallback" aria-label={slideLabel}>
            <SlideshowRenderer
              deck={slideFallback.deck}
              highlights={readSlideHighlights(effectState)}
              renderMode="single-screen"
              scale={0.18}
              slideId={slideFallback.slideId}
              stepIndex={readSlideStepIndex(effectState)}
              triggerAnimationIds={readTriggerAnimationIds(effectState)}
            />
          </div>
        ) : (
          <div
            className="audience-slide-fallback"
            role="img"
            aria-label={
              state?.slideId
                ? `${slideLabel} 이미지 준비 중`
                : "발표가 시작되면 슬라이드가 표시됩니다."
            }
          >
            <span>{state?.slideId ? "슬라이드 준비 중" : "대기 중"}</span>
          </div>
        )}
      </div>
      <p className="audience-connection-status" role="status">
        {toConnectionStatusCopy(connectionStatus)}
      </p>
      <AudienceActiveCards
        activeInteraction={activeInteraction}
        features={features}
        privateAnswer={privateAnswer}
        quizReveal={quizReveal}
        recentReactions={recentReactions}
        sessionId={participant.sessionId}
      />
      {survey ? <AudienceSurveyCard survey={survey} /> : null}
      <p className="audience-participant-label">{participant.nickname}</p>
    </section>
  );
}

function AudienceActiveCards({
  activeInteraction,
  features,
  recentReactions,
  sessionId,
  privateAnswer,
  quizReveal,
}: {
  activeInteraction: SessionInteraction | null;
  features: AudienceFeatureSettings | null;
  privateAnswer: AudienceQuestionAnswerResponse | null;
  quizReveal: QuizAnswerRevealItem[];
  recentReactions: ReactionType[];
  sessionId: string;
}) {
  const cards = getAudienceActiveCards(features, Boolean(activeInteraction));
  if (
    cards.length === 0 &&
    !activeInteraction &&
    !features?.qnaEnabled &&
    !features?.reactionsEnabled
  ) {
    return null;
  }

  return (
    <section className="audience-active-cards" aria-label="활성 청중 기능">
      {features?.qnaEnabled ? (
        <AudienceQnaCard privateAnswer={privateAnswer} sessionId={sessionId} />
      ) : null}
      {activeInteraction ? (
        <AudienceInteractionCard
          interaction={activeInteraction}
          quizReveal={quizReveal}
        />
      ) : null}
      {features?.reactionsEnabled ? (
        <AudienceReactionCard
          recentReactions={recentReactions}
          sessionId={sessionId}
        />
      ) : null}
      {cards.map((card) => (
        <article className="audience-active-card" key={card.label}>
          <span>{card.label}</span>
          <button type="button" disabled>
            {card.action}
          </button>
        </article>
      ))}
    </section>
  );
}

function getAudienceActiveCards(
  features: AudienceFeatureSettings | null,
  hasActiveInteraction: boolean,
) {
  if (!features) {
    return [];
  }

  return [
    features.aiQnaEnabled ? { action: "AI 답변 대기", label: "AI Q&A" } : null,
    features.pollsEnabled && !hasActiveInteraction
      ? { action: "대기 중", label: "Poll" }
      : null,
    features.quizzesEnabled && !hasActiveInteraction
      ? { action: "대기 중", label: "Quiz" }
      : null,
    features.surveyEnabled ? { action: "설문 작성", label: "Survey" } : null,
  ].filter((card): card is { action: string; label: string } => Boolean(card));
}

const reactionButtons: Array<{
  type: ReactionType;
  label: string;
  symbol: string;
}> = [
  { type: "clap", label: "박수", symbol: "👏" },
  { type: "heart", label: "좋아요", symbol: "❤" },
  { type: "wow", label: "놀람", symbol: "!" },
  { type: "laugh", label: "웃음", symbol: "ㅎㅎ" },
];

function AudienceReactionCard({
  recentReactions,
  sessionId,
}: {
  recentReactions: ReactionType[];
  sessionId: string;
}) {
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleReaction(reaction: ReactionType) {
    setMessage("");
    setErrorMessage("");
    try {
      await submitAudienceReaction({ sessionId, reaction });
      setMessage("반응을 보냈습니다.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : audienceCopy["reaction.rateLimited"],
      );
    }
  }

  return (
    <article className="audience-active-card audience-interaction-card">
      <span>Reactions</span>
      <div className="audience-reaction-buttons" aria-label="반응 보내기">
        {reactionButtons.map((reaction) => (
          <button
            aria-label={`${reaction.label} 반응 보내기`}
            key={reaction.type}
            type="button"
            onClick={() => void handleReaction(reaction.type)}
          >
            {reaction.symbol}
          </button>
        ))}
      </div>
      {recentReactions.length > 0 ? (
        <div className="audience-reaction-stream" aria-label="최근 반응">
          {recentReactions.map((reaction, index) => (
            <span key={`${reaction}-${index}`}>
              {getReactionSymbol(reaction)}
            </span>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className="audience-interaction-status" role="status">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="audience-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </article>
  );
}

function getReactionSymbol(reaction: ReactionType) {
  return (
    reactionButtons.find((button) => button.type === reaction)?.symbol ??
    reaction
  );
}

function toRecentReactions(
  current: ReactionType[],
  payload: AudienceReactionPayload,
) {
  return [payload.reaction, ...current].slice(0, 5);
}

function AudienceSurveyCard({ survey }: { survey: SurveyForm }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [contactAnswers, setContactAnswers] = useState<Record<string, unknown>>(
    {},
  );
  const [contactConsent, setContactConsent] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");
    try {
      await submitAudienceSurvey({
        sessionId: survey.sessionId,
        answers,
        contactConsent,
        contactAnswers: contactConsent ? contactAnswers : {},
      });
      setStatusMessage(audienceCopy["survey.submitted"]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : audienceCopy["survey.windowExpired"],
      );
    }
  }

  return (
    <article className="audience-active-card audience-survey-card">
      <span>{survey.title}</span>
      <form onSubmit={(event) => void handleSubmit(event)}>
        {survey.questions.map((question) => (
          <SurveyQuestionField
            key={question.questionId}
            onChange={(value) =>
              setAnswers((current) => ({
                ...current,
                [question.questionId]: value,
              }))
            }
            question={question}
            value={answers[question.questionId]}
          />
        ))}
        {survey.contact.enabled ? (
          <fieldset className="audience-survey-contact">
            <legend>연락처</legend>
            <label>
              <input
                checked={contactConsent}
                type="checkbox"
                onChange={(event) => setContactConsent(event.target.checked)}
              />
              {survey.contact.consentText}
            </label>
            <p>{audienceCopy["survey.contact.sensitiveWarning"]}</p>
            {contactConsent
              ? survey.contact.fields.map((question) => (
                  <SurveyQuestionField
                    key={question.questionId}
                    onChange={(value) =>
                      setContactAnswers((current) => ({
                        ...current,
                        [question.questionId]: value,
                      }))
                    }
                    question={question}
                    value={contactAnswers[question.questionId]}
                  />
                ))
              : null}
          </fieldset>
        ) : null}
        <button type="submit">{audienceCopy["survey.submit"]}</button>
      </form>
      {statusMessage ? (
        <p className="audience-interaction-status" role="status">
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="audience-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </article>
  );
}

function SurveyQuestionField({
  onChange,
  question,
  value,
}: {
  onChange: (value: unknown) => void;
  question: InteractionQuestion;
  value: unknown;
}) {
  const label = `${question.prompt}${"required" in question && question.required ? " *" : ""}`;

  if (question.type === "scale") {
    return (
      <label>
        <span>{label}</span>
        <input
          max={question.max}
          min={question.min}
          required={question.required}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    );
  }

  if (question.type === "choice") {
    if (question.allowMultiple) {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset>
          <legend>{label}</legend>
          {question.options.map((option) => (
            <label key={option.optionId}>
              <input
                checked={selected.includes(option.optionId)}
                type="checkbox"
                value={option.optionId}
                onChange={(event) => {
                  onChange(
                    event.target.checked
                      ? [...selected, option.optionId]
                      : selected.filter((item) => item !== option.optionId),
                  );
                }}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      );
    }

    return (
      <label>
        <span>{label}</span>
        <select
          required={question.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">선택</option>
          {question.options.map((option) => (
            <option key={option.optionId} value={option.optionId}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (question.type === "open-text") {
    return (
      <label>
        <span>{label}</span>
        <textarea
          maxLength={question.maxLength}
          required={question.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  if (question.type === "ranking") {
    return (
      <label>
        <span>{label}</span>
        <input
          required={question.required}
          type="text"
          value={Array.isArray(value) ? value.join(",") : ""}
          onChange={(event) =>
            onChange(
              event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
        />
      </label>
    );
  }

  return null;
}

function AudienceQnaCard({
  privateAnswer,
  sessionId,
}: {
  privateAnswer: AudienceQuestionAnswerResponse | null;
  sessionId: string;
}) {
  const [questionText, setQuestionText] = useState("");
  const [question, setQuestion] = useState<AudienceQuestion | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (
      !privateAnswer ||
      !question ||
      privateAnswer.question.questionId !== question.questionId
    ) {
      return;
    }

    setQuestion(privateAnswer.question);
    setAnswerText(privateAnswer.answer?.answerText ?? "");
  }, [privateAnswer, question]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    try {
      const response = await submitAudienceQuestion({
        sessionId,
        text: questionText,
      });
      setQuestion(response.question);
      setQuestionText("");
      const answer = await fetchAudienceQuestionAnswer({
        sessionId,
        questionId: response.question.questionId,
      });
      setAnswerText(answer.answer?.answerText ?? "");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : audienceCopy["qna.error.rateLimited"],
      );
    }
  }

  async function handleUnresolved() {
    if (!question) {
      return;
    }

    setErrorMessage("");
    try {
      await updateAiAnswerFeedback({
        sessionId,
        questionId: question.questionId,
        feedback: "unresolved",
      });
      setQuestion({ ...question, status: "pending" });
      setAnswerText(audienceCopy["ai.answer.escalated"]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : audienceCopy["ai.answer.escalated"],
      );
    }
  }

  return (
    <article className="audience-active-card audience-interaction-card">
      <span>Q&A</span>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label className="audience-field" htmlFor="audience-qna-question">
          <span>질문</span>
          <textarea
            id="audience-qna-question"
            maxLength={1000}
            placeholder={audienceCopy["qna.input.placeholder"]}
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
          />
        </label>
        <button type="submit" disabled={!questionText.trim()}>
          {audienceCopy["qna.submit"]}
        </button>
      </form>
      {question ? (
        <p className="audience-interaction-status" role="status">
          {question.status === "answered"
            ? "발표자가 답변한 질문입니다."
            : "발표자 대기열에 질문을 전달했습니다."}
        </p>
      ) : null}
      {answerText ? (
        <div className="audience-ai-answer" role="status">
          <p>{answerText}</p>
          <button type="button" onClick={() => void handleUnresolved()}>
            {audienceCopy["ai.answer.unresolvedCta"]}
          </button>
        </div>
      ) : null}
      {errorMessage ? (
        <p className="audience-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </article>
  );
}

function AudienceInteractionCard({
  interaction,
  quizReveal,
}: {
  interaction: SessionInteraction;
  quizReveal: QuizAnswerRevealItem[];
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const showQuizReveal =
    interaction.kind === "quiz" &&
    interaction.closedAt !== null &&
    quizReveal.length > 0;

  function updateAnswer(questionId: string, value: string | string[]) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    try {
      for (const question of interaction.questions) {
        const answer = buildAnswer(question, answers[question.questionId] ?? "");
        if (!answer) {
          if ("required" in question && !question.required) {
            continue;
          }
          setErrorMessage("응답을 선택해 주세요.");
          return;
        }

        await submitAudienceInteractionResponse({
          sessionId: interaction.sessionId,
          interactionId: interaction.interactionId,
          questionId: question.questionId,
          answer,
        });
      }
      setMessage(
        interaction.kind === "quiz"
          ? "퀴즈 응답이 제출되었습니다."
          : "응답이 저장되었습니다.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "응답을 제출하지 못했습니다.",
      );
    }
  }

  return (
    <article className="audience-active-card audience-interaction-card">
      <span>{interaction.kind === "quiz" ? "Quiz" : "Poll"}</span>
      {showQuizReveal ? (
        <QuizRevealList interaction={interaction} quizReveal={quizReveal} />
      ) : interaction.closedAt !== null ? (
        <p className="audience-interaction-status" role="status">
          {interaction.kind === "quiz"
            ? "퀴즈가 종료되었습니다."
            : "응답이 종료되었습니다."}
        </p>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)}>
          {interaction.questions.map((question) => (
            <fieldset key={question.questionId}>
              <legend>{question.prompt}</legend>
              <InteractionQuestionInput
                question={question}
                value={answers[question.questionId] ?? ""}
                onChange={(value) => updateAnswer(question.questionId, value)}
              />
            </fieldset>
          ))}
          <button type="submit">
            {interaction.kind === "quiz" ? "퀴즈 제출" : "응답 제출"}
          </button>
        </form>
      )}
      {message ? (
        <p className="audience-interaction-status" role="status">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="audience-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </article>
  );
}

function QuizRevealList({
  interaction,
  quizReveal,
}: {
  interaction: SessionInteraction;
  quizReveal: QuizAnswerRevealItem[];
}) {
  return (
    <div className="audience-quiz-reveal" role="status">
      <p>퀴즈 결과가 공개되었습니다.</p>
      {quizReveal.map((item) => {
        const question = interaction.questions.find(
          (candidate) => candidate.questionId === item.questionId,
        );
        if (!question) {
          return null;
        }

        return (
          <section key={item.questionId}>
            <h3>{question.prompt}</h3>
            <dl>
              <div>
                <dt>내 답</dt>
                <dd>{formatInteractionAnswer(question, item.submittedAnswer)}</dd>
              </div>
              <div>
                <dt>정답</dt>
                <dd>{formatInteractionAnswer(question, item.correctAnswer)}</dd>
              </div>
              <div>
                <dt>결과</dt>
                <dd>
                  {item.isCorrect === true
                    ? "정답입니다."
                    : item.isCorrect === false
                      ? "오답입니다."
                      : "제출한 답이 없습니다."}
                </dd>
              </div>
              {item.score !== null ? (
                <div>
                  <dt>점수</dt>
                  <dd>{item.score}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

function InteractionQuestionInput(props: {
  question: InteractionQuestion;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  const { question, value, onChange } = props;
  if (question.type === "choice" || question.type === "quiz-multiple-choice") {
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    const allowMultiple =
      question.type === "choice" ? question.allowMultiple : true;
    return (
      <div className="audience-interaction-options">
        {question.options.map((option) => (
          <label key={option.optionId}>
            <input
              checked={selected.includes(option.optionId)}
              name={question.questionId}
              type={allowMultiple ? "checkbox" : "radio"}
              value={option.optionId}
              onChange={(event) => {
                if (!allowMultiple) {
                  onChange(event.target.value);
                  return;
                }

                onChange(
                  event.target.checked
                    ? [...selected, option.optionId]
                    : selected.filter((item) => item !== option.optionId),
                );
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "scale") {
    const textValue = typeof value === "string" ? value : "";
    return (
      <label className="audience-field" htmlFor={question.questionId}>
        <span>1-5</span>
        <input
          id={question.questionId}
          inputMode="numeric"
          max={5}
          min={1}
          type="number"
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  if (question.type === "ranking") {
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <div className="audience-interaction-options">
        {question.options.map((option) => (
          <label key={option.optionId}>
            <input
              checked={selected.includes(option.optionId)}
              name={question.questionId}
              type="checkbox"
              value={option.optionId}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, option.optionId].slice(0, 5)
                  : selected.filter((item) => item !== option.optionId);
                onChange(next);
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "quiz-true-false") {
    return (
      <div className="audience-interaction-options">
        <label>
          <input
            checked={value === "true"}
            name={question.questionId}
            type="radio"
            value="true"
            onChange={(event) => onChange(event.target.value)}
          />
          <span>참</span>
        </label>
        <label>
          <input
            checked={value === "false"}
            name={question.questionId}
            type="radio"
            value="false"
            onChange={(event) => onChange(event.target.value)}
          />
          <span>거짓</span>
        </label>
      </div>
    );
  }

  return (
    <label className="audience-field" htmlFor={question.questionId}>
      <span>답변</span>
      <textarea
        id={question.questionId}
        maxLength={1000}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function buildAnswer(
  question: InteractionQuestion,
  value: string | string[],
): InteractionAnswer | null {
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const textValue = typeof value === "string" ? value.trim() : "";
  if (selectedValues.length === 0 && !textValue) {
    return null;
  }

  if (question.type === "scale") {
    return { type: "scale", value: Number(textValue) };
  }

  if (question.type === "open-text") {
    return { type: "open-text", text: textValue };
  }

  if (question.type === "ranking") {
    return {
      type: "ranking",
      orderedOptionIds: selectedValues.slice(0, 5),
    };
  }

  if (question.type === "quiz-true-false") {
    return { type: "quiz-true-false", answer: textValue === "true" };
  }

  if (question.type === "quiz-multiple-choice") {
    return { type: "quiz-multiple-choice", selectedOptionIds: selectedValues };
  }

  return { type: "choice", selectedOptionIds: selectedValues };
}

function formatInteractionAnswer(
  question: InteractionQuestion,
  answer: InteractionAnswer | null,
) {
  if (!answer) {
    return "제출하지 않음";
  }

  if (answer.type === "quiz-true-false") {
    return answer.answer ? "참" : "거짓";
  }

  if (
    (answer.type === "choice" || answer.type === "quiz-multiple-choice") &&
    (question.type === "choice" || question.type === "quiz-multiple-choice")
  ) {
    const labelsById = new Map(
      question.options.map((option) => [option.optionId, option.label]),
    );
    return answer.selectedOptionIds
      .map((optionId) => labelsById.get(optionId) ?? optionId)
      .join(", ");
  }

  if (answer.type === "scale") {
    return String(answer.value);
  }

  if (answer.type === "ranking") {
    return answer.orderedOptionIds.join(", ");
  }

  if (answer.type === "open-text") {
    return answer.text;
  }

  return "응답";
}

function readSlideSnapshotUrl(payload: Record<string, unknown>) {
  const value = payload.slideSnapshotUrl;
  return typeof value === "string" && value.length > 0 ? value : "";
}

type AudienceSlideFallback = {
  deck: Deck;
  slideId: string;
};

function readSlideFallback(
  payload: Record<string, unknown>,
): AudienceSlideFallback | null {
  const value = payload.slideFallback;
  if (!isRecord(value)) {
    return null;
  }

  const parsedDeck = deckSchema.safeParse(value.deck);
  if (!parsedDeck.success) {
    return null;
  }

  const slideIndex =
    typeof value.slideIndex === "number" ? Math.trunc(value.slideIndex) : 0;
  const slide = parsedDeck.data.slides[slideIndex] ?? parsedDeck.data.slides[0];
  if (!slide) {
    return null;
  }

  return {
    deck: parsedDeck.data,
    slideId: slide.slideId,
  };
}

function readSlideStepIndex(payload: Record<string, unknown>) {
  const value = payload.stepIndex;
  return typeof value === "number" ? Math.max(0, Math.trunc(value)) : 0;
}

function readTriggerAnimationIds(payload: Record<string, unknown>) {
  const value = payload.triggerAnimationIds;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readSlideHighlights(payload: Record<string, unknown>) {
  const value = payload.highlights;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.elementId !== "string") {
      return [];
    }

    return [
      {
        active: item.active === true,
        elementId: item.elementId,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toConnectionStatusCopy(status: AudienceRealtimeStatus) {
  if (status === "connected") return "실시간 연결됨";
  if (status === "reconnecting") return audienceCopy["connection.reconnecting"];
  if (status === "error") return "실시간 연결을 확인해 주세요.";
  if (status === "connecting") return "실시간 연결 중";
  return "실시간 연결 대기 중";
}
