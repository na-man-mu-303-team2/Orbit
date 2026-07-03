import { describe, expect, it } from "vitest";
import { createLiveSttPort, defaultLiveSttEngineId } from "./liveSttEngineRegistry";
import { MoonshineLiveSttPort } from "./moonshineLiveSttPort";
import { SherpaLiveSttPort } from "./sherpaLiveSttPort";
import { WebSpeechLiveSttPort } from "./webSpeechLiveSttPort";

describe("liveSttEngineRegistry", () => {
  it("기본 엔진은 sherpa이다", () => {
    expect(defaultLiveSttEngineId).toBe("sherpa");
    expect(createLiveSttPort()).toBeInstanceOf(SherpaLiveSttPort);
  });

  it("Web Speech 엔진을 생성한다", () => {
    expect(createLiveSttPort("web-speech")).toBeInstanceOf(WebSpeechLiveSttPort);
  });

  it("Moonshine 엔진을 생성한다", () => {
    expect(createLiveSttPort("moonshine")).toBeInstanceOf(MoonshineLiveSttPort);
  });
});
