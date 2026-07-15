import { deckSchema, type Deck, type Project } from "@orbit/shared";

export function buildInitialProjectDeck(project: Project): Deck {
  const normalizedProjectId = project.projectId.replace(/^project_/, "");

  return deckSchema.parse({
    canvas: { aspectRatio: "16:9", height: 1080, preset: "wide-16-9", width: 1920 },
    deckId: `deck_${normalizedProjectId}`,
    metadata: { language: "ko", locale: "ko-KR", sourceType: "manual" },
    projectId: project.projectId,
    slides: [{
      actions: [],
      aiNotes: { emphasisPoints: [], sourceEvidence: [] },
      animations: [],
      elements: [],
      keywords: [],
      order: 1,
      slideId: "slide_1",
      speakerNotes: "",
      style: {
        accentColor: "#2563eb",
        backgroundColor: "#ffffff",
        layout: "title",
        textColor: "#111827",
      },
      thumbnailUrl: "",
      title: "",
    }],
    theme: {
      accentColor: "#2563eb",
      backgroundColor: "#ffffff",
      effects: {
        borderRadius: 10,
        shadow: { blur: 18, color: "#111827", offsetX: 0, offsetY: 8, opacity: 0.16 },
      },
      fontFamily: "Inter",
      name: "Orbit Blank",
      palette: {
        border: "#dbe3f0",
        muted: "#f3f4f6",
        primary: "#2563eb",
        secondary: "#7c3aed",
        surface: "#ffffff",
      },
      textColor: "#111827",
      typography: {
        bodyFontFamily: "Inter",
        bodySize: 22,
        captionSize: 16,
        headingFontFamily: "Inter",
        headingSize: 36,
        titleSize: 56,
      },
    },
    title: project.title || "새 프레젠테이션",
    version: 1,
  });
}
