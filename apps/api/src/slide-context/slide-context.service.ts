import { loadOrbitConfig } from "@orbit/config";
import {
  extractSlideContextItemsRequestSchema,
  extractSlideContextItemsResponseSchema,
  listSlideContextItemsResponseSchema,
  updateSlideContextItemRequestSchema,
  updateSlideContextItemResponseSchema,
  type ListSlideContextItemsResponse,
  type ExtractSlideContextItemsResponse,
  type UpdateSlideContextItemResponse
} from "@orbit/shared";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { z } from "zod";
import { parseRequest } from "../common/zod-request";

type SlideContextItemRow = {
  item_id: string;
  project_id: string;
  deck_id: string;
  slide_id: string;
  item_order: number;
  label: string;
  sentence: string;
  created_at: Date;
  updated_at: Date;
};

const pythonWorkerSlideContextItemSchema = z.object({
  itemId: z.string().uuid(),
  slideId: z.string().min(1),
  itemOrder: z.number().int().nonnegative(),
  label: z.string().trim().min(1).max(200),
  sentence: z.string().trim().min(1).max(1000)
});

const pythonWorkerExtractSlideContextResponseSchema = z.object({
  projectId: z.string().min(1).optional(),
  deckId: z.string().min(1).optional(),
  items: z.array(pythonWorkerSlideContextItemSchema)
});

@Injectable()
export class SlideContextService {
  private readonly pythonWorkerUrl = loadOrbitConfig(process.env, {
    service: "api"
  }).PYTHON_WORKER_URL;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  async extractItems(
    projectId: string,
    deckId: string,
    body: unknown
  ): Promise<ExtractSlideContextItemsResponse> {
    const request = parseRequest(extractSlideContextItemsRequestSchema, body);

    if (request.projectId !== projectId || request.deckId !== deckId) {
      throw new BadRequestException(
        "projectId/deckId in body must match URL params."
      );
    }

    const response = await fetch(
      workerUrl(this.pythonWorkerUrl, "/slide-context/extract"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          deckId,
          slides: request.slides.map((s) => ({
            slideId: s.slideId,
            slideText: s.slideText,
            speakerNotes: s.speakerNotes
          }))
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new BadGatewayException(
        `Slide context extraction failed: ${detail || response.statusText}`
      );
    }

    const raw = pythonWorkerExtractSlideContextResponseSchema.parse(
      await response.json()
    );
    const now = new Date().toISOString();
    return extractSlideContextItemsResponseSchema.parse({
      items: raw.items.map((item) => ({
        itemId: item.itemId,
        projectId,
        deckId,
        slideId: item.slideId,
        itemOrder: item.itemOrder,
        label: item.label,
        sentence: item.sentence,
        hasEmbedding: false,
        createdAt: now,
        updatedAt: now
      }))
    });
  }

  async listItems(
    projectId: string,
    deckId: string
  ): Promise<ListSlideContextItemsResponse> {
    const rows = await this.dataSource.query<SlideContextItemRow[]>(
      `SELECT item_id, project_id, deck_id, slide_id, item_order,
              label, sentence, created_at, updated_at
       FROM slide_context_items
       WHERE project_id = $1 AND deck_id = $2
       ORDER BY item_order ASC`,
      [projectId, deckId]
    );

    return listSlideContextItemsResponseSchema.parse({
      items: rows.map(toItemResponse)
    });
  }

  async updateItem(
    projectId: string,
    itemId: string,
    body: unknown
  ): Promise<UpdateSlideContextItemResponse> {
    const request = parseRequest(updateSlideContextItemRequestSchema, body);

    const setClauses: string[] = ["updated_at = now()"];
    const params: unknown[] = [];

    if (request.label !== undefined) {
      params.push(request.label);
      setClauses.push(`label = $${params.length}`);
    }
    if (request.sentence !== undefined) {
      params.push(request.sentence);
      setClauses.push(`sentence = $${params.length}`);
      setClauses.push("embedding = NULL");
    }

    params.push(itemId, projectId);
    const rows = await this.dataSource.query<SlideContextItemRow[]>(
      `UPDATE slide_context_items
       SET ${setClauses.join(", ")}
       WHERE item_id = $${params.length - 1} AND project_id = $${params.length}
       RETURNING item_id, project_id, deck_id, slide_id, item_order,
                 label, sentence, created_at, updated_at`,
      params
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException("Slide context item not found.");
    }

    return updateSlideContextItemResponseSchema.parse({ item: toItemResponse(row) });
  }

  async deleteItem(projectId: string, itemId: string): Promise<void> {
    const result = await this.dataSource.query<{ rowcount?: number }>(
      `DELETE FROM slide_context_items
       WHERE item_id = $1 AND project_id = $2`,
      [itemId, projectId]
    );
    const affected = Array.isArray(result) ? (result[1] as number) : 0;
    if (affected === 0) {
      throw new NotFoundException("Slide context item not found.");
    }
  }
}

function toItemResponse(row: SlideContextItemRow) {
  return {
    itemId: row.item_id,
    projectId: row.project_id,
    deckId: row.deck_id,
    slideId: row.slide_id,
    itemOrder: row.item_order,
    label: row.label,
    sentence: row.sentence,
    hasEmbedding: false,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  ).toString();
}
