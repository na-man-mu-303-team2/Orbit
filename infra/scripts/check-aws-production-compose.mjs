import { spawnSync } from "node:child_process";
import fs from "node:fs";

const composeFile = "docker-compose.aws.yml";
const envFile = "infra/aws/ec2-production.env.example";
const bootstrapFile = "infra/aws/main-production-bootstrap.yaml";
const productionEnvFile = ".env.production.example";
const deployScriptFile = "infra/scripts/deploy-aws-ec2.sh";
const privateRedisUrl = "redis://private-evidence-redis:6379";
const editorPracticeFlags = [
  "SLIDE_PRACTICE_ENABLED",
  "SLIDE_QUESTION_GUIDES_ENABLED"
];
const failures = [];

function assertContract(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function renderComposeConfig() {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "config",
      "--format",
      "json",
      "--no-env-resolution"
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ORBIT_ENV_FILE: envFile
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  if (result.error || result.status !== 0) {
    failures.push("docker-compose.aws.yml could not be rendered");
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    failures.push("docker-compose.aws.yml did not render as valid JSON");
    return null;
  }
}

function hasCommandPair(command, option, value) {
  if (!Array.isArray(command)) {
    return false;
  }

  const optionIndex = command.indexOf(option);
  return optionIndex >= 0 && command[optionIndex + 1] === value;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertTemplateValue(file, key, expectedValue, allowLeadingWhitespace) {
  const content = fs.readFileSync(file, "utf8");
  const prefix = allowLeadingWhitespace ? "\\s*" : "";
  const keyPattern = new RegExp(`^${prefix}${key}=`, "gm");
  const valuePattern = new RegExp(
    `^${prefix}${key}=${escapeRegex(expectedValue)}\\s*$`,
    "gm"
  );
  const keyCount = content.match(keyPattern)?.length ?? 0;
  const valueCount = content.match(valuePattern)?.length ?? 0;

  assertContract(keyCount === 1, `${file} must declare ${key} exactly once`);
  assertContract(valueCount === 1, `${file} must set ${key}=${expectedValue}`);
}

function assertRequiredKey(file, key) {
  const content = fs.readFileSync(file, "utf8");
  const requiredKeysBlock = content.match(/required_keys=\(\s*([\s\S]*?)\n\)/)?.[1] ?? "";
  const keyCount = requiredKeysBlock.match(new RegExp(`^\\s*${key}\\s*$`, "gm"))?.length ?? 0;

  assertContract(keyCount === 1, `${file} must require ${key} exactly once`);
}

const config = renderComposeConfig();

if (config) {
  const services = config.services ?? {};
  const privateRedis = services["private-evidence-redis"];

  assertContract(Boolean(privateRedis), "private-evidence-redis service is missing");

  if (privateRedis) {
    assertContract(privateRedis.image === "redis:7-alpine", "private-evidence-redis must use redis:7-alpine");
    assertContract(
      hasCommandPair(privateRedis.command, "--save", ""),
      "private-evidence-redis must disable RDB persistence"
    );
    assertContract(
      hasCommandPair(privateRedis.command, "--appendonly", "no"),
      "private-evidence-redis must disable AOF persistence"
    );
    assertContract(
      !Array.isArray(privateRedis.volumes) || privateRedis.volumes.length === 0,
      "private-evidence-redis must not mount volumes"
    );
    assertContract(
      !Array.isArray(privateRedis.ports) || privateRedis.ports.length === 0,
      "private-evidence-redis must not publish host ports"
    );
    assertContract(Boolean(privateRedis.healthcheck), "private-evidence-redis healthcheck is missing");
    assertContract(privateRedis.restart === "unless-stopped", "private-evidence-redis restart policy is incorrect");
    assertContract(privateRedis.logging?.driver === "awslogs", "private-evidence-redis must use awslogs");
    assertContract(
      privateRedis.logging?.options?.["awslogs-stream"] === "private-evidence-redis",
      "private-evidence-redis CloudWatch stream is incorrect"
    );
  }

  for (const serviceName of ["api", "worker"]) {
    const service = services[serviceName];
    const environment = service?.environment ?? {};

    assertContract(Boolean(service), `${serviceName} service is missing`);
    assertContract(
      environment.PRIVATE_EVIDENCE_REDIS_URL === privateRedisUrl,
      `${serviceName} must inject PRIVATE_EVIDENCE_REDIS_URL directly`
    );
    assertContract(
      environment.PRIVATE_EVIDENCE_REDIS_URL !== environment.REDIS_URL,
      `${serviceName} must keep private evidence Redis separate from REDIS_URL`
    );
    assertContract(
      service?.depends_on?.["private-evidence-redis"]?.condition === "service_healthy",
      `${serviceName} must wait for private-evidence-redis health`
    );
  }
}

assertTemplateValue(envFile, "PRIVATE_EVIDENCE_REDIS_URL", privateRedisUrl, false);
assertTemplateValue(bootstrapFile, "PRIVATE_EVIDENCE_REDIS_URL", privateRedisUrl, true);

for (const flag of editorPracticeFlags) {
  assertTemplateValue(productionEnvFile, flag, "true", false);
  assertTemplateValue(envFile, flag, "true", false);
  assertTemplateValue(bootstrapFile, flag, "true", true);
  assertRequiredKey(deployScriptFile, flag);
}

if (failures.length > 0) {
  console.error("AWS production Compose contract validation failed:");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("AWS production Compose contract validation passed.");
