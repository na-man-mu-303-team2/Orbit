import { loadOrbitConfig, type OrbitConfig } from "@orbit/config";
import type { Params } from "nestjs-pino";

export const redactedPaths = [
  "password",
  "*.password",
  "body.password",
  "payload.contentBase64",
  "payload.files.*.contentBase64",
  "contentBase64",
  "audioBase64",
  "rawAudio",
  "script",
  "transcript",
  "speakerNotes",
  "premise",
  "hypothesis",
  "semanticCueDecisions",
  "*.speakerNotes",
  "*.premise",
  "*.hypothesis",
  "*.semanticCueDecisions",
  "body.deck.slides.*.speakerNotes",
  "payload.deck.slides.*.speakerNotes",
  "payload.semanticCueDecisions",
  "result.semanticCueDecisions"
];

export function createWorkerLoggerParams(
  env: NodeJS.ProcessEnv = process.env
): Params {
  const config = loadOrbitConfig(env, { service: "worker" });

  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      base: {
        service: "worker",
        appEnv: config.APP_ENV
      },
      redact: {
        paths: redactedPaths,
        censor: "[Redacted]"
      },
      transport: createPrettyTransport(config)
    },
    assignResponse: true
  };
}

export function serializeLogError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: String(error)
  };
}

export function writeBootstrapError(service: "worker", error: unknown): void {
  const payload = {
    level: "fatal",
    time: new Date().toISOString(),
    service,
    event: "bootstrap.failed",
    error: serializeLogError(error),
    message: `${service} bootstrap failed.`
  };

  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

function createPrettyTransport(config: OrbitConfig) {
  if (!config.LOG_PRETTY) {
    return undefined;
  }

  return {
    target: "pino-pretty",
    options: {
      colorize: true,
      singleLine: true,
      translateTime: "SYS:standard"
    }
  };
}
