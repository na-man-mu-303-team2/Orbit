import type { PresentationBrief } from "@orbit/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import {
  ProjectAccessProvider,
  createAcceptedProjectAccess,
} from "../projects/ProjectAccessContext";
import { PresentationBriefPage } from "./PresentationBriefPage";

const projectId = "project_brief_1";
const brief: PresentationBrief = {
  briefId: "brief_1",
  projectId,
  revision: 1,
  audience: "decision-maker",
  purpose: "persuade",
  evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
  targetDurationMinutes: 15,
  desiredOutcome: "예산 승인을 얻는다.",
  requirements: [
    {
      requirementId: "requirement_1",
      revision: 1,
      kind: "must-cover",
      text: "핵심 비용을 설명한다.",
      reviewStatus: "approved",
    },
  ],
  terminology: [],
  challengeTopics: ["도입 비용"],
  approvedReferences: [],
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

it("Viewer는 Brief를 읽지만 input과 저장 control은 받지 않는다", () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["presentation-brief", projectId], brief);
  queryClient.setQueryData(["evaluator-lenses"], [
    {
      ref: { lensId: "decision-maker", revision: 1 },
      label: "의사결정자",
      description: "의사결정 기준",
      priorityOrder: ["semantic", "structure", "timing", "delivery"],
    },
  ]);
  const access = createAcceptedProjectAccess({
    project: {
      projectId,
      workspaceId: "workspace_demo_1",
      title: "Brief 프로젝트",
      createdBy: "user_owner",
      createdAt: "2026-07-16T00:00:00.000Z",
    },
    membership: { role: "viewer", status: "accepted" },
  });

  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <ProjectAccessProvider access={access}>
        <PresentationBriefPage projectId={projectId} />
      </ProjectAccessProvider>
    </QueryClientProvider>,
  );

  expect(html).toContain("예산 승인을 얻는다.");
  expect(html).toContain("핵심 비용을 설명한다.");
  expect(html).toContain("보기 전용");
  expect(html).not.toContain("<input");
  expect(html).not.toContain("<textarea");
  expect(html).not.toContain("브리프 저장하고 계속");
});
