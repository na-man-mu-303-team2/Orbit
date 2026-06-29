import { createDemoDeck } from "@orbit/editor-core";
import {
  demoIds,
  type DeckElement,
  type GenerateDeckJobResult,
  type Job
} from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Database,
  FileUp,
  Mic,
  Play,
  Radio,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { AuthPanel } from "./features/auth/AuthPanel";
import { ProjectAssetWorkspace } from "./features/projects/ProjectAssetWorkspace";
import { RehearsalWorkspace } from "./features/rehearsal/RehearsalWorkspace";
import type { CSSProperties, ChangeEvent, DragEvent, ReactNode } from "react";
import { lazy, Suspense, useMemo, useRef, useState } from "react";

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
  referenceDocumentId?: string;
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

type GenerateDeckResponse = {
  job: Job;
};

type ReferenceGenerationInput = {
  references: Array<{ fileId: string }>;
  referenceKeywords: Array<{ text: string }>;
  succeededFiles: ExtractedFile[];
  failedFiles: ExtractedFile[];
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type PresentationKeyword = {
  keyword: string;
  reason: string;
  priority: "high" | "medium" | "low" | string;
};

const demoDeck = createDemoDeck();
const EditorShell = lazy(() =>
  import("./features/editor/EditorShell").then((module) => ({
    default: module.EditorShell
  }))
);
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

export function getGenerateDeckJobResult(job: Job): GenerateDeckJobResult | null {
  const result = job.result as GenerateDeckJobResult | null;
  return result?.deck ? result : null;
}

export function buildReferenceGenerationInput(
  files: ExtractedFile[]
): ReferenceGenerationInput {
  const references: Array<{ fileId: string }> = [];
  const referenceKeywords: Array<{ text: string }> = [];
  const succeededFiles: ExtractedFile[] = [];
  const failedFiles: ExtractedFile[] = [];
  const seenFileIds = new Set<string>();
  const seenKeywords = new Set<string>();

  for (const file of files) {
    const fileId = file.referenceDocumentId?.trim() ?? "";
    if (file.status.toLowerCase() !== "succeeded" || !fileId) {
      failedFiles.push(file);
      continue;
    }

    succeededFiles.push(file);
    if (!seenFileIds.has(fileId)) {
      seenFileIds.add(fileId);
      references.push({ fileId });
    }

    for (const keyword of file.keywords ?? []) {
      const text = keyword.keyword.trim();
      const key = text.toLowerCase();
      if (!text || seenKeywords.has(key)) continue;

      seenKeywords.add(key);
      referenceKeywords.push({ text });
    }
  }

  return { references, referenceKeywords, succeededFiles, failedFiles };
}

// 데모 콘솔의 최상위 화면 전환을 관리한다.
export function App() {
  const [view, setView] = useState<
    "console" | "upload" | "generate" | "project-assets" | "editor" | "rehearsal"
  >(
    "console"
  );
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

  if (view === "generate") {
    return <GenerateDeckView />;
  }

  if (view === "project-assets") {
    return <ProjectAssetWorkspace />;
  }

  if (view === "editor") {
    return (
      <Suspense fallback={<EditorLoadingFallback />}>
        <EditorShell />
      </Suspense>
    );
  }

  if (view === "rehearsal") {
    return <RehearsalWorkspace />;
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
              <button type="button" onClick={() => setView("project-assets")}>
                <Play size={18} />
                프로젝트 생성
              </button>
              <button type="button" onClick={() => setView("upload")}>
                <FileUp size={18} />
                파일 업로드
              </button>
              <button type="button" onClick={() => setView("generate")}>
                <Sparkles size={18} />
                AI 덱 생성
              </button>
              <button type="button" onClick={() => setView("editor")}>
                <Activity size={18} />
                편집기 열기
              </button>
              <button type="button" onClick={() => setView("rehearsal")}>
                <Mic size={18} />
                리허설
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

function EditorLoadingFallback() {
  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">editor</p>
          <h1>편집기를 불러오는 중</h1>
        </div>
      </section>
    </main>
  );
}

function GenerateDeckView() {
  const [topic, setTopic] = useState("AI 덱 생성 파이프라인");
  const [prompt, setPrompt] = useState("참고자료를 바탕으로 발표 흐름과 핵심 메시지를 정리");
  const [duration, setDuration] = useState(10);
  const [minSlides, setMinSlides] = useState(5);
  const [maxSlides, setMaxSlides] = useState(8);
  const [template, setTemplate] = useState("report");
  const [audience, setAudience] = useState("general");
  const [purpose, setPurpose] = useState("inform");
  const [tone, setTone] = useState("professional");
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<
    "idle" | "extracting" | "generating"
  >("idle");
  const [generateError, setGenerateError] = useState("");
  const [extractJob, setExtractJob] = useState<Job | null>(null);
  const [generateJob, setGenerateJob] = useState<Job | null>(null);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [result, setResult] = useState<GenerateDeckJobResult | null>(null);
  const totalSize = useMemo(
    () => uploads.reduce((sum, upload) => sum + upload.file.size, 0),
    [uploads]
  );
  const referenceSummary = useMemo(
    () => buildReferenceGenerationInput(extractedFiles),
    [extractedFiles]
  );

  const addFiles = (fileList: FileList | File[]) => {
    const { acceptedFiles, rejectedFiles } = collectUploadFiles(fileList);

    setUploads((current) => appendUniqueUploads(current, acceptedFiles));
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
    setExtractedFiles([]);
    setExtractJob(null);
    setGenerateError("");
  };

  const extractReferences = async (): Promise<ReferenceGenerationInput> => {
    if (uploads.length === 0) {
      return {
        references: [],
        referenceKeywords: [],
        succeededFiles: [],
        failedFiles: []
      };
    }

    const formData = new FormData();
    uploads.forEach(({ file }) => formData.append("files", file));

    setGenerationStep("extracting");
    setExtractJob(null);
    setExtractedFiles([]);

    const response = await fetch("/api/extract", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "참고자료 처리에 실패했습니다.");
    }

    const data = (await response.json()) as ExtractResponse;
    setExtractJob(data.job);

    const job = await pollExtractJob(data.job.jobId, {
      onUpdate: setExtractJob
    });

    if (job.status === "failed") {
      throw new Error(
        job.error?.message || job.message || "참고자료 처리에 실패했습니다."
      );
    }

    const files = getJobResultFiles(job);
    setExtractedFiles(files);
    const input = buildReferenceGenerationInput(files);
    if (input.references.length === 0) {
      throw new Error("참고자료 처리에 성공한 파일이 없어 덱 생성을 중단했습니다.");
    }

    return input;
  };

  const generateDeck = async () => {
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerationStep("idle");
    setGenerateError("");
    setExtractJob(null);
    setGenerateJob(null);
    setExtractedFiles([]);
    setResult(null);

    try {
      const referenceInput = await extractReferences();
      setGenerationStep("generating");
      const response = await fetch(
        `/api/v1/projects/${demoIds.projectId}/jobs/generate-deck`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            topic,
            prompt,
            targetDurationMinutes: duration,
            slideCountRange: { min: minSlides, max: maxSlides },
            template,
            metadata: { audience, purpose, tone },
            references: referenceInput.references,
            referenceKeywords: referenceInput.referenceKeywords
          })
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "AI 덱 생성에 실패했습니다.");
      }

      const data = (await response.json()) as GenerateDeckResponse;
      setGenerateJob(data.job);

      const job = await pollExtractJob(data.job.jobId, {
        onUpdate: setGenerateJob
      });

      if (job.status === "failed") {
        throw new Error(job.error?.message || job.message || "AI 덱 생성에 실패했습니다.");
      }

      setResult(getGenerateDeckJobResult(job));
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "AI 덱 생성에 실패했습니다."
      );
    } finally {
      setIsGenerating(false);
      setGenerationStep("idle");
    }
  };
  const submitLabel =
    generationStep === "extracting"
      ? "참고자료 처리 중..."
      : generationStep === "generating"
        ? "덱 생성 중..."
        : "덱 생성";

  return (
    <main className="app-shell generate-app-shell">
      <section className="generate-layout" aria-labelledby="generate-title">
        <form
          className="generate-form"
          onSubmit={(event) => {
            event.preventDefault();
            void generateDeck();
          }}
        >
          <div className="panel-copy">
            <span className="eyebrow">Orbit issue #26</span>
            <h1 id="generate-title">AI 덱 생성</h1>
          </div>

          <label>
            <span>Topic</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} />
          </label>

          <label>
            <span>Prompt</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>

          <div className="form-grid">
            <label>
              <span>Duration</span>
              <input
                min={1}
                max={120}
                type="number"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Min slides</span>
              <input
                min={1}
                max={20}
                type="number"
                value={minSlides}
                onChange={(event) => setMinSlides(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Max slides</span>
              <input
                min={1}
                max={20}
                type="number"
                value={maxSlides}
                onChange={(event) => setMaxSlides(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="form-grid">
            <SelectField
              label="Template"
              value={template}
              onChange={setTemplate}
              options={["default", "pitch", "report", "lesson"]}
            />
            <SelectField
              label="Audience"
              value={audience}
              onChange={setAudience}
              options={["general", "executive", "technical", "sales"]}
            />
            <SelectField
              label="Purpose"
              value={purpose}
              onChange={setPurpose}
              options={["inform", "persuade", "teach", "report"]}
            />
          </div>

          <div className="form-grid">
            <SelectField
              label="Tone"
              value={tone}
              onChange={setTone}
              options={["professional", "friendly", "confident", "concise"]}
            />
          </div>

          <section
            className="generate-reference-panel"
            aria-labelledby="generate-reference-title"
          >
            <div className="reference-panel-heading">
              <span className="eyebrow" id="generate-reference-title">
                References
              </span>
              <p>PDF, DOCX, PPTX와 이미지 파일</p>
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
              <input type="file" accept={accept} multiple onChange={handleFileChange} />
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
              <ul className="file-list" aria-label="덱 생성 참고자료 파일">
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
                      disabled={isGenerating}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button className="extract-button" type="submit" disabled={isGenerating}>
            {isGenerating ? submitLabel : "덱 생성"}
          </button>

          {extractJob && (
            <div className="job-status" aria-live="polite">
              <div>
                <strong>reference {extractJob.status}</strong>
                <span>{extractJob.progress}%</span>
              </div>
              {extractJob.message && <p>{extractJob.message}</p>}
            </div>
          )}

          {extractedFiles.length > 0 && (
            <div className="job-status" aria-live="polite">
              <p>
                참고자료 {referenceSummary.succeededFiles.length}개 사용
                {referenceSummary.failedFiles.length > 0
                  ? ` · ${referenceSummary.failedFiles.length}개 실패`
                  : ""}
              </p>
            </div>
          )}

          {generateJob && (
            <div className="job-status" aria-live="polite">
              <div>
                <strong>deck {generateJob.status}</strong>
                <span>{generateJob.progress}%</span>
              </div>
              {generateJob.message && <p>{generateJob.message}</p>}
            </div>
          )}

          {generateError && (
            <div className="rejection-list" role="alert">
              <p>{generateError}</p>
            </div>
          )}
        </form>

        <section className="generate-result" aria-live="polite">
          {result ? <GeneratedDeckResult result={result} /> : <DeckPreviewPlaceholder />}
        </section>
      </section>
    </main>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GeneratedDeckResult(props: { result: GenerateDeckJobResult }) {
  const { deck, validation, warnings } = props.result;

  return (
    <div className="generated-deck">
      <header className="result-heading">
        <div>
          <span className="eyebrow">Generated deck</span>
          <h2>{deck.title}</h2>
        </div>
        <strong>{deck.slides.length} slides</strong>
      </header>

      {warnings.length > 0 && (
        <div className="job-status">
          <p>{warnings.join(" · ")}</p>
        </div>
      )}

      <p className="indexing-summary">
        validation {validation.passed ? "passed" : "failed"}
      </p>

      <div className="generated-slide-grid">
        {deck.slides.map((slide) => (
          <article key={slide.slideId} className="generated-slide-card">
            <GeneratedSlidePreview
              canvas={deck.canvas}
              elements={slide.elements}
              title={slide.title}
            />
            <div className="generated-slide-meta">
              <span>{slide.order}</span>
              <strong>{slide.title}</strong>
            </div>
            <details>
              <summary>Evidence</summary>
              {slide.aiNotes?.sourceEvidence.length ? (
                <ul>
                  {slide.aiNotes.sourceEvidence.map((evidence) => (
                    <li key={`${slide.slideId}-${evidence.fileId}`}>
                      <strong>{evidence.fileId}</strong>
                      {evidence.note ? ` · ${evidence.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>topic-only</p>
              )}
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}

function GeneratedSlidePreview(props: {
  canvas: { width: number; height: number };
  elements: DeckElement[];
  title: string;
}) {
  return (
    <div
      className="generated-slide-preview"
      aria-label={props.title}
      style={{ aspectRatio: `${props.canvas.width} / ${props.canvas.height}` }}
    >
      {props.elements
        .filter((element) => element.visible)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((element) => (
          <GeneratedSlideElement
            key={element.elementId}
            canvas={props.canvas}
            element={element}
          />
        ))}
    </div>
  );
}

function GeneratedSlideElement(props: {
  canvas: { width: number; height: number };
  element: DeckElement;
}) {
  const { canvas, element } = props;
  const baseStyle: CSSProperties = {
    left: `${(element.x / canvas.width) * 100}%`,
    top: `${(element.y / canvas.height) * 100}%`,
    width: `${(element.width / canvas.width) * 100}%`,
    height: `${(element.height / canvas.height) * 100}%`,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg)`,
    zIndex: element.zIndex
  };

  if (element.type === "text") {
    return (
      <div
        className="generated-slide-element generated-slide-text"
        style={{
          ...baseStyle,
          alignItems: textVerticalAlign(element.props.verticalAlign),
          color: element.props.color,
          display: "flex",
          fontFamily: element.props.fontFamily,
          fontSize: `max(8px, ${(element.props.fontSize / canvas.width) * 100}cqw)`,
          fontWeight: element.props.fontWeight,
          justifyContent: textAlign(element.props.align),
          lineHeight: element.props.lineHeight,
          textAlign: element.props.align
        }}
      >
        {element.props.text}
      </div>
    );
  }

  if (element.type === "image") {
    return (
      <img
        className="generated-slide-element"
        src={element.props.src}
        alt={element.props.alt}
        style={{
          ...baseStyle,
          objectFit: element.props.fit === "stretch" ? "fill" : element.props.fit
        }}
      />
    );
  }

  if (isShapeElement(element)) {
    return (
      <div
        className={`generated-slide-element generated-slide-shape generated-slide-shape-${element.type}`}
        style={{
          ...baseStyle,
          background: element.props.fill,
          borderColor: element.props.stroke,
          borderRadius:
            element.type === "ellipse" || element.type === "ring"
              ? "999px"
              : `${element.props.borderRadius}px`,
          borderStyle: "solid",
          borderWidth: `${element.props.strokeWidth}px`
        }}
      />
    );
  }

  return <div className="generated-slide-element generated-slide-shape" style={baseStyle} />;
}

function isShapeElement(
  element: DeckElement
): element is Extract<DeckElement, { type: "rect" | "ellipse" | "line" | "arrow" | "polygon" | "star" | "ring" }> {
  return ["rect", "ellipse", "line", "arrow", "polygon", "star", "ring"].includes(element.type);
}

function textAlign(align: string) {
  if (align === "center") return "center";
  if (align === "right") return "flex-end";
  return "flex-start";
}

function textVerticalAlign(align: string) {
  if (align === "middle") return "center";
  if (align === "bottom") return "flex-end";
  return "flex-start";
}

function DeckPreviewPlaceholder() {
  return (
    <div className="deck-preview-placeholder">
      <Sparkles size={28} />
      <span>AI deck</span>
    </div>
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
    const { acceptedFiles, rejectedFiles } = collectUploadFiles(fileList);

    setUploads((current) => appendUniqueUploads(current, acceptedFiles));
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

function collectUploadFiles(fileList: FileList | File[]) {
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

  return { acceptedFiles, rejectedFiles };
}

function appendUniqueUploads(current: UploadFile[], acceptedFiles: UploadFile[]) {
  const existingIds = new Set(current.map((upload) => upload.id));
  const nextFiles = acceptedFiles.filter((upload) => !existingIds.has(upload.id));

  return [...current, ...nextFiles];
}
