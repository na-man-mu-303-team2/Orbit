import type { AudienceParticipant, AudiencePublicSession } from "@orbit/shared";
import { CheckCircle2, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  fetchAudienceMe,
  joinAudienceSession,
  lookupAudienceSession,
} from "./audienceApi";
import { audienceCopy } from "./audienceCopy";
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
          <section className="audience-waiting-room" aria-live="polite">
            <CheckCircle2 size={24} />
            <div>
              <h2>{audienceCopy["waiting.title"]}</h2>
              <p>{audienceCopy["waiting.body"]}</p>
              <small>{participant.nickname}</small>
            </div>
          </section>
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
