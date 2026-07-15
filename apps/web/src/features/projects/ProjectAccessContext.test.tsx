import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ProjectAccessProvider,
  ProjectReadOnlyBanner,
  createAcceptedProjectAccess,
  useProjectAccess,
} from "./ProjectAccessContext";

const response = {
  project: {
    projectId: "project_1",
    workspaceId: "workspace_demo_1",
    title: "신뢰 경계",
    createdBy: "user_owner",
    createdAt: "2026-07-16T00:00:00.000Z",
  },
  membership: { role: "viewer" as const, status: "accepted" as const },
};

function AccessProbe() {
  const access = useProjectAccess();
  return <span>{`${access.role}:${String(access.capabilities.canMutateDeck)}`}</span>;
}

describe("ProjectAccessContext", () => {
  it("accepted membership과 capability를 project-bound context로 전달한다", () => {
    const access = createAcceptedProjectAccess(response);
    const html = renderToStaticMarkup(
      <ProjectAccessProvider access={access}>
        <AccessProbe />
      </ProjectAccessProvider>,
    );

    expect(html).toContain("viewer:false");
  });

  it("viewer에게 공통 read-only 이유 banner를 제공한다", () => {
    const html = renderToStaticMarkup(<ProjectReadOnlyBanner />);

    expect(html).toContain("보기 전용");
    expect(html).toContain("프로젝트 내용을 읽을 수 있지만 변경할 수 없습니다");
    expect(html).toContain('role="status"');
  });
});
