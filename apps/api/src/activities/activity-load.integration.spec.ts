import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.ACTIVITY_LOAD_TEST_BASE_URL;
const databaseUrl = process.env.ACTIVITY_LOAD_TEST_DATABASE_URL;
const enabled = Boolean(baseUrl && databaseUrl);
const audienceCount = 200;
const projectId = "project_activity_load_test";
const deckId = "deck_activity_load_test";
const sessionId = "session_activity_load_test";
const activityId = "activity_load_test";
const runId = "activity_run_load_test";
const origin = "http://localhost:5173";

type AudienceIdentity = { cookie: string; userAgent: string };
type LoadResult = { latencyMs: number; runRevision?: number; status: number };
type ResultsUpdatedEvent = {
  payload?: { activityRunId?: string; revision?: number };
};

describe.skipIf(!enabled)("activity response load integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let activeSocket: Socket | null = null;

  beforeAll(async () => {
    await resetFixture(pool);
    await createFixture(pool);
  });

  afterAll(async () => {
    activeSocket?.disconnect();
    await resetFixture(pool);
    await pool.end();
  });

  it("stores 200 concurrent audience responses and publishes the final revision within two seconds", async () => {
    const audiences = await Promise.all(
      Array.from({ length: audienceCount }, (_, index) => joinAudience(index))
    );
    const socket = await connectAudienceSocket(audiences[0]!);
    activeSocket = socket;
    let maxEventRevision = 0;
    let finalEventReceivedAt = 0;
    const finalEvent = promiseWithResolvers<void>();

    socket.on("activity-results-updated", (event: ResultsUpdatedEvent) => {
      if (event.payload?.activityRunId !== runId) return;
      const revision = event.payload.revision;
      if (typeof revision !== "number" || revision <= maxEventRevision) return;
      maxEventRevision = revision;
      if (revision === audienceCount + 1) {
        finalEventReceivedAt = performance.now();
        finalEvent.resolve();
      }
    });

    let sampleLocks = true;
    const lockSample = sampleActivityRunLockWaiters(pool, () => sampleLocks);
    let results: LoadResult[];
    try {
      results = await Promise.all(
        audiences.map((audience, index) => submitResponse(audience, index))
      );
    } finally {
      sampleLocks = false;
    }
    const maxDbLockWaiters = await lockSample;
    await Promise.race([
      finalEvent.promise,
      rejectAfter(2_000, "final activity revision event timed out")
    ]);
    const snapshot = await getAudienceActivity(audiences[0]!);
    const eventToSnapshotMs = performance.now() - finalEventReceivedAt;
    socket.disconnect();
    activeSocket = null;

    const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
    const p50Ms = percentile(latencies, 0.5);
    const p95Ms = percentile(latencies, 0.95);
    const database = await pool.query<{
      distinct_audiences: string;
      response_count: number;
      response_rows: string;
      revision: number;
    }>(
      `
        SELECT runs.response_count, runs.revision,
          count(responses.response_id)::text AS response_rows,
          count(DISTINCT responses.audience_id)::text AS distinct_audiences
        FROM activity_runs AS runs
        LEFT JOIN activity_responses AS responses
          ON responses.activity_run_id = runs.activity_run_id
        WHERE runs.activity_run_id = $1
        GROUP BY runs.response_count, runs.revision
      `,
      [runId]
    );
    const row = database.rows[0]!;

    console.info("[activity-load]", {
      audienceCount,
      eventToSnapshotMs: Math.round(eventToSnapshotMs),
      maxDbLockWaiters,
      p50Ms: Math.round(p50Ms),
      p95Ms: Math.round(p95Ms)
    });
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(
      Math.max(...results.flatMap((result) => result.runRevision ?? []))
    ).toBe(audienceCount + 1);
    expect(p95Ms).toBeLessThanOrEqual(2_000);
    expect(row.response_count).toBe(audienceCount);
    expect(Number(row.response_rows)).toBe(audienceCount);
    expect(Number(row.distinct_audiences)).toBe(audienceCount);
    expect(row.revision).toBe(audienceCount + 1);
    expect(maxEventRevision).toBe(audienceCount + 1);
    expect(maxDbLockWaiters).toBeGreaterThanOrEqual(0);
    expect(snapshot.run.revision).toBe(audienceCount + 1);
    expect(eventToSnapshotMs).toBeLessThanOrEqual(2_000);
  }, 30_000);
});

async function joinAudience(index: number): Promise<AudienceIdentity> {
  const userAgent = `activity-load-client-${index}`;
  const response = await fetch(
    `${baseUrl}/api/v1/audience-sessions/${sessionId}/join`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin, "user-agent": userAgent },
      body: "{}"
    }
  );
  expect(response.status).toBe(201);
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("audience join did not return a cookie");
  return { cookie: setCookie.split(";", 1)[0]!, userAgent };
}

async function connectAudienceSocket(audience: AudienceIdentity): Promise<Socket> {
  const socket = io(baseUrl!, {
    autoConnect: false,
    extraHeaders: { Cookie: audience.cookie, "User-Agent": audience.userAgent },
    transports: ["websocket"]
  });
  const connected = promiseWithResolvers<void>();
  socket.once("connect", () => connected.resolve());
  socket.once("connect_error", connected.reject);
  socket.connect();
  await Promise.race([connected.promise, rejectAfter(5_000, "socket connection timed out")]);
  const acknowledgement = await socket.timeout(5_000).emitWithAck(
    "presentation:audience:join",
    { projectId, sessionId }
  );
  expect(acknowledgement).toEqual({ joined: true, role: "audience", sessionId });
  return socket;
}

async function submitResponse(
  audience: AudienceIdentity,
  index: number
): Promise<LoadResult> {
  const startedAt = performance.now();
  const response = await fetch(
    `${baseUrl}/api/v1/audience-sessions/${sessionId}/activities/${activityId}/response`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: audience.cookie,
        origin,
        "user-agent": audience.userAgent
      },
      body: JSON.stringify({
        clientMutationId: `load-mutation-${index}`,
        answers: [
          {
            questionId: "question_rating",
            type: "rating",
            value: (index % 5) + 1
          }
        ]
      })
    }
  );
  const payload = (await response.json().catch(() => null)) as
    | { runRevision?: number }
    | null;
  return {
    latencyMs: performance.now() - startedAt,
    runRevision: payload?.runRevision,
    status: response.status
  };
}

async function getAudienceActivity(audience: AudienceIdentity) {
  const response = await fetch(
    `${baseUrl}/api/v1/audience-sessions/${sessionId}/activities/${activityId}`,
    {
      headers: { cookie: audience.cookie, "user-agent": audience.userAgent }
    }
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { run: { revision: number } };
}

async function createFixture(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO projects (project_id, workspace_id, title, created_by)
     VALUES ($1, 'workspace_activity_load_test', 'Activity load test', 'user_activity_load_test')`,
    [projectId]
  );
  await pool.query(
    `INSERT INTO decks (project_id, deck_id, deck_json, version)
     VALUES ($1, $2, '{}'::jsonb, 1)`,
    [projectId, deckId]
  );
  await pool.query(
    `
      INSERT INTO presentation_sessions (
        session_id, session_password_hash, project_id, status, expires_at,
        deck_id, deck_version, presenter_user_id, created_by, access_mode,
        starts_at, updated_at, started_at
      )
      VALUES ($1, NULL, $2, 'live', now() + interval '1 day', $3, 1,
        'user_activity_load_test', 'user_activity_load_test', 'public',
        now() - interval '1 minute', now(), now())
    `,
    [sessionId, projectId, deckId]
  );
  await pool.query(
    `
      INSERT INTO activity_runs (
        activity_run_id, project_id, session_id, activity_id, source_slide_id,
        version, definition_snapshot, definition_fingerprint, status, revision,
        is_current, response_count, opened_at
      )
      VALUES ($1, $2, $3, $4, 'slide_activity_load_test', 1, $5::jsonb,
        'activity-load-test-fingerprint', 'open', 1, true, 0, now())
    `,
    [runId, projectId, sessionId, activityId, JSON.stringify(activityDefinition())]
  );
  await pool.query(
    `UPDATE presentation_sessions SET active_activity_run_id = $1 WHERE session_id = $2`,
    [runId, sessionId]
  );
}

async function resetFixture(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM decks WHERE project_id = $1`, [projectId]);
  await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
}

function activityDefinition() {
  return {
    activityId,
    template: "satisfaction",
    title: "Load test",
    description: "",
    questions: [
      {
        questionId: "question_rating",
        type: "rating",
        prompt: "Rating",
        required: true,
        leftLabel: "Low",
        rightLabel: "High"
      }
    ],
    allowDisplayName: false,
    hideResultsUntilReveal: true
  };
}

function percentile(sorted: number[], ratio: number): number {
  return sorted[Math.ceil(sorted.length * ratio) - 1] ?? Number.POSITIVE_INFINITY;
}

function rejectAfter(milliseconds: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), milliseconds);
  });
}

async function sampleActivityRunLockWaiters(
  pool: Pool,
  isRunning: () => boolean
): Promise<number> {
  let maxWaiters = 0;
  while (isRunning()) {
    const result = await pool.query<{ waiters: number }>(
      `
        SELECT count(*)::int AS waiters
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%FOR UPDATE OF runs%'
      `
    );
    maxWaiters = Math.max(maxWaiters, result.rows[0]?.waiters ?? 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return maxWaiters;
}

function promiseWithResolvers<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
