import type { AudienceAccessSession } from "@orbit/shared";
import { IconShare as Share2, IconX as X } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  closeAudienceAccessSession,
  createAudienceAccessSession,
  fetchCurrentAudienceAccessSession
} from "./audienceLinkApi";
import {
  createQrDataUrl,
  formatAudienceExpiresAt,
  formatAudienceTimeRemaining,
  resolveAbsoluteAudienceUrl,
  toAudienceLinkErrorMessage
} from "./audienceLinkUtils";
import "./audience-link.css";

type AudienceLinkModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
};

export function AudienceLinkModal({
  isOpen,
  onClose,
  projectId
}: AudienceLinkModalProps) {
  const [audiencePasscode, setAudiencePasscode] = useState("");
  const [audienceExpiresInHours, setAudienceExpiresInHours] = useState(2);
  const [audienceSession, setAudienceSession] =
    useState<AudienceAccessSession | null>(null);
  const [audienceUrl, setAudienceUrl] = useState("");
  const [audienceQrDataUrl, setAudienceQrDataUrl] = useState("");
  const [audienceLinkError, setAudienceLinkError] = useState("");
  const [isAudienceLinkLoading, setIsAudienceLinkLoading] = useState(false);
  const [isAudienceCloseConfirming, setIsAudienceCloseConfirming] =
    useState(false);
  const [audienceNowMs, setAudienceNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAudienceNowMs(Date.now());
    const timerId = window.setInterval(() => setAudienceNowMs(Date.now()), 60_000);

    return () => window.clearInterval(timerId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;
    setAudienceLinkError("");
    setIsAudienceCloseConfirming(false);
    setIsAudienceLinkLoading(true);
    void fetchCurrentAudienceAccessSession(projectId)
      .then(async (payload) => {
        if (isCancelled) {
          return;
        }

        setAudienceSession(payload.session);
        const nextAudienceUrl = payload.audienceUrl
          ? resolveAbsoluteAudienceUrl(payload.audienceUrl)
          : "";
        setAudienceUrl(nextAudienceUrl);
        setAudienceQrDataUrl(nextAudienceUrl ? await createQrDataUrl(nextAudienceUrl) : "");
      })
      .catch((error) => {
        if (!isCancelled) {
          setAudienceLinkError(toAudienceLinkErrorMessage(error));
          setAudienceSession(null);
          setAudienceUrl("");
          setAudienceQrDataUrl("");
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsAudienceLinkLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, projectId]);

  function closeModal() {
    setIsAudienceCloseConfirming(false);
    onClose();
  }

  function updateAudiencePasscode(value: string) {
    setAudiencePasscode(value.replace(/\D/g, "").slice(0, 4));
  }

  async function handleCreateAudienceLink() {
    if (!/^\d{4}$/.test(audiencePasscode) || isAudienceLinkLoading) {
      setAudienceLinkError("4자리 숫자 비밀번호를 입력해 주세요.");
      return;
    }

    setIsAudienceLinkLoading(true);
    setAudienceLinkError("");

    try {
      const payload = await createAudienceAccessSession({
        expiresInHours: audienceExpiresInHours,
        passcode: audiencePasscode,
        projectId
      });
      const nextAudienceUrl = resolveAbsoluteAudienceUrl(payload.audienceUrl);
      setAudienceSession(payload.session);
      setAudienceUrl(nextAudienceUrl);
      setAudienceQrDataUrl(await createQrDataUrl(nextAudienceUrl));
      setAudiencePasscode("");
      setIsAudienceCloseConfirming(false);
    } catch (error) {
      setAudienceLinkError(toAudienceLinkErrorMessage(error));
    } finally {
      setIsAudienceLinkLoading(false);
    }
  }

  async function handleCloseAudienceLink() {
    if (!audienceSession || isAudienceLinkLoading) {
      return;
    }

    setIsAudienceLinkLoading(true);
    setAudienceLinkError("");

    try {
      await closeAudienceAccessSession({
        projectId,
        sessionId: audienceSession.sessionId
      });
      setAudienceSession(null);
      setAudienceUrl("");
      setAudienceQrDataUrl("");
      setIsAudienceCloseConfirming(false);
    } catch (error) {
      setAudienceLinkError(toAudienceLinkErrorMessage(error));
      setIsAudienceCloseConfirming(false);
    } finally {
      setIsAudienceLinkLoading(false);
    }
  }

  async function handleCopyAudienceUrl() {
    if (!audienceUrl || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(audienceUrl);
  }

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="audience-link-modal-backdrop"
      role="presentation"
      onMouseDown={closeModal}
    >
      <section
        aria-label="청중 링크와 QR"
        aria-modal="true"
        className="audience-link-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong>청중 링크/QR</strong>
            <span>4자리 입장 비밀번호로 보호되는 청중 입장 링크입니다.</span>
          </div>
          <button
            className="audience-link-close-button"
            type="button"
            aria-label="청중 링크 모달 닫기"
            onClick={closeModal}
          >
            <X size={16} />
          </button>
        </header>
        {audienceSession && audienceUrl ? (
          <section className="audience-link-current">
            <div className="audience-link-status-row">
              <span
                className={`audience-link-status audience-link-status-${audienceSession.status}`}
              >
                {audienceSession.status === "open" ? "입장 열림" : "입장 닫힘"}
              </span>
            </div>
            <div className="audience-link-qr-frame">
              {audienceQrDataUrl ? (
                <img alt="청중 입장 QR 코드" src={audienceQrDataUrl} />
              ) : (
                <Share2 size={28} />
              )}
            </div>
            <div className="audience-link-expiry-summary">
              <strong>
                {formatAudienceTimeRemaining(audienceSession.expiresAt, audienceNowMs)}
              </strong>
              <span>만료 {formatAudienceExpiresAt(audienceSession.expiresAt)}</span>
            </div>
            <label className="audience-link-url-field">
              <span>주소 영역</span>
              <input readOnly value={audienceUrl} />
            </label>
            <div className="audience-link-actions">
              <button
                type="button"
                onClick={() => void handleCopyAudienceUrl()}
                disabled={!audienceUrl}
              >
                복사
              </button>
              <button
                className="audience-link-session-close"
                type="button"
                onClick={() => setIsAudienceCloseConfirming(true)}
                disabled={isAudienceLinkLoading || audienceSession.status === "closed"}
              >
                세션 닫기
              </button>
              <button className="audience-link-modal-dismiss" type="button" onClick={closeModal}>
                닫기
              </button>
            </div>
          </section>
        ) : null}
        {isAudienceCloseConfirming ? (
          <div
            className="audience-link-confirm-backdrop"
            role="presentation"
            onMouseDown={() => setIsAudienceCloseConfirming(false)}
          >
            <section
              aria-label="세션 닫기 확인"
              aria-modal="true"
              className="audience-link-confirm-modal"
              role="alertdialog"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <strong>세션을 닫을까요?</strong>
              <p>
                현재 청중 입장 링크가 닫히고, 이 QR 코드로는 더 이상 입장할 수
                없습니다.
              </p>
              <div className="audience-link-confirm-actions">
                <button
                  type="button"
                  onClick={() => setIsAudienceCloseConfirming(false)}
                  disabled={isAudienceLinkLoading}
                >
                  취소
                </button>
                <button
                  className="audience-link-confirm-danger"
                  type="button"
                  onClick={() => void handleCloseAudienceLink()}
                  disabled={isAudienceLinkLoading}
                >
                  {isAudienceLinkLoading ? "닫는 중" : "세션 닫기"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {!audienceSession ? (
          <section className="audience-link-create">
            <label>
              <span>입장 비밀번호</span>
              <div className="audience-pin-inputs" aria-label="4자리 입장 비밀번호">
                <input
                  aria-label="4자리 입장 비밀번호"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]*"
                  type="text"
                  value={audiencePasscode}
                  onChange={(event) => updateAudiencePasscode(event.target.value)}
                />
                {[0, 1, 2, 3].map((index) => (
                  <span key={index} aria-hidden="true">
                    {audiencePasscode[index] ?? ""}
                  </span>
                ))}
              </div>
            </label>
            <label className="audience-expiry-field">
              <span>링크 유효시간</span>
              <select
                value={audienceExpiresInHours}
                onChange={(event) => setAudienceExpiresInHours(Number(event.target.value))}
              >
                <option value={1}>1시간</option>
                <option value={2}>2시간</option>
                <option value={6}>6시간</option>
                <option value={12}>12시간</option>
                <option value={24}>24시간</option>
              </select>
            </label>
            <button
              className="audience-link-primary"
              type="button"
              onClick={() => void handleCreateAudienceLink()}
              disabled={isAudienceLinkLoading}
            >
              {isAudienceLinkLoading ? "처리 중..." : "QR코드 생성"}
            </button>
          </section>
        ) : null}
        {audienceLinkError ? (
          <p className="audience-link-error" role="alert">
            {audienceLinkError}
          </p>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
