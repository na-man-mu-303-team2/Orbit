import type { Slide } from "@orbit/shared";
import {
  createMotionProposalPreviewModel,
  formatMotionProposalSummary,
} from "./motionProposalPreviewModel";

export function MotionProposalSummary(props: { slide: Slide }) {
  const model = createMotionProposalPreviewModel(props.slide);
  return (
    <div className="motion-proposal-summary" role="status">
      <strong>Motion 흐름</strong>
      <span>{formatMotionProposalSummary(model)}</span>
      <small>실제 등장 순서와 클릭 흐름은 미리보기에서 확인할 수 있습니다.</small>
    </div>
  );
}
