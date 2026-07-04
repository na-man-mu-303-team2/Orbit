import type {
  AudienceFeatureSettings,
  PresentationSession,
} from "@orbit/shared";
import { BarChart3, ExternalLink, QrCode, Users } from "lucide-react";
import { useEffect, useState } from "react";

import {
  fetchAudienceFeatureSettings,
  fetchCurrentAudienceAccessSession,
  updateAudienceAccessEntryStatus,
  updateAudienceFeatureSettings,
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
} from "./AudienceFeatureSettingsControls";

import "./audienceFeatureControls.css";

type AudiencePresenterPanelProps = {
  projectId: string;
  publisher?: AudiencePresenterRealtimePublisher | null;
  variant?: "overlay" | "page";
};

export function AudiencePresenterPanel({
  projectId,
  publisher = null,
  variant = "overlay",
}: AudiencePresenterPanelProps) {
  const [session, setSession] = useState<PresentationSession | null>(null);
  const [audienceUrl, setAudienceUrl] = useState("");
  const [audienceQrDataUrl, setAudienceQrDataUrl] = useState("");
  const [features, setFeatures] = useState<AudienceFeatureSettings | null>(
    null,
  );
  const [fallbackPublisher, setFallbackPublisher] =
    useState<AudiencePresenterRealtimePublisher | null>(null);
  const [busyKey, setBusyKey] = useState<AudienceFeatureKey | null>(null);
  const [isEntryBusy, setIsEntryBusy] = useState(false);
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

        const settings = await fetchAudienceFeatureSettings({
          projectId,
          sessionId: nextSession.sessionId,
        });
        if (!isCancelled) {
          setFeatures(settings.features);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setErrorMessage(toAudienceLinkErrorMessage(error));
          setSession(null);
          setAudienceUrl("");
          setAudienceQrDataUrl("");
          setFeatures(null);
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
  }, [projectId]);

  useEffect(() => {
    if (publisher || !session) {
      setFallbackPublisher(null);
      return;
    }

    const nextPublisher = createAudiencePresenterRealtimePublisher({
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

  const isOpen = session?.entryStatus === "open";
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
            href={`/audience/${encodeURIComponent(projectId)}/control`}
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

          <div
            className="audience-presenter-results"
            aria-label="청중 결과 요약"
          >
            <span>
              <BarChart3 size={15} />
              결과
            </span>
            <p>활성 상호작용 없음</p>
            <p>Q&A 대기열 0개</p>
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

export function AudiencePresenterControlPage({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <main className="audience-presenter-control-page">
      <AudiencePresenterPanel projectId={projectId} variant="page" />
    </main>
  );
}
