import type { Deck, DeckPatchOperation } from "@orbit/shared";
import { createPortal } from "react-dom";
import { OrbitButton, OrbitDialog } from "../../../../components/ui";
import { ReadOnlySlideCanvas } from "../../../slides/rendering";
import {
  canApplyDesignProposal,
  type DesignProposalLifecycle,
} from "../designProposalLifecycle";
import { MotionProposalPreview } from "./MotionProposalPreview";
import { isMotionOnlyProposal } from "./motionProposalPreviewModel";

type DesignProposalPreviewModalProps = {
  afterDeck: Deck;
  beforeDeck: Deck;
  lifecycle: DesignProposalLifecycle;
  onApply: () => void;
  onClose: () => void;
  operations: DeckPatchOperation[];
  readOnly?: boolean;
  slideId: string;
  summary: string;
  warnings: string[];
};

export function DesignProposalPreviewModal(
  props: DesignProposalPreviewModalProps,
) {
  const beforeSlide = props.beforeDeck.slides.find(
    (slide) => slide.slideId === props.slideId,
  );
  const afterSlide = props.afterDeck.slides.find(
    (slide) => slide.slideId === props.slideId,
  );
  if (!beforeSlide || !afterSlide) return null;

  const isApplying = props.lifecycle === "applying";
  const canApply = !props.readOnly && canApplyDesignProposal(props.lifecycle);
  const motionOnly = isMotionOnlyProposal(props.operations);
  const beforeScale = Math.min(0.3, 420 / props.beforeDeck.canvas.width);
  const afterScale = Math.min(0.3, 420 / props.afterDeck.canvas.width);
  const dialog = (
    <OrbitDialog
      className="design-proposal-preview-dialog"
      closeDisabled={isApplying}
      description={props.summary}
      footer={(
        <>
          <OrbitButton
            disabled={isApplying}
            variant="secondary"
            onClick={props.onClose}
          >
            취소
          </OrbitButton>
          {props.readOnly ? (
            <span className="design-proposal-read-only-label">
              최종 검토 후 적용할 수 있습니다.
            </span>
          ) : (
            <OrbitButton
              disabled={!canApply}
              loading={isApplying}
              onClick={props.onApply}
            >
              {props.lifecycle === "failed" ? "다시 적용" : "적용"}
            </OrbitButton>
          )}
        </>
      )}
      onClose={props.onClose}
      open
      title={
        props.readOnly
          ? "AI 디자인 중간 미리보기"
          : motionOnly
            ? "AI Motion 제안 미리보기"
            : "AI 디자인 제안 비교"
      }
    >
      {motionOnly ? (
        <MotionProposalPreview deck={props.afterDeck} slide={afterSlide} />
      ) : (
        <div className="design-proposal-modal-comparison">
          <figure>
            <figcaption>Before</figcaption>
            <div className="design-proposal-modal-slide">
              <ReadOnlySlideCanvas
                deck={props.beforeDeck}
                scale={beforeScale}
                slide={beforeSlide}
              />
            </div>
          </figure>
          <figure>
            <figcaption>After</figcaption>
            <div className="design-proposal-modal-slide after">
              <ReadOnlySlideCanvas
                deck={props.afterDeck}
                scale={afterScale}
                slide={afterSlide}
              />
            </div>
          </figure>
        </div>
      )}

      {props.lifecycle === "stale" ? (
        <p className="design-proposal-modal-state" role="status">
          제안 생성 후 슬라이드가 변경되었습니다. 이 제안은 적용할 수 없습니다.
        </p>
      ) : null}
      {props.lifecycle === "failed" ? (
        <p className="design-proposal-modal-state error" role="alert">
          제안을 적용하지 못했습니다. 내용을 확인한 뒤 다시 적용해 주세요.
        </p>
      ) : null}
      {props.warnings.length ? (
        <p className="design-proposal-modal-warning">
          {props.warnings.join(" ")}
        </p>
      ) : null}
    </OrbitDialog>
  );
  const content = (
    <div className="redesign-dark design-proposal-preview-portal">
      {dialog}
    </div>
  );

  if (typeof document === "undefined" || !document.body) return content;
  return createPortal(content, document.body);
}
