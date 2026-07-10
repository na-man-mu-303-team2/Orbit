import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SemanticCapabilityStatus } from "./SemanticCapabilityStatus";
import type { SemanticCapabilityStatusItem } from "./semanticCapabilityStatusModel";

describe("SemanticCapabilityStatus", () => {
  it("AI 결과와 분리된 접근 가능한 시스템 상태 영역을 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <SemanticCapabilityStatus items={[statusItem()]} onAction={() => undefined} />
    );

    expect(html).toContain('aria-label="시스템 상태 안내"');
    expect(html).toContain("시스템 상태");
    expect(html).toContain("정밀 판정 비활성");
    expect(html).toContain("재시도");
    expect(html).not.toContain("AI 분석");
    expect(html).not.toContain("AI 코칭");
  });

  it("상태가 없으면 빈 시스템 카드나 toast를 만들지 않는다", () => {
    expect(renderToStaticMarkup(<SemanticCapabilityStatus items={[]} />)).toBe("");
  });
});

function statusItem(): SemanticCapabilityStatusItem {
  return {
    key: "nli",
    severity: "warning",
    shortLabel: "정밀 판정 비활성",
    detail: "기본 의미 체크로 계속합니다.",
    retryable: true,
    affectedCount: 1,
    source: "system-status",
    actionLabel: "재시도",
    recovered: false,
    measurementMode: "basic"
  };
}
