import { useEffect, useState } from "react";

function formatSecondsLabel(value: number) {
  return `${(value / 1000).toFixed(1)}s`;
}

export function AnimationRangeField(props: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const { label, max, min, onCommit, step = 50, value } = props;
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function commit(nextValue: number) {
    setDraftValue(nextValue);
    onCommit(nextValue);
  }

  return (
    <div className="animation-range-field">
      <div className="animation-range-field-header">
        <strong>{label}</strong>
        <span>({formatSecondsLabel(draftValue)})</span>
      </div>
      <div className="animation-range-field-control">
        <input
          className="animation-range-slider"
          max={max}
          min={min}
          step={step}
          type="range"
          value={draftValue}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <input
          className="animation-range-number"
          max={max}
          min={min}
          step={step}
          type="number"
          value={draftValue}
          onChange={(event) => commit(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
