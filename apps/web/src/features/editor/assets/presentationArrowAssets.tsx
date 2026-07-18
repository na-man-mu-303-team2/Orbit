import { forwardRef } from "react";
import type { IconProps, TablerIcon } from "@tabler/icons-react";

type ArrowPrimitive = {
  d: string;
  fillRule?: "evenodd" | "nonzero";
  strokeWidth?: number;
};

export type PresentationArrowAsset = {
  defaultHeight: number;
  defaultWidth: number;
  Icon: TablerIcon;
  keywords: string[];
  label: string;
  name: string;
};

export const presentationArrowAssets: PresentationArrowAsset[] = [
  asset(
    "presentation-arrow-right",
    "기본 블록 화살표",
    ["기본", "직선", "진행", "다음"],
    260,
    96,
    "0 0 240 96",
    [{ d: "M8 30H164V8L232 48L164 88V66H8Z" }],
  ),
  asset(
    "presentation-arrow-ribbon",
    "리본 화살표",
    ["리본", "강조", "프로세스", "단계"],
    260,
    96,
    "0 0 240 96",
    [{ d: "M8 10H166L232 48L166 86H8L34 48Z" }],
  ),
  asset(
    "presentation-arrow-chevron",
    "프로세스 셰브론",
    ["셰브론", "프로세스", "타임라인", "단계"],
    220,
    96,
    "0 0 240 96",
    [{ d: "M12 8H154L230 48L154 88H12L86 48Z" }],
  ),
  asset(
    "presentation-arrow-double",
    "양방향 블록 화살표",
    ["양방향", "비교", "전환", "수평"],
    260,
    96,
    "0 0 240 96",
    [{ d: "M8 48L54 8V28H186V8L232 48L186 88V68H54V88Z" }],
  ),
  asset(
    "presentation-arrow-elbow",
    "꺾인 흐름 화살표",
    ["꺾인", "전환", "방향", "연결"],
    230,
    120,
    "0 0 240 120",
    [{ d: "M12 14H118V48H180V24L232 66L180 108V82H82V50H12Z" }],
  ),
  asset(
    "presentation-arrow-growth",
    "곡선 성장 화살표",
    ["곡선", "성장", "상승", "성과", "추세"],
    260,
    120,
    "0 0 240 120",
    [{ d: "M12 82C78 88 126 68 166 30L146 14L230 8L210 90L190 66C142 112 78 118 12 100Z" }],
  ),
  asset(
    "presentation-arrow-arc",
    "아치형 진행 화살표",
    ["아치", "곡선", "전개", "이동"],
    250,
    128,
    "0 0 240 128",
    [{ d: "M12 106C38 38 108 8 176 30L174 6L232 52L166 74L170 52C112 30 58 54 34 116Z" }],
  ),
  asset(
    "presentation-arrow-cycle",
    "순환 프로세스 화살표",
    ["순환", "사이클", "반복", "루프"],
    144,
    144,
    "0 0 144 144",
    [
      { d: "M118 42A54 54 0 0 0 30 30", strokeWidth: 16 },
      { d: "M26 8L16 46L54 36Z" },
      { d: "M26 102A54 54 0 0 0 114 114", strokeWidth: 16 },
      { d: "M118 136L128 98L90 108Z" },
    ],
  ),
  asset(
    "presentation-arrow-split",
    "분기 프로세스 화살표",
    ["분기", "갈래", "의사결정", "프로세스"],
    260,
    120,
    "0 0 240 108",
    [{ d: "M8 42H70C96 42 102 16 134 16H178V2L232 20L178 38V26H136C122 26 116 38 108 50C116 62 122 74 136 74H178V62L232 80L178 98V84H134C102 84 96 58 70 58H8Z" }],
  ),
  asset(
    "presentation-arrow-merge",
    "합류 프로세스 화살표",
    ["합류", "병합", "통합", "프로세스"],
    260,
    120,
    "0 0 240 108",
    [{ d: "M8 2L62 20L8 38V26H48C78 26 86 42 98 50C86 58 78 74 48 74H8V62L62 80L8 98V84H50C88 84 106 64 120 58H178V78L232 50L178 22V42H120C106 36 88 16 50 16H8Z" }],
  ),
  asset(
    "presentation-arrow-stair",
    "단계 상승 화살표",
    ["단계", "상승", "로드맵", "성장", "마일스톤"],
    260,
    132,
    "0 0 240 132",
    [{ d: "M10 114H54V88H96V62H138V36H178V12L232 44L178 76V52H154V78H112V104H70V126H10Z" }],
  ),
  asset(
    "presentation-arrow-turn",
    "U턴 전환 화살표",
    ["U턴", "전환", "복귀", "회고", "방향"],
    210,
    150,
    "0 0 210 150",
    [{ d: "M28 132V68C28 28 58 10 96 10H146V0L202 34L146 68V56H98C82 56 72 64 72 80V96H98L58 142L18 96H44V68C44 42 64 28 94 28H154V34H96C66 34 50 48 50 70V132Z" }],
  ),
];

function asset(
  name: string,
  label: string,
  keywords: string[],
  defaultWidth: number,
  defaultHeight: number,
  viewBox: string,
  primitives: ArrowPrimitive[],
): PresentationArrowAsset {
  return {
    defaultHeight,
    defaultWidth,
    Icon: createArrowIcon(name, viewBox, primitives),
    keywords,
    label,
    name,
  };
}

function createArrowIcon(
  displayName: string,
  viewBox: string,
  primitives: ArrowPrimitive[],
): TablerIcon {
  const ArrowIcon = forwardRef<SVGSVGElement, IconProps>(
    function PresentationArrow(
      {
        color = "currentColor",
        height,
        size,
        stroke: _stroke,
        width,
        ...props
      },
      ref,
    ) {
      return (
        <svg
          {...props}
          fill="none"
          height={height ?? size ?? 96}
          ref={ref}
          viewBox={viewBox}
          width={width ?? size ?? 240}
          xmlns="http://www.w3.org/2000/svg"
        >
          {primitives.map((primitive, index) => (
            <path
              d={primitive.d}
              fill={primitive.strokeWidth ? "none" : color}
              fillRule={primitive.fillRule}
              key={`${displayName}-${index}`}
              stroke={primitive.strokeWidth ? color : "none"}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={primitive.strokeWidth}
            />
          ))}
        </svg>
      );
    },
  );
  ArrowIcon.displayName = displayName;
  return ArrowIcon;
}
