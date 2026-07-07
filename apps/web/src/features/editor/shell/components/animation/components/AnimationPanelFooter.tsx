export function AnimationPanelFooter(props: {
  canPlay: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  const { canPlay, isPlaying, onPlay } = props;

  return (
    <div className="animation-side-pane-footer">
      <button
        className="animation-panel-preview-button"
        disabled={!canPlay || isPlaying}
        type="button"
        onClick={onPlay}
      >
        {isPlaying ? "재생 중..." : "전체 실행하기"}
      </button>
    </div>
  );
}
