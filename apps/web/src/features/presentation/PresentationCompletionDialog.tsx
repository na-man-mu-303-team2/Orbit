import { Check, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { useEffect } from "react";

import "./presentation-completion-dialog.css";

export function PresentationCompletionDialog(props: {
  isSaving: boolean;
  onClose: () => void;
  onGoHome: () => void;
  onOpenProject: () => void;
  onOpenReport: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="presentation-completion-backdrop" role="presentation">
      <section
        aria-labelledby="presentation-completion-title"
        aria-modal="true"
        className="presentation-completion-dialog"
        role="dialog"
      >
        <button
          aria-label="완료 창 닫기"
          className="presentation-completion-close"
          disabled={props.isSaving}
          onClick={props.onClose}
          type="button"
        >
          <X aria-hidden="true" size={22} />
        </button>

        <span className="presentation-completion-check" aria-hidden="true">
          <Check size={46} strokeWidth={2.5} />
        </span>
        <h1 id="presentation-completion-title">발표를 마쳤어요</h1>
        <p className="presentation-completion-description">
          수고했어요! 발표 결과와 청중의 반응을 한곳에서 확인해 보세요.
        </p>

        <div
          className={`presentation-completion-report ${
            props.isSaving ? "" : "presentation-completion-report-ready"
          }`}
          role="status"
        >
          {props.isSaving ? (
            <LoaderCircle
              aria-hidden="true"
              className="presentation-completion-loader"
              size={24}
            />
          ) : (
            <CheckCircle2 aria-hidden="true" size={24} />
          )}
          <div>
            <strong>
              {props.isSaving
                ? "발표 기록을 저장하고 있어요"
                : "발표 결과 화면이 준비됐어요"}
            </strong>
            <span>
              {props.isSaving
                ? "녹음과 청중 응답을 안전하게 마무리하고 있어요."
                : "음성 분석 진행 상태와 청중 응답을 확인할 수 있어요."}
            </span>
          </div>
        </div>

        <div className="presentation-completion-actions">
          <button
            className="presentation-completion-report-button"
            disabled={props.isSaving}
            onClick={props.onOpenReport}
            type="button"
          >
            리포트 보기
          </button>
          <button
            className="presentation-completion-project-button"
            disabled={props.isSaving}
            onClick={props.onOpenProject}
            type="button"
          >
            프로젝트 편집기로
          </button>
        </div>

        <nav className="presentation-completion-links" aria-label="실전 발표 종료 후 이동">
          <button disabled={props.isSaving} onClick={props.onGoHome} type="button">
            홈으로
          </button>
        </nav>
      </section>
    </div>
  );
}
