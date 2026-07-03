import { type LiveSttEngineId, type LiveSttPort } from "./liveSttPort";
import { MoonshineLiveSttPort } from "./moonshineLiveSttPort";
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
      return new WebSpeechLiveSttPort({ processLocally: true });
    case "moonshine":
      return new MoonshineLiveSttPort();
  }
}
