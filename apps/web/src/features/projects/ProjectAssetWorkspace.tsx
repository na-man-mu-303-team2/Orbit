import {
  allowedAssetMimeTypes,
  deckSchema,
  demoIds,
  maxAssetUploadSizeBytes,
  type AssetUploadUrlRequest,
  type AssetUploadUrlResponse,
  type Deck,
  type FilePurpose,
  type Project,
  type UploadedFile,
} from "@orbit/shared";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  FolderPlus,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type AssetMimeType = (typeof allowedAssetMimeTypes)[number];
type UploadPhase = "idle" | "request-url" | "storage-put" | "complete";

const defaultPurpose: FilePurpose = "pptx-import";
const assetMimeTypeSet = new Set<string>(allowedAssetMimeTypes);
const documentMimeByExtension: Record<string, AssetMimeType> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const assetAccept = [
  ...allowedAssetMimeTypes,
  ".pdf",
  ".pptx",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
].join(",");

export class ProjectAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectAssetError";
  }
}

// 파일명에서 확장자를 꺼내 MIME fallback을 찾을 때 사용한다.
function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

// 브라우저가 MIME type을 비워도 확장자 기준으로 API 계약 MIME을 복원한다.
export function resolveAssetMimeType(file: Pick<File, "name" | "type">) {
  if (assetMimeTypeSet.has(file.type)) {
    return file.type as AssetMimeType;
  }

  return documentMimeByExtension[getExtension(file.name)] ?? null;
}

// 업로드 전에 파일 형식과 크기를 shared 계약 기준으로 검증한다.
export function getAssetValidationMessage(
  file: Pick<File, "name" | "size" | "type">,
) {
  if (!resolveAssetMimeType(file)) {
    return "PDF, PPTX, DOCX, JPG, PNG, WebP 파일만 업로드할 수 있습니다.";
  }

  if (file.size > maxAssetUploadSizeBytes) {
    return `파일 크기는 최대 ${formatAssetBytes(maxAssetUploadSizeBytes)}까지 가능합니다.`;
  }

  if (file.size <= 0) {
    return "빈 파일은 업로드할 수 없습니다.";
  }

  return null;
}

// 화면과 테스트가 같은 payload를 쓰도록 upload-url 요청 본문을 만든다.
export function buildAssetUploadRequest(
  file: File,
  purpose: FilePurpose,
): AssetUploadUrlRequest {
  const validationMessage = getAssetValidationMessage(file);
  const mimeType = resolveAssetMimeType(file);

  if (validationMessage || !mimeType) {
    throw new ProjectAssetError(validationMessage ?? "업로드할 수 없는 파일입니다.");
  }

  return {
    originalName: file.name,
    mimeType,
    size: file.size,
    purpose,
  };
}

// API 에러 본문이 있으면 사용자에게 보여줄 짧은 메시지로 바꾼다.
async function readErrorMessage(response: Response, fallback: string) {
  const message = await response.text();
  return message || fallback;
}

// 현재 demo workspace의 프로젝트 목록을 API에서 가져온다.
export async function fetchProjects(fetcher: Fetcher = fetch) {
  const response = await fetcher(
    `/api/v1/workspaces/${demoIds.workspaceId}/projects`,
  );

  if (!response.ok) {
    throw new ProjectAssetError(
      await readErrorMessage(response, "프로젝트 목록을 불러오지 못했습니다."),
    );
  }

  return (await response.json()) as Project[];
}

// 새 프로젝트를 만들고 API가 반환한 project DTO를 그대로 사용한다.
export async function createProject(
  title: string,
  fetcher: Fetcher = fetch,
) {
  const response = await fetcher(
    `/api/v1/workspaces/${demoIds.workspaceId}/projects`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    },
  );

  if (!response.ok) {
    throw new ProjectAssetError(
      await readErrorMessage(response, "프로젝트를 만들지 못했습니다."),
    );
  }

  const project = (await response.json()) as Project;
  await createInitialProjectDeck(project, fetcher);

  return project;
}

export function buildInitialProjectDeck(project: Project): Deck {
  const normalizedProjectId = project.projectId.replace(/^project_/, "");

  return deckSchema.parse({
    deckId: `deck_${normalizedProjectId}`,
    projectId: project.projectId,
    title: project.title || "새 프레젠테이션",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR",
      sourceType: "manual",
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
    },
    theme: {
      name: "Orbit Blank",
      fontFamily: "Inter",
      backgroundColor: "#ffffff",
      textColor: "#111827",
      accentColor: "#2563eb",
      palette: {
        primary: "#2563eb",
        secondary: "#7c3aed",
        surface: "#ffffff",
        muted: "#f3f4f6",
        border: "#dbe3f0",
      },
      typography: {
        headingFontFamily: "Inter",
        bodyFontFamily: "Inter",
        titleSize: 56,
        headingSize: 36,
        bodySize: 22,
        captionSize: 16,
      },
      effects: {
        borderRadius: 10,
        shadow: {
          color: "#111827",
          blur: 18,
          offsetX: 0,
          offsetY: 8,
          opacity: 0.16,
        },
      },
    },
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "",
        thumbnailUrl: "",
        style: {
          layout: "title",
          backgroundColor: "#ffffff",
          textColor: "#111827",
          accentColor: "#2563eb",
        },
        speakerNotes: "",
        elements: [],
        keywords: [],
        animations: [],
        aiNotes: {
          emphasisPoints: [],
          sourceEvidence: [],
        },
      },
    ],
  });
}

export async function createInitialProjectDeck(
  project: Project,
  fetcher: Fetcher = fetch,
) {
  const deck = buildInitialProjectDeck(project);
  const response = await fetcher(`/api/v1/projects/${project.projectId}/deck`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deck,
      snapshotReason: "deck-replaced",
    }),
  });

  if (!response.ok) {
    throw new ProjectAssetError(
      await readErrorMessage(response, "초기 발표자료를 만들지 못했습니다."),
    );
  }

  return deck;
}

// 선택된 프로젝트에 이미 완료된 asset metadata를 불러온다.
export async function fetchProjectAssets(
  projectId: string,
  fetcher: Fetcher = fetch,
) {
  const response = await fetcher(`/api/v1/projects/${projectId}/assets`);

  if (!response.ok) {
    throw new ProjectAssetError(
      await readErrorMessage(response, "업로드된 파일 목록을 불러오지 못했습니다."),
    );
  }

  return (await response.json()) as UploadedFile[];
}

// project asset 업로드 전체 흐름을 upload-url, PUT, complete 순서로 실행한다.
export async function uploadProjectAsset(
  projectId: string,
  file: File,
  purpose: FilePurpose = defaultPurpose,
  fetcher: Fetcher = fetch,
) {
  const uploadRequest = buildAssetUploadRequest(file, purpose);
  const uploadUrl = await requestProjectUploadUrl(projectId, uploadRequest, fetcher);

  await uploadFileToStorage(file, uploadUrl, fetcher);
  return completeProjectAssetUpload(projectId, uploadUrl.fileId, fetcher);
}

// API에 presigned upload URL을 요청하고 pending metadata 생성을 시작한다.
async function requestProjectUploadUrl(
  projectId: string,
  uploadRequest: AssetUploadUrlRequest,
  fetcher: Fetcher,
) {
  const response = await fetcher(`/api/v1/projects/${projectId}/assets/upload-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(uploadRequest),
  });

  if (!response.ok) {
    throw new ProjectAssetError(
      await readErrorMessage(response, "업로드 URL을 발급하지 못했습니다."),
    );
  }

  return (await response.json()) as AssetUploadUrlResponse;
}

// 브라우저가 storage URL로 파일 binary를 직접 PUT한다.
async function uploadFileToStorage(
  file: File,
  uploadUrl: AssetUploadUrlResponse,
  fetcher: Fetcher,
) {
  const response = await fetcher(uploadUrl.uploadUrl, {
    method: uploadUrl.method,
    headers: uploadUrl.headers,
    body: file,
  });

  if (!response.ok) {
    throw new ProjectAssetError(
      await readErrorMessage(response, "스토리지 업로드에 실패했습니다."),
    );
  }
}

// storage 업로드가 끝난 뒤 API metadata를 uploaded 상태로 전환한다.
async function completeProjectAssetUpload(
  projectId: string,
  fileId: string,
  fetcher: Fetcher,
) {
  const response = await fetcher(`/api/v1/projects/${projectId}/assets/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileId }),
  });

  if (!response.ok) {
    throw new ProjectAssetError(
      await readErrorMessage(response, "업로드 완료 처리를 하지 못했습니다."),
    );
  }

  return (await response.json()) as UploadedFile;
}

// byte 값을 화면에 맞는 짧은 단위로 변환한다.
export function formatAssetBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

// ORBIT-91 화면 전체 상태를 묶어 프로젝트 생성과 asset 업로드를 제공한다.
export function ProjectAssetWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<UploadedFile[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectTitle, setProjectTitle] = useState("새 발표 프로젝트");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState<FilePurpose>(defaultPurpose);
  const [isDragging, setIsDragging] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [lastUploaded, setLastUploaded] = useState<UploadedFile | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.projectId === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const validationMessage = selectedFile ? getAssetValidationMessage(selectedFile) : "";
  const isUploading = uploadPhase !== "idle";

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setAssets([]);
      return;
    }

    void refreshAssets(selectedProjectId);
  }, [selectedProjectId]);

  // 프로젝트 목록을 다시 가져오고 선택값이 없으면 첫 프로젝트를 선택한다.
  async function refreshProjects() {
    setIsLoadingProjects(true);
    setProjectError("");

    try {
      const nextProjects = await fetchProjects();
      setProjects(nextProjects);
      setSelectedProjectId((current) => current || nextProjects[0]?.projectId || "");
    } catch (error) {
      setProjectError(toErrorMessage(error));
    } finally {
      setIsLoadingProjects(false);
    }
  }

  // 선택된 프로젝트의 업로드 완료 asset 목록을 최신 상태로 맞춘다.
  async function refreshAssets(projectId: string) {
    setUploadError("");

    try {
      setAssets(await fetchProjectAssets(projectId));
    } catch (error) {
      setUploadError(toErrorMessage(error));
    }
  }

  // 프로젝트 생성 form submit을 API 호출로 연결한다.
  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isCreatingProject) return;

    setIsCreatingProject(true);
    setProjectError("");

    try {
      const project = await createProject(projectTitle);
      setProjects((current) => [...current, project]);
      setSelectedProjectId(project.projectId);
      setProjectTitle("새 발표 프로젝트");
    } catch (error) {
      setProjectError(toErrorMessage(error));
    } finally {
      setIsCreatingProject(false);
    }
  }

  // input이나 drop에서 넘어온 첫 파일을 선택 상태로 저장한다.
  function selectUploadFile(fileList: FileList | File[]) {
    const [file] = Array.from(fileList);

    setLastUploaded(null);
    setUploadError("");
    setSelectedFile(file ?? null);
  }

  // 파일 선택 input 변경을 공통 파일 선택 로직으로 넘긴다.
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      selectUploadFile(event.target.files);
    }

    event.target.value = "";
  }

  // 드래그된 파일을 drop zone에서 받아 선택 상태로 저장한다.
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectUploadFile(event.dataTransfer.files);
  }

  // 선택된 프로젝트와 파일로 upload-url 발급부터 complete까지 실행한다.
  async function handleUpload() {
    if (!selectedProjectId || !selectedFile || validationMessage || isUploading) {
      return;
    }

    setUploadError("");
    setLastUploaded(null);

    try {
      setUploadPhase("request-url");
      buildAssetUploadRequest(selectedFile, purpose);
      setUploadPhase("storage-put");
      const uploaded = await uploadProjectAsset(selectedProjectId, selectedFile, purpose);
      setUploadPhase("complete");
      setLastUploaded(uploaded);
      setSelectedFile(null);
      setAssets((current) => [...current, uploaded]);
    } catch (error) {
      setUploadError(toErrorMessage(error));
    } finally {
      setUploadPhase("idle");
    }
  }

  return (
    <main className="app-shell project-app-shell">
      <section className="project-topbar">
        <div>
          <p className="eyebrow">ORBIT-10</p>
          <h1>프로젝트와 파일</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void refreshProjects()}
          aria-label="프로젝트 목록 새로고침"
          title="프로젝트 목록 새로고침"
        >
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="project-workspace-grid">
        <article className="panel project-create-panel">
          <div className="project-panel-heading">
            <FolderPlus size={20} />
            <div>
              <p className="panel-kicker">workspace</p>
              <h2>프로젝트 생성</h2>
            </div>
          </div>

          <form className="project-form" onSubmit={handleCreateProject}>
            <label>
              <span>프로젝트 이름</span>
              <input
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                maxLength={120}
              />
            </label>
            <button className="primary-action" type="submit" disabled={isCreatingProject}>
              {isCreatingProject ? "생성 중..." : "프로젝트 생성"}
            </button>
          </form>

          {projectError && (
            <StatusMessage tone="danger" message={projectError} />
          )}

          <div className="project-list-heading">
            <strong>{isLoadingProjects ? "불러오는 중" : `${projects.length}개 프로젝트`}</strong>
            <span>{demoIds.workspaceId}</span>
          </div>

          {projects.length === 0 ? (
            <div className="project-empty-state">생성된 프로젝트가 없습니다.</div>
          ) : (
            <div className="project-list" aria-label="프로젝트 목록">
              {projects.map((project) => (
                <button
                  key={project.projectId}
                  className={project.projectId === selectedProjectId ? "active" : ""}
                  type="button"
                  onClick={() => setSelectedProjectId(project.projectId)}
                >
                  <span>{project.title}</span>
                  <small>{project.projectId}</small>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="panel project-upload-panel">
          <div className="project-panel-heading">
            <FileUp size={20} />
            <div>
              <p className="panel-kicker">asset upload</p>
              <h2>{selectedProject?.title ?? "프로젝트를 선택하세요"}</h2>
            </div>
          </div>

          <div className="project-meta-strip">
            <span>{selectedProject?.projectId ?? "project 없음"}</span>
            <span>{assets.length}개 파일</span>
          </div>

          <label
            className={`project-drop-zone${isDragging ? " is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept={assetAccept}
              disabled={!selectedProjectId || isUploading}
              onChange={handleFileChange}
            />
            <UploadCloud size={36} />
            <span>{selectedFile?.name ?? "파일 선택"}</span>
            <small>
              {selectedFile
                ? `${resolveAssetMimeType(selectedFile) ?? "unsupported"} · ${formatAssetBytes(selectedFile.size)}`
                : "PDF · PPTX · DOCX · JPG · PNG · WebP"}
            </small>
          </label>

          <div className="project-upload-controls">
            <label>
              <span>목적</span>
              <select
                value={purpose}
                onChange={(event) => setPurpose(event.target.value as FilePurpose)}
              >
                <option value="pptx-import">PPTX import</option>
                <option value="reference-material">Reference material</option>
              </select>
            </label>
            <button
              className="primary-action"
              type="button"
              disabled={!selectedProjectId || !selectedFile || !!validationMessage || isUploading}
              onClick={() => void handleUpload()}
            >
              {getUploadButtonText(uploadPhase)}
            </button>
          </div>

          {validationMessage && <StatusMessage tone="danger" message={validationMessage} />}
          {uploadError && <StatusMessage tone="danger" message={uploadError} />}
          {lastUploaded && (
            <StatusMessage
              tone="success"
              message={`${lastUploaded.originalName} 업로드 완료`}
            />
          )}

          <AssetList assets={assets} />
        </article>
      </section>
    </main>
  );
}

// tone에 맞는 아이콘과 함께 짧은 상태 메시지를 렌더링한다.
function StatusMessage(props: { message: string; tone: "danger" | "success" }) {
  const Icon = props.tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div className={`project-status-message project-status-${props.tone}`} role="status">
      <Icon size={18} />
      <span>{props.message}</span>
    </div>
  );
}

// 업로드된 asset metadata 목록을 파일명과 크기 중심으로 보여준다.
function AssetList(props: { assets: UploadedFile[] }) {
  if (props.assets.length === 0) {
    return <div className="project-empty-state">업로드된 파일이 없습니다.</div>;
  }

  return (
    <ul className="project-asset-list" aria-label="업로드된 파일">
      {props.assets.map((asset) => (
        <li key={asset.fileId}>
          <div>
            <strong>{asset.originalName}</strong>
            <span>
              {asset.purpose} · {formatAssetBytes(asset.size)}
            </span>
          </div>
          <small>{asset.fileId}</small>
        </li>
      ))}
    </ul>
  );
}

// 업로드 단계별로 버튼 문구를 짧게 바꾼다.
function getUploadButtonText(phase: UploadPhase) {
  if (phase === "request-url") return "URL 발급 중...";
  if (phase === "storage-put") return "파일 업로드 중...";
  if (phase === "complete") return "완료 처리 중...";
  return "업로드";
}

// unknown error를 화면에 표시 가능한 문자열로 정리한다.
function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
