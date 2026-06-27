import fs from "node:fs";

const requiredKeys = [
  "NODE_ENV",
  "APP_ENV",
  "WEB_PORT",
  "API_PORT",
  "WORKER_PORT",
  "PYTHON_WORKER_PORT",
  "WEB_ORIGIN",
  "API_BASE_URL",
  "PYTHON_WORKER_URL",
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "COOKIE_SECRET",
  "STORAGE_DRIVER",
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "JOB_QUEUE_DRIVER",
  "STT_PROVIDER",
  "OCR_PROVIDER",
  "LLM_PROVIDER",
  "OPENAI_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "AWS_REGION",
  "DEMO_USER_ID",
  "DEMO_WORKSPACE_ID",
  "DEMO_PROJECT_ID",
  "DEMO_DECK_ID",
  "DEMO_SESSION_ID"
];

const exampleFiles = [
  ".env.example",
  ".env.staging.example",
  ".env.production.example"
];

function readEnvKeys(path) {
  const content = fs.readFileSync(path, "utf8");
  return new Set(
    content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("=")[0])
  );
}

const failures = [];

for (const file of exampleFiles) {
  const keys = readEnvKeys(file);
  const missing = requiredKeys.filter((key) => !keys.has(key));

  if (missing.length > 0) {
    failures.push(`${file} missing env keys: ${missing.join(", ")}`);
  }
}

const localKeys = readEnvKeys(".env.example");
for (const file of exampleFiles.slice(1)) {
  const keys = readEnvKeys(file);
  const extra = [...keys].filter((key) => !localKeys.has(key));
  const missingFromFile = [...localKeys].filter((key) => !keys.has(key));

  if (extra.length > 0) {
    failures.push(`${file} has extra env keys: ${extra.join(", ")}`);
  }

  if (missingFromFile.length > 0) {
    failures.push(`${file} does not match .env.example keys: ${missingFromFile.join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `${exampleFiles.join(", ")} contain the required ORBIT env keys`
);
