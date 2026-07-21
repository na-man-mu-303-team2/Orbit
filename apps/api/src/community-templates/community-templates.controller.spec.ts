import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "../auth/auth.service";
import {
  CommunityTemplatesController,
  WorkspaceCommunityTemplatesController,
} from "./community-templates.controller";
import { CommunityTemplateRateLimitService } from "./community-template-rate-limit.service";
import { CommunityTemplatesService } from "./community-templates.service";

function createControllers() {
  const service = {
    list: vi.fn(),
    listRecent: vi.fn(),
    listSources: vi.fn(),
    publish: vi.fn(),
    use: vi.fn(),
  } as unknown as CommunityTemplatesService;
  const auth = {
    me: vi.fn(async () => ({ user: { userId: "user_1" } })),
  } as unknown as AuthService;
  const rateLimit = {
    consume: vi.fn(async () => undefined),
  } as unknown as CommunityTemplateRateLimitService;
  return {
    auth,
    publicController: new CommunityTemplatesController(
      auth,
      service,
      rateLimit,
    ),
    rateLimit,
    service,
    workspaceController: new WorkspaceCommunityTemplatesController(
      auth,
      service,
      rateLimit,
    ),
  };
}

const authenticatedRequest = {
  signedCookies: { orbit_session: "session_signed" },
} as never;

describe("community template controllers", () => {
  it("requires a signed session for every endpoint", async () => {
    const { publicController, workspaceController } = createControllers();

    const requests = [
      publicController.list({}, {} as never),
      publicController.recent({} as never),
      workspaceController.sources("workspace_demo_1", {} as never),
      workspaceController.publish("workspace_demo_1", {}, {} as never),
      workspaceController.use(
        "workspace_demo_1",
        "community_template_seed",
        {},
        {} as never,
      ),
    ];

    for (const request of requests) {
      await expect(request).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it("rejects client-provided snapshot and source version fields", async () => {
    const { service, workspaceController } = createControllers();

    await expect(
      workspaceController.publish(
        "workspace_demo_1",
        {
          sourceProjectId: "project_demo_1",
          title: "템플릿",
          category: "education",
          rightsConfirmed: true,
          snapshot: {},
          sourceDeckVersion: 9,
        },
        authenticatedRequest,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.publish).not.toHaveBeenCalled();
  });

  it("validates pagination and UUID idempotency input with Zod", async () => {
    const { publicController, service, workspaceController } =
      createControllers();

    await expect(
      publicController.list({ limit: "49" }, authenticatedRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      workspaceController.use(
        "workspace_demo_1",
        "community_template_seed",
        { clientRequestId: "retry-1" },
        authenticatedRequest,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.use).not.toHaveBeenCalled();
  });
});
