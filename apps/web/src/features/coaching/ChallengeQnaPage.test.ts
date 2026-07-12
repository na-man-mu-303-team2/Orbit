import { describe, expect, it } from "vitest";

import { toChallengeQnaUserMessage } from "./ChallengeQnaPage";

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
});
