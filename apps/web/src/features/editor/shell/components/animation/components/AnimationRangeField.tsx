import { useEffect, useRef, useState } from "react";

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
  const lastCommittedValueRef = useRef(value);

  useEffect(() => {
    setDraftValue(value);
    lastCommittedValueRef.current = value;
  }, [value]);

  function updateDraft(nextValue: number) {
    if (!Number.isFinite(nextValue)) return;
    setDraftValue(nextValue);
  }

  function commit(nextValue: number) {
    if (!Number.isFinite(nextValue)) return;
    const normalizedValue = Math.min(max, Math.max(min, nextValue));
    setDraftValue(normalizedValue);
    if (normalizedValue === lastCommittedValueRef.current) return;
    lastCommittedValueRef.current = normalizedValue;
    onCommit(normalizedValue);
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
          onChange={(event) => updateDraft(Number(event.target.value))}
          onKeyUp={(event) => commit(Number(event.currentTarget.value))}
          onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        />
        <input
          className="animation-range-number"
          max={max}
          min={min}
          step={step}
          type="number"
          value={draftValue}
          onBlur={(event) => commit(Number(event.currentTarget.value))}
          onChange={(event) => updateDraft(Number(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(Number(event.currentTarget.value));
            }
          }}
        />
      </div>
    </div>
  );
}
