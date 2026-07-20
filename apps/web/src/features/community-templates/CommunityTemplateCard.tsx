import type {
  CommunityTemplateCard as CommunityTemplateCardValue,
  CommunityTemplateCategory,
} from "@orbit/shared";

import { CommunityTemplatePreview } from "./CommunityTemplatePreview";

const categoryLabels: Record<CommunityTemplateCategory, string> = {
  business: "비즈니스",
  education: "교육",
  portfolio: "포트폴리오",
  event: "이벤트",
};

export function getCommunityTemplateCategoryLabel(
  category: CommunityTemplateCategory,
) {
  return categoryLabels[category];
}

export function CommunityTemplateCard(props: {
  card: CommunityTemplateCardValue;
  disabled?: boolean;
  onSelect: () => void;
  purpose: "open-gallery" | "use";
  shelf?: boolean;
}) {
  const accessibleName =
    props.purpose === "use"
      ? `${props.card.title} 템플릿으로 바로 시작`
      : `${props.card.title} 템플릿 갤러리에서 보기`;

  return (
    <article
      className={`community-template-card${props.shelf ? " is-shelf" : ""}`}
      data-template-shelf-card={props.shelf ? props.card.templateId : undefined}
    >
      <button
        aria-label={accessibleName}
        className="community-template-card-action"
        disabled={props.disabled}
        onClick={props.onSelect}
        type="button"
      >
        <CommunityTemplatePreview card={props.card} />
        <span className="community-template-card-copy">
          <strong>{props.card.title}</strong>
          <small>
            {getCommunityTemplateCategoryLabel(props.card.category)} 디자인
            템플릿
          </small>
        </span>
      </button>
    </article>
  );
}
