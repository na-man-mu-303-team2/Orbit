import { MessageSquareText, MonitorPlay } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getAudienceSessionAccess,
  verifyAudienceSessionPasscode
} from "./audienceApi";
import "./audience.css";

type AudienceEntranceProps = {
  sessionId: string;
};

type AudienceRoom = "questions" | "stream";

export function AudienceEntrance({ sessionId }: AudienceEntranceProps) {
  const [passcode, setPasscode] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<AudienceRoom | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkAccess() {
      try {
        await getAudienceSessionAccess(sessionId);
        if (isMounted) {
          setIsVerified(true);
        }
      } catch {
        if (isMounted) {
          setIsVerified(false);
        }
      } finally {
        if (isMounted) {
          setIsCheckingAccess(false);
        }
      }
    }

    void checkAccess();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  function updatePasscode(value: string) {
    setPasscode(value.replace(/\D/g, "").slice(0, 4));
  }

  async function handleVerifyPasscode() {
    if (passcode.length !== 4 || isVerifying) {
      return;
    }

    setErrorMessage("");
    setIsVerifying(true);
    try {
      await verifyAudienceSessionPasscode({ passcode, sessionId });
      setIsVerified(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "청중 입장 비밀번호를 확인하지 못했습니다."
      );
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <main className="audience-page">
      <section className="audience-entry-panel" aria-labelledby="audience-title">
        <div className="audience-entry-heading">
          <span>ORBIT Audience</span>
          <h1 id="audience-title">청중 입장</h1>
          <p>
            {isVerified
              ? "입장할 공간을 선택해 주세요."
              : "발표자가 공유한 4자리 비밀번호를 입력해 주세요."}
          </p>
        </div>

        {isCheckingAccess ? (
          <div className="audience-access-loading" role="status">
            입장 상태 확인 중
          </div>
        ) : !isVerified ? (
          <>
            <label className="audience-passcode-field">
              <span>입장 비밀번호</span>
              <div className="audience-passcode-boxes" aria-label="4자리 입장 비밀번호">
                <input
                  aria-label="4자리 입장 비밀번호"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]*"
                  type="text"
                  value={passcode}
                  onChange={(event) => updatePasscode(event.target.value)}
                />
                {[0, 1, 2, 3].map((index) => (
                  <span key={index} aria-hidden="true">
                    {passcode[index] ?? ""}
                  </span>
                ))}
              </div>
            </label>

            {errorMessage ? (
              <p className="audience-error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <button
              className="audience-enter-button"
              type="button"
              onClick={() => void handleVerifyPasscode()}
              disabled={passcode.length !== 4 || isVerifying}
            >
              {isVerifying ? "확인 중" : "비밀번호 확인"}
            </button>
          </>
        ) : (
          <>
            <div className="audience-verified-badge">비밀번호 확인 완료</div>
            <div className="audience-room-grid" aria-label="입장할 방 선택">
              <button
                className={selectedRoom === "questions" ? "selected" : ""}
                type="button"
                onClick={() => setSelectedRoom("questions")}
              >
                <MessageSquareText size={20} />
                <strong>질문방</strong>
                <small>발표자에게 질문을 남깁니다.</small>
              </button>
              <button
                className={selectedRoom === "stream" ? "selected" : ""}
                type="button"
                onClick={() => setSelectedRoom("stream")}
              >
                <MonitorPlay size={20} />
                <strong>스트리밍 방</strong>
                <small>발표 화면을 함께 봅니다.</small>
              </button>
            </div>

            <button
              className="audience-enter-button"
              type="button"
              disabled={selectedRoom === null}
            >
              입장하기
            </button>
          </>
        )}

        <p className="audience-session-meta">세션 {sessionId}</p>
      </section>
    </main>
  );
}
