import type { DataSource, EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import type { FilesService } from "../files/files.service";
import type { ProjectsService } from "../projects/projects.service";
import { PresentationBriefsService } from "./presentation-briefs.service";

const baseRequest = {
  expectedRevision: 0,
  origin: "ai-generation" as const,
  audience: "decision-maker" as const,
  purpose: "persuade" as const,
  evaluatorLensRef: { lensId: "decision-maker" as const, revision: 1 as const },
  targetDurationMinutes: 10,
  desiredOutcome: "예산 승인을 얻는다.",
  requirements: [
    {
      kind: "must-cover" as const,
      text: "ROI를 설명한다.",
      reviewStatus: "approved" as const,
    },
  ],
  terminology: [],
  challengeTopics: ["비용"],
  approvedReferenceFileIds: [],
};

describe("PresentationBriefsService", () => {
  it("creates, reads, and idempotently returns an equivalent stale retry", async () => {
    const fixture = createFixture();
    const created = await fixture.service.put("project_1", "editor_1", baseRequest);
    const read = await fixture.service.get("project_1", "viewer_1");
    const retried = await fixture.service.put("project_1", "editor_1", baseRequest);

    expect(created.brief.revision).toBe(1);
    expect(created.brief.origin).toBe("ai-generation");
    expect(created.brief.requirements[0]?.revision).toBe(1);
    expect(read.brief?.briefId).toBe(created.brief.briefId);
    expect(retried.brief).toEqual(created.brief);
    expect(fixture.projects.assertCanWriteProject).toHaveBeenCalledWith(
      "project_1",
      "editor_1",
    );
    expect(fixture.projects.assertCanReadProject).toHaveBeenCalledWith(
      "project_1",
      "viewer_1",
    );
  });

  it("returns a bounded revision conflict without replacing current content", async () => {
    const fixture = createFixture();
    await fixture.service.put("project_1", "editor_1", baseRequest);

    await expect(
      fixture.service.put("project_1", "editor_1", {
        ...baseRequest,
        desiredOutcome: "다른 결과",
      }),
    ).rejects.toMatchObject({ response: { code: "REVISION_CONFLICT", currentRevision: 1 } });
    expect(fixture.state.row?.content_json.desiredOutcome).toBe("예산 승인을 얻는다.");
  });

  it("keeps the creation origin immutable", async () => {
    const fixture = createFixture();
    const created = await fixture.service.put("project_1", "editor_1", baseRequest);

    await expect(
      fixture.service.put("project_1", "editor_1", {
        ...baseRequest,
        expectedRevision: created.brief.revision,
        origin: "manual",
      }),
    ).rejects.toThrow("Brief origin cannot be changed.");
    expect(fixture.state.row?.content_json.origin).toBe("ai-generation");
  });
});

function createFixture() {
  const state: {
    row: null | {
      brief_id: string;
      project_id: string;
      revision: number;
      content_json: Record<string, unknown>;
      created_at: Date;
      updated_at: Date;
    };
  } = { row: null };

  const manager = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("SELECT * FROM presentation_briefs")) {
        return state.row ? [state.row] : [];
      }
      if (sql.includes("SELECT file_id, file_content_hash")) return [];
      if (sql.includes("INSERT INTO presentation_briefs")) {
        const [briefId, projectId, revision, content, , now] = params;
        state.row = {
          brief_id: String(briefId),
          project_id: String(projectId),
          revision: Number(revision),
          content_json: content as Record<string, unknown>,
          created_at: state.row?.created_at ?? (now as Date),
          updated_at: now as Date,
        };
        return [];
      }
      if (sql.includes("DELETE FROM presentation_brief_approved_references")) return [];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: vi.fn(async (work: (value: EntityManager) => unknown) => work(manager)),
  } as unknown as DataSource;
  const projects = {
    assertCanReadProject: vi.fn(async () => ({ projectId: "project_1" })),
    assertCanWriteProject: vi.fn(async () => ({ projectId: "project_1" })),
  };
  const service = new PresentationBriefsService(
    dataSource,
    projects as unknown as ProjectsService,
    {} as FilesService,
  );
  return { service, state, projects };
}
