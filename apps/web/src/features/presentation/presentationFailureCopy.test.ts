import { describe, expect, it } from "vitest";
import { getPresentationFailureCopy } from "./presentationFailureCopy";

describe("getPresentationFailureCopy", () => {
  it("기술적인 요청 검증 문구를 사용자에게 노출하지 않는다", () => {
    const rawMessage = "Invalid request body";
    const copy = getPresentationFailureCopy("start", rawMessage);
    const renderedCopy = JSON.stringify(copy).toLowerCase();

    expect(copy.title).toBe("실전 발표를 시작하지 못했습니다.");
    expect(copy.description).toContain("최신 저장 상태");
    expect(copy.recommendedAction).toContain("프로젝트로 돌아가");
    expect(renderedCopy).not.toContain(rawMessage.toLowerCase());
  });

  it("연결 실패에는 연결 확인과 재시도를 안내한다", () => {
    const copy = getPresentationFailureCopy("start", "Failed to fetch");

    expect(copy.description).toContain("연결하지 못했습니다");
    expect(copy.recommendedAction).toContain("인터넷 연결");
    expect(copy.recommendedAction).toContain("다시 시도");
  });

  it("종료 실패에는 수집된 청중 응답이 유지됨을 안내한다", () => {
    const copy = getPresentationFailureCopy("finish", "Upload failed");

    expect(copy.title).toBe("실전 발표를 마치지 못했습니다.");
    expect(copy.recommendedAction).toContain("청중 응답은 유지");
  });
});
