export function normalizeCoachingAudioMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "audio/webm";
}
