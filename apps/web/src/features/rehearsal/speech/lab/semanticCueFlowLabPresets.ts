import { semanticCueLabPresets } from "./semanticCueLabPresets";

export type FlowLabSlideInput = {
  slideId: string;
  title?: string;
  speakerNotes: string;
  keywords: {
    keywordId: string;
    text: string;
    synonyms: string[];
    abbreviations: string[];
  }[];
  semanticCues: unknown[];
};

export type FlowLabPreset = {
  id: string;
  label: string;
  description: string;
  script: string;
  slides: FlowLabSlideInput[];
};

const cacCues = semanticCueLabPresets[0]?.cues ?? [];
const problemCauseCues = semanticCueLabPresets[1]?.cues ?? [];

export const flowLabPresets: FlowLabPreset[] = [
  {
    id: "two-slide-pitch",
    label: "2슬라이드 피치 (CAC → 문제/원인)",
    description: "슬라이드 전환을 포함한 기본 유저 플로우",
    script: [
      "안녕하세요, 오늘 발표를 시작하겠습니다.",
      "이번 슬라이드에서는 고객 획득 비용, 즉 CAC에 대해 말씀드리겠습니다.",
      "CAC는 신규 고객 한 명을 데려오는 데 드는 마케팅과 영업 비용을 의미합니다.",
      "다음으로 저희가 마주한 문제를 보겠습니다.",
      "저희 서비스의 이탈률이 최근 석 달 동안 두 배로 늘었습니다.",
      "원인을 분석해 보니 온보딩 과정이 너무 복잡해서 첫 주에 이탈하는 사용자가 많았습니다."
    ].join("\n"),
    slides: [
      {
        slideId: "slide_lab_1",
        title: "CAC 정의",
        speakerNotes:
          "이번 슬라이드에서는 고객 획득 비용, 즉 CAC에 대해 말씀드리겠습니다. CAC는 신규 고객 한 명을 데려오는 데 드는 마케팅과 영업 비용을 의미합니다.",
        keywords: [
          {
            keywordId: "kw_lab_cac",
            text: "CAC",
            synonyms: ["고객 획득 비용"],
            abbreviations: ["씨에이씨"]
          }
        ],
        semanticCues: [...cacCues]
      },
      {
        slideId: "slide_lab_2",
        title: "문제와 원인",
        speakerNotes:
          "저희 서비스의 이탈률이 최근 석 달 동안 두 배로 늘었습니다. 원인을 분석해 보니 온보딩 과정이 너무 복잡해서 첫 주에 이탈하는 사용자가 많았습니다.",
        keywords: [
          {
            keywordId: "kw_lab_churn",
            text: "이탈률",
            synonyms: ["이탈율", "churn"],
            abbreviations: []
          },
          {
            keywordId: "kw_lab_onboarding",
            text: "온보딩",
            synonyms: ["가입 과정"],
            abbreviations: []
          }
        ],
        semanticCues: [...problemCauseCues]
      }
    ]
  },
  {
    id: "single-slide",
    label: "1슬라이드 (CAC만)",
    description: "슬라이드 전환 없이 단일 슬라이드 플로우",
    script: [
      "이번 슬라이드에서는 고객 획득 비용에 대해 말씀드리겠습니다.",
      "CAC는 신규 고객 한 명을 데려오는 데 드는 비용입니다."
    ].join("\n"),
    slides: [
      {
        slideId: "slide_lab_1",
        title: "CAC 정의",
        speakerNotes:
          "이번 슬라이드에서는 고객 획득 비용, 즉 CAC에 대해 말씀드리겠습니다.",
        keywords: [
          {
            keywordId: "kw_lab_cac",
            text: "CAC",
            synonyms: ["고객 획득 비용"],
            abbreviations: ["씨에이씨"]
          }
        ],
        semanticCues: [...cacCues]
      }
    ]
  }
];
