import type { CommunityTemplateCategory } from "@orbit/shared";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { DropdownMenu, DropdownMenuItem } from "../../components/ui";

type CategoryValue = CommunityTemplateCategory | "";

const options: Array<{ label: string; value: CommunityTemplateCategory }> = [
  { label: "비즈니스", value: "business" },
  { label: "교육", value: "education" },
  { label: "포트폴리오", value: "portfolio" },
  { label: "이벤트", value: "event" },
];

export function CommunityTemplateCategoryDropdown(props: {
  disabled?: boolean;
  id: string;
  invalid?: boolean;
  onChange: (value: CategoryValue) => void;
  value: CategoryValue;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === props.value);

  useEffect(() => {
    if (!open) return;

    function closeOnPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="community-template-category-dropdown" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={props.invalid || undefined}
        className="community-template-category-trigger"
        disabled={props.disabled}
        id={props.id}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={selected ? "" : "is-placeholder"}>
          {selected?.label ?? "카테고리를 선택해 주세요"}
        </span>
        <IconChevronDown aria-hidden="true" size={18} />
      </button>
      {open ? (
        <DropdownMenu
          align="start"
          aria-label="카테고리 선택"
          className="community-template-category-menu"
          role="listbox"
          variant="white"
        >
          {options.map((option) => {
            const active = option.value === props.value;
            return (
              <DropdownMenuItem
                aria-selected={active}
                className={active ? "is-selected" : ""}
                icon={active ? <IconCheck size={16} /> : undefined}
                key={option.value}
                onClick={() => {
                  props.onChange(option.value);
                  setOpen(false);
                }}
                role="option"
              >
                {option.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenu>
      ) : null}
    </div>
  );
}
