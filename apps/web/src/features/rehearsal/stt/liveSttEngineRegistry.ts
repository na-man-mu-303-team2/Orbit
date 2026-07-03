import { type LiveSttEngineId, type LiveSttPort } from "./liveSttPort";
import { MoonshineLiveSttPort } from "./moonshineLiveSttPort";
import { RerankingLiveSttPort } from "./rerankingLiveSttPort";
import { createSherpaLiveSttPort } from "./sherpaLiveSttPort";
import { WebSpeechLiveSttPort } from "./webSpeechLiveSttPort";

export const defaultLiveSttEngineId: LiveSttEngineId = "web-speech";

export function createLiveSttPort(
  engineId: LiveSttEngineId = defaultLiveSttEngineId
): LiveSttPort {
  switch (engineId) {
    case "sherpa":
      return createSherpaLiveSttPort();
    case "web-speech":
      return new RerankingLiveSttPort(
        new WebSpeechLiveSttPort({ processLocally: true })
      );
    case "moonshine":
      return new MoonshineLiveSttPort();
  }
}
