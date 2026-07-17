import {
  slidePracticeReportListResponseSchema,
  slidePracticeReportRecordSchema,
  voiceBaselineRecordSchema,
  type CreateSlidePracticeReportRequest,
  type SlidePracticeReportListResponse,
  type VoiceBaselineMetrics,
  type VoiceBaselineRecord,
} from "@orbit/shared";

const pendingReportStoreName = "pending-reports";
const databaseName = "orbit-slide-practice";

export async function persistSlidePracticeReport(
  request: CreateSlidePracticeReportRequest,
) {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(request.report.projectId)}/slide-practice-reports`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) throw new Error(await responseMessage(response, "연습 결과를 저장하지 못했습니다."));
  const payload = await response.json() as { report?: unknown };
  return slidePracticeReportRecordSchema.parse(payload.report);
}

export async function listSlidePracticeReports(input: {
  projectId: string;
  deckId?: string;
  slideId?: string;
  limit?: number;
}): Promise<SlidePracticeReportListResponse> {
  const search = new URLSearchParams();
  if (input.deckId) search.set("deckId", input.deckId);
  if (input.slideId) search.set("slideId", input.slideId);
  search.set("limit", String(input.limit ?? 30));
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(input.projectId)}/slide-practice-reports?${search}`,
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await responseMessage(response, "연습 기록을 불러오지 못했습니다."));
  return slidePracticeReportListResponseSchema.parse(await response.json());
}

export async function getVoiceBaseline(deviceIdHash: string): Promise<VoiceBaselineRecord | null> {
  const response = await fetch(
    `/api/v1/users/me/voice-baselines/${encodeURIComponent(deviceIdHash)}`,
    { credentials: "include" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await responseMessage(response, "목소리 기준값을 불러오지 못했습니다."));
  const payload = await response.json() as { baseline?: unknown };
  return voiceBaselineRecordSchema.parse(payload.baseline);
}

export async function upsertVoiceBaseline(input: {
  deviceIdHash: string;
  sampleCount: number;
  metrics: VoiceBaselineMetrics;
}) {
  const response = await fetch(
    `/api/v1/users/me/voice-baselines/${encodeURIComponent(input.deviceIdHash)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw new Error(await responseMessage(response, "목소리 기준값을 저장하지 못했습니다."));
}

export async function enqueueOfflinePracticeReport(request: CreateSlidePracticeReportRequest) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(pendingReportStoreName, "readwrite");
    transaction.objectStore(pendingReportStoreName).put(request, request.clientRequestId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function flushOfflinePracticeReports() {
  if (!navigator.onLine || typeof indexedDB === "undefined") return 0;
  const database = await openDatabase();
  const records = await new Promise<CreateSlidePracticeReportRequest[]>((resolve, reject) => {
    const request = database.transaction(pendingReportStoreName).objectStore(pendingReportStoreName).getAll();
    request.onsuccess = () => resolve(request.result as CreateSlidePracticeReportRequest[]);
    request.onerror = () => reject(request.error);
  });
  let flushed = 0;
  for (const record of records) {
    try {
      await persistSlidePracticeReport(record);
      await deletePending(database, record.clientRequestId);
      flushed += 1;
    } catch {
      break;
    }
  }
  database.close();
  return flushed;
}

export async function getStableDeviceIdHash() {
  const storageKey = "orbit.slide-practice.device-id.v1";
  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(storageKey, deviceId);
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(deviceId));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(pendingReportStoreName)) {
        request.result.createObjectStore(pendingReportStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deletePending(database: IDBDatabase, key: string) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(pendingReportStoreName, "readwrite");
    transaction.objectStore(pendingReportStoreName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}
