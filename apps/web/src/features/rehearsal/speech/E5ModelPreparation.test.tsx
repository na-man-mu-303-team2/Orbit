import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  E5ModelPreparationPanel,
  getE5ModelPreparationLabel,
  type E5ModelPreparationState,
} from "./E5ModelPreparation";

function renderPanel(state: E5ModelPreparationState) {
  return renderToStaticMarkup(
    <E5ModelPreparationPanel prepare={vi.fn()} state={state} />,
  );
}

describe("E5ModelPreparationPanel", () => {
  it("최초 다운로드 이유와 명시적인 시작 버튼을 안내한다", () => {
    const state: E5ModelPreparationState = {
      error: "",
      progress: null,
      status: "required",
    };
    const html = renderPanel(state);

    expect(html).toContain("최초 한 번만 다운로드");
    expect(html).toContain("모델 다운로드");
    expect(getE5ModelPreparationLabel(state)).toBe("최초 1회 다운로드 필요");
  });

  it("다운로드 진행률을 접근 가능한 progressbar로 보여준다", () => {
    const state: E5ModelPreparationState = {
      error: "",
      progress: 42,
      status: "downloading",
    };
    const html = renderPanel(state);

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain("모델 파일 42%");
    expect(getE5ModelPreparationLabel(state)).toBe("다운로드 42%");
  });

  it("실패 상태에서 안전한 오류 문구와 재시도를 제공한다", () => {
    const state: E5ModelPreparationState = {
      error: "네트워크 연결을 확인해 주세요.",
      progress: null,
      status: "error",
    };
    const html = renderPanel(state);

    expect(html).toContain('role="alert"');
    expect(html).toContain("네트워크 연결을 확인해 주세요.");
    expect(html).toContain("다시 시도");
  });

  it("준비 완료 상태에서는 추가 안내를 렌더링하지 않는다", () => {
    const state: E5ModelPreparationState = {
      error: "",
      progress: 100,
      status: "ready",
    };

    expect(renderPanel(state)).toBe("");
    expect(getE5ModelPreparationLabel(state)).toBe("사용 준비됨");
  });
});
