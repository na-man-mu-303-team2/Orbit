import { MigrationInterface, QueryRunner } from "typeorm";

type TemplateElement = {
  elementIdSuffix?: string;
  textField?: "title" | "description";
  props?: Record<string, unknown>;
};

const layoutIds = [
  "smart_art_list_vertical_3",
  "smart_art_card_grid_3",
  "smart_art_card_grid_4",
  "smart_art_process_horizontal_2",
  "smart_art_process_horizontal_3",
  "smart_art_process_horizontal_4",
  "smart_art_process_horizontal_5",
  "smart_art_comparison_2",
  "smart_art_classification_grid_4",
  "smart_art_timeline_4",
  "smart_art_metric_cards_3",
] as const;

const originalContentSizes: Record<string, { title: number; description?: number }> = {
  smart_art_list_vertical_3: { title: 26 },
  smart_art_card_grid_3: { title: 40, description: 20 },
  smart_art_card_grid_4: { title: 25, description: 18 },
  smart_art_process_horizontal_2: { title: 28, description: 18 },
  smart_art_process_horizontal_3: { title: 28, description: 18 },
  smart_art_process_horizontal_4: { title: 24, description: 16 },
  smart_art_process_horizontal_5: { title: 24, description: 16 },
  smart_art_comparison_2: { title: 26, description: 17 },
  smart_art_classification_grid_4: { title: 23, description: 15 },
  smart_art_timeline_4: { title: 21, description: 14 },
  smart_art_metric_cards_3: { title: 24, description: 15 },
};

export function updateSmartArtTypography(
  layoutId: string,
  elements: TemplateElement[],
  direction: "up" | "down",
) {
  return elements.map((element) => {
    if (!element.textField || !element.props) return element;
    const original = originalContentSizes[layoutId]?.[element.textField];
    if (original === undefined) return element;
    const fontSize =
      direction === "down"
        ? original
        : layoutId === "smart_art_metric_cards_3" && element.textField === "description"
          ? 30
          : element.textField === "title"
            ? Math.max(original, 30)
            : Math.max(original, 21);
    return { ...element, props: { ...element.props, fontSize } };
  });
}

export class IncreaseSmartArtTypography2026071703000 implements MigrationInterface {
  name = "IncreaseSmartArtTypography2026071703000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.update(queryRunner, "up");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.update(queryRunner, "down");
  }

  private async update(queryRunner: QueryRunner, direction: "up" | "down") {
    const rows = (await queryRunner.query(
      `SELECT layout_id, elements_json FROM smart_art_layouts WHERE layout_id = ANY($1::text[])`,
      [layoutIds],
    )) as Array<{ layout_id: string; elements_json: TemplateElement[] }>;

    for (const row of rows) {
      await queryRunner.query(
        `UPDATE smart_art_layouts SET elements_json = $2::jsonb, updated_at = now() WHERE layout_id = $1`,
        [
          row.layout_id,
          JSON.stringify(updateSmartArtTypography(row.layout_id, row.elements_json, direction)),
        ],
      );
    }
  }
}
