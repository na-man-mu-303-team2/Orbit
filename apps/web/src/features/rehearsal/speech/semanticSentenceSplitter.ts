import {
  createCanonicalScriptSentenceIndex,
  type CanonicalScriptSentence
} from "./canonicalScriptSentenceIndex";

export type SemanticScriptSentence = CanonicalScriptSentence;

export function splitSpeakerNotesIntoSemanticSentences(
  speakerNotes: string
): SemanticScriptSentence[] {
  return createCanonicalScriptSentenceIndex(speakerNotes).sentences;
}
