import { MigrationInterface, QueryRunner } from "typeorm";

type TemplateElement = {
  textField?: "title" | "description";
  props?: Record<string, unknown>;
};

const layoutIds = ["smart_art_card_grid_3", "smart_art_metric_cards_3"] as const;

export function alignSmartArtCardText(
  layoutId: string,
  elements: TemplateElement[],
  direction: "up" | "down",
) {
  return elements.map((element) => {
    if (!element.textField || !element.props) return element;
    if (direction === "up") {
      return {
        ...element,
        props: { ...element.props, align: "center", verticalAlign: "middle" },
      };
    }
    return {
      ...element,
      props: {
        ...element.props,
        align: layoutId === "smart_art_card_grid_3" ? "left" : "center",
        verticalAlign: "top",
      },
    };
  });
}

export class CenterSmartArtCardText2026071705000 implements MigrationInterface {
  name = "CenterSmartArtCardText2026071705000";

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
          JSON.stringify(alignSmartArtCardText(row.layout_id, row.elements_json, direction)),
        ],
      );
    }
  }
}
