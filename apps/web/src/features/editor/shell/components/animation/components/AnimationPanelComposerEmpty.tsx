export function AnimationPanelComposerEmpty(props: {
  hasAnimations: boolean;
}) {
  const { hasAnimations } = props;

  return (
    <section className="animation-panel-empty">
      <strong>
        {hasAnimations
          ? "편집할 애니메이션을 선택하세요."
          : "추가할 효과를 선택하세요."}
      </strong>
      <p>
        {hasAnimations
          ? "연결된 애니메이션 목록에서 하나를 고르거나 새 효과 카드를 선택하면 됩니다."
          : "아래 효과 카드에서 페이드 인 또는 페이드 아웃을 추가할 수 있습니다."}
      </p>
    </section>
  );
}
