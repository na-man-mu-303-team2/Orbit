import { describe, expect, it } from "vitest";

import { maxRehearsalAudioUploadSizeBytes } from "../files/file.schema";
import {
  challengeAnswerGuideSchema,
  challengeQnaAnswerAttemptSchema,
  challengeQnaSourceSchema,
  createChallengeQnaAnswerAttemptRequestSchema,
} from "./challenge-qna.schema";

describe("challengeQnaSourceSchema", () => {
  it("fixes checkpoint and final question counts", () => {
    expect(
      challengeQnaSourceSchema.safeParse({
        mode: "checkpoint",
        sourcePracticeSessionId: "practice_1",
        sourceAttemptId: "attempt_1",
        questionCount: 3,
      }).success,
    ).toBe(false);
    expect(
      challengeQnaSourceSchema.parse({
        mode: "final",
        sourceFullRunId: "run_1",
        questionCount: 3,
      }).questionCount,
    ).toBe(3);
  });
});

describe("challengeAnswerGuideSchema", () => {
  it("requires remediation only for insufficient support", () => {
    expect(
      challengeAnswerGuideSchema.safeParse({
        supportState: "insufficient",
        mustIncludeConcepts: [],
        suggestedStructure: ["주장을 좁혀 답합니다."],
        caveats: [],
        remediation: null,
      }).success,
    ).toBe(false);
  });
});

describe("Challenge Q&A answer privacy", () => {
  it("rejects private voice audio above the rehearsal upload limit", () => {
    expect(createChallengeQnaAnswerAttemptRequestSchema.safeParse({
      clientRequestId: "request-123",
      questionRevision: 1,
      inputMode: "voice",
      mimeType: "audio/webm",
      size: maxRehearsalAudioUploadSizeBytes + 1
    }).success).toBe(false);
  });

  it("accepts text only at the command boundary and rejects it from results", () => {
    expect(
      createChallengeQnaAnswerAttemptRequestSchema.parse({
        clientRequestId: "request-123",
        questionRevision: 1,
        inputMode: "text",
        answerText: "승인 근거를 중심으로 답하겠습니다.",
      }).inputMode,
    ).toBe("text");

    expect(
      challengeQnaAnswerAttemptSchema.safeParse({ answerText: "영구 저장 금지" }).success,
    ).toBe(false);
  });
});
