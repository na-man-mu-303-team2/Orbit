import { ForbiddenException } from "@nestjs/common";
import type { BrandKitValues, GenerateDeckRequest } from "@orbit/shared";
import type { DataSource, Repository } from "typeorm";
import { describe, expect, it } from "vitest";
import { BrandKitEntity } from "./brand-kit.entity";
import { OrganizationMemberEntity } from "./organization-member.entity";
import { OrganizationEntity } from "./organization.entity";
import { OrganizationsService } from "./organizations.service";

const values: BrandKitValues = {
  palette: {
    primary: "#123456",
    secondary: "#0F766E",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    muted: "#E0F2FE",
    border: "#BAE6FD",
    text: "#0F172A",
    accentColor: "#F472B6"
  },
  forbiddenColors: ["#FF0000"],
  typography: {
    headingFontFamily: "Pretendard",
    bodyFontFamily: "Pretendard",
    fallbackFamily: "Arial"
  },
  tone: "concise",
  mediaPolicy: "minimal",
  writingStyle: "",
  coverRules: "",
  footerRules: "",
  approvedAssetIds: [],
  lockedFields: ["palette", "typography", "tone", "mediaPolicy"]
};

function serviceFixture(
  role: "admin" | "member" = "member",
  assetRows: Array<{ file_id: string; mime_type: string }> = []
) {
  const membership: OrganizationMemberEntity = {
    organizationId: "organization_1",
    userId: "user_1",
    role,
    createdAt: new Date()
  };
  const kit: BrandKitEntity = {
    brandKitId: "brand_kit_1",
    organizationId: "organization_1",
    name: "ORBIT",
    version: 2,
    values,
    createdAt: new Date("2026-07-11T00:00:00.000Z"),
    updatedAt: new Date("2026-07-11T00:00:00.000Z")
  };
  const organizations = [] as OrganizationEntity[];
  const organizationRepository = repository(organizations);
  const memberRepository = repository([membership]);
  const brandKitRepository = repository([kit]);
  const dataSource = { query: async () => assetRows } as unknown as DataSource;
  return {
    kit,
    service: new OrganizationsService(
      dataSource,
      organizationRepository,
      memberRepository,
      brandKitRepository
    )
  };
}

describe("OrganizationsService Brand Kit", () => {
  it("lets members apply locked Brand Kit fields over session values", async () => {
    const { service } = serviceFixture("member");
    const request = baseRequest();

    const resolved = await service.resolveGenerationRequest(request, "user_1");

    expect(resolved.request.design.paletteOverride).toEqual(values.palette);
    expect(resolved.request.design.fontOverride?.headingFontFamily).toBe("Pretendard");
    expect(resolved.request.design.mediaPolicy).toBe("minimal");
    expect(resolved.request.metadata.tone).toBe("concise");
    expect(resolved.snapshot?.id).toBe("brand_kit_1");
  });

  it("blocks non-admin Brand Kit updates", async () => {
    const { service } = serviceFixture("member");

    await expect(
      service.updateBrandKit("organization_1", "brand_kit_1", "user_1", {
        name: "Changed"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects Brand Kit assets outside the admin's accessible projects", async () => {
    const { service } = serviceFixture("admin");

    await expect(
      service.updateBrandKit("organization_1", "brand_kit_1", "user_1", {
        values: { ...values, logoAssetId: "file_private" }
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accepts an uploaded image from an admin's accessible project", async () => {
    const { service } = serviceFixture("admin", [
      { file_id: "file_logo", mime_type: "image/png" }
    ]);

    await expect(
      service.updateBrandKit("organization_1", "brand_kit_1", "user_1", {
        values: { ...values, logoAssetId: "file_logo" }
      })
    ).resolves.toMatchObject({ values: { logoAssetId: "file_logo" } });
  });

  it("allows an admin to delete an organization Brand Kit", async () => {
    const { service } = serviceFixture("admin");

    await expect(
      service.deleteBrandKit("organization_1", "brand_kit_1", "user_1")
    ).resolves.toEqual({ id: "brand_kit_1" });
  });
});

function baseRequest(): GenerateDeckRequest {
  return {
    generationMode: "design-pack",
    topic: "Brand",
    brief: { referencePolicy: "topic-only" },
    targetDurationMinutes: 10,
    slideCountRange: { min: 5, max: 8 },
    template: "default",
    metadata: { audience: "general", purpose: "inform", tone: "friendly" },
    design: {
      engineVersion: "recipe-v1",
      visualRhythm: "clean",
      densityTarget: "medium",
      mediaPolicy: "ai-generated",
      layoutDiversity: "varied",
      paletteOverride: { primary: "#FF0000" }
    },
    brandKit: { id: "brand_kit_1", version: 2 },
    referenceFileIds: [],
    references: [],
    designReferences: [],
    referenceKeywords: [],
    referenceContext: []
  };
}

function repository<T extends object>(rows: T[]): Repository<T> {
  return {
    create: (input: Partial<T>) => input as T,
    save: async (input: T) => input,
    remove: async (input: T) => input,
    find: async () => rows,
    findOne: async ({ where }: { where: Partial<T> }) =>
      rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key as keyof T] === value)
      ) ?? null
  } as unknown as Repository<T>;
}
