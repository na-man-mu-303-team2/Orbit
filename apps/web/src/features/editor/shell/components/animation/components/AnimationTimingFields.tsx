import { AnimationRangeField } from "./AnimationRangeField";

export function AnimationTimingFields(props: {
  delayMs: number;
  durationMs: number;
  onDelayChange: (value: number) => void;
  onDurationChange: (value: number) => void;
}) {
  const { delayMs, durationMs, onDelayChange, onDurationChange } = props;

  return (
    <div className="animation-panel-timing-fields">
      <AnimationRangeField
        label="재생 시간"
        max={2000}
        min={100}
        value={durationMs}
        onCommit={onDurationChange}
      />
      <AnimationRangeField
        label="지연 시간"
        max={2000}
        min={0}
        value={delayMs}
        onCommit={onDelayChange}
      />
    </div>
  );
}
