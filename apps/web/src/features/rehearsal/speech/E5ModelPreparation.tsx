import {
  IconCloudDownload,
  IconRefresh,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getE5EmbeddingService,
  isE5EmbeddingModelPrepared,
} from "./e5EmbeddingService";
import "./e5-model-preparation.css";

export type E5ModelPreparationState = {
  error: string;
  progress: number | null;
  status: "checking" | "required" | "downloading" | "ready" | "error";
};

export function useE5ModelPreparation() {
  const preparedAtMountRef = useRef(isE5EmbeddingModelPrepared());
  const [state, setState] = useState<E5ModelPreparationState>(() => ({
    error: "",
    progress: null,
    status: preparedAtMountRef.current ? "checking" : "required",
  }));
  const requestRef = useRef<Promise<boolean> | null>(null);

  const prepare = useCallback((checkingCachedModel = false) => {
    if (requestRef.current) {
      return requestRef.current;
    }

    setState({
      error: "",
      progress: null,
      status: checkingCachedModel ? "checking" : "downloading",
    });
    const request = getE5EmbeddingService((event) => {
      if (typeof event.progress !== "number") {
        return;
      }
      const progress = Math.max(
        0,
        Math.min(100, Math.round(event.progress)),
      );
      setState((current) => ({
        ...current,
        progress,
      }));
    })
      .then(() => {
        setState({ error: "", progress: 100, status: "ready" });
        return true;
      })
      .catch(() => {
        setState({
          error: "다운로드를 완료하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
          progress: null,
          status: "error",
        });
        return false;
      })
      .finally(() => {
        requestRef.current = null;
      });
    requestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    if (preparedAtMountRef.current) {
      void prepare(true);
    }
  }, [prepare]);

  return {
    isReady: state.status === "ready",
    prepare: () => prepare(false),
    state,
  };
}

export function E5ModelPreparationPanel(props: {
  prepare: () => Promise<boolean>;
  state: E5ModelPreparationState;
}) {
  const isBusy =
    props.state.status === "checking" || props.state.status === "downloading";
  const progressLabel =
    props.state.progress === null
      ? props.state.status === "checking"
        ? "저장된 모델 확인 중"
        : "모델 파일 받는 중"
      : `모델 파일 ${props.state.progress}%`;

  if (props.state.status === "ready") {
    return null;
  }

  return (
    <div className="e5-model-preparation" aria-live="polite">
      {props.state.status === "required" ? (
        <>
          <p>
            발표 내용을 문맥으로 이해하는 모델입니다. 최초 한 번만 다운로드하며,
            이후에는 이 브라우저에서 바로 사용합니다.
          </p>
          <button type="button" onClick={() => void props.prepare()}>
            <IconCloudDownload aria-hidden="true" size={17} />
            모델 다운로드
          </button>
        </>
      ) : null}

      {isBusy ? (
        <>
          <div
            aria-label={progressLabel}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={props.state.progress ?? undefined}
            className="e5-model-preparation-progress"
            role="progressbar"
          >
            <span
              className={
                props.state.progress === null
                  ? "e5-model-preparation-progress-indeterminate"
                  : undefined
              }
              style={
                props.state.progress === null
                  ? undefined
                  : { width: `${props.state.progress}%` }
              }
            />
          </div>
          <p>
            <strong>{progressLabel}</strong>
            <span>이 화면을 열어둔 채 잠시만 기다려 주세요.</span>
          </p>
        </>
      ) : null}

      {props.state.status === "error" ? (
        <>
          <p className="e5-model-preparation-error" role="alert">
            {props.state.error}
          </p>
          <button type="button" onClick={() => void props.prepare()}>
            <IconRefresh aria-hidden="true" size={17} />
            다시 시도
          </button>
        </>
      ) : null}
    </div>
  );
}

export function getE5ModelPreparationLabel(
  state: E5ModelPreparationState,
) {
  switch (state.status) {
    case "checking":
      return "저장된 모델 확인 중";
    case "required":
      return "최초 1회 다운로드 필요";
    case "downloading":
      return state.progress === null
        ? "다운로드 중"
        : `다운로드 ${state.progress}%`;
    case "ready":
      return "사용 준비됨";
    case "error":
      return "다운로드 재시도 필요";
  }
}
