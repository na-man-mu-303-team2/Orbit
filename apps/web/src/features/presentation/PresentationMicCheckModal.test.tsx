import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PresentationMicCheckModal } from "./PresentationMicCheckModal";

describe("PresentationMicCheckModal", () => {
  it("offers microphone and microphone-free starts without reusing rehearsal copy", () => {
    const html = renderToStaticMarkup(
      <PresentationMicCheckModal
        onClose={vi.fn()}
        onStart={vi.fn()}
        onStartWithoutMicrophone={vi.fn()}
      />,
    );

    expect(html).toContain("발표 전 마이크를 확인해 주세요");
    expect(html).toContain("발표 시작");
    expect(html).toContain("마이크 없이 시작");
    expect(html).toContain("AI 대본 매칭 모델");
    expect(html).toContain("최초 1회 다운로드 필요");
    expect(html).toContain("모델 다운로드");
    expect(html).toContain('disabled=""');
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("리허설 시작");
  });
});
