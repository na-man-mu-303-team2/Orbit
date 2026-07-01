import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { basename, join, normalize } from "node:path";

export function assertUsableLiveSttFixtures(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    throw new Error("Live STT fixtures must be a non-empty array.");
  }

  const seenIds = new Set();
  for (const [index, fixture] of fixtures.entries()) {
    if (!isRecord(fixture)) {
      throw new Error(`Live STT fixture at index ${index} must be an object.`);
    }
    const id = normalizeOptionalString(fixture.id);
    if (!id) {
      throw new Error(`Live STT fixture at index ${index} requires id.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Live STT fixture id "${id}" is duplicated.`);
    }
    seenIds.add(id);

    if (!normalizeOptionalString(fixture.referenceTranscript)) {
      throw new Error(`Live STT fixture "${id}" requires referenceTranscript.`);
    }
    if (!Array.isArray(fixture.expectedKeywords)) {
      throw new Error(`Live STT fixture "${id}" requires expectedKeywords array.`);
    }
    if (typeof fixture.shouldTriggerControl !== "boolean") {
      throw new Error(`Live STT fixture "${id}" requires shouldTriggerControl boolean.`);
    }
  }
}

export function buildLiveSttFixtureSet(fixtures) {
  assertUsableLiveSttFixtures(fixtures);
  const normalizedFixtures = fixtures.map((fixture) => ({
    id: normalizeOptionalString(fixture.id),
    audioFile: normalizeOptionalString(fixture.audioFile),
    referenceTranscript: normalizeOptionalString(fixture.referenceTranscript),
    expectedKeywords: fixture.expectedKeywords.map((keyword) =>
      normalizeOptionalString(keyword)
    ),
    shouldTriggerControl: fixture.shouldTriggerControl
  }));
  const sha256 = createHash("sha256")
    .update(JSON.stringify(normalizedFixtures))
    .digest("hex");

  return {
    count: normalizedFixtures.length,
    ids: normalizedFixtures.map((fixture) => fixture.id),
    sha256
  };
}

export async function resolveHumanFixtureAudioPath(fixture, audioDir) {
  const candidates = buildHumanFixtureAudioPathCandidates(fixture, audioDir);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next documented location.
    }
  }

  throw new Error(
    `Missing wav audio for fixture ${fixture.id}. Expected one of: ${candidates.join(", ")}`
  );
}

function buildHumanFixtureAudioPathCandidates(fixture, audioDir) {
  const candidates = [];
  const audioFile = normalizeOptionalString(fixture.audioFile);
  if (audioFile) {
    candidates.push(join(audioDir, audioFile));
    candidates.push(join(audioDir, basename(audioFile)));
  }
  candidates.push(join(audioDir, `${fixture.id}.wav`));

  return [...new Set(candidates.map((candidate) => normalize(candidate)))];
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length === 0 ? null : normalized;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
