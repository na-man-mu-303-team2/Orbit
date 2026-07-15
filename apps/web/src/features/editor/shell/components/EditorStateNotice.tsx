import type { DeckCanvas } from "@orbit/shared";
import { IconArrowLeft, IconFilePlus, IconRefresh } from "@tabler/icons-react";

import { OrbitButton, OrbitEmptyState } from "../../../../design-system";

type EditorStateNoticeProps =
  | { kind: "loading" }
  | {
      kind: "error";
      message: string;
      onRetry: () => void;
    }
  | {
      canCreate: boolean;
      createError?: string | null;
      isCreating?: boolean;
      kind: "missing";
      onCreate?: () => void;
    };

export function EditorStateNotice(props: EditorStateNoticeProps) {
  if (props.kind === "loading") {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className="editor-state-notice loading"
        role="status"
      >
        <span aria-hidden="true" className="editor-loading-spinner" />
        <strong>발표 자료를 불러오는 중입니다</strong>
        <span>프로젝트의 저장된 발표 자료를 확인하고 있습니다.</span>
      </section>
    );
  }

  if (props.kind === "error") {
    return (
      <section aria-label="발표 자료 로드 오류" role="alert">
        <OrbitEmptyState
          action={
            <>
              <OrbitButton icon={<IconRefresh aria-hidden="true" size={17} />} onClick={props.onRetry}>
                다시 시도
              </OrbitButton>
              <a className="editor-state-back-link" href="/project">
                <IconArrowLeft aria-hidden="true" size={17} /> 프로젝트로 돌아가기
              </a>
            </>
          }
          description={props.message}
          icon={<IconRefresh aria-hidden="true" size={26} />}
          title="발표 자료를 열지 못했습니다"
        />
      </section>
    );
  }

  const action = props.canCreate && props.onCreate ? (
    <OrbitButton
      disabled={props.isCreating}
      icon={<IconFilePlus aria-hidden="true" size={18} />}
      onClick={props.onCreate}
    >
      {props.isCreating ? "첫 슬라이드 만드는 중" : "첫 슬라이드 만들기"}
    </OrbitButton>
  ) : (
    <a className="editor-state-back-link" href="/project">
      <IconArrowLeft aria-hidden="true" size={17} /> 프로젝트로 돌아가기
    </a>
  );

  return (
    <div className="editor-missing-state">
      <OrbitEmptyState
        action={action}
        description={
          props.canCreate
            ? "첫 슬라이드를 만들면 편집과 리허설을 시작할 수 있습니다."
            : "아직 발표 자료가 없습니다. 소유자나 편집자가 첫 슬라이드를 만들면 이곳에서 확인할 수 있습니다."
        }
        icon={<IconFilePlus aria-hidden="true" size={26} />}
        title={props.canCreate ? "아직 슬라이드가 없습니다" : "아직 발표 자료가 없습니다"}
      />
      {props.createError ? <p className="editor-state-create-error" role="alert">{props.createError}</p> : null}
    </div>
  );
}

export function EmptyPanel(props: { title: string; description: string }) {
  return (
    <section className="empty-panel">
      <strong>{props.title}</strong>
      <p>{props.description}</p>
    </section>
  );
}

export function EmptyCanvasState(props: { canvas: DeckCanvas }) {
  return (
    <section className="empty-canvas-state">
      <strong>빈 덱</strong>
      <p>
        현재 덱에는 슬라이드가 없습니다. 캔버스 프리셋은 {props.canvas.preset} /{" "}
        {props.canvas.width} × {props.canvas.height}px로 유지됩니다.
      </p>
    </section>
  );
}
