import { describe, expect, it } from "vitest";

import {
  appendDeckPatchAckResponseSchema,
  appendDeckPatchRequestSchema,
} from "./deck-api.schema";

const changeRecord = {
  changeId: "change_test_1",
  deckId: "deck_test_1",
  beforeVersion: 1,
  afterVersion: 2,
  source: "user" as const,
  operations: [{ type: "update_deck" as const, title: "Updated" }],
  createdAt: "2026-07-10T00:00:00.000Z",
};

describe("deck patch ack API schema", () => {
  it("accepts the optional ack response mode", () => {
    const request = appendDeckPatchRequestSchema.parse({
      patch: {
        deckId: "deck_test_1",
        baseVersion: 1,
        source: "user",
        operations: [{ type: "update_deck", title: "Updated" }],
      },
      responseMode: "ack",
    });

    expect(request.responseMode).toBe("ack");
  });

  it("validates a lightweight response without a deck", () => {
    const response = appendDeckPatchAckResponseSchema.parse({
      deckId: "deck_test_1",
      version: 2,
      changeRecord,
      updatedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(response).not.toHaveProperty("deck");
    expect(response.version).toBe(2);
  });

  it("rejects an ack version that differs from the change record", () => {
    expect(() =>
      appendDeckPatchAckResponseSchema.parse({
        deckId: "deck_test_1",
        version: 3,
        changeRecord,
        updatedAt: "2026-07-10T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
