import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { slideIconDefinitions, type SlideIconDefinition } from "../../icons/slideIconRegistry";

export function IconLibrarySidePanel(props: {
  accentColor: string;
  onInsert: (icon: SlideIconDefinition, color: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [color, setColor] = useState(props.accentColor);
  const [category, setCategory] = useState<"all" | "arrow" | "general">("all");
  const useDarkPreview = isLightColor(color);
  const icons = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return slideIconDefinitions.filter((icon) => {
      if (category !== "all" && icon.category !== category) return false;
      if (!normalizedQuery) return true;
      return [icon.label, icon.name, ...icon.keywords]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [category, query]);

  return (
    <section aria-label="아이콘 라이브러리" className="icon-library-panel">
      <p className="icon-library-description">
        정보 아이콘과 발표 흐름을 구성할 장표용 화살표를 선택하세요.
      </p>
      <div className="icon-library-controls">
        <label className="icon-library-search">
          <IconSearch aria-hidden="true" size={16} />
          <input aria-label="아이콘 검색" placeholder="아이콘 검색" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="icon-library-color">
          <span>색상</span>
          <input aria-label="아이콘 색상" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
      </div>
      <div aria-label="아이콘 종류" className="icon-library-categories" role="group">
        <button
          aria-pressed={category === "all"}
          type="button"
          onClick={() => setCategory("all")}
        >
          전체
        </button>
        <button
          aria-pressed={category === "general"}
          type="button"
          onClick={() => setCategory("general")}
        >
          아이콘
        </button>
        <button
          aria-pressed={category === "arrow"}
          type="button"
          onClick={() => setCategory("arrow")}
        >
          장표 화살표
        </button>
      </div>
      <div className="icon-library-scroll">
        {icons.length > 0 ? (
          <div className={`icon-library-grid${category === "arrow" ? " presentation-arrows" : ""}`}>
            {icons.map((icon) => (
              <button aria-label={`${icon.label} 추가`} className={`icon-library-item${icon.category === "arrow" ? " presentation-arrow" : ""}`} key={icon.name} title={icon.label} type="button" onClick={() => props.onInsert(icon, color)}>
                <span className={`icon-library-preview${useDarkPreview ? " dark" : ""}`}>
                  <icon.Icon
                    color={color}
                    height={icon.category === "arrow" ? 42 : 28}
                    stroke={2}
                    width={icon.category === "arrow" ? 76 : 28}
                  />
                </span>
                <span>{icon.label}</span>
              </button>
            ))}
          </div>
        ) : <p className="icon-library-empty">검색 결과가 없습니다.</p>}
      </div>
    </section>
  );
}

function isLightColor(color: string) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return false;
  const [red, green, blue] = match.slice(1).map((value) => Number.parseInt(value, 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 210;
}
