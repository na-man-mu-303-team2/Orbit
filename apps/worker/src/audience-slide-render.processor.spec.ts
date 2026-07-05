import { deckSchema } from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { processAudienceSlideRenderJob } from "./audience-slide-render.processor";

const deck = deckSchema.parse({
  deckId: "deck_1",
  projectId: "project_1",
  title: "Audience Deck",
  version: 3,
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9"
  },
  slides: [
    {
      slideId: "slide_1",
      order: 1,
      title: "Audience snapshot",
      style: {},
      elements: [
        {
          elementId: "el_1",
          type: "text",
          x: 100,
          y: 120,
          width: 800,
          height: 120,
          props: { text: "Visible to audience" }
        }
      ]
    }
  ]
});

describe("processAudienceSlideRenderJob", () => {
  it("stores the snapshot, updates the session snapshot map, and succeeds the job", async () => {
    const putObject = vi.fn(async (input: Parameters<StoragePort["putObject"]>[0]) => ({
      key: input.key,
      url: `https://cdn.example.test/${input.key}`,
      contentType: input.contentType,
      purpose: input.purpose,
      size: String(input.body).length
    }));
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("audience_slide_snapshots_json")) {
        return [];
      }

      if (sql.includes("UPDATE jobs")) {
        return [
          {
            job_id: params[0],
            project_id: "project_1",
            type: "audience-slide-render",
            status: params[1],
            progress: params[2],
            message: params[3],
            result: params[4],
            error: params[5],
            created_at: "2026-07-05T00:00:00.000Z",
            updated_at: "2026-07-05T00:00:01.000Z"
          }
        ];
      }

      return [];
    });

    const result = await processAudienceSlideRenderJob(
      { query } as unknown as DataSource,
      { putObject },
      {
        jobId: "job_slide",
        projectId: "project_1",
        sessionId: "session_1",
        deck,
        deckContentHash: "deck-public-hash",
        deckVersion: 3,
        slideId: "slide_1"
      }
    );

    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/svg+xml",
        purpose: "audience-slide-snapshot"
      })
    );
    const snapshotUpdate = query.mock.calls.find(([sql]) =>
      String(sql).includes("audience_slide_snapshots_json")
    );
    expect(snapshotUpdate?.[1]).toEqual(
      expect.arrayContaining([
        "session_1",
        3,
        "deck-public-hash",
        "slide_1"
      ])
    );
    expect(result).toMatchObject({
      jobId: "job_slide",
      status: "succeeded",
      result: {
        slideId: "slide_1",
        url: expect.stringContaining("audience-slide-snapshots/session_1")
      }
    });
  });
});
