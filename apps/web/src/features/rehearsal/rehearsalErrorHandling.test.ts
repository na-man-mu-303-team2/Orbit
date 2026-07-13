import { describe, expect, it, vi } from "vitest";
import {
  logRehearsalValidationFailure,
  readRehearsalErrorMessage,
  rehearsalDeckInvalidMessage
} from "./rehearsalErrorHandling";

describe("rehearsal error handling", () => {
  it("logs only validation codes and paths", () => {
    const logger = vi.fn();
    const logged = logRehearsalValidationFailure(
      {
        issues: [
          {
            code: "too_small",
            path: ["slides", 0, "title"],
            message: "sensitive raw validation detail"
          }
        ]
      },
      { projectId: "project-a", deckId: "deck-a" },
      logger
    );

    expect(logged).toBe(true);
    expect(JSON.parse(logger.mock.calls[0]![0])).toEqual({
      event: "rehearsal.snapshot.validation_failed",
      projectId: "project-a",
      deckId: "deck-a",
      issues: [{ code: "too_small", path: ["slides", 0, "title"] }]
    });
    expect(logger.mock.calls[0]![0]).not.toContain("sensitive raw validation detail");
  });

  it("maps known API codes and hides raw unknown responses", async () => {
    await expect(
      readRehearsalErrorMessage(
        new Response(JSON.stringify({ code: "REHEARSAL_DECK_INVALID", details: "raw" })),
        "fallback"
      )
    ).resolves.toBe(rehearsalDeckInvalidMessage);

    await expect(
      readRehearsalErrorMessage(new Response("internal stack trace"), "fallback")
    ).resolves.toBe("fallback");
  });
});
