import { MigrationInterface, QueryRunner } from "typeorm";

type TemplateElement = Record<string, unknown>;

const text = (
  suffix: string,
  itemIndex: number,
  field: "title" | "description",
  xFrac: number,
  yFrac: number,
  widthFrac: number,
  heightFrac: number,
  zIndex: number,
  options: Record<string, unknown> = {},
): TemplateElement => ({
  elementIdSuffix: suffix,
  type: "text",
  itemIndex,
  role: field === "title" ? "title" : "body",
  xFrac,
  yFrac,
  widthFrac,
  heightFrac,
  zIndex,
  textField: field,
  props: {
    fontSize: field === "title" ? 26 : 17,
    fontWeight: field === "title" ? "bold" : "normal",
    color: field === "title" ? "#0F172A" : "#475569",
    align: "left",
    verticalAlign: "top",
    lineHeight: 1.2,
    ...options,
  },
});

const rect = (
  suffix: string,
  itemIndex: number | null,
  xFrac: number,
  yFrac: number,
  widthFrac: number,
  heightFrac: number,
  zIndex: number,
  props: Record<string, unknown>,
): TemplateElement => ({
  elementIdSuffix: suffix,
  type: "rect",
  itemIndex,
  role: "decoration",
  xFrac,
  yFrac,
  widthFrac,
  heightFrac,
  zIndex,
  props,
});

const ellipse = (
  suffix: string,
  itemIndex: number,
  xFrac: number,
  yFrac: number,
  widthFrac: number,
  heightFrac: number,
  zIndex: number,
  fill: string,
): TemplateElement => ({
  elementIdSuffix: suffix,
  type: "ellipse",
  itemIndex,
  role: "decoration",
  xFrac,
  yFrac,
  widthFrac,
  heightFrac,
  zIndex,
  props: { fill, stroke: "transparent", strokeWidth: 0 },
});

const comparisonElements = [0, 1].flatMap((index) => {
  const x = index === 0 ? 0.09 : 0.535;
  const accent = index === 0 ? "#2563EB" : "#F59E0B";
  return [
    rect(`card_${index}`, index, x, 0.31, 0.375, 0.42, 100 + index * 10, {
      fill: "#FFFFFF",
      stroke: "#CBD5E1",
      strokeWidth: 1,
      borderRadius: 16,
    }),
    rect(`accent_${index}`, index, x, 0.31, 0.375, 0.018, 101 + index * 10, {
      fill: accent,
      stroke: "transparent",
      strokeWidth: 0,
      borderRadius: 16,
    }),
    text(`title_${index}`, index, "title", x + 0.03, 0.39, 0.315, 0.08, 102 + index * 10),
    text(
      `description_${index}`,
      index,
      "description",
      x + 0.03,
      0.51,
      0.315,
      0.15,
      103 + index * 10,
    ),
  ];
});

const classificationElements = [0, 1, 2, 3].flatMap((index) => {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const x = 0.09 + column * 0.43;
  const y = 0.3 + row * 0.245;
  const accents = ["#2563EB", "#0891B2", "#7C3AED", "#DB2777"];
  return [
    rect(`card_${index}`, index, x, y, 0.39, 0.205, 100 + index * 10, {
      fill: "#F8FAFC",
      stroke: "#D7DEE8",
      strokeWidth: 1,
      borderRadius: 12,
    }),
    rect(`accent_${index}`, index, x, y, 0.012, 0.205, 101 + index * 10, {
      fill: accents[index],
      stroke: "transparent",
      strokeWidth: 0,
      borderRadius: 12,
    }),
    text(`title_${index}`, index, "title", x + 0.035, y + 0.035, 0.32, 0.055, 102 + index * 10, {
      fontSize: 23,
    }),
    text(
      `description_${index}`,
      index,
      "description",
      x + 0.035,
      y + 0.105,
      0.32,
      0.07,
      103 + index * 10,
      { fontSize: 15 },
    ),
  ];
});

const timelineElements = [
  rect("timeline_line", null, 0.11, 0.5, 0.78, 0.006, 90, {
    fill: "#CBD5E1",
    stroke: "transparent",
    strokeWidth: 0,
    borderRadius: 0,
  }),
  ...[0, 1, 2, 3].flatMap((index) => {
    const x = 0.105 + index * 0.205;
    const above = index % 2 === 0;
    const accent = index % 2 === 0 ? "#2563EB" : "#F59E0B";
    return [
      ellipse(`node_${index}`, index, x, 0.465, 0.045, 0.08, 100 + index * 10, accent),
      text(`title_${index}`, index, "title", x - 0.055, above ? 0.32 : 0.57, 0.155, 0.06, 101 + index * 10, {
        align: "center",
        fontSize: 21,
      }),
      text(
        `description_${index}`,
        index,
        "description",
        x - 0.055,
        above ? 0.39 : 0.64,
        0.155,
        0.08,
        102 + index * 10,
        { align: "center", fontSize: 14 },
      ),
    ];
  }),
];

const metricElements = [0, 1, 2].flatMap((index) => {
  const x = 0.08 + index * 0.295;
  const accents = ["#2563EB", "#0891B2", "#7C3AED"];
  return [
    rect(`card_${index}`, index, x, 0.32, 0.25, 0.38, 100 + index * 10, {
      fill: "#FFFFFF",
      stroke: "#D7DEE8",
      strokeWidth: 1,
      borderRadius: 18,
    }),
    ellipse(`metric_${index}`, index, x + 0.085, 0.37, 0.08, 0.142, 101 + index * 10, accents[index]),
    text(`title_${index}`, index, "title", x + 0.025, 0.54, 0.2, 0.07, 102 + index * 10, {
      align: "center",
      fontSize: 24,
    }),
    text(
      `description_${index}`,
      index,
      "description",
      x + 0.025,
      0.62,
      0.2,
      0.055,
      103 + index * 10,
      { align: "center", fontSize: 15 },
    ),
  ];
});

const presets = [
  {
    layoutId: "smart_art_comparison_2",
    layoutType: "comparison",
    name: "2열 비교 카드",
    itemCount: 2,
    elements: comparisonElements,
    sourceFile: "검정 흰색 심플한 콘텐츠 발표 ppt 프레젠테이션.pptx (slide 4)",
  },
  {
    layoutId: "smart_art_classification_grid_4",
    layoutType: "classification_grid",
    name: "2×2 분류 카드",
    itemCount: 4,
    elements: classificationElements,
    sourceFile: "검정 흰색 심플한 콘텐츠 발표 ppt 프레젠테이션.pptx (slide 6)",
  },
  {
    layoutId: "smart_art_timeline_4",
    layoutType: "timeline",
    name: "4단계 타임라인",
    itemCount: 4,
    elements: timelineElements,
    sourceFile: "노란색과 파란색 깔끔한 비즈니스 사업 제안 발표 보고서 PPT 디자인템플릿 프레젠테이션.pptx (slide 12)",
  },
  {
    layoutId: "smart_art_metric_cards_3",
    layoutType: "metric_cards",
    name: "3열 핵심 지표 카드",
    itemCount: 3,
    elements: metricElements,
    sourceFile: "파란색 흰색 심플한 비즈니스 프레젠테이션.pptx (slide 10)",
  },
] as const;

export class AddSmartArtTemplateLayouts2026071702000 implements MigrationInterface {
  name = "AddSmartArtTemplateLayouts2026071702000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const preset of presets) {
      await queryRunner.query(
        `
          INSERT INTO smart_art_layouts (
            layout_id, layout_type, name, item_count_min, item_count_max,
            elements_json, source_file, is_active, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $4, $5::jsonb, $6, true, now(), now())
          ON CONFLICT (layout_id) DO UPDATE SET
            layout_type = EXCLUDED.layout_type,
            name = EXCLUDED.name,
            item_count_min = EXCLUDED.item_count_min,
            item_count_max = EXCLUDED.item_count_max,
            elements_json = EXCLUDED.elements_json,
            source_file = EXCLUDED.source_file,
            is_active = true,
            updated_at = now()
        `,
        [
          preset.layoutId,
          preset.layoutType,
          preset.name,
          preset.itemCount,
          JSON.stringify(preset.elements),
          preset.sourceFile,
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM smart_art_layouts WHERE layout_id = ANY($1::text[])`,
      [presets.map((preset) => preset.layoutId)],
    );
  }
}
