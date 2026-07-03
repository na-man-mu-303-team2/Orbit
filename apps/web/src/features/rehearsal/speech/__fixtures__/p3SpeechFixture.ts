import type { P3RehearsalSessionSlide } from "../p3RehearsalSession";

export const p3SpeechFixtureSlides: P3RehearsalSessionSlide[] = [
  {
    slideId: "slide_p3_intro",
    speakerNotes:
      "안녕하세요. 생성형 AI 초안은 개인정보를 보호하면서 개선됩니다. 생성형 AI 초안은 검토 로그로 추적됩니다. 마지막으로 ORBIT AI 흐름을 정리합니다.",
    keywords: [
      {
        keywordId: "kw_gen_ai",
        text: "생성형 AI",
        synonyms: ["인공지능"],
        abbreviations: ["AI"]
      },
      {
        keywordId: "kw_privacy",
        text: "개인정보",
        synonyms: ["프라이버시"],
        abbreviations: []
      },
      {
        keywordId: "kw_orbit_ai",
        text: "ORBIT AI",
        synonyms: ["오르빗 에이아이"],
        abbreviations: ["OAI"]
      }
    ],
    controlPhrases: ["다음 슬라이드", "이전 슬라이드"],
    cuePhrases: ["검토 로그"],
    legacyPhrases: ["레거시 제목", "감사합니다", "본문 키워드"]
  },
  {
    slideId: "slide_p3_metrics",
    speakerNotes:
      "리허설 지표는 말 속도와 누락 키워드를 함께 봅니다. 마지막으로 보고서 입력을 확정합니다.",
    keywords: [
      {
        keywordId: "kw_wpm",
        text: "말 속도",
        synonyms: ["WPM"],
        abbreviations: []
      },
      {
        keywordId: "kw_report",
        text: "보고서",
        synonyms: ["리포트"],
        abbreviations: []
      }
    ],
    controlPhrases: ["다음 슬라이드"],
    legacyPhrases: ["부가 설명"]
  }
];

export const p3CleanFinalTranscript =
  "생성형 AI 초안은 개인정보를 보호하면서 개선됩니다. 마지막으로 ORBIT AI 흐름을 정리합니다.";

export const p3AsrLikeFinalTranscript =
  "생성형 에이아이 초안은 개인정보 보호하며 개선됩니다. 오르빗 에이아이 흐름 정리합니다.";

export const p3FalsePositiveTranscript = "안녕하세요. 감사합니다. 다음 슬라이드는 아닙니다.";
