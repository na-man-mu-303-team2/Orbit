import { createDemoDeck } from "@orbit/editor-core";
import { deckSchema } from "@orbit/shared";
import type { Deck } from "@orbit/shared";

export const kdhHomeProjectEmail = "kdh@orbit.com";

export const kdhHomeProjectSeeds = [
  ["브랜드 리뉴얼 제안", "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1920&q=85"],
  ["2026 제품 로드맵", "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=85"],
  ["지속가능성 보고서", "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=85"],
  ["디지털 전환 전략", "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1920&q=85"],
  ["고객 경험 인사이트", "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1920&q=85"],
  ["분기별 비즈니스 리뷰", "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1920&q=85"],
  ["팀 온보딩 가이드", "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1920&q=85"],
  ["시장 진출 계획", "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1920&q=85"],
  ["크리에이티브 캠페인", "https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=1920&q=85"],
  ["2026 연간 성과 공유", "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1920&q=85"],
] as const;

export type KdhHomeProjectSeed = {
  deckId: string;
  imageUrl: string;
  projectId: string;
  title: string;
};

export function getKdhHomeProjectSeeds(): KdhHomeProjectSeed[] {
  return kdhHomeProjectSeeds.map(([title, imageUrl], index) => {
    const sequence = String(index + 1).padStart(2, "0");
    return {
      deckId: `deck_kdh_home_${sequence}`,
      imageUrl,
      projectId: `project_kdh_home_${sequence}`,
      title,
    };
  });
}

export function isKdhHomeProjectId(projectId: string): boolean {
  return getKdhHomeProjectSeeds().some((seed) => seed.projectId === projectId);
}

export function createKdhHomeProjectDeck(seed: KdhHomeProjectSeed): Deck {
  const template = createDemoDeck();
  const openingSlide = template.slides[0];

  return deckSchema.parse({
    ...template,
    deckId: seed.deckId,
    projectId: seed.projectId,
    slides: [
      {
        ...openingSlide,
        slideId: `slide_kdh_home_${seed.projectId.slice(-2)}`,
        title: seed.title,
        thumbnailUrl: "",
        style: {
          ...openingSlide.style,
          backgroundColor: "#111827",
          backgroundImage: {
            src: seed.imageUrl,
            alt: "",
            fit: "cover",
            opacity: 0.42,
          },
          textColor: "#ffffff",
        },
        speakerNotes: "",
        keywords: [],
        animations: [],
        actions: [],
        elements: openingSlide.elements
          .filter((element) => element.role === "title" || element.role === "body")
          .map((element) => ({
            ...element,
            elementId: `${element.elementId}_${seed.projectId.slice(-2)}`,
            props: {
              ...element.props,
              color: "#ffffff",
              text:
                element.role === "title"
                  ? seed.title
                  : "발표자료 초안",
            },
          })),
      },
    ],
    title: seed.title,
  });
}
