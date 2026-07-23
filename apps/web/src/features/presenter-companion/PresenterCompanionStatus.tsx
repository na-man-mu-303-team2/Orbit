import { useCallback, useEffect, useState } from "react";
import type {
  PresentationCompanionStatus as CompanionStatus,
  PresentationSessionPurpose,
} from "@orbit/shared";
import {
  disconnectPresenterCompanion,
  fetchPresenterCompanionStatus,
} from "./presenterCompanionApi";
import { PresenterCompanionSetup, getPurposeLabel } from "./PresenterCompanionSetup";

const statusPollIntervalMs = 3_000;

export function PresenterCompanionStatus(props: {
  projectId: string;
  sessionId: string;
  sessionPurpose: PresentationSessionPurpose;
}) {
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [showPairing, setShowPairing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(
        await fetchPresenterCompanionStatus({
          projectId: props.projectId,
          sessionId: props.sessionId,
        }),
      );
      setStatusUnavailable(false);
    } catch {
      setStatusUnavailable(true);
    }
  }, [props.projectId, props.sessionId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), statusPollIntervalMs);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function disconnect() {
    try {
      await disconnectPresenterCompanion(props);
      setStatus({
        connected: false,
        connectedAt: null,
        pairingGeneration: null,
        rttBucket: null,
      });
      setShowPairing(false);
    } catch {
      setStatusUnavailable(true);
    }
  }

  return (
    <section
      aria-label="iPad 발표 도우미 상태"
      className="presenter-companion-status"
    >
      <div>
        <strong>{getPurposeLabel(props.sessionPurpose)} · iPad</strong>
        <span>{getStatusLabel(status, statusUnavailable)}</span>
      </div>
      <button type="button" onClick={() => setShowPairing((value) => !value)}>
        {status?.connected ? "다른 iPad 연결" : "iPad 연결"}
      </button>
      {status?.connected ? (
        <button type="button" onClick={() => void disconnect()}>
          연결 해제
        </button>
      ) : null}
      {showPairing ? <PresenterCompanionSetup {...props} /> : null}
    </section>
  );
}

export function getStatusLabel(
  status: CompanionStatus | null,
  unavailable: boolean,
) {
  if (unavailable) return "상태 확인 실패 · 발표는 계속됩니다";
  if (!status) return "상태 확인 중";
  if (!status.connected) return "연결 대기";
  switch (status.rttBucket) {
    case "fast":
      return "연결됨 · 빠름";
    case "moderate":
      return "연결됨 · 보통";
    case "slow":
      return "연결됨 · 느림";
    default:
      return "연결됨";
  }
}
