export function MultiSelectionQuickBar(props: {
  canDistribute: boolean;
  selectedCount: number;
  onDistributeX: () => void;
  onDistributeY: () => void;
}) {
  return (
    <section className="selection-quickbar" data-testid="editor-multi-selection-quickbar">
      <div className="selection-quickbar-fields">
        <span className="quickbar-inline-hint">
          {props.selectedCount}개 선택됨
        </span>
        <button
          className="quickbar-action-chip"
          disabled={!props.canDistribute}
          type="button"
          onClick={props.onDistributeX}
        >
          가로 분배
        </button>
        <button
          className="quickbar-action-chip"
          disabled={!props.canDistribute}
          type="button"
          onClick={props.onDistributeY}
        >
          세로 분배
        </button>
      </div>
    </section>
  );
}
