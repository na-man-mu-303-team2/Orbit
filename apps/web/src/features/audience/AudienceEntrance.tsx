import type {
  AudienceActiveInteractionResponse,
  AudienceFeatureSettings,
  AudienceParticipant,
  AudiencePublicSession,
  AudienceReactionPayload,
  AudienceRealtimeState,
  AudienceStateResponse,
  InteractionAnswer,
  InteractionQuestion,
  AudienceQuestion,
  ReactionType,
  SessionInteraction,
} from "@orbit/shared";
import { CheckCircle2, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  fetchAudienceActiveInteraction,
  fetchAudienceQuestionAnswer,
  fetchAudienceState,
  fetchAudienceMe,
  joinAudienceSession,
  lookupAudienceSession,
  submitAudienceInteractionResponse,
  submitAudienceQuestion,
  submitAudienceReaction,
  updateAiAnswerFeedback,
} from "./audienceApi";
import { audienceCopy } from "./audienceCopy";
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
  const [connectionStatus, setConnectionStatus] =
    useState<AudienceRealtimeStatus>("idle");
  const [recentReactions, setRecentReactions] = useState<ReactionType[]>([]);
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
      setConnectionStatus("idle");
      setRecentReactions([]);
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
      onReaction: (payload) => {
        if (!isCancelled) {
          setRecentReactions((current) => toRecentReactions(current, payload));
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
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    audienceState?.features.pollsEnabled,
    audienceState?.features.quizzesEnabled,
    audienceState?.state.activeInteractionId,
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
              recentReactions={recentReactions}
              state={audienceState?.state ?? null}
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
  recentReactions?: ReactionType[];
  state: AudienceRealtimeState | null;
}) {
  const {
    activeInteraction,
    connectionStatus,
    features,
    participant,
    recentReactions = [],
    state,
  } = props;
  const slideSnapshotUrl = readSlideSnapshotUrl(state?.effectState ?? {});
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
        recentReactions={recentReactions}
        sessionId={participant.sessionId}
      />
      <p className="audience-participant-label">{participant.nickname}</p>
    </section>
  );
}

function AudienceActiveCards({
  activeInteraction,
  features,
  recentReactions,
  sessionId,
}: {
  activeInteraction: SessionInteraction | null;
  features: AudienceFeatureSettings | null;
  recentReactions: ReactionType[];
  sessionId: string;
}) {
  const cards = getAudienceActiveCards(features);
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
      {features?.qnaEnabled ? <AudienceQnaCard sessionId={sessionId} /> : null}
      {activeInteraction ? (
        <AudienceInteractionCard interaction={activeInteraction} />
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

function getAudienceActiveCards(features: AudienceFeatureSettings | null) {
  if (!features) {
    return [];
  }

  return [
    features.aiQnaEnabled ? { action: "AI 답변 대기", label: "AI Q&A" } : null,
    features.pollsEnabled ? { action: "대기 중", label: "Poll" } : null,
    features.quizzesEnabled ? { action: "대기 중", label: "Quiz" } : null,
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

function AudienceQnaCard({ sessionId }: { sessionId: string }) {
  const [questionText, setQuestionText] = useState("");
  const [question, setQuestion] = useState<AudienceQuestion | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
}: {
  interaction: SessionInteraction;
}) {
  const [selectedValue, setSelectedValue] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const question = interaction.questions[0];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    const answer = buildAnswer(question, selectedValue);
    if (!answer) {
      setErrorMessage("응답을 선택해 주세요.");
      return;
    }

    try {
      await submitAudienceInteractionResponse({
        sessionId: interaction.sessionId,
        interactionId: interaction.interactionId,
        questionId: question.questionId,
        answer,
      });
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
      <form onSubmit={(event) => void handleSubmit(event)}>
        <fieldset>
          <legend>{question.prompt}</legend>
          <InteractionQuestionInput
            question={question}
            value={selectedValue}
            onChange={setSelectedValue}
          />
        </fieldset>
        <button type="submit">
          {interaction.kind === "quiz" ? "퀴즈 제출" : "응답 제출"}
        </button>
      </form>
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

function InteractionQuestionInput(props: {
  question: InteractionQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const { question, value, onChange } = props;
  if (
    question.type === "choice" ||
    question.type === "quiz-multiple-choice" ||
    question.type === "ranking"
  ) {
    return (
      <div className="audience-interaction-options">
        {question.options.map((option) => (
          <label key={option.optionId}>
            <input
              checked={value === option.optionId}
              name={question.questionId}
              type="radio"
              value={option.optionId}
              onChange={(event) => onChange(event.target.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "scale") {
    return (
      <label className="audience-field" htmlFor={question.questionId}>
        <span>1-5</span>
        <input
          id={question.questionId}
          inputMode="numeric"
          max={5}
          min={1}
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function buildAnswer(
  question: InteractionQuestion,
  value: string,
): InteractionAnswer | null {
  if (!value.trim()) {
    return null;
  }

  if (question.type === "scale") {
    return { type: "scale", value: Number(value) };
  }

  if (question.type === "open-text") {
    return { type: "open-text", text: value };
  }

  if (question.type === "ranking") {
    return {
      type: "ranking",
      orderedOptionIds: [
        value,
        ...question.options
          .map((option) => option.optionId)
          .filter((optionId) => optionId !== value),
      ].slice(0, 5),
    };
  }

  if (question.type === "quiz-true-false") {
    return { type: "quiz-true-false", answer: value === "true" };
  }

  if (question.type === "quiz-multiple-choice") {
    return { type: "quiz-multiple-choice", selectedOptionIds: [value] };
  }

  return { type: "choice", selectedOptionIds: [value] };
}

function readSlideSnapshotUrl(payload: Record<string, unknown>) {
  const value = payload.slideSnapshotUrl;
  return typeof value === "string" && value.length > 0 ? value : "";
}

function toConnectionStatusCopy(status: AudienceRealtimeStatus) {
  if (status === "connected") return "실시간 연결됨";
  if (status === "reconnecting") return audienceCopy["connection.reconnecting"];
  if (status === "error") return "실시간 연결을 확인해 주세요.";
  if (status === "connecting") return "실시간 연결 중";
  return "실시간 연결 대기 중";
}
