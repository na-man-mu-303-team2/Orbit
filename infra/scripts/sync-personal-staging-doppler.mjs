import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  collectComposeEnvironmentKeys,
  decodeEnvValue,
  readEnvFile,
  readPersonalStagingPolicy,
  selectDopplerChanges,
  validatePersonalStagingPolicy,
} from "./personal-staging-env.mjs";

const POLICY_FILE = "infra/env/personal-staging-env-policy.json";
const STAGING_EXAMPLE_FILE = ".env.staging.example";

export function parseArguments(argv) {
  const options = {
    apply: false,
    project: "orbit",
    config: "stg",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--apply") {
      options.apply = true;
      continue;
    }

    if (argument === "--project" || argument === "--config") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a value`);
      }

      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${argument}`);
  }

  for (const [name, value] of Object.entries({
    project: options.project,
    config: options.config,
  })) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
      throw new Error(`invalid ${name}`);
    }
  }

  return options;
}

export function resolveDopplerCommand() {
  if (process.env.DOPPLER_CLI) {
    return process.env.DOPPLER_CLI;
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const candidate = path.join(
        localAppData,
        "Programs",
        "Doppler",
        "doppler.exe",
      );
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return "doppler";
}

function runDoppler(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    throw new Error("Doppler command failed");
  }

  return result.stdout;
}

export function readDopplerKeyNames({ command, project, config }) {
  const output = runDoppler(command, [
    "secrets",
    "--project",
    project,
    "--config",
    config,
    "--only-names",
    "--json",
  ]);

  let result;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error("Doppler key list was not valid JSON");
  }

  return new Set(Object.keys(result));
}

export function applyRepoDefaults({
  command,
  project,
  config,
  keys,
  stagingEntries,
}) {
  if (keys.length === 0) {
    return;
  }

  const assignments = keys.map((key) => {
    const value = decodeEnvValue(stagingEntries.get(key));
    return `${key}=${value}`;
  });

  runDoppler(command, [
    "secrets",
    "set",
    ...assignments,
    "--project",
    project,
    "--config",
    config,
    "--silent",
    "--no-interactive",
  ]);
}

function printKeys(label, keys) {
  console.log(`${label}: ${keys.length}`);
  for (const key of keys) {
    console.log(`- ${key}`);
  }
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    console.error(`Doppler sync argument error: ${error.message}`);
    return 1;
  }

  const stagingResult = readEnvFile(STAGING_EXAMPLE_FILE);
  if (stagingResult.failures.length > 0) {
    console.error("Staging example validation failed.");
    for (const failure of stagingResult.failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  let policy;
  try {
    policy = readPersonalStagingPolicy(POLICY_FILE);
  } catch {
    console.error(`${POLICY_FILE} is not valid JSON.`);
    return 1;
  }

  const policyFailures = validatePersonalStagingPolicy({
    stagingEntries: stagingResult.entries,
    policy,
    composeKeys: collectComposeEnvironmentKeys([
      "docker-compose.yml",
      "docker-compose.staging.yml",
    ]),
    policyFile: POLICY_FILE,
  });

  if (policyFailures.length > 0) {
    console.error("Personal staging env policy validation failed.");
    for (const failure of policyFailures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  let dopplerKeys;
  const command = resolveDopplerCommand();
  try {
    dopplerKeys = readDopplerKeyNames({
      command,
      project: options.project,
      config: options.config,
    });
  } catch (error) {
    console.error(`Doppler key-only lookup failed: ${error.message}`);
    return 1;
  }

  const changes = selectDopplerChanges({ policy, dopplerKeys });

  console.log(
    `Personal staging Doppler sync (${options.project}/${options.config}, ${
      options.apply ? "apply" : "dry-run"
    })`,
  );
  printKeys("Missing safe repo defaults", changes.missingAuto);
  printKeys("Missing required manual values", changes.missingRequired);
  printKeys("Missing optional overrides", changes.missingOptional);
  console.log("Secret values were not read or printed.");

  if (changes.missingRequired.length > 0) {
    console.error(
      "Required manual values are missing. Existing services were not changed.",
    );
    return 1;
  }

  if (!options.apply) {
    console.log(
      "Dry-run only. Use pnpm env:sync:stg:apply to add safe defaults.",
    );
    return 0;
  }

  try {
    applyRepoDefaults({
      command,
      project: options.project,
      config: options.config,
      keys: changes.missingAuto,
      stagingEntries: stagingResult.entries,
    });
  } catch (error) {
    console.error(`Doppler safe-default update failed: ${error.message}`);
    return 1;
  }

  console.log(`Added safe repo defaults: ${changes.missingAuto.length}`);
  if (changes.missingAuto.length > 0) {
    console.log(
      "The existing Doppler webhook will request an environment-only deployment.",
    );
  }

  return 0;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  process.exitCode = main();
}
