import { createDemoDeck } from "@orbit/editor-core";
import { demoIds, type Job } from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, FileUp, Play, Radio, RefreshCw } from "lucide-react";
import { AuthPanel } from "./features/auth/AuthPanel";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";

interface HealthResponse {
  status: string;
  app: string;
  demo: typeof demoIds;
}

type UploadFile = {
  id: string;
  file: File;
};

type RejectedFile = {
  name: string;
  reason: string;
};

type ExtractedFile = {
  fileName: string;
  kind: string;
  status: string;
  message?: string;
  rawText: string;
  cleanedText?: string;
  cleanupStatus?: string;
  cleanupMessage?: string;
  keywords?: PresentationKeyword[];
  keywordStatus?: string;
  keywordMessage?: string;
  indexingStatus?: string;
  indexingMessage?: string;
  chunkCount?: number;
};

type ExtractResponse = {
  files: ExtractedFile[];
  job: Job;
};

type JobResult = {
  files?: ExtractedFile[];
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type PresentationKeyword = {
  keyword: string;
  reason: string;
  priority: "high" | "medium" | "low" | string;
};

const demoDeck = createDemoDeck();
const allowedExtensions = ["pdf", "docx", "pptx"];
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
const imagePrefix = "image/";
const accept = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/*",
  ".pdf",
  ".docx",
  ".pptx"
].join(",");

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error("API health check failed");
  }
  return response.json() as Promise<HealthResponse>;
}

export async function pollExtractJob(
  jobId: string,
  options: {
    delayMs?: number;
    fetcher?: Fetcher;
    onUpdate?: (job: Job) => void;
    timeoutMs?: number;
  } = {}
): Promise<Job> {
  const delayMs = options.delayMs ?? 1000;
  const fetcher = options.fetcher ?? fetch;
  const timeoutAt = Date.now() + (options.timeoutMs ?? 120_000);

  for (;;) {
    const response = await fetcher(`/api/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error((await response.text()) || "Job status lookup failed.");
    }

    const job = (await response.json()) as Job;
    options.onUpdate?.(job);
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }

    if (Date.now() > timeoutAt) {
      throw new Error("Reference extraction timed out.");
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export function getJobResultFiles(job: Job): ExtractedFile[] {
  const result = job.result as JobResult | null;
  return Array.isArray(result?.files) ? result.files : [];
}

export function App() {
  const [view, setView] = useState<"console" | "upload">("console");
  const previewText =
    demoDeck.slides[0]?.elements.find((element) => element.type === "text")?.props.text ?? "";

  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false
  });

  if (view === "upload") {
    return <UploadView />;
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">platform-core</p>
          <h1>ORBIT Demo Console</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void health.refetch()}
          aria-label="상태 새로고침"
          title="상태 새로고침"
        >
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="status-strip">
        <StatusItem
          icon={<Activity size={20} />}
          label="API"
          value={health.data?.status ?? (health.isError ? "offline" : "checking")}
        />
        <StatusItem icon={<Database size={20} />} label="Project" value={demoIds.projectId} />
        <StatusItem icon={<Radio size={20} />} label="Session" value={demoIds.sessionId} />
      </section>

      <section className="workspace-grid">
        <article className="panel primary-panel">
          <div>
            <p className="panel-kicker">Deck</p>
            <h2>{demoDeck.title}</h2>
          </div>
          <div className="slide-preview">
            <span>{previewText}</span>
          </div>
          <dl className="meta-grid">
            <div>
              <dt>deckId</dt>
              <dd>{demoDeck.deckId}</dd>
            </div>
            <div>
              <dt>slides</dt>
              <dd>{demoDeck.slides.length}</dd>
            </div>
            <div>
              <dt>version</dt>
              <dd>{demoDeck.version}</dd>
            </div>
          </dl>
        </article>

        <div className="side-column">
          <AuthPanel />

          <article className="panel task-panel">
            <p className="panel-kicker">Sprint 1</p>
            <h2>Core Flow</h2>
            <div className="action-list">
              <button type="button">
                <Play size={18} />
                프로젝트 생성
              </button>
              <button type="button" onClick={() => setView("upload")}>
                <FileUp size={18} />
                파일 업로드
              </button>
              <button type="button">
                <Activity size={18} />
                Job 상태 확인
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function UploadView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extractJob, setExtractJob] = useState<Job | null>(null);
  const [results, setResults] = useState<ExtractedFile[]>([]);

  const totalSize = useMemo(
    () => uploads.reduce((sum, upload) => sum + upload.file.size, 0),
    [uploads]
  );

  const addFiles = (fileList: FileList | File[]) => {
    const acceptedFiles: UploadFile[] = [];
    const rejectedFiles: RejectedFile[] = [];

    Array.from(fileList).forEach((file) => {
      if (isAllowedFile(file)) {
        acceptedFiles.push({ id: createUploadId(file), file });
        return;
      }

      rejectedFiles.push({
        name: file.name,
        reason: "PDF, DOCX, PPTX 또는 이미지 파일만 업로드할 수 있습니다."
      });
    });

    setUploads((current) => {
      const existingIds = new Set(current.map((upload) => upload.id));
      const nextFiles = acceptedFiles.filter((upload) => !existingIds.has(upload.id));

      return [...current, ...nextFiles];
    });
    setRejected(rejectedFiles);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files);
    }

    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const removeUpload = (id: string) => {
    setUploads((current) => current.filter((upload) => upload.id !== id));
    setResults([]);
    setExtractJob(null);
    setExtractError("");
  };

  const extractText = async () => {
    if (uploads.length === 0 || isExtracting) return;

    const formData = new FormData();
    uploads.forEach(({ file }) => formData.append("files", file));

    setIsExtracting(true);
    setExtractError("");
    setExtractJob(null);
    setResults([]);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "텍스트 추출에 실패했습니다.");
      }

      const data = (await response.json()) as ExtractResponse;
      setExtractJob(data.job);

      const job = await pollExtractJob(data.job.jobId, {
        onUpdate: setExtractJob
      });

      if (job.status === "failed") {
        throw new Error(
          job.error?.message || job.message || "텍스트 추출에 실패했습니다."
        );
      }

      setResults(getJobResultFiles(job));
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "텍스트 추출에 실패했습니다.");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <main className="app-shell upload-app-shell">
      <section className="upload-panel" aria-labelledby="upload-title">
        <div className="panel-copy">
          <span className="eyebrow">Orbit issue #24</span>
          <h1 id="upload-title">참고 자료 업로드</h1>
          <p>PDF, DOCX, PPTX와 이미지 파일을 추가하고 텍스트를 추출하세요.</p>
        </div>

        <label
          className={`drop-zone${isDragging ? " is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            onChange={handleFileChange}
          />
          <span className="upload-mark" aria-hidden="true">
            +
          </span>
          <span className="drop-title">파일을 끌어오거나 선택하세요</span>
          <span className="drop-meta">PDF · DOCX · PPTX · JPG · PNG · GIF · WEBP</span>
        </label>

        <div className="upload-summary" aria-live="polite">
          <span>{uploads.length}개 파일</span>
          <span>{formatBytes(totalSize)}</span>
        </div>

        {rejected.length > 0 && (
          <div className="rejection-list" role="alert">
            {rejected.map((file) => (
              <p key={file.name}>
                <strong>{file.name}</strong> {file.reason}
              </p>
            ))}
          </div>
        )}

        {uploads.length > 0 && (
          <>
            <ul className="file-list" aria-label="업로드 대기 파일">
              {uploads.map(({ id, file }) => (
                <li key={id}>
                  <div>
                    <span className="file-name">{file.name}</span>
                    <span className="file-detail">
                      {getExtension(file.name).toUpperCase()} · {formatBytes(file.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUpload(id)}
                    aria-label={`${file.name} 제거`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <button
              className="extract-button"
              type="button"
              onClick={extractText}
              disabled={isExtracting}
            >
              {isExtracting ? "텍스트 추출 중..." : "텍스트 추출"}
            </button>
          </>
        )}

        {extractJob && (
          <div className="job-status" aria-live="polite">
            <div>
              <strong>{extractJob.status}</strong>
              <span>{extractJob.progress}%</span>
            </div>
            {extractJob.message && <p>{extractJob.message}</p>}
          </div>
        )}

        {extractError && (
          <div className="rejection-list" role="alert">
            <p>{extractError}</p>
          </div>
        )}

        {results.length > 0 && (
          <section className="result-panel" aria-labelledby="result-title">
            <div className="result-heading">
              <span className="eyebrow">Extraction result</span>
              <h2 id="result-title">추출된 텍스트</h2>
            </div>

            <div className="result-list">
              {results.map((result) => (
                <ExtractResultItem key={result.fileName} result={result} />
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export function ExtractResultItem(props: { result: ExtractedFile }) {
  const { result } = props;

  return (
    <article className="result-item">
      <header className="result-item-header">
        <div>
          <h3>{result.fileName}</h3>
          <p>
            {result.kind.toUpperCase()} · {result.status}
          </p>
        </div>
        {result.message && <span>{result.message}</span>}
      </header>
      {result.indexingStatus && (
        <p className="indexing-summary">
          {result.indexingStatus}
          {typeof result.chunkCount === "number" ? ` · ${result.chunkCount} chunks` : ""}
          {result.indexingMessage ? ` · ${result.indexingMessage}` : ""}
        </p>
      )}
      <div className="text-comparison">
        <div className="text-column">
          <h4>OCR 원문</h4>
          <pre>{result.rawText || "추출된 텍스트가 없습니다."}</pre>
        </div>
        <div className="text-column">
          <h4>AI 정제본</h4>
          <pre>
            {result.cleanedText ||
              result.cleanupMessage ||
              "AI 정제 결과가 없습니다."}
          </pre>
          {result.cleanupStatus && (
            <span className={`cleanup-status cleanup-status-${result.cleanupStatus}`}>
              {result.cleanupStatus}
            </span>
          )}
        </div>
      </div>
      <div className="keyword-panel">
        <div className="keyword-panel-header">
          <h4>발표 주요 키워드</h4>
          {result.keywordStatus && (
            <span className={`cleanup-status cleanup-status-${result.keywordStatus}`}>
              {result.keywordStatus}
            </span>
          )}
        </div>

        {result.keywords && result.keywords.length > 0 ? (
          <ul className="keyword-list">
            {result.keywords.map((keyword) => (
              <li key={`${result.fileName}-${keyword.keyword}`}>
                <div>
                  <strong>{keyword.keyword}</strong>
                  <p>{keyword.reason}</p>
                </div>
                <span className={`priority priority-${keyword.priority}`}>
                  {keyword.priority}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="keyword-empty">
            {result.keywordMessage || "추출된 발표 키워드가 없습니다."}
          </p>
        )}
      </div>
    </article>
  );
}

function StatusItem(props: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="status-item">
      {props.icon}
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
    </div>
  );
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function isAllowedFile(file: File) {
  const extension = getExtension(file.name);
  const isAllowedDocument =
    allowedExtensions.includes(extension) && allowedMimeTypes.has(file.type);
  const isImage = file.type.startsWith(imagePrefix);

  return isAllowedDocument || isImage;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function createUploadId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}
