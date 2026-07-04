import type {
  AudienceParticipant,
  AudiencePublicSession,
  AudienceRealtimeState,
  AudienceStateResponse,
} from "@orbit/shared";
import { CheckCircle2, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  fetchAudienceState,
  fetchAudienceMe,
  joinAudienceSession,
  lookupAudienceSession,
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
  const [connectionStatus, setConnectionStatus] =
    useState<AudienceRealtimeStatus>("idle");
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
      setConnectionStatus("idle");
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
              connectionStatus={connectionStatus}
              participant={participant}
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
  connectionStatus: AudienceRealtimeStatus;
  participant: AudienceParticipant;
  state: AudienceRealtimeState | null;
}) {
  const { connectionStatus, participant, state } = props;
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
      <p className="audience-participant-label">{participant.nickname}</p>
    </section>
  );
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
