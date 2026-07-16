import fs from "node:fs";

export const PERSONAL_STAGING_ENV_SOURCES = new Set([
  "repo-default",
  "doppler-optional",
  "doppler-required",
]);

export const PERSONAL_STAGING_ENV_DELIVERIES = new Set([
  "compose",
  "code-default",
]);

export function parseEnvFileContent(content, file = "<env>") {
  const entries = new Map();
  const failures = [];

  content.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      return;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      failures.push(`${file}:${index + 1} invalid env declaration`);
      return;
    }

    const [, key, rawValue] = match;
    if (entries.has(key)) {
      failures.push(`${file}:${index + 1} duplicate env key: ${key}`);
      return;
    }

    entries.set(key, rawValue);
  });

  return { entries, failures };
}

export function readEnvFile(file) {
  return parseEnvFileContent(fs.readFileSync(file, "utf8"), file);
}

export function decodeEnvValue(rawValue) {
  const value = rawValue.trim();

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

export function isBlankEnvValue(rawValue) {
  return decodeEnvValue(rawValue).trim().length === 0;
}

export function isSafeRepoDefault(rawValue) {
  const value = decodeEnvValue(rawValue).trim();

  if (!value || value.includes("${") || value.includes("$(")) {
    return false;
  }

  return !/(?:replace|change[-_ ]?me|placeholder|todo|<[^>]+>)/i.test(value);
}

export function readPersonalStagingPolicy(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function collectComposeEnvironmentKeys(files) {
  const keys = new Set();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = /^\s{2,}([A-Z][A-Z0-9_]*):(?:\s|$)/.exec(line);
      if (match) {
        keys.add(match[1]);
      }
    }
  }

  return keys;
}

export function validatePersonalStagingPolicy({
  stagingEntries,
  policy,
  composeKeys,
  policyFile = "infra/env/personal-staging-env-policy.json",
}) {
  const failures = [];

  if (policy?.version !== 1) {
    failures.push(`${policyFile} version must be 1`);
  }

  if (
    !policy?.variables ||
    typeof policy.variables !== "object" ||
    Array.isArray(policy.variables)
  ) {
    failures.push(`${policyFile} variables must be an object`);
    return failures;
  }

  const stagingKeys = new Set(stagingEntries.keys());
  const policyKeys = new Set(Object.keys(policy.variables));

  for (const key of stagingKeys) {
    if (!policyKeys.has(key)) {
      failures.push(`${policyFile} missing policy for env key: ${key}`);
    }
  }

  for (const key of policyKeys) {
    if (!stagingKeys.has(key)) {
      failures.push(`${policyFile} has unknown env key: ${key}`);
    }
  }

  for (const [key, settings] of Object.entries(policy.variables)) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      failures.push(`${policyFile} invalid policy for env key: ${key}`);
      continue;
    }

    const unexpectedFields = Object.keys(settings).filter(
      (field) => field !== "source" && field !== "delivery",
    );
    if (unexpectedFields.length > 0) {
      failures.push(
        `${policyFile} unexpected policy field for env key: ${key}`,
      );
    }

    if (!PERSONAL_STAGING_ENV_SOURCES.has(settings.source)) {
      failures.push(`${policyFile} invalid source for env key: ${key}`);
    }

    if (!PERSONAL_STAGING_ENV_DELIVERIES.has(settings.delivery)) {
      failures.push(`${policyFile} invalid delivery for env key: ${key}`);
      continue;
    }

    if (
      settings.source === "doppler-required" &&
      settings.delivery !== "compose"
    ) {
      failures.push(
        `${policyFile} required Doppler key is not delivered: ${key}`,
      );
    }

    if (settings.delivery === "compose" && !composeKeys.has(key)) {
      failures.push(
        `personal staging Compose does not deliver env key: ${key}`,
      );
    }

    if (settings.delivery === "code-default" && composeKeys.has(key)) {
      failures.push(
        `${policyFile} delivery does not match Compose for env key: ${key}`,
      );
    }

    if (
      settings.source === "repo-default" &&
      stagingEntries.has(key) &&
      !isSafeRepoDefault(stagingEntries.get(key))
    ) {
      failures.push(`${policyFile} unsafe repo default for env key: ${key}`);
    }
  }

  return failures;
}

export function selectDopplerChanges({ policy, dopplerKeys }) {
  const missingAuto = [];
  const missingRequired = [];
  const missingOptional = [];

  for (const [key, settings] of Object.entries(policy.variables)) {
    if (settings.delivery !== "compose" || dopplerKeys.has(key)) {
      continue;
    }

    if (settings.source === "repo-default") {
      missingAuto.push(key);
    } else if (settings.source === "doppler-required") {
      missingRequired.push(key);
    } else if (settings.source === "doppler-optional") {
      missingOptional.push(key);
    }
  }

  return {
    missingAuto: missingAuto.sort(),
    missingRequired: missingRequired.sort(),
    missingOptional: missingOptional.sort(),
  };
}
