import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DisplayControls,
  getDisplayControlMessage,
  getDisplayStatusLabel,
  shouldShowRecoverAction
} from "./DisplayControls";

const displayControlsSourcePath = fileURLToPath(
  new URL("./DisplayControls.tsx", import.meta.url)
);

describe("DisplayControls", () => {
  it("renders Korean controls without presenter-only content", () => {
    const html = renderToStaticMarkup(
      <DisplayControls
        channelStatus="idle"
        onOpenSlideDisplay={async () => ({
          displayMode: "slide-window",
          displayOpened: true,
          fullscreenStarted: true,
        })}
      />
    );

    expect(html).toContain("슬라이드 창 열기");
    expect(html).toContain("프레젠테이션 옵션");
    expect(html).toContain("대기");
    expect(html).not.toContain("speakerNotes");
    expect(html).not.toContain("Partial transcript");
  });

  it("uses a recover action for stale, closed, or failed channel states", () => {
    expect(shouldShowRecoverAction("stale")).toBe(true);
    expect(shouldShowRecoverAction("closed")).toBe(true);
    expect(shouldShowRecoverAction("failed")).toBe(true);
    expect(shouldShowRecoverAction("connected")).toBe(false);
  });

  it("maps display manager error codes to Korean guidance", () => {
    expect(getDisplayControlMessage("popup-blocked")).toContain("팝업");
    expect(getDisplayControlMessage("permission-denied")).toContain("권한");
    expect(getDisplayControlMessage("window-management-unsupported")).toContain(
      "자동 화면 배치"
    );
    expect(getDisplayControlMessage("fullscreen-blocked")).toContain("전체화면");
    expect(getDisplayControlMessage("placement-failed")).toContain("자동 배치");
  });

  it("prioritizes actionable status labels", () => {
    expect(getDisplayStatusLabel("connected", "idle")).toBe("슬라이드 화면 연결됨");
    expect(getDisplayStatusLabel("stale", "idle")).toBe("슬라이드 화면 응답 없음");
    expect(getDisplayStatusLabel("idle", "opening")).toBe("발표자 창 여는 중");
    expect(getDisplayStatusLabel("idle", "manual-guide")).toBe("전환 안내");
    expect(getDisplayStatusLabel("idle", "failed")).toBe("확인 필요");
  });

  it("starts the slide display request before updating control state", () => {
    const source = fs.readFileSync(displayControlsSourcePath, "utf8");
    const start = source.indexOf("async function openSlideWindow(");
    const end = source.indexOf("return (", start);
    const openSlideWindowBody = source.slice(start, end);

    expect(openSlideWindowBody.indexOf("onOpenSlideDisplay(resolvedLaunchOptions)")).toBeLessThan(
      openSlideWindowBody.indexOf("setDisplayState(\"opening\")")
    );
  });

  it("starts the display permission request before updating request state", () => {
    const source = fs.readFileSync(displayControlsSourcePath, "utf8");
    const start = source.indexOf("async function requestDisplayScreens(");
    const end = source.indexOf("function setPresenterView(", start);
    const requestDisplayScreensBody = source.slice(start, end);

    expect(requestDisplayScreensBody.indexOf("onRequestDisplayScreens()")).toBeLessThan(
      requestDisplayScreensBody.indexOf("setScreenRequestState(\"loading\")")
    );
  });

  it("resets the mounted guard when StrictMode remounts effects", () => {
    const source = fs.readFileSync(displayControlsSourcePath, "utf8");
    const start = source.indexOf("useEffect(");
    const end = source.indexOf("async function openSlideWindow(", start);
    const effectBody = source.slice(start, end);

    expect(effectBody.indexOf("mountedRef.current = true")).toBeGreaterThan(-1);
    expect(effectBody.indexOf("mountedRef.current = true")).toBeLessThan(
      effectBody.indexOf("mountedRef.current = false")
    );
  });
});
