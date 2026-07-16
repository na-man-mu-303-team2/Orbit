import {
  IconAlertTriangle,
  IconEyeOff,
  IconShare3,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import type { AudienceOutputMode } from "./presenterStateStore";
import type { AudienceScreenShareStatus } from "./useAudienceScreenShare";

export function AudienceOutputControls(props: {
  connected: boolean;
  error: string;
  onReturnToSlide: () => void;
  onShowBlack: () => void;
  onStartMonitor: () => Promise<boolean>;
  onStartTabOrWindow: () => Promise<boolean>;
  outputMode: AudienceOutputMode;
  status: AudienceScreenShareStatus;
}) {
  const [isAdvancedOpen, setAdvancedOpen] = useState(false);
  const [isMonitorWarningOpen, setMonitorWarningOpen] = useState(false);
  const [monitorWarningConfirmed, setMonitorWarningConfirmed] = useState(false);
  const isAwayFromSlide = props.outputMode !== "slide";
  const controlsDisabled = !props.connected || props.status === "selecting";

  const startMonitor = () => {
    const startResult = props.onStartMonitor();
    setMonitorWarningOpen(false);
    setMonitorWarningConfirmed(false);
    void startResult;
  };

  return (
    <section className="audience-output-controls" aria-label="청중 화면 전환">
      <div className="audience-output-controls-row">
        {isAwayFromSlide ? (
          <button type="button" onClick={props.onReturnToSlide}>
            <IconX size={16} />
            슬라이드로 돌아가기
          </button>
        ) : (
          <button
            className="audience-output-share-primary"
            disabled={controlsDisabled}
            type="button"
            onClick={() => {
              const startResult = props.onStartTabOrWindow();
              void startResult;
            }}
          >
            <IconShare3 size={16} />
            웹·실습 보여주기
          </button>
        )}
        <button
          disabled={controlsDisabled}
          type="button"
          onClick={props.onShowBlack}
        >
          <IconEyeOff size={16} />
          청중 화면 가리기
        </button>
        <button
          aria-expanded={isAdvancedOpen}
          disabled={controlsDisabled}
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          고급 옵션
        </button>
      </div>

      {isAdvancedOpen ? (
        <div className="audience-output-advanced">
          <button
            disabled={controlsDisabled}
            type="button"
            onClick={() => setMonitorWarningOpen(true)}
          >
            전체 화면 공유
          </button>
          <small>전체 모니터 공유는 개인정보가 노출될 수 있습니다.</small>
        </div>
      ) : null}

      <p aria-live="polite" className="audience-output-control-status">
        {getAudienceOutputStatus(props)}
      </p>

      {isMonitorWarningOpen ? (
        <div
          aria-label="전체 화면 공유 경고"
          className="audience-output-warning"
          role="dialog"
        >
          <IconAlertTriangle aria-hidden="true" size={22} />
          <h2>전체 화면을 공유하시겠습니까?</h2>
          <p>
            발표자 노트, 시스템 알림, 브라우저 탭과 개인정보가 청중에게 보일 수
            있습니다. Orbit 발표자 또는 청중 화면을 선택하면 화면이 반복되어
            보일 수 있습니다.
          </p>
          <label>
            <input
              checked={monitorWarningConfirmed}
              type="checkbox"
              onChange={(event) =>
                setMonitorWarningConfirmed(event.currentTarget.checked)
              }
            />
            노출 위험을 확인했습니다
          </label>
          <div>
            <button
              type="button"
              onClick={() => {
                setMonitorWarningOpen(false);
                setMonitorWarningConfirmed(false);
              }}
            >
              취소
            </button>
            <button
              disabled={!monitorWarningConfirmed}
              type="button"
              onClick={startMonitor}
            >
              전체 화면 선택
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getAudienceOutputStatus(props: {
  connected: boolean;
  error: string;
  outputMode: AudienceOutputMode;
  status: AudienceScreenShareStatus;
}) {
  if (props.error) return props.error;
  if (!props.connected) return "청중 화면을 먼저 연결해주세요.";
  if (props.status === "selecting") return "공유할 탭 또는 창을 선택해주세요.";
  if (props.outputMode === "screen-share") return "웹·실습 화면 공유 중";
  if (props.outputMode === "black") return "청중 화면을 가렸습니다.";
  return "청중 화면에 현재 슬라이드를 표시합니다.";
}
