import type {
  SlideRedesignProgressPayload,
  SlideRedesignStage,
} from "@orbit/shared";

const stageLabels: Record<SlideRedesignStage, string> = {
  interpreting: "슬라이드를 읽는 중",
  composing: "구성을 고르는 중",
  coloring: "배색을 맞추는 중",
  ornamenting: "장식을 정리하는 중",
  illustrating: "이미지를 준비하는 중",
  verifying: "마무리 검토 중",
};

const stageOrder = Object.keys(stageLabels) as SlideRedesignStage[];

type DesignRedesignProgressProps = {
  connectionDegraded?: boolean;
  progress: SlideRedesignProgressPayload;
};

export function DesignRedesignProgress(props: DesignRedesignProgressProps) {
  const activeIndex = stageOrder.indexOf(props.progress.stage);
  const completed = new Set(props.progress.completedStages);

  return (
    <section
      aria-label="슬라이드 리디자인 진행 상태"
      className="design-redesign-progress"
    >
      <header>
        <strong>슬라이드를 다시 디자인하고 있어요</strong>
        <span>{stageLabels[props.progress.stage]}</span>
      </header>
      <ol>
        {stageOrder.map((stage, index) => {
          const state = completed.has(stage)
            ? "completed"
            : stage === props.progress.stage
              ? "active"
              : index < activeIndex
                ? "skipped"
                : "upcoming";
          return (
            <li
              aria-current={state === "active" ? "step" : undefined}
              data-stage-state={state}
              key={stage}
            >
              <span aria-hidden="true" className="design-redesign-progress-dot" />
              <span>{stageLabels[stage]}</span>
              {state === "completed" ? <small>완료</small> : null}
              {state === "skipped" ? <small>건너뜀</small> : null}
            </li>
          );
        })}
      </ol>
      {props.progress.previewProposal ? (
        <p className="design-redesign-preview-ready" role="status">
          레이아웃 중간 미리보기가 준비되었습니다. 최종 검토가 끝날 때까지
          읽기 전용입니다.
        </p>
      ) : null}
      {props.connectionDegraded ? (
        <p className="design-redesign-connection-note" role="status">
          실시간 연결이 지연되어 작업 상태를 주기적으로 확인하고 있습니다.
        </p>
      ) : null}
    </section>
  );
}
