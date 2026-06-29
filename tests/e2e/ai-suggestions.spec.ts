import { expect, test } from "@playwright/test";

const initialNotes = "기존 발표 메모입니다.";
const appliedNotes = "AI가 승인한 발표 메모입니다.";
const updatedAt = "2026-06-29T00:00:00.000Z";

const baseDeck = {
  deckId: "deck_demo_1",
  projectId: "project_demo_1",
  title: "ORBIT AI Suggestion Deck",
  version: 1,
  metadata: { language: "ko", locale: "ko-KR", sourceType: "manual" },
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9"
  },
  theme: {
    name: "Default",
    fontFamily: "Inter",
    backgroundColor: "#ffffff",
    textColor: "#111827",
    accentColor: "#2563eb",
    palette: {
      primary: "#2563eb",
      secondary: "#7c3aed",
      surface: "#ffffff",
      muted: "#f3f4f6",
      border: "#e5e7eb"
    },
    typography: {
      headingFontFamily: "Inter",
      bodyFontFamily: "Inter",
      titleSize: 56,
      headingSize: 40,
      bodySize: 24,
      captionSize: 16
    },
    effects: {
      borderRadius: 8
    }
  },
  slides: [
    {
      slideId: "slide_ai_1",
      order: 1,
      title: "AI 제안 대상 슬라이드",
      thumbnailUrl: "",
      style: {
        layout: "title-content",
        backgroundColor: "#ffffff",
        textColor: "#111827",
        accentColor: "#2563eb"
      },
      speakerNotes: initialNotes,
      elements: [
        {
          elementId: "el_ai_title",
          type: "text",
          role: "title",
          x: 120,
          y: 120,
          width: 920,
          height: 160,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          locked: false,
          visible: true,
          props: {
            text: "AI 제안 대상 슬라이드",
            fontSize: 64,
            fontFamily: "Inter",
            fontWeight: 800,
            color: "#111827",
            align: "left",
            verticalAlign: "top",
            lineHeight: 1.2
          }
        }
      ],
      keywords: [],
      animations: [],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] }
    }
  ]
};

type DeckFixture = typeof baseDeck;
type SuggestionStatus = "pending" | "applied";

test.describe("ORBIT-27 AI suggestion review/apply", () => {
  test("shows a pending slide suggestion, applies it, persists after reload, and prevents a second apply", async ({
    page
  }) => {
    let deck: DeckFixture = structuredClone(baseDeck);
    let suggestionStatus: SuggestionStatus = "pending";
    let applyCount = 0;

    await page.route("**/api/health", async (route) => {
      await route.fulfill({
        json: {
          status: "ok",
          app: "orbit-api",
          demo: {
            projectId: deck.projectId,
            deckId: deck.deckId,
            sessionId: "session_demo_1"
          }
        }
      });
    });

    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 401,
        json: {
          code: "UNAUTHENTICATED",
          message: "Not authenticated"
        }
      });
    });

    await page.route("**/api/v1/projects/project_demo_1/deck", async (route) => {
      await route.fulfill({
        json: {
          projectId: deck.projectId,
          deck,
          updatedAt
        }
      });
    });

    await page.route(
      "**/api/v1/projects/project_demo_1/ai-suggestions**",
      async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (request.method() === "GET" && url.pathname.endsWith("/ai-suggestions")) {
          await route.fulfill({
            json: {
              projectId: deck.projectId,
              suggestions: [createSuggestion(deck, suggestionStatus)]
            }
          });
          return;
        }

        if (
          request.method() === "POST" &&
          url.pathname.endsWith("/suggestion_ai_notes/apply")
        ) {
          applyCount += 1;

          if (suggestionStatus !== "pending") {
            await route.fulfill({
              status: 409,
              json: {
                code: "AI_SUGGESTION_NOT_PENDING",
                message: "AI suggestion is not pending.",
                details: ["status=applied"]
              }
            });
            return;
          }

          const nextDeck = {
            ...deck,
            version: deck.version + 1,
            slides: deck.slides.map((slide) =>
              slide.slideId === "slide_ai_1"
                ? { ...slide, speakerNotes: appliedNotes }
                : slide
            )
          };
          deck = nextDeck;
          suggestionStatus = "applied";

          await route.fulfill({
            json: {
              suggestion: createSuggestion(deck, "applied"),
              deck,
              changeRecord: {
                changeId: "change_ai_notes",
                deckId: deck.deckId,
                beforeVersion: 1,
                afterVersion: deck.version,
                source: "ai",
                createdAt: "2026-06-29T00:00:01.000Z",
                operations: createSuggestion(deck, "applied").patch.operations
              },
              snapshot: {
                snapshotId: "snapshot_ai_notes",
                projectId: deck.projectId,
                deckId: deck.deckId,
                version: deck.version,
                reason: "patch-applied",
                createdAt: "2026-06-29T00:00:01.000Z"
              },
              updatedAt: "2026-06-29T00:00:01.000Z"
            }
          });
          return;
        }

        await route.fulfill({ status: 404, body: "" });
      }
    );

    await page.goto("/project/project_demo_1");
    await expect(page.getByLabel("Presentation editor")).toBeVisible();

    const aiPanel = page.getByLabel("AI 제안");
    await expect(aiPanel.getByText("발표 메모 개선")).toBeVisible();
    await expect(page.getByText(initialNotes)).toBeVisible();

    await aiPanel.getByRole("button", { name: "적용" }).click();

    await expect(page.getByText(appliedNotes)).toBeVisible();
    await expect(aiPanel.getByText("적용됨")).toBeVisible();
    await expect(aiPanel.getByRole("button", { name: "적용" })).toHaveCount(0);
    expect(applyCount).toBe(1);

    await page.reload();
    await expect(page.getByLabel("Presentation editor")).toBeVisible();

    await expect(page.getByText(appliedNotes)).toBeVisible();
    await expect(aiPanel.getByText("적용됨")).toBeVisible();
    await expect(aiPanel.getByRole("button", { name: "적용" })).toHaveCount(0);
    expect(applyCount).toBe(1);
  });
});

function createSuggestion(deck: DeckFixture, status: SuggestionStatus) {
  const slide = deck.slides[0];

  return {
    suggestionId: "suggestion_ai_notes",
    projectId: deck.projectId,
    deckId: deck.deckId,
    slideId: slide.slideId,
    baseVersion: 1,
    title: "발표 메모 개선",
    summary: "현재 슬라이드의 발표 메모를 더 명확하게 바꿉니다.",
    patch: {
      deckId: deck.deckId,
      baseVersion: 1,
      source: "ai",
      operations: [
        {
          type: "update_speaker_notes",
          slideId: slide.slideId,
          speakerNotes: appliedNotes
        }
      ]
    },
    status,
    appliedChangeId: status === "applied" ? "change_ai_notes" : undefined,
    createdAt: updatedAt,
    updatedAt: status === "applied" ? "2026-06-29T00:00:01.000Z" : updatedAt
  };
}
