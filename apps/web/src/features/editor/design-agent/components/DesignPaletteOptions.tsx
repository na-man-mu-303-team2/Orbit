import type { SlideRedesignPaletteOption } from "@orbit/shared";
import { useId } from "react";

type DesignPaletteOptionsProps = {
  isSubmitting?: boolean;
  onConfirm: (optionId: string) => void;
  onSelectionChange: (optionId: string) => void;
  options: SlideRedesignPaletteOption[];
  selectedOptionId?: string;
};

export function DesignPaletteOptions(props: DesignPaletteOptionsProps) {
  const groupName = useId();
  const headingId = useId();
  const selectedOptionId = props.selectedOptionId ?? props.options[0]?.optionId;

  return (
    <section className="design-palette-options" aria-labelledby={headingId}>
      <div className="design-palette-options-heading">
        <h2 id={headingId}>배색을 골라주세요</h2>
        <p>배치와 내용은 유지하고, 선택한 색으로 미리보기를 만듭니다.</p>
      </div>

      <fieldset disabled={props.isSubmitting} role="radiogroup">
        <legend className="design-palette-options-legend">배색 선택</legend>
        <div className="design-palette-options-list">
          {props.options.map((option) => {
            const isSelected = option.optionId === selectedOptionId;
            return (
              <label
                className={`design-palette-option${isSelected ? " selected" : ""}`}
                key={option.optionId}
              >
                <input
                  checked={isSelected}
                  name={groupName}
                  type="radio"
                  value={option.optionId}
                  onChange={() => props.onSelectionChange(option.optionId)}
                />
                <span className="design-palette-option-copy">
                  <span className="design-palette-option-title">
                    <strong>{option.name}</strong>
                    {option.isCurrentTheme ? <span>현재 테마</span> : null}
                    {isSelected ? <span className="design-palette-option-selected">선택됨</span> : null}
                  </span>
                  <span className="design-palette-option-rationale">{option.rationale}</span>
                </span>
                <span className="design-palette-swatches" aria-hidden="true">
                  {[option.palette.dominant, option.palette.focal, option.palette.secondary].map(
                    (color, index) => (
                      <span key={`${color}-${index}`} style={{ backgroundColor: color }} />
                    ),
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <button
        className="design-palette-options-confirm"
        disabled={!selectedOptionId || props.isSubmitting}
        type="button"
        onClick={() => selectedOptionId && props.onConfirm(selectedOptionId)}
      >
        {props.isSubmitting ? "미리보기 생성 중..." : "선택한 배색으로 미리보기"}
      </button>
    </section>
  );
}
