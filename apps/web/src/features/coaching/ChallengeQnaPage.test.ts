import { describe, expect, it } from "vitest";

import {
  getChallengeAnswerFeedback,
  getChallengeQuestionMetaLabel,
  toChallengeQnaUserMessage,
} from "./ChallengeQnaPage";

describe("ChallengeQnaPage", () => {
  it("서버의 원시 Cannot POST 응답을 사용자용 복구 안내로 바꾼다", () => {
    const message = toChallengeQnaUserMessage(
      new Error("Cannot POST /api/v1/projects/project_1/challenge-qna-sessions"),
    );

    expect(message).toBe(
      "질문 생성 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(message).not.toContain("Cannot POST");
  });

  it("비활성 기능은 전체 리허설 대안을 안내한다", () => {
    expect(
      toChallengeQnaUserMessage(new Error("Challenge Q&A is not enabled")),
    ).toContain("전체 리허설");
  });

  it("명확한 답변도 질문 유형에 맞는 다음 개선점을 안내한다", () => {
    const headlines = ["evidence", "objection", "decision"].map((questionType) =>
      getChallengeAnswerFeedback(questionType, "clear", "appropriate").headline,
    );

    expect(new Set(headlines)).toHaveLength(3);
    expect(headlines[0]).toContain("검증 기준");
    expect(headlines[1]).toContain("수용 조건");
    expect(headlines[2]).toContain("담당자와 시점");
  });

  it("청중 적합성 enum을 사용자용 한국어 피드백으로 바꾼다", () => {
    expect(
      getChallengeAnswerFeedback("evidence", "clear", "too-technical").audienceFit,
    ).toContain("전문 용어");
    expect(
      getChallengeAnswerFeedback("evidence", "clear", "too-vague").audienceFit,
    ).toContain("구체적");
    expect(
      getChallengeAnswerFeedback("evidence", "clear", "unmeasured").audienceFit,
    ).not.toContain("unmeasured");
  });

  it("질문 유형과 난이도를 한국어로 표시한다", () => {
    expect(getChallengeQuestionMetaLabel("objection", "challenging")).toBe(
      "반론 대응 · 심화",
    );
  });
});
