import { MigrationInterface, QueryRunner } from "typeorm";

const OVAL_PATH_DATA =
  "M 1012626 0 C 453368 0 0 181951 0 406400 C 0 630849 453368 812800 1012626 812800 " +
  "C 1571884 812800 2025253 630849 2025253 406400 C 2025253 181951 1571884 0 1012626 0 Z";

const cardGrid3Elements = [0, 1, 2].flatMap((i) => {
  const ovalX = [0.0651, 0.3708, 0.687][i];
  const dividerX = [0.0844, 0.3901, 0.7063][i];
  const titleX = [0.1229, 0.4281, 0.7448][i];
  return [
    {
      elementIdSuffix: `oval_${i}`,
      type: "customShape",
      itemIndex: i,
      role: "decoration",
      xFrac: ovalX,
      yFrac: 0.4,
      widthFrac: 0.2589,
      heightFrac: 0.1843,
      zIndex: 100 + i * 10,
      props: {
        pathData: OVAL_PATH_DATA,
        viewBoxWidth: 2025253,
        viewBoxHeight: 812800,
        fill: "#F3F4F6",
        stroke: "transparent",
        strokeWidth: 0,
        closed: true,
        nodes: []
      }
    },
    {
      elementIdSuffix: `divider_${i}`,
      type: "rect",
      itemIndex: i,
      role: "decoration",
      xFrac: dividerX,
      yFrac: 0.6556,
      widthFrac: 0.2198,
      heightFrac: 0.0015,
      zIndex: 101 + i * 10,
      props: { fill: "transparent", stroke: "#E5E7EB", strokeWidth: 1, borderRadius: 0 }
    },
    {
      elementIdSuffix: `title_${i}`,
      type: "text",
      itemIndex: i,
      role: "title",
      xFrac: titleX,
      yFrac: 0.4157,
      widthFrac: 0.1432,
      heightFrac: 0.15,
      zIndex: 102 + i * 10,
      textField: "title",
      props: {
        fontSize: 40,
        fontWeight: "bold",
        color: "#111827",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.15
      }
    },
    {
      elementIdSuffix: `desc_${i}`,
      type: "text",
      itemIndex: i,
      role: "body",
      xFrac: dividerX,
      yFrac: 0.7019,
      widthFrac: 0.2198,
      heightFrac: 0.1204,
      zIndex: 103 + i * 10,
      textField: "description",
      props: {
        fontSize: 20,
        fontWeight: "normal",
        color: "#4B5563",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.2
      }
    }
  ];
});

const listVertical3Elements = [0, 1, 2].flatMap((i) => {
  const rowY = [0.4565, 0.5991, 0.7417][i];
  const iconY = [0.5065, 0.6463, 0.787][i];
  const textY = [0.4917, 0.6333, 0.7741][i];
  return [
    {
      elementIdSuffix: `row_bg_${i}`,
      type: "rect",
      itemIndex: i,
      role: "decoration",
      xFrac: 0.0844,
      yFrac: rowY,
      widthFrac: 0.8313,
      heightFrac: 0.1176,
      zIndex: 100 + i * 10,
      props: { fill: "#F1F1F1", stroke: "#C8C8C6", strokeWidth: 1, borderRadius: 4 }
    },
    {
      elementIdSuffix: `bullet_${i}`,
      type: "ellipse",
      itemIndex: i,
      role: "decoration",
      xFrac: 0.1141,
      yFrac: iconY,
      widthFrac: 0.0125,
      heightFrac: 0.0222,
      zIndex: 101 + i * 10,
      props: { fill: "#111827", stroke: "transparent", strokeWidth: 0 }
    },
    {
      elementIdSuffix: `text_${i}`,
      type: "text",
      itemIndex: i,
      role: "body",
      xFrac: 0.1333,
      yFrac: textY,
      widthFrac: 0.7542,
      heightFrac: 0.0454,
      zIndex: 102 + i * 10,
      textField: "title",
      props: {
        fontSize: 26,
        fontWeight: "normal",
        color: "#222222",
        align: "left",
        verticalAlign: "middle",
        lineHeight: 1.15
      }
    }
  ];
});

const cardGrid4Elements = [0, 1, 2, 3].flatMap((i) => {
  const startX = 0.065;
  const gap = 0.025;
  const cardWidth = 0.19875;
  const x = startX + i * (cardWidth + gap);
  const accentColors = ["#2563EB", "#7C3AED", "#DB2777", "#0891B2"];

  return [
    {
      elementIdSuffix: `card_${i}`,
      type: "rect",
      itemIndex: i,
      role: "decoration",
      xFrac: x,
      yFrac: 0.29,
      widthFrac: cardWidth,
      heightFrac: 0.43,
      zIndex: 100 + i * 10,
      props: {
        fill: "#FFFFFF",
        stroke: "#D7DEE8",
        strokeWidth: 1,
        borderRadius: 18
      }
    },
    {
      elementIdSuffix: `accent_${i}`,
      type: "rect",
      itemIndex: i,
      role: "decoration",
      xFrac: x,
      yFrac: 0.29,
      widthFrac: cardWidth,
      heightFrac: 0.012,
      zIndex: 101 + i * 10,
      props: {
        fill: accentColors[i],
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 18
      }
    },
    {
      elementIdSuffix: `badge_${i}`,
      type: "ellipse",
      itemIndex: i,
      role: "decoration",
      xFrac: x + 0.018,
      yFrac: 0.33,
      widthFrac: 0.04,
      heightFrac: 0.0711,
      zIndex: 102 + i * 10,
      props: {
        fill: accentColors[i],
        stroke: "transparent",
        strokeWidth: 0
      }
    },
    {
      elementIdSuffix: `badge_text_${i}`,
      type: "text",
      itemIndex: i,
      role: "caption",
      xFrac: x + 0.018,
      yFrac: 0.343,
      widthFrac: 0.04,
      heightFrac: 0.045,
      zIndex: 103 + i * 10,
      props: {
        text: String(i + 1).padStart(2, "0"),
        fontSize: 18,
        fontWeight: "bold",
        color: "#FFFFFF",
        align: "center",
        verticalAlign: "middle",
        lineHeight: 1
      }
    },
    {
      elementIdSuffix: `title_${i}`,
      type: "text",
      itemIndex: i,
      role: "title",
      xFrac: x + 0.018,
      yFrac: 0.43,
      widthFrac: cardWidth - 0.036,
      heightFrac: 0.09,
      zIndex: 104 + i * 10,
      textField: "title",
      props: {
        fontSize: 25,
        fontWeight: "bold",
        color: "#111827",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.15
      }
    },
    {
      elementIdSuffix: `description_${i}`,
      type: "text",
      itemIndex: i,
      role: "body",
      xFrac: x + 0.018,
      yFrac: 0.54,
      widthFrac: cardWidth - 0.036,
      heightFrac: 0.13,
      zIndex: 105 + i * 10,
      textField: "description",
      props: {
        fontSize: 18,
        fontWeight: "normal",
        color: "#4B5563",
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.25
      }
    }
  ];
});

function processHorizontalElements(itemCount: number) {
  const startX = 0.08;
  const totalWidth = 0.84;
  const gap = 0.02;
  const cardWidth = (totalWidth - gap * (itemCount - 1)) / itemCount;

  const connectors = Array.from({ length: itemCount - 1 }, (_, i) => ({
    elementIdSuffix: `connector_${i}`,
    type: "rect",
    itemIndex: null,
    role: "decoration",
    xFrac: startX + cardWidth * (i + 1) + gap * i,
    yFrac: 0.515,
    widthFrac: gap,
    heightFrac: 0.008,
    zIndex: 90,
    props: {
      fill: "#94A3B8",
      stroke: "transparent",
      strokeWidth: 0,
      borderRadius: 0
    }
  }));

  const cards = Array.from({ length: itemCount }, (_, i) => {
    const x = startX + i * (cardWidth + gap);
    return [
      {
        elementIdSuffix: `card_${i}`,
        type: "rect",
        itemIndex: i,
        role: "decoration",
        xFrac: x,
        yFrac: 0.34,
        widthFrac: cardWidth,
        heightFrac: 0.36,
        zIndex: 100 + i * 10,
        props: {
          fill: i % 2 === 0 ? "#EFF6FF" : "#F8FAFC",
          stroke: "#CBD5E1",
          strokeWidth: 1,
          borderRadius: 16
        }
      },
      {
        elementIdSuffix: `step_${i}`,
        type: "ellipse",
        itemIndex: i,
        role: "decoration",
        xFrac: x + cardWidth * 0.08,
        yFrac: 0.375,
        widthFrac: Math.min(cardWidth * 0.2, 0.04),
        heightFrac: 0.071,
        zIndex: 101 + i * 10,
        props: { fill: "#2563EB", stroke: "transparent", strokeWidth: 0 }
      },
      {
        elementIdSuffix: `step_number_${i}`,
        type: "text",
        itemIndex: i,
        role: "caption",
        xFrac: x + cardWidth * 0.08,
        yFrac: 0.386,
        widthFrac: Math.min(cardWidth * 0.2, 0.04),
        heightFrac: 0.045,
        zIndex: 102 + i * 10,
        props: {
          text: String(i + 1),
          fontSize: 20,
          fontWeight: "bold",
          color: "#FFFFFF",
          align: "center",
          verticalAlign: "middle",
          lineHeight: 1
        }
      },
      {
        elementIdSuffix: `title_${i}`,
        type: "text",
        itemIndex: i,
        role: "title",
        xFrac: x + cardWidth * 0.08,
        yFrac: 0.48,
        widthFrac: cardWidth * 0.84,
        heightFrac: 0.075,
        zIndex: 103 + i * 10,
        textField: "title",
        props: {
          fontSize: itemCount >= 4 ? 24 : 28,
          fontWeight: "bold",
          color: "#0F172A",
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.1
        }
      },
      {
        elementIdSuffix: `description_${i}`,
        type: "text",
        itemIndex: i,
        role: "body",
        xFrac: x + cardWidth * 0.08,
        yFrac: 0.57,
        widthFrac: cardWidth * 0.84,
        heightFrac: 0.09,
        zIndex: 104 + i * 10,
        textField: "description",
        props: {
          fontSize: itemCount >= 4 ? 16 : 18,
          fontWeight: "normal",
          color: "#475569",
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2
        }
      }
    ];
  });

  return [...connectors, ...cards.flat()];
}

const presets = [
  {
    layoutId: "smart_art_list_vertical_3",
    layoutType: "list",
    name: "세로 체크리스트 (3항목)",
    itemCountMin: 3,
    itemCountMax: 3,
    elements: listVertical3Elements,
    sourceFile:
      "하늘색과 흰색 심플한 비즈니스 기획서 발표 보고서 PPT 디자인 레이아웃 템플릿 프레젠테이션.pptx (slide 6)"
  },
  {
    layoutId: "smart_art_card_grid_3",
    layoutType: "card_grid",
    name: "가로 카드형 (3항목)",
    itemCountMin: 3,
    itemCountMax: 3,
    elements: cardGrid3Elements,
    sourceFile: "베이지색의 심플한 프로젝트 발표 프레젠테이션.pptx (slide 2)"
  },
  {
    layoutId: "smart_art_card_grid_4",
    layoutType: "card_grid",
    name: "인물/항목 카드형 (4항목)",
    itemCountMin: 4,
    itemCountMax: 4,
    elements: cardGrid4Elements,
    sourceFile: null
  },
  ...[2, 3, 4, 5].map((itemCount) => ({
    layoutId: `smart_art_process_horizontal_${itemCount}`,
    layoutType: "process",
    name: `가로 프로세스 (${itemCount}단계)`,
    itemCountMin: itemCount,
    itemCountMax: itemCount,
    elements: processHorizontalElements(itemCount),
    sourceFile: null
  }))
] as const;

export class CreateSmartArtLayouts2026071701000 implements MigrationInterface {
  name = "CreateSmartArtLayouts2026071701000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS smart_art_layouts (
        layout_id text PRIMARY KEY,
        layout_type text NOT NULL,
        name text NOT NULL,
        item_count_min integer NOT NULL CHECK (item_count_min > 0),
        item_count_max integer NOT NULL CHECK (item_count_max >= item_count_min),
        elements_json jsonb NOT NULL,
        source_file text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_smart_art_layouts_type_count
      ON smart_art_layouts (layout_type, item_count_min, item_count_max)
      WHERE is_active = true
    `);

    for (const preset of presets) {
      await queryRunner.query(
        `
          INSERT INTO smart_art_layouts (
            layout_id, layout_type, name, item_count_min, item_count_max,
            elements_json, source_file, is_active, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, true, now(), now())
          ON CONFLICT (layout_id) DO NOTHING
        `,
        [
          preset.layoutId,
          preset.layoutType,
          preset.name,
          preset.itemCountMin,
          preset.itemCountMax,
          JSON.stringify(preset.elements),
          preset.sourceFile
        ]
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_smart_art_layouts_type_count`);
    await queryRunner.query(`DROP TABLE IF EXISTS smart_art_layouts`);
  }
}
