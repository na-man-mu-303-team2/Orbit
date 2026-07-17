import type { ActivityRuntimeStatus, ActivitySlide } from "@orbit/shared";
import { IconCopy, IconQrcode } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { createQrDataUrl } from "../../editor/audience-link/audienceLinkUtils";
import {
  getActivityPrimaryCommand,
  getActivityReopenCommand
} from "../presenter/ActivityPresenterPanel";
import { canonicalActivityUrl } from "../rendering/ActivityAudienceSlideRenderer";
import type { ActivityEditorRuntime } from "./useActivityEditorRuntime";

export function ActivityEditorOperationsPanel(props: {
  onOpenAudienceLink?: () => void;
  onUpdateStatus: (status?: ActivityRuntimeStatus) => void;
  pending: boolean;
  runtime: ActivityEditorRuntime | null;
  slide: ActivitySlide;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const directUrl = useMemo(
    () => props.runtime
      ? canonicalActivityUrl(
          props.runtime.audienceUrl,
          props.slide.activity.activityId
        )
      : "",
    [props.runtime, props.slide.activity.activityId]
  );
  const command = getActivityPrimaryCommand(
    props.runtime?.run.status ?? "draft"
  );
  const reopenCommand = getActivityReopenCommand(
    props.runtime?.run.status ?? "draft"
  );

  useEffect(() => {
    let cancelled = false;
    if (!qrOpen || !directUrl) {
      setQrDataUrl("");
      return;
    }
    void createQrDataUrl(directUrl).then((value) => {
      if (!cancelled) setQrDataUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [directUrl, qrOpen]);

  if (!props.runtime) {
    return (
      <section aria-label="참여 장표 운영" className="activity-editor-operations">
        <div>
          <strong>발표 세션이 없습니다.</strong>
          <p>세션을 만들면 상태 제어와 장표별 링크·QR을 사용할 수 있습니다.</p>
        </div>
        {props.onOpenAudienceLink ? (
          <button type="button" onClick={props.onOpenAudienceLink}>
            발표 세션 만들기
          </button>
        ) : null}
      </section>
    );
  }

  const status = props.runtime.run.status;
  return (
    <section aria-label="참여 장표 운영" className="activity-editor-operations">
      <div className="activity-editor-operation-heading">
        <div>
          <span>현재 상태</span>
          <strong>{statusLabel(status)}</strong>
        </div>
        <div>
          <span>청중 결과</span>
          <strong>{status === "results" ? "공개" : "비공개"}</strong>
        </div>
        <div>
          <span>응답</span>
          <strong>{props.runtime.run.responseCount}</strong>
        </div>
      </div>
      {reopenCommand ? (
        <>
          <div className="activity-editor-command-row">
            <button
              className="activity-editor-secondary-command"
              disabled={props.pending}
              type="button"
              onClick={() => props.onUpdateStatus(reopenCommand.nextStatus)}
            >
              {props.pending ? "상태 변경 중" : reopenCommand.label}
            </button>
            <button
              className="activity-editor-primary-command"
              disabled={props.pending}
              type="button"
              onClick={() => props.onUpdateStatus(command.nextStatus)}
            >
              {props.pending ? "상태 변경 중" : command.label}
            </button>
          </div>
          <p className="activity-editor-reopen-help">
            다시 열어도 기존 응답과 집계는 유지됩니다.
          </p>
        </>
      ) : (
        <button
          className="activity-editor-primary-command"
          disabled={props.pending}
          type="button"
          onClick={() => props.onUpdateStatus(command.nextStatus)}
        >
          {props.pending ? "상태 변경 중" : command.label}
        </button>
      )}
      <label className="activity-editor-direct-link">
        장표별 직접 링크
        <span>
          <input readOnly value={directUrl} />
          <button
            aria-label="장표별 직접 링크 복사"
            type="button"
            onClick={() => {
              if (!navigator.clipboard) return;
              void navigator.clipboard.writeText(directUrl).then(() => {
                setCopyState("copied");
              });
            }}
          >
            <IconCopy aria-hidden="true" size={16} />
            {copyState === "copied" ? "복사됨" : "복사"}
          </button>
        </span>
      </label>
      <button
        aria-expanded={qrOpen}
        className="activity-editor-qr-toggle"
        type="button"
        onClick={() => setQrOpen((open) => !open)}
      >
        <IconQrcode aria-hidden="true" size={17} />
        QR 코드 확인
      </button>
      {qrOpen ? (
        <div className="activity-editor-qr-preview">
          {qrDataUrl ? (
            <img alt={`${props.slide.activity.title} 참여 QR 코드`} src={qrDataUrl} />
          ) : (
            <span>QR 코드를 만드는 중입니다.</span>
          )}
        </div>
      ) : null}
    </section>
  );
}

function statusLabel(status: ActivityRuntimeStatus) {
  if (status === "open") return "응답 중";
  if (status === "closed") return "응답 마감";
  if (status === "results") return "결과 공개";
  return "준비";
}
