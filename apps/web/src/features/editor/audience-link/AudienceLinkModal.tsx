import type {
  AudienceFeatureSettings,
  PresentationSession,
} from "@orbit/shared";
import { Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  AudienceFeatureSettingsControls,
  AudienceSessionSetupSummary,
  type AudienceFeatureKey,
  normalizeAudienceFeaturePatch,
} from "../../audience/AudienceFeatureSettingsControls";
import {
  closeAudienceAccessSession,
  createAudienceAccessSession,
  fetchAudienceFeatureSettings,
  fetchCurrentAudienceAccessSession,
  updateAudienceFeatureSettings,
} from "./audienceLinkApi";
import {
  createQrDataUrl,
  formatAudienceExpiresAt,
  resolveAbsoluteAudienceUrl,
  toAudienceLinkErrorMessage,
} from "./audienceLinkUtils";
import "./audience-link.css";

type AudienceLinkModalProps = {
  deckId: string;
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
};

export function AudienceLinkModal({
  deckId,
  isOpen,
  onClose,
  projectId,
}: AudienceLinkModalProps) {
  const [audienceSession, setAudienceSession] =
    useState<PresentationSession | null>(null);
  const [audienceUrl, setAudienceUrl] = useState("");
  const [audienceQrDataUrl, setAudienceQrDataUrl] = useState("");
  const [audienceFeatures, setAudienceFeatures] =
    useState<AudienceFeatureSettings | null>(null);
  const [audienceFeatureBusyKey, setAudienceFeatureBusyKey] =
    useState<AudienceFeatureKey | null>(null);
  const [audienceLinkError, setAudienceLinkError] = useState("");
  const [isAudienceLinkLoading, setIsAudienceLinkLoading] = useState(false);
  const [isAudienceCloseConfirming, setIsAudienceCloseConfirming] =
    useState(false);

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
        setAudienceQrDataUrl(
          nextAudienceUrl ? await createQrDataUrl(nextAudienceUrl) : "",
        );
        if (payload.session) {
          const settings = await fetchAudienceFeatureSettings({
            projectId,
            sessionId: payload.session.sessionId,
          });
          if (!isCancelled) {
            setAudienceFeatures(settings.features);
          }
        } else {
          setAudienceFeatures(null);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setAudienceLinkError(toAudienceLinkErrorMessage(error));
          setAudienceSession(null);
          setAudienceUrl("");
          setAudienceQrDataUrl("");
          setAudienceFeatures(null);
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

  async function handleCreateAudienceLink() {
    if (isAudienceLinkLoading) {
      return;
    }

    setIsAudienceLinkLoading(true);
    setAudienceLinkError("");

    try {
      const payload = await createAudienceAccessSession({
        deckId,
        projectId,
      });
      const nextAudienceUrl = resolveAbsoluteAudienceUrl(payload.audienceUrl);
      setAudienceSession(payload.session);
      setAudienceUrl(nextAudienceUrl);
      setAudienceQrDataUrl(await createQrDataUrl(nextAudienceUrl));
      const settings = await fetchAudienceFeatureSettings({
        projectId,
        sessionId: payload.session.sessionId,
      });
      setAudienceFeatures(settings.features);
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
        sessionId: audienceSession.sessionId,
      });
      setAudienceSession(null);
      setAudienceUrl("");
      setAudienceQrDataUrl("");
      setAudienceFeatures(null);
      setIsAudienceCloseConfirming(false);
    } catch (error) {
      setAudienceLinkError(toAudienceLinkErrorMessage(error));
      setIsAudienceCloseConfirming(false);
    } finally {
      setIsAudienceLinkLoading(false);
    }
  }

  async function handleCopyAudienceUrl() {
    if (
      !audienceUrl ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }

    await navigator.clipboard.writeText(audienceUrl);
  }

  async function handleFeatureToggle(
    key: AudienceFeatureKey,
    enabled: boolean,
  ) {
    if (!audienceSession || !audienceFeatures || audienceFeatureBusyKey) {
      return;
    }

    setAudienceFeatureBusyKey(key);
    setAudienceLinkError("");

    try {
      const response = await updateAudienceFeatureSettings({
        projectId,
        sessionId: audienceSession.sessionId,
        settings: normalizeAudienceFeaturePatch(key, enabled),
      });
      setAudienceFeatures(response.features);
    } catch (error) {
      setAudienceLinkError(toAudienceLinkErrorMessage(error));
    } finally {
      setAudienceFeatureBusyKey(null);
    }
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
            <span>6자리 입장 코드로 청중이 바로 참여할 수 있습니다.</span>
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
                className={`audience-link-status audience-link-status-${audienceSession.entryStatus}`}
              >
                {audienceSession.entryStatus === "open"
                  ? "입장 열림"
                  : "입장 닫힘"}
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
              <strong>코드 {audienceSession.joinCode}</strong>
              <span>
                데이터 보관{" "}
                {formatAudienceExpiresAt(audienceSession.rawDataDeleteAfter)}
              </span>
            </div>
            <label className="audience-link-url-field">
              <span>주소 영역</span>
              <input readOnly value={audienceUrl} />
            </label>
            <section
              className="audience-link-feature-setup"
              aria-label="청중 기능 설정"
            >
              <div className="audience-link-subheading">
                <strong>청중 기능</strong>
                <span>세션 시작 시 선택한 설정으로 청중 화면이 열립니다.</span>
              </div>
              <AudienceFeatureSettingsControls
                busyKey={audienceFeatureBusyKey}
                disabled={isAudienceLinkLoading}
                features={audienceFeatures}
                onToggle={(key, enabled) =>
                  void handleFeatureToggle(key, enabled)
                }
              />
              <AudienceSessionSetupSummary />
            </section>
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
                disabled={
                  isAudienceLinkLoading ||
                  audienceSession.entryStatus === "closed"
                }
              >
                세션 닫기
              </button>
              <button
                className="audience-link-modal-dismiss"
                type="button"
                onClick={closeModal}
              >
                닫기
              </button>
              <a
                className="audience-link-control-link"
                href={`/audience/${encodeURIComponent(projectId)}/control`}
              >
                상세 제어
              </a>
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
              <span>입장 코드</span>
              <div
                className="audience-pin-inputs audience-pin-preview"
                aria-label="6자리 입장 코드"
              >
                <input
                  aria-label="6자리 입장 코드"
                  readOnly
                  value="자동 생성"
                />
              </div>
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
    document.body,
  );
}
