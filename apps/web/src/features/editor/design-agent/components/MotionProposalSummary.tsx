import type { MotionPlanMetadata, Slide } from "@orbit/shared";
import { MotionPlanExplanation } from "./MotionPlanExplanation";
import {
  createMotionProposalPreviewModel,
  formatMotionProposalSummary,
} from "./motionProposalPreviewModel";

export function MotionProposalSummary(props: {
  motionPlan?: MotionPlanMetadata;
  slide: Slide;
}) {
  const model = createMotionProposalPreviewModel(props.slide);
  return (
    <>
      {props.motionPlan ? (
        <MotionPlanExplanation
          motionPlan={props.motionPlan}
          slide={props.slide}
        />
      ) : null}
      <div className="motion-proposal-summary" role="status">
        <strong>Motion 흐름</strong>
        <span>{formatMotionProposalSummary(model, props.motionPlan)}</span>
        <small>실제 등장 순서와 클릭 흐름은 미리보기에서 확인할 수 있습니다.</small>
      </div>
    </>
  );
}
