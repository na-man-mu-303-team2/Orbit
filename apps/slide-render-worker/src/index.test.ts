import { describe, expect, it } from "vitest";
import { deckSchema } from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import { handleSlideRenderJob } from "./index";

const deck = deckSchema.parse({
  deckId: "deck_1",
  projectId: "project_1",
  title: "Demo",
  version: 1,
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
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
          y: 200,
          width: 800,
          height: 120,
          props: { text: "Visible" },
        },
      ],
    },
  ],
});

describe("handleSlideRenderJob", () => {
  it("stores rendered snapshots with the audience-slide-snapshot purpose", async () => {
    const writes: Array<Parameters<StoragePort["putObject"]>[0]> = [];
    const storage: StoragePort = {
      async putObject(input) {
        writes.push(input);
        return {
          key: input.key,
          url: `https://cdn.example.test/${input.key}`,
          contentType: input.contentType,
          purpose: input.purpose,
          size: String(input.body).length,
        };
      },
      async getObject() {
        throw new Error("not used");
      },
      async createUploadUrl() {
        throw new Error("not used");
      },
      async getSignedReadUrl() {
        throw new Error("not used");
      },
      async headObject() {
        return null;
      },
      async removeObject() {
        throw new Error("not used");
      },
    };

    const result = await handleSlideRenderJob(
      {
        deck,
        sessionId: "session_1",
        slideId: "slide_1",
        effectState: { stepIndex: 1 },
      },
      storage,
    );

    expect(result.url).toContain("audience-slide-snapshots/session_1");
    expect(writes[0]).toMatchObject({
      contentType: "image/svg+xml",
      purpose: "audience-slide-snapshot",
    });
    expect(String(writes[0].body)).toContain("Audience snapshot");
  });
});
