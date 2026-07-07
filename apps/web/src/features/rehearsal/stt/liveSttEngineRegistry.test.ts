import { describe, expect, it } from "vitest";
import { createLiveSttPort, defaultLiveSttEngineId } from "./liveSttEngineRegistry";
import { MoonshineLiveSttPort } from "./moonshineLiveSttPort";
import { RerankingLiveSttPort } from "./rerankingLiveSttPort";
import { SherpaLiveSttPort } from "./sherpaLiveSttPort";

describe("liveSttEngineRegistry", () => {
  it("기본 엔진은 온디바이스 Web Speech이다", () => {
    const port = createLiveSttPort();

    expect(defaultLiveSttEngineId).toBe("web-speech");
    expect(port).toBeInstanceOf(RerankingLiveSttPort);
    expect(port.engineId).toBe("web-speech");
    expect(port.capabilities.onDevice).toBe(true);
  });

  it("Web Speech 엔진을 재순위 데코레이터로 생성한다", () => {
    expect(createLiveSttPort("web-speech")).toBeInstanceOf(RerankingLiveSttPort);
  });

  it("Sherpa 엔진을 명시적으로 생성한다", () => {
    expect(createLiveSttPort("sherpa")).toBeInstanceOf(SherpaLiveSttPort);
  });

  it("Moonshine 엔진을 생성한다", () => {
    expect(createLiveSttPort("moonshine")).toBeInstanceOf(MoonshineLiveSttPort);
  });
});
