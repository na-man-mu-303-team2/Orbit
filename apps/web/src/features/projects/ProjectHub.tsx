import type { Project, ProjectListItem } from "@orbit/shared";
import { useQuery } from "@tanstack/react-query";
import {
  IconAdjustmentsHorizontal,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconEye,
  IconFileUpload,
  IconHeartFilled,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { WorkspaceContainer } from "../../components/patterns";
import {
  OrbitButton,
  OrbitFailureState,
  OrbitIconButton,
  OrbitInput,
  OrbitSelect,
} from "../../components/ui";
import "../../styles/tokens.css";
import { uploadAndImportPptxTemplate } from "../editor/shell/api/editorJobApi";
import {
  getPptxImportValidationMessage,
  pptxImportAccept,
} from "../editor/shell/utils/editorFileValidation";
import {
  createProject,
  createProjectWithoutDeck,
  deleteProject,
  fetchProjects,
  updateProjectPin,
  updateProjectTags,
} from "./ProjectAssetWorkspace";
import { WorkspaceProjectCard } from "./WorkspaceProjectCard";
import "./workspace-home.css";

const ProjectSlidePreview = lazy(() => import("./ProjectSlidePreview"));

type ProjectHubProps = {
  onNavigate: (path: string) => void;
};

type ProjectFilter = "all" | "presentation" | "draft" | "pinned";
type ProjectSort = "newest" | "oldest" | "title";
const defaultProjectTags = ["중요", "완료"] as const;
const maxProjectTags = 12;
const maxTagLength = 20;
const projectFilters: ReadonlyArray<{ id: ProjectFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "presentation", label: "발표자료" },
  { id: "draft", label: "초안" },
  { id: "pinned", label: "즐겨찾기" },
];
const communityAuthors = ["이지윤", "스투키 스튜디오", "김하늘", "패키지랩", "브랜드인사이트"];
const communityStats = [
  { likes: "196", views: "13.5k" },
  { likes: "195", views: "8.6k" },
  { likes: "340", views: "16.9k" },
  { likes: "525", views: "36.0k" },
  { likes: "271", views: "11.4k" },
];

export function OrbitWorkspaceHome(props: ProjectHubProps & { userName?: string }) {
  const projects = useProjectList();
  const communityTrackRef = useRef<HTMLDivElement>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [sort, setSort] = useState<ProjectSort>("newest");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [tagEditorProject, setTagEditorProject] = useState<ProjectListItem | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [tagError, setTagError] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [pptxImportPhase, setPptxImportPhase] = useState<"idle" | "uploading" | "importing">("idle");
  const [actionError, setActionError] = useState("");
  const isImportingPptx = pptxImportPhase !== "idle";

  const sortedProjects = useMemo(
    () => sortProjects(projects.data ?? [], sort),
    [projects.data, sort],
  );
  const communityProjects = useMemo(
    () => sortProjects(projects.data ?? [], "newest").slice(0, 5),
    [projects.data],
  );
  const availableTags = useMemo(() => {
    const tags = new Set<string>(defaultProjectTags);
    projects.data?.forEach((project) => project.tags.forEach((tag) => tags.add(tag)));
    return [...tags];
  }, [projects.data]);
  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    return sortedProjects.filter((project) => {
      if (!project.title.toLocaleLowerCase("ko-KR").includes(normalizedQuery)) return false;
      if (!selectedTags.every((tag) => project.tags.includes(tag))) return false;
      if (filter === "pinned") return project.isPinned;
      if (filter === "draft") return isDraftProject(project);
      if (filter === "presentation") return !isDraftProject(project);
      return true;
    });
  }, [filter, query, selectedTags, sortedProjects]);
  const visibleProjects = filteredProjects.slice(0, visibleCount);

  useEffect(() => setVisibleCount(8), [filter, query, selectedTags, sort]);

  async function createBlankProject() {
    if (isCreating || isImportingPptx) return;
    setIsCreating(true);
    setActionError("");
    try {
      const project = await createProject("새 프레젠테이션");
      await projects.refetch();
      props.onNavigate(projectPath(project));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "프로젝트를 만들지 못했습니다.");
    } finally {
      setIsCreating(false);
    }
  }

  async function importPptxProject(file: File) {
    const validationMessage = getPptxImportValidationMessage(file);
    if (validationMessage) {
      setActionError(validationMessage);
      return;
    }

    let project: Project | null = null;
    setActionError("");
    setPptxImportPhase("uploading");
    try {
      project = await createProjectWithoutDeck(projectTitleFromFile(file.name));
      await uploadAndImportPptxTemplate(project.projectId, file, { onPhase: setPptxImportPhase });
      await projects.refetch();
      props.onNavigate(projectPath(project));
    } catch (cause) {
      if (project) {
        try {
          await deleteProject(project.projectId);
          await projects.refetch();
        } catch {
          // Keep the original import error because it is more actionable.
        }
      }
      setActionError(cause instanceof Error ? cause.message : "PPTX를 가져오지 못했습니다.");
    } finally {
      setPptxImportPhase("idle");
    }
  }

  async function togglePinnedProject(project: ProjectListItem) {
    if (pinningId) return;
    setPinningId(project.projectId);
    setActionError("");
    try {
      await updateProjectPin(project.projectId, !project.isPinned);
      await projects.refetch();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "프로젝트 고정 상태를 변경하지 못했습니다.");
    } finally {
      setPinningId(null);
    }
  }

  async function removeProject(project: Project) {
    if (deletingId || !window.confirm(`“${project.title}” 프로젝트를 삭제할까요?`)) return;
    setDeletingId(project.projectId);
    setActionError("");
    try {
      await deleteProject(project.projectId);
      await projects.refetch();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "프로젝트를 삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  function openTagEditor(project: ProjectListItem) {
    setTagEditorProject(project);
    setTagDraft(project.tags);
    setNewTag("");
    setTagError("");
  }

  function toggleTagDraft(tag: string) {
    setTagError("");
    setTagDraft((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, maxProjectTags),
    );
  }

  function addCustomTag() {
    const tag = newTag.trim();
    if (!tag) return;
    if (tag.length > maxTagLength) {
      setTagError(`태그는 ${maxTagLength}자 이하로 입력해 주세요.`);
      return;
    }
    if (tagDraft.includes(tag)) {
      setNewTag("");
      return;
    }
    if (tagDraft.length >= maxProjectTags) {
      setTagError(`태그는 최대 ${maxProjectTags}개까지 추가할 수 있습니다.`);
      return;
    }
    setTagDraft((current) => [...current, tag]);
    setNewTag("");
    setTagError("");
  }

  function handleTagInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCustomTag();
  }

  async function saveProjectTags() {
    if (!tagEditorProject || tagSaving) return;
    setTagSaving(true);
    setTagError("");
    try {
      await updateProjectTags(tagEditorProject.projectId, tagDraft);
      await projects.refetch();
      setTagEditorProject(null);
    } catch (cause) {
      setTagError(cause instanceof Error ? cause.message : "프로젝트 태그를 저장하지 못했습니다.");
    } finally {
      setTagSaving(false);
    }
  }

  function handlePptxChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void importPptxProject(file);
  }

  function scrollCommunity(direction: -1 | 1) {
    communityTrackRef.current?.scrollBy({
      behavior: "smooth",
      left: direction * Math.max(320, communityTrackRef.current.clientWidth * 0.7),
    });
  }

  return (
    <main className="workspace-home">
      <section className="workspace-community-band">
        <WorkspaceContainer as="div" className="workspace-community" width="content">
          <div className="workspace-community-layout">
            <header className="workspace-community-intro">
              <div>
                <p className="workspace-section-kicker">COMMUNITY</p>
                <h1>커뮤니티</h1>
                <p>새로운 발표를 발견하세요</p>
              </div>
              <OrbitIconButton aria-label="다음 커뮤니티 프로젝트" className="workspace-community-intro-arrow" onClick={() => scrollCommunity(1)}>
                <IconArrowRight aria-hidden="true" size={19} />
              </OrbitIconButton>
            </header>

            <div className="workspace-community-carousel">
              <div className="workspace-community-track" ref={communityTrackRef}>
                {communityProjects.map((project, index) => {
                  const authorIndex = index % communityAuthors.length;
                  const stat = communityStats[authorIndex];
                  return (
                    <button
                      className={`workspace-community-card${index === 0 ? " is-featured" : ""}`}
                      key={project.projectId}
                      onClick={() => props.onNavigate(projectPath(project))}
                      type="button"
                    >
                      <span className="workspace-community-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="workspace-community-preview">
                        <span className="workspace-community-preview-fallback"><IconSparkles aria-hidden="true" size={28} stroke={1.5} /></span>
                        <Suspense fallback={null}>
                          <ProjectSlidePreview className="workspace-community-preview-canvas" projectId={project.projectId} />
                        </Suspense>
                      </span>
                      <span className="workspace-community-meta">
                        <strong>{project.title}</strong>
                        <small>{communityAuthors[authorIndex]}</small>
                        <span className="workspace-community-stats">
                          <span><IconEye aria-hidden="true" size={13} />{stat.views}</span>
                          <span><IconHeartFilled aria-hidden="true" size={12} />{stat.likes}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <OrbitIconButton aria-label="다음 커뮤니티 프로젝트" className="workspace-community-arrow" onClick={() => scrollCommunity(1)}>
                <IconArrowRight aria-hidden="true" size={18} />
              </OrbitIconButton>
            </div>
          </div>
        </WorkspaceContainer>
      </section>

      <WorkspaceContainer as="section" className="workspace-projects" id="workspace-projects" width="content">
        <header className="workspace-projects-heading">
          <div>
            <p className="workspace-section-kicker">YOUR WORKSPACE</p>
            <h2>내 프로젝트</h2>
          </div>
          <div className="workspace-project-actions">
            <OrbitButton icon={<IconSparkles aria-hidden="true" size={17} />} onClick={() => props.onNavigate("/createdeck")}>AI 발표자료 만들기</OrbitButton>
            <OrbitButton icon={<IconPlus aria-hidden="true" size={17} />} loading={isCreating} onClick={() => void createBlankProject()} variant="secondary">빈 프로젝트</OrbitButton>
            <OrbitButton icon={<IconFileUpload aria-hidden="true" size={17} />} loading={isImportingPptx} onClick={() => pptxInputRef.current?.click()} variant="secondary">PPTX 업로드</OrbitButton>
            <input accept={pptxImportAccept} className="workspace-home-file-input" disabled={isImportingPptx} onChange={handlePptxChange} ref={pptxInputRef} type="file" />
          </div>
          <label className="workspace-project-search">
            <IconSearch aria-hidden="true" size={18} />
            <OrbitInput aria-label="내 프로젝트 검색" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="내 프로젝트 검색" type="search" value={query} />
            <kbd>⌘K</kbd>
          </label>
          <OrbitSelect aria-label="프로젝트 정렬" onChange={(event) => setSort(event.currentTarget.value as ProjectSort)} value={sort}>
            <option value="newest">최신순</option>
            <option value="oldest">오래된 순</option>
            <option value="title">이름순</option>
          </OrbitSelect>
          <div className="workspace-tag-filter-wrap">
            <OrbitButton
              aria-expanded={isTagFilterOpen}
              icon={<IconAdjustmentsHorizontal aria-hidden="true" size={17} />}
              onClick={() => setIsTagFilterOpen((current) => !current)}
              variant={selectedTags.length ? "primary" : "secondary"}
            >
              태그 {selectedTags.length ? selectedTags.length : "필터"}
              <IconChevronDown aria-hidden="true" size={15} />
            </OrbitButton>
            {isTagFilterOpen ? (
              <div className="workspace-tag-filter-popover" role="dialog" aria-label="태그 필터">
                <div className="workspace-tag-filter-title"><strong>태그 필터</strong><button onClick={() => setSelectedTags([])} type="button">초기화</button></div>
                <div className="workspace-tag-filter-group">
                  <span>기본 태그</span>
                  {defaultProjectTags.map((tag) => <TagFilterOption key={tag} selected={selectedTags.includes(tag)} tag={tag} onToggle={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />)}
                </div>
                {availableTags.some((tag) => !defaultProjectTags.includes(tag as (typeof defaultProjectTags)[number])) ? (
                  <div className="workspace-tag-filter-group">
                    <span>커스텀 태그</span>
                    {availableTags.filter((tag) => !defaultProjectTags.includes(tag as (typeof defaultProjectTags)[number])).map((tag) => <TagFilterOption key={tag} selected={selectedTags.includes(tag)} tag={tag} onToggle={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />)}
                  </div>
                ) : null}
                <button className="workspace-tag-filter-add" disabled={!sortedProjects.length} onClick={() => { const firstProject = sortedProjects[0]; if (firstProject) { setIsTagFilterOpen(false); openTagEditor(firstProject); } }} type="button"><IconPlus aria-hidden="true" size={16} />새 태그</button>
              </div>
            ) : null}
          </div>
        </header>

        <div className="workspace-filter-row">
          <div aria-label="프로젝트 필터" className="workspace-project-filters" role="tablist">
            {projectFilters.map((item) => (
              <button aria-selected={filter === item.id} className={filter === item.id ? "is-active" : ""} key={item.id} onClick={() => setFilter(item.id)} role="tab" type="button">{item.label}</button>
            ))}
          </div>
          {selectedTags.length ? (
            <div className="workspace-active-tags" aria-label="적용된 태그 필터">
              {selectedTags.map((tag) => <button key={tag} onClick={() => setSelectedTags((current) => current.filter((item) => item !== tag))} type="button">#{tag}<IconX aria-hidden="true" size={12} /></button>)}
            </div>
          ) : null}
        </div>

        {actionError ? <p className="workspace-home-action-error" role="alert">{actionError}</p> : null}

        {projects.isLoading ? (
          <p className="workspace-home-state" role="status">프로젝트를 불러오는 중입니다.</p>
        ) : projects.isError ? (
          <OrbitFailureState className="workspace-home-state" description="프로젝트 목록을 가져오는 중 연결 문제가 발생했습니다." onRetry={() => void projects.refetch()} recommendedAction="인터넷 연결을 확인한 뒤 목록을 다시 불러오세요." retryLabel="목록 다시 불러오기" title="프로젝트를 불러오지 못했습니다." />
        ) : (
          <>
            <div className="workspace-home-grid">
              {visibleProjects.map((project) => (
                <WorkspaceProjectCard
                  createdAtLabel={formatProjectDate(project)}
                  deleting={deletingId === project.projectId}
                  isPinned={project.isPinned}
                  key={project.projectId}
                  onDelete={() => void removeProject(project)}
                  onManageTags={() => openTagEditor(project)}
                  onOpen={() => props.onNavigate(projectPath(project))}
                  onRehearse={() => props.onNavigate(`/rehearsal/${encodeURIComponent(project.projectId)}`)}
                  onReport={() => props.onNavigate(`/reports/${encodeURIComponent(project.projectId)}`)}
                  onTogglePinned={() => void togglePinnedProject(project)}
                  pinning={pinningId === project.projectId}
                  project={project}
                />
              ))}
            </div>
            {filteredProjects.length === 0 ? (
              <div className="workspace-home-empty">
                <IconSearch aria-hidden="true" size={26} stroke={1.5} />
                <strong>조건에 맞는 프로젝트가 없습니다.</strong>
                <button onClick={() => { setQuery(""); setFilter("all"); setSelectedTags([]); }} type="button">필터 초기화</button>
              </div>
            ) : null}
            {visibleCount < filteredProjects.length ? (
              <button className="workspace-home-load-more" onClick={() => setVisibleCount((current) => current + 8)} type="button">더 많은 프로젝트 불러오기<IconArrowRight aria-hidden="true" size={15} /></button>
            ) : null}
          </>
        )}
      </WorkspaceContainer>

      {tagEditorProject ? (
        <div className="workspace-tag-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !tagSaving) setTagEditorProject(null); }}>
          <section aria-labelledby="workspace-tag-modal-title" aria-modal="true" className="workspace-tag-modal" role="dialog">
            <header>
              <span className="workspace-tag-modal-icon"><IconTag aria-hidden="true" size={19} /></span>
              <div><p>PROJECT TAGS</p><h3 id="workspace-tag-modal-title">태그 편집</h3></div>
              <OrbitIconButton aria-label="태그 편집 닫기" disabled={tagSaving} onClick={() => setTagEditorProject(null)}><IconX aria-hidden="true" size={18} /></OrbitIconButton>
            </header>
            <p className="workspace-tag-modal-description">“{tagEditorProject.title}”를 찾기 쉽게 분류해 보세요.</p>
            <div className="workspace-tag-preset-group">
              <span>기본 태그</span>
              <div className="workspace-tag-chip-list">
                {defaultProjectTags.map((tag) => <button className={tagDraft.includes(tag) ? "workspace-tag-chip is-selected" : "workspace-tag-chip"} key={tag} onClick={() => toggleTagDraft(tag)} type="button">{tagDraft.includes(tag) ? <IconCheck aria-hidden="true" size={13} /> : null}{tag}</button>)}
              </div>
            </div>
            {availableTags.some((tag) => !defaultProjectTags.includes(tag as (typeof defaultProjectTags)[number])) ? (
              <div className="workspace-tag-preset-group">
                <span>내 태그</span>
                <div className="workspace-tag-chip-list">
                  {availableTags.filter((tag) => !defaultProjectTags.includes(tag as (typeof defaultProjectTags)[number])).map((tag) => <button className={tagDraft.includes(tag) ? "workspace-tag-chip is-selected" : "workspace-tag-chip"} key={tag} onClick={() => toggleTagDraft(tag)} type="button">{tagDraft.includes(tag) ? <IconCheck aria-hidden="true" size={13} /> : null}{tag}</button>)}
                </div>
              </div>
            ) : null}
            <label className="workspace-tag-input-label">
              <span>새 태그 추가</span>
              <span className="workspace-tag-input-row">
                <OrbitInput maxLength={maxTagLength} onChange={(event) => setNewTag(event.currentTarget.value)} onKeyDown={handleTagInputKeyDown} placeholder="예: 포트폴리오" value={newTag} />
                <OrbitButton disabled={!newTag.trim() || tagDraft.length >= maxProjectTags} icon={<IconPlus aria-hidden="true" size={16} />} onClick={addCustomTag} variant="secondary">추가</OrbitButton>
              </span>
            </label>
            {tagError ? <p className="workspace-tag-error" role="alert">{tagError}</p> : null}
            <footer>
              <span>{tagDraft.length} / {maxProjectTags}</span>
              <div><OrbitButton disabled={tagSaving} onClick={() => setTagEditorProject(null)} variant="secondary">취소</OrbitButton><OrbitButton loading={tagSaving} onClick={() => void saveProjectTags()}>저장</OrbitButton></div>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function useProjectList() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
    refetchInterval: (query) => query.state.data?.some((project) => project.generation) ? 2500 : false,
    retry: false,
  });
}

function sortProjects<T extends Project>(projects: T[], sort: ProjectSort): T[] {
  return [...projects].sort((left, right) => {
    if (sort === "title") return left.title.localeCompare(right.title, "ko-KR");
    const difference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return sort === "newest" ? difference : -difference;
  });
}

function isDraftProject(project: Project) {
  return /초안|새 프레젠테이션/i.test(project.title);
}

function formatProjectDate(project: Project) {
  const date = new Date(project.createdAt);
  return Number.isNaN(date.getTime()) ? "날짜 없음" : date.toLocaleDateString("ko-KR");
}

function projectTitleFromFile(fileName: string) {
  return fileName.replace(/\.pptx$/i, "").trim() || "PPTX 프로젝트";
}

function projectPath(project: Project) {
  return `/project/${encodeURIComponent(project.projectId)}`;
}

function TagFilterOption(props: { onToggle: () => void; selected: boolean; tag: string }) {
  return (
    <button aria-pressed={props.selected} className="workspace-tag-filter-option" onClick={props.onToggle} type="button">
      <span className="workspace-tag-filter-check">{props.selected ? <IconCheck aria-hidden="true" size={12} /> : null}</span>
      <span className={props.tag === "중요" ? "is-important" : props.tag === "완료" ? "is-complete" : ""}>{props.tag}</span>
    </button>
  );
}
