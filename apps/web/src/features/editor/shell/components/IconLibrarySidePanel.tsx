import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { slideIconDefinitions, type SlideIconDefinition } from "../../icons/slideIconRegistry";

export function IconLibrarySidePanel(props: {
  accentColor: string;
  onInsert: (icon: SlideIconDefinition, color: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [color, setColor] = useState(props.accentColor);
  const useDarkPreview = isLightColor(color);
  const icons = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return slideIconDefinitions;
    return slideIconDefinitions.filter((icon) =>
      [icon.label, icon.name, ...icon.keywords].join(" ").toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  return (
    <section aria-label="아이콘 라이브러리" className="icon-library-panel">
      <p className="icon-library-description">
        슬라이드에 사용할 아이콘을 선택하세요.
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
      <div className="icon-library-scroll">
        {icons.length > 0 ? (
          <div className="icon-library-grid">
            {icons.map((icon) => (
              <button aria-label={`${icon.label} 아이콘 추가`} className="icon-library-item" key={icon.name} title={icon.label} type="button" onClick={() => props.onInsert(icon, color)}>
                <span className={`icon-library-preview${useDarkPreview ? " dark" : ""}`}>
                  <icon.Icon color={color} size={28} stroke={2} />
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
