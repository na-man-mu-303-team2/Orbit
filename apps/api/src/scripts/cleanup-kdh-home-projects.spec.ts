import { loadOrbitConfig } from "@orbit/config";
import { describe, expect, it } from "vitest";
import {
  assertKdhHomeCleanupAllowed,
  assertNoResidualRows,
  assertNoStorageObjectsAtRisk,
  assertProjectsAreOwnedByFixtureAccount,
  countStorageObjects,
  kdhHomeCleanupConfirmToken,
  kdhHomeCleanupTableOrder,
  kdhHomeProjectIds,
} from "./cleanup-kdh-home-projects";

const base = {
  NODE_ENV: "test",
  APP_ENV: "local",
  WEB_PORT: "5173",
  API_PORT: "3000",
  WORKER_PORT: "3001",
  PYTHON_WORKER_PORT: "8000",
  WEB_ORIGIN: "http://localhost:5173",
  API_BASE_URL: "http://localhost:3000",
  PYTHON_WORKER_URL: "http://localhost:8000",
  DATABASE_URL: "postgres://orbit:orbit@localhost:5432/orbit",
  REDIS_URL: "redis://localhost:6379",
  PRIVATE_EVIDENCE_REDIS_URL: "redis://localhost:6380",
  SESSION_SECRET: "local-session-secret-change-me",
  COOKIE_SECRET: "local-cookie-secret-change-me",
  STORAGE_DRIVER: "minio",
  S3_ENDPOINT: "http://localhost:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "orbit-local",
  S3_REGION: "ap-northeast-2",
  S3_ACCESS_KEY_ID: "orbit",
  S3_SECRET_ACCESS_KEY: "orbit-password",
  S3_FORCE_PATH_STYLE: "true",
  JOB_QUEUE_DRIVER: "bullmq",
  LIVE_STT_PROVIDER: "sherpa",
  LIVE_STT_ENGINE: "web-speech",
  REPORT_STT_PROVIDER: "openai",
  OCR_PROVIDER: "python",
  LLM_PROVIDER: "openai",
  OPENAI_MODEL: "gpt-4.1-mini",
  OPENAI_TRANSCRIPTION_MODEL: "whisper-1",
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  AWS_REGION: "ap-northeast-2",
  TRANSCRIBE_LANGUAGE_CODE: "ko-KR",
  TEXTRACT_ENABLED: "false",
  LOG_LEVEL: "info",
  LOG_PRETTY: "false",
  DEMO_USER_ID: "user_demo_1",
  DEMO_WORKSPACE_ID: "workspace_demo_1",
  DEMO_PROJECT_ID: "project_demo_1",
  DEMO_DECK_ID: "deck_demo_1",
  DEMO_SESSION_ID: "session_demo_1",
};

const confirmed = { KDH_HOME_CLEANUP_CONFIRM: kdhHomeCleanupConfirmToken };

function tableIndex(table: string): number {
  const index = kdhHomeCleanupTableOrder.indexOf(
    table as (typeof kdhHomeCleanupTableOrder)[number],
  );
  expect(index, `${table} must be listed in kdhHomeCleanupTableOrder`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("kdh home cleanup guard", () => {
  it("refuses to run in production even with the token", () => {
    expect(() =>
      assertKdhHomeCleanupAllowed({ APP_ENV: "production" }, confirmed),
    ).toThrow("forbidden in production");
  });

  it("requires the explicit confirmation token", () => {
    const config = loadOrbitConfig(base, { service: "api" });
    expect(() => assertKdhHomeCleanupAllowed(config, {})).toThrow(
      "KDH_HOME_CLEANUP_CONFIRM",
    );
    expect(() =>
      assertKdhHomeCleanupAllowed(config, { KDH_HOME_CLEANUP_CONFIRM: "yes" }),
    ).toThrow("KDH_HOME_CLEANUP_CONFIRM");
    expect(() => assertKdhHomeCleanupAllowed(config, confirmed)).not.toThrow();
  });
});

describe("kdhHomeProjectIds", () => {
  it("targets exactly the ten fixed fixture project IDs", () => {
    expect(kdhHomeProjectIds).toHaveLength(10);
    expect(new Set(kdhHomeProjectIds).size).toBe(10);
    expect(
      kdhHomeProjectIds.every((id) => /^project_kdh_home_\d{2}$/.test(id)),
    ).toBe(true);
    expect(kdhHomeProjectIds[0]).toBe("project_kdh_home_01");
    expect(kdhHomeProjectIds[9]).toBe("project_kdh_home_10");
  });
});

describe("kdhHomeCleanupTableOrder", () => {
  it("lists every table once and deletes projects last", () => {
    expect(new Set(kdhHomeCleanupTableOrder).size).toBe(
      kdhHomeCleanupTableOrder.length,
    );
    expect(kdhHomeCleanupTableOrder.at(-1)).toBe("projects");
  });

  it("deletes decks after every table that RESTRICT-references it", () => {
    const decks = tableIndex("decks");
    for (const referrer of [
      "challenge_qna_sessions",
      "slide_practice_reports",
      "slide_question_guides",
      "slide_practice_audio_analyses",
    ]) {
      expect(tableIndex(referrer)).toBeLessThan(decks);
    }
  });

  it("deletes project_assets after every table that RESTRICT-references it", () => {
    const assets = tableIndex("project_assets");
    for (const referrer of [
      "challenge_qna_answer_attempts",
      "focused_practice_attempts",
      "slide_practice_audio_analyses",
    ]) {
      expect(tableIndex(referrer)).toBeLessThan(assets);
    }
  });

  it("respects the remaining RESTRICT orderings", () => {
    expect(tableIndex("challenge_qna_answer_attempts")).toBeLessThan(
      tableIndex("challenge_qna_questions"),
    );
    expect(tableIndex("challenge_qna_sessions")).toBeLessThan(
      tableIndex("focused_practice_sessions"),
    );
    expect(tableIndex("challenge_qna_sessions")).toBeLessThan(
      tableIndex("rehearsal_runs"),
    );
    expect(tableIndex("focused_practice_sessions")).toBeLessThan(
      tableIndex("practice_goal_sets"),
    );
    expect(tableIndex("slide_practice_audio_analyses")).toBeLessThan(
      tableIndex("slide_practice_reports"),
    );
  });
});

describe("assertProjectsAreOwnedByFixtureAccount", () => {
  const manager = (rows: Array<{ project_id: string; email: string | null }>) =>
    ({ async query() { return rows; } }) as never;

  it("passes when every project belongs to the fixture account", async () => {
    await expect(
      assertProjectsAreOwnedByFixtureAccount(
        manager([{ project_id: "project_kdh_home_01", email: "kdh@orbit.com" }]),
        kdhHomeProjectIds,
      ),
    ).resolves.toBeUndefined();
  });

  it("refuses when an ID collides with another account's project", async () => {
    await expect(
      assertProjectsAreOwnedByFixtureAccount(
        manager([
          { project_id: "project_kdh_home_01", email: "kdh@orbit.com" },
          { project_id: "project_kdh_home_02", email: "someone@orbit.com" },
        ]),
        kdhHomeProjectIds,
      ),
    ).rejects.toThrow("project_kdh_home_02");
  });
});

describe("storage object guard", () => {
  it("allows cleanup when nothing references an object in storage", () => {
    expect(() =>
      assertNoStorageObjectsAtRisk({ liveAssets: 0, pendingDeletions: 0 }),
    ).not.toThrow();
  });

  it("refuses when a live asset row would strand its object", () => {
    expect(() =>
      assertNoStorageObjectsAtRisk({ liveAssets: 2, pendingDeletions: 0 }),
    ).toThrow("strand those objects");
  });

  it("refuses when the deletion outbox has not drained", () => {
    expect(() =>
      assertNoStorageObjectsAtRisk({ liveAssets: 0, pendingDeletions: 1 }),
    ).toThrow("strand those objects");
  });

  it("ignores assets and outbox rows whose objects are already deleted", async () => {
    const seen: string[] = [];
    const manager = {
      async query(sql: string) {
        if (sql.includes("to_regclass")) return [{ oid: "1" }];
        seen.push(sql);
        return [{ total: 0 }];
      },
    } as never;

    await expect(
      countStorageObjects(manager, kdhHomeProjectIds),
    ).resolves.toEqual({ liveAssets: 0, pendingDeletions: 0 });
    expect(
      seen.every((sql) => sql.includes("status IS DISTINCT FROM 'deleted'")),
    ).toBe(true);
  });
});

describe("assertNoResidualRows", () => {
  function manager(counts: Record<string, number>) {
    return {
      async query(sql: string, params?: unknown[]) {
        if (sql.includes("pg_attribute"))
          return Object.keys(counts).map((table) => ({ table_name: table }));
        if (sql.includes("to_regclass")) return [{ oid: String(params?.[0]) }];
        const table = /FROM (\w+)/.exec(sql)?.[1] ?? "";
        return [{ total: counts[table] ?? 0 }];
      },
    } as never;
  }

  it("passes when every project-scoped table is empty", async () => {
    await expect(
      assertNoResidualRows(manager({ decks: 0, projects: 0 }), kdhHomeProjectIds),
    ).resolves.toBeUndefined();
  });

  it("fails on a project-scoped table missing from the delete order", async () => {
    await expect(
      assertNoResidualRows(
        manager({ decks: 0, some_new_table: 3 }),
        kdhHomeProjectIds,
      ),
    ).rejects.toThrow("some_new_table=3");
  });
});
