import {
  completePresentationAudioResponseSchema,
  createPresentationAudioUploadResponseSchema,
  createPresentationRunResponseSchema,
  getPresentationRunReportResponseSchema,
  getPresentationRunResponseSchema,
  type AssetUploadUrlResponse,
  type PresentationRecordingMode,
} from "@orbit/shared";

import { activityApi } from "../activity-slides/api/activityApi";

export type PresentationRuntimeIdentity = {
  audienceUrl: string;
  runId: string;
  sessionId: string;
};

export async function createPresentationRuntime(input: {
  deckId: string;
  deckVersion: number;
  projectId: string;
  recordingMode: PresentationRecordingMode;
}): Promise<PresentationRuntimeIdentity> {
  const { audienceUrl, session } = await activityApi.createSession(input.projectId, {
    accessMode: "public",
    deckId: input.deckId,
  });
  const response = await requestJson(
    runsUrl(input.projectId, session.sessionId),
    {
      body: JSON.stringify({
        expectedDeckVersion: input.deckVersion,
        recordingMode: input.recordingMode,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const { run } = createPresentationRunResponseSchema.parse(response);
  return { audienceUrl, runId: run.runId, sessionId: session.sessionId };
}

export async function uploadPresentationRecording(input: {
  file: File;
  projectId: string;
  runId: string;
  sessionId: string;
}) {
  const uploadResponse = await requestJson(
    `${runsUrl(input.projectId, input.sessionId)}/${segment(input.runId)}/audio-upload`,
    {
      body: JSON.stringify({
        mimeType: input.file.type || "audio/webm",
        originalName: input.file.name,
        size: input.file.size,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const { upload } = createPresentationAudioUploadResponseSchema.parse(uploadResponse);
  await putPresentationRecording(upload, input.file);
  return completePresentationRecording({
    body: { fileId: upload.fileId },
    projectId: input.projectId,
    runId: input.runId,
    sessionId: input.sessionId,
  });
}

export function completePresentationWithoutAudio(input: {
  projectId: string;
  runId: string;
  sessionId: string;
}) {
  return completePresentationRecording({ ...input, body: { withoutAudio: true } });
}

export async function getPresentationRun(input: {
  projectId: string;
  runId: string;
  sessionId: string;
}) {
  const response = await requestJson(
    `${runsUrl(input.projectId, input.sessionId)}/${segment(input.runId)}`,
  );
  return getPresentationRunResponseSchema.parse(response);
}

export async function getPresentationSessionRun(input: {
  projectId: string;
  sessionId: string;
}) {
  const response = await requestJson(runsUrl(input.projectId, input.sessionId));
  return getPresentationRunResponseSchema.parse(response);
}

export async function getPresentationReport(input: {
  projectId: string;
  runId: string;
  sessionId: string;
}) {
  const response = await requestJson(
    `${runsUrl(input.projectId, input.sessionId)}/${segment(input.runId)}/report`,
  );
  return getPresentationRunReportResponseSchema.parse(response);
}

export async function retryPresentationAnalysis(input: {
  projectId: string;
  runId: string;
  sessionId: string;
}) {
  const response = await requestJson(
    `${runsUrl(input.projectId, input.sessionId)}/${segment(input.runId)}/retry-analysis`,
    { method: "POST" },
  );
  return completePresentationAudioResponseSchema.parse(response);
}

async function completePresentationRecording(input: {
  body: { fileId: string } | { withoutAudio: true };
  projectId: string;
  runId: string;
  sessionId: string;
}) {
  const response = await requestJson(
    `${runsUrl(input.projectId, input.sessionId)}/${segment(input.runId)}/audio-complete`,
    {
      body: JSON.stringify(input.body),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  return completePresentationAudioResponseSchema.parse(response);
}

async function putPresentationRecording(upload: AssetUploadUrlResponse, file: File) {
  const response = await fetch(upload.uploadUrl, {
    body: file,
    headers: upload.headers,
    method: upload.method,
  });
  if (!response.ok) {
    throw new Error("발표 녹음 파일을 업로드하지 못했습니다.");
  }
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "실전 발표 요청을 처리하지 못했습니다.";
    throw new Error(message);
  }
  return payload;
}

function runsUrl(projectId: string, sessionId: string) {
  return `/api/v1/projects/${segment(projectId)}/presentation-sessions/${segment(sessionId)}/runs`;
}

function segment(value: string) {
  return encodeURIComponent(value);
}
