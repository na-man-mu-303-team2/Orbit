import type { GenerateDeckFontOverride } from "./generate-deck.schema";

export type GenerateDeckFontMood =
  | "professional"
  | "rounded"
  | "friendly"
  | "editorial"
  | "tech"
  | "formal"
  | "playful";

export type GenerateDeckFontOption = GenerateDeckFontOverride & {
  rationale: string;
  score: number;
};

export const generateDeckFontCatalog: GenerateDeckFontOverride[] = [
  {
    fontId: "pretendard",
    name: "Pretendard",
    headingFontFamily: "Pretendard",
    bodyFontFamily: "Pretendard",
    fallbackFamily: "Arial",
    weights: [400, 500, 600, 700],
    supportsKorean: true,
    pptxEmbeddable: true,
    moodTags: ["professional", "modern", "clear", "tech"],
    license: "SIL Open Font License 1.1",
    sourceUrl: "https://github.com/orioncactus/pretendard"
  },
  {
    fontId: "noto-sans-kr",
    name: "Noto Sans KR",
    headingFontFamily: "Noto Sans KR",
    bodyFontFamily: "Noto Sans KR",
    fallbackFamily: "Arial",
    weights: [400, 500, 700],
    supportsKorean: true,
    pptxEmbeddable: true,
    moodTags: ["professional", "formal", "clear"],
    license: "SIL Open Font License 1.1",
    sourceUrl: "https://fonts.google.com/noto/specimen/Noto+Sans+KR"
  },
  {
    fontId: "gowun-dodum",
    name: "Gowun Dodum",
    headingFontFamily: "Gowun Dodum",
    bodyFontFamily: "Gowun Dodum",
    fallbackFamily: "Arial",
    weights: [400],
    supportsKorean: true,
    pptxEmbeddable: true,
    moodTags: ["friendly", "rounded", "editorial"],
    license: "SIL Open Font License 1.1",
    sourceUrl: "https://github.com/yangheeryu/Gowun-Dodum"
  },
  {
    fontId: "nanum-square-round",
    name: "NanumSquareRound",
    headingFontFamily: "NanumSquareRound",
    bodyFontFamily: "NanumSquareRound",
    fallbackFamily: "Arial",
    weights: [400, 700],
    supportsKorean: true,
    pptxEmbeddable: true,
    moodTags: ["rounded", "friendly", "playful"],
    license: "Naver Nanum Font License",
    sourceUrl: "https://hangeul.naver.com/font"
  },
  {
    fontId: "gmarket-sans",
    name: "Gmarket Sans",
    headingFontFamily: "Gmarket Sans",
    bodyFontFamily: "Gmarket Sans",
    fallbackFamily: "Arial",
    weights: [400, 500, 700],
    supportsKorean: true,
    pptxEmbeddable: true,
    moodTags: ["modern", "playful", "bold", "friendly"],
    license: "Gmarket Sans License",
    sourceUrl: "https://corp.gmarket.com/fonts"
  }
];

const moodKeywords: Record<GenerateDeckFontMood, string[]> = {
  professional: ["professional", "expert", "trust", "business", "전문", "신뢰"],
  rounded: ["rounded", "round", "soft", "cute", "동글", "둥근"],
  friendly: ["friendly", "warm", "casual", "친근", "부드러운"],
  editorial: ["editorial", "essay", "book", "감성", "에디토리얼"],
  tech: ["tech", "ai", "data", "developer", "기술", "개발"],
  formal: ["formal", "executive", "official", "임원", "격식"],
  playful: ["playful", "fun", "bold", "kids", "재미", "귀여운"]
};

export function recommendGenerateDeckFonts(
  input: string,
  limit = 3
): GenerateDeckFontOption[] {
  const source = input.toLocaleLowerCase("ko-KR");
  return generateDeckFontCatalog
    .map((font) => {
      const matchedMoods = font.moodTags.filter((tag) =>
        matchesMood(source, tag as GenerateDeckFontMood)
      );
      return {
        ...font,
        score: matchedMoods.length * 10 + defaultFontScore(font.fontId),
        rationale: fontRationale(font, matchedMoods)
      };
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

function matchesMood(source: string, mood: GenerateDeckFontMood) {
  return moodKeywords[mood]?.some((keyword) =>
    source.includes(keyword.toLocaleLowerCase("ko-KR"))
  );
}

function defaultFontScore(fontId: string) {
  return fontId === "pretendard" ? 3 : fontId === "noto-sans-kr" ? 2 : 1;
}

function fontRationale(
  font: GenerateDeckFontOverride,
  matchedMoods: string[]
) {
  const moods = matchedMoods.length ? matchedMoods : font.moodTags.slice(0, 2);
  return `${font.name} matches ${moods.join(", ")} presentation tone.`;
}
