import type {
  Project,
  ProjectAccessResponse,
  ProjectMemberRole,
} from "@orbit/shared";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import { OrbitStatus } from "../../design-system";
import {
  resolveEditorCapabilities,
  type EditorCapabilities,
} from "../editor/shell/editorCapabilities";
import "./project-access-context.css";

export type AcceptedProjectAccess = {
  capabilities: EditorCapabilities;
  project: Project;
  role: ProjectMemberRole;
};

const ProjectAccessContext = createContext<AcceptedProjectAccess | null>(null);

export function createAcceptedProjectAccess(
  response: ProjectAccessResponse,
): AcceptedProjectAccess | null {
  if (response.membership?.status !== "accepted") {
    return null;
  }

  return {
    capabilities: resolveEditorCapabilities(response.membership),
    project: response.project,
    role: response.membership.role,
  };
}

export function ProjectAccessProvider(props: {
  access: AcceptedProjectAccess | null;
  children: ReactNode;
}) {
  return (
    <ProjectAccessContext.Provider value={props.access}>
      {props.children}
    </ProjectAccessContext.Provider>
  );
}

export function useProjectAccess(expectedProjectId?: string) {
  const access = useContext(ProjectAccessContext);
  if (!access) {
    throw new Error("Accepted project access is required");
  }
  if (expectedProjectId && access.project.projectId !== expectedProjectId) {
    throw new Error("Project access context mismatch");
  }
  return access;
}

export function ProjectReadOnlyBanner() {
  return (
    <section
      aria-label="프로젝트 보기 전용 안내"
      className="orbit-project-read-only-banner"
      role="status"
    >
      <OrbitStatus tone="neutral">보기 전용</OrbitStatus>
      <div>
        <strong>보기 전용으로 열었습니다.</strong>
        <span>프로젝트 내용을 읽을 수 있지만 변경할 수 없습니다.</span>
      </div>
    </section>
  );
}
