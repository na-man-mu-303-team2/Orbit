import { createDemoDeck } from "@orbit/editor-core";
import { demoIds, type Deck, type Project } from "@orbit/shared";
import { LayoutTemplate, Plus, Presentation, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { createProject, fetchProjects } from "./ProjectAssetWorkspace";

const templates = [
  { id: "pitch", title: "피치덱", tone: "blue" },
  { id: "lesson", title: "수업 자료", tone: "yellow" },
  { id: "report", title: "보고서", tone: "rose" },
  { id: "workshop", title: "워크숍", tone: "gray" },
];

export function ProjectGallery(props: { onOpenEditor: (projectId: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshProjects();
  }, []);

  async function refreshProjects() {
    setIsLoading(true);
    setError("");

    try {
      const nextProjects = await fetchProjects();
      setProjects(nextProjects);
      setSelectedProjectId((current) => current || nextProjects[0]?.projectId || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로젝트를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function createBlankProject() {
    if (isCreating) return;

    setIsCreating(true);
    setError("");

    try {
      const project = await createProject("새 프레젠테이션");
      await saveInitialDeck(project);
      setProjects((current) => [project, ...current]);
      setSelectedProjectId(project.projectId);
      props.onOpenEditor(project.projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로젝트를 만들지 못했습니다.");
    } finally {
      setIsCreating(false);
    }
  }

  async function openProject(project: Project) {
    setSelectedProjectId(project.projectId);
    setError("");

    try {
      await ensureProjectDeck(project);
      props.onOpenEditor(project.projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로젝트를 열지 못했습니다.");
    }
  }

  async function ensureProjectDeck(project: Project) {
    const response = await fetch(`/api/v1/projects/${project.projectId}/deck`);
    if (response.ok) return;

    if (response.status === 404) {
      await saveInitialDeck(project);
      return;
    }

    throw new Error((await response.text()) || "덱을 불러오지 못했습니다.");
  }

  async function saveInitialDeck(project: Project) {
    const demoDeck = createDemoDeck();
    const deck: Deck = {
      ...demoDeck,
      deckId: `deck_${crypto.randomUUID()}`,
      projectId: project.projectId,
      title: project.title,
      version: 1,
      metadata: {
        ...demoDeck.metadata
      },
    };

    const response = await fetch(`/api/v1/projects/${project.projectId}/deck`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deck,
        snapshotReason: "deck-replaced",
      }),
    });

    if (!response.ok) {
      throw new Error((await response.text()) || "덱을 저장하지 못했습니다.");
    }
  }

  return (
    <main className="app-shell project-app-shell project-gallery-shell">
      <section className="project-gallery-topbar">
        <div>
          <p className="eyebrow">작업 공간</p>
          <h1>프로젝트 불러오기</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void refreshProjects()}
          aria-label="프로젝트 새로고침"
          title="프로젝트 새로고침"
        >
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="template-strip" aria-label="템플릿">
        <button
          className="template-card template-new"
          type="button"
          onClick={() => void createBlankProject()}
          disabled={isCreating}
        >
          <span className="template-plus">
            <Plus size={34} />
          </span>
          <strong>{isCreating ? "생성 중..." : "새 프레젠테이션"}</strong>
        </button>

        {templates.map((template) => (
          <button className="template-card" key={template.id} type="button">
            <span className={`template-preview template-${template.tone}`}>
              <LayoutTemplate size={24} />
            </span>
            <strong>{template.title}</strong>
          </button>
        ))}
      </section>

      {error && (
        <div className="project-status-message project-status-danger" role="status">
          <span>{error}</span>
        </div>
      )}

      <section className="recent-projects-section">
        <div className="recent-projects-heading">
          <h2>이전 작업물</h2>
          <span>{isLoading ? "불러오는 중" : `${projects.length}개`}</span>
        </div>

        {projects.length === 0 ? (
          <div className="project-empty-state">
            아직 생성된 프로젝트가 없습니다. {demoIds.workspaceId}
          </div>
        ) : (
          <div className="recent-project-grid" aria-label="이전 작업물">
            {projects.map((project) => (
              <button
                className={`recent-project-card ${
                  project.projectId === selectedProjectId ? "active" : ""
                }`}
                key={project.projectId}
                type="button"
                onClick={() => void openProject(project)}
              >
                <span className="recent-project-thumb">
                  <Presentation size={30} />
                </span>
                <strong>{project.title}</strong>
                <small>{project.projectId}</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
