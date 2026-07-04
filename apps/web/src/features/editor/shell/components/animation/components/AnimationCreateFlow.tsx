import { AnimationCreateEditor } from "./AnimationCreateEditor";
import { AnimationCreatePicker } from "./AnimationCreatePicker";
import { AnimationKeywordPicker } from "./AnimationKeywordPicker";
import type { AnimationKeywordTriggerOption } from "../models";
import type {
  AnimationDraftInput,
  AnimationTimingDraft,
  SupportedAnimationType
} from "../types";

export function AnimationCreateFlow(props: {
  canCreateAnimation: boolean;
  creationType: SupportedAnimationType | null;
  draft: AnimationTimingDraft | null;
  keywordOptions: AnimationKeywordTriggerOption[];
  linkedTypes: SupportedAnimationType[];
  selectedKeywordId: string | null;
  selectedKeywordLabel: string | null;
  onAddAnimation: (draft: AnimationDraftInput, keywordId?: string | null) => void;
  onDraftChange: (patch: Partial<AnimationTimingDraft>) => void;
  onSelectKeyword: (keywordId: string) => void;
  onStartCreating: (type: SupportedAnimationType) => void;
}) {
  const {
    canCreateAnimation,
    creationType,
    draft,
    keywordOptions,
    linkedTypes,
    selectedKeywordId,
    selectedKeywordLabel,
    onAddAnimation,
    onDraftChange,
    onSelectKeyword,
    onStartCreating
  } = props;

  return (
    <>
      <AnimationCreatePicker
        creationType={creationType}
        linkedTypes={linkedTypes}
        onStartCreating={onStartCreating}
      />

      <AnimationKeywordPicker
        keywordOptions={keywordOptions}
        selectedKeywordId={selectedKeywordId}
        onSelectKeyword={onSelectKeyword}
      />

      {creationType && draft ? (
        <AnimationCreateEditor
          canCreateAnimation={canCreateAnimation}
          draft={draft}
          selectedKeywordId={selectedKeywordId}
          selectedKeywordLabel={selectedKeywordLabel}
          type={creationType}
          onAddAnimation={onAddAnimation}
          onDraftChange={onDraftChange}
        />
      ) : null}
    </>
  );
}
