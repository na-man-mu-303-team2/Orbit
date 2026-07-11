import { randomUUID } from "node:crypto";
import {
  addOrganizationMemberRequestSchema,
  brandKitListResponseSchema,
  brandKitSchema,
  brandKitSnapshotSchema,
  createBrandKitRequestSchema,
  createOrganizationRequestSchema,
  organizationListResponseSchema,
  organizationSchema,
  updateBrandKitRequestSchema,
  type BrandKit,
  type BrandKitSnapshot,
  type GenerateDeckRequest,
  type OrganizationRole
} from "@orbit/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { BrandKitEntity } from "./brand-kit.entity";
import { OrganizationMemberEntity } from "./organization-member.entity";
import { OrganizationEntity } from "./organization.entity";

type UserRow = { user_id: string };
type BrandAssetRow = { file_id: string; mime_type: string };

export type ResolvedBrandKit = {
  request: GenerateDeckRequest;
  snapshot?: BrandKitSnapshot;
};

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(OrganizationEntity)
    private readonly organizations: Repository<OrganizationEntity>,
    @InjectRepository(OrganizationMemberEntity)
    private readonly members: Repository<OrganizationMemberEntity>,
    @InjectRepository(BrandKitEntity)
    private readonly brandKits: Repository<BrandKitEntity>
  ) {}

  async list(userId: string) {
    const memberships = await this.members.find({ where: { userId } });
    const ids = memberships.map((membership) => membership.organizationId);
    if (ids.length === 0) return { organizations: [] };
    const organizations = await this.organizations.find({
      where: { organizationId: In(ids) },
      order: { updatedAt: "DESC" }
    });
    const roles = new Map(
      memberships.map((membership) => [membership.organizationId, membership.role])
    );
    return organizationListResponseSchema.parse({
      organizations: organizations.map((organization) => ({
        ...toOrganizationDto(organization),
        role: roles.get(organization.organizationId)
      }))
    });
  }

  async create(userId: string, rawInput: unknown) {
    const input = createOrganizationRequestSchema.parse(rawInput);
    const now = new Date();
    const organization = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(OrganizationEntity, {
          organizationId: `organization_${randomUUID()}`,
          name: input.name,
          createdBy: userId,
          createdAt: now,
          updatedAt: now
        })
      );
      await manager.save(
        manager.create(OrganizationMemberEntity, {
          organizationId: saved.organizationId,
          userId,
          role: "admin",
          createdAt: now
        })
      );
      return saved;
    });
    return organizationSchema.parse(toOrganizationDto(organization));
  }

  async addMember(
    organizationId: string,
    requesterUserId: string,
    rawInput: unknown
  ) {
    await this.requireRole(organizationId, requesterUserId, "admin");
    const input = addOrganizationMemberRequestSchema.parse(rawInput);
    const users = await this.dataSource.query<UserRow[]>(
      `SELECT user_id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [input.email]
    );
    const user = users[0];
    if (!user) throw new NotFoundException(`User not found: ${input.email}`);
    const saved = await this.members.save(
      this.members.create({
        organizationId,
        userId: user.user_id,
        role: input.role,
        createdAt: new Date()
      })
    );
    return {
      organizationId: saved.organizationId,
      userId: saved.userId,
      role: saved.role,
      createdAt: saved.createdAt.toISOString()
    };
  }

  async listBrandKits(organizationId: string, userId: string) {
    await this.requireRole(organizationId, userId);
    const rows = await this.brandKits.find({
      where: { organizationId },
      order: { updatedAt: "DESC" }
    });
    return brandKitListResponseSchema.parse({ brandKits: rows.map(toBrandKitDto) });
  }

  async createBrandKit(
    organizationId: string,
    userId: string,
    rawInput: unknown
  ): Promise<BrandKit> {
    await this.requireRole(organizationId, userId, "admin");
    const input = createBrandKitRequestSchema.parse(rawInput);
    await this.assertBrandKitNameAvailable(organizationId, input.name);
    await this.assertBrandAssetsAccessible(input.values, userId);
    const now = new Date();
    const saved = await this.brandKits.save(
      this.brandKits.create({
        brandKitId: `brand_kit_${randomUUID()}`,
        organizationId,
        name: input.name,
        version: 1,
        values: input.values,
        createdAt: now,
        updatedAt: now
      })
    );
    this.logger.log({
      event: "brand-kit.created",
      organizationId,
      brandKitId: saved.brandKitId,
      userId
    });
    return toBrandKitDto(saved);
  }

  async updateBrandKit(
    organizationId: string,
    brandKitId: string,
    userId: string,
    rawInput: unknown
  ): Promise<BrandKit> {
    await this.requireRole(organizationId, userId, "admin");
    const input = updateBrandKitRequestSchema.parse(rawInput);
    const kit = await this.requireBrandKit(brandKitId);
    if (kit.organizationId !== organizationId) {
      throw new ForbiddenException("Brand Kit organization mismatch");
    }
    if (input.name && input.name !== kit.name) {
      await this.assertBrandKitNameAvailable(organizationId, input.name, brandKitId);
      kit.name = input.name;
    }
    if (input.values) {
      await this.assertBrandAssetsAccessible(input.values, userId);
      kit.values = input.values;
    }
    kit.version += 1;
    kit.updatedAt = new Date();
    const saved = await this.brandKits.save(kit);
    this.logger.log({
      event: "brand-kit.updated",
      organizationId,
      brandKitId,
      userId,
      version: saved.version
    });
    return toBrandKitDto(saved);
  }

  async deleteBrandKit(
    organizationId: string,
    brandKitId: string,
    userId: string
  ): Promise<{ id: string }> {
    await this.requireRole(organizationId, userId, "admin");
    const kit = await this.requireBrandKit(brandKitId);
    if (kit.organizationId !== organizationId) {
      throw new ForbiddenException("Brand Kit organization mismatch");
    }
    await this.brandKits.remove(kit);
    this.logger.log({
      event: "brand-kit.deleted",
      organizationId,
      brandKitId,
      userId
    });
    return { id: brandKitId };
  }

  async resolveGenerationRequest(
    request: GenerateDeckRequest,
    userId: string
  ): Promise<ResolvedBrandKit> {
    if (request.generationMode !== "design-pack" || !request.brandKit) {
      return { request };
    }
    const kit = await this.requireBrandKit(request.brandKit.id);
    await this.requireRole(kit.organizationId, userId);
    if (kit.version !== request.brandKit.version) {
      throw new ConflictException(
        `Brand Kit version mismatch: requested ${request.brandKit.version}, current ${kit.version}`
      );
    }
    const resolved = applyLockedBrandValues(request, kit);
    return {
      request: resolved,
      snapshot: brandKitSnapshotSchema.parse({
        id: kit.brandKitId,
        organizationId: kit.organizationId,
        name: kit.name,
        version: kit.version,
        values: kit.values
      })
    };
  }

  private async requireRole(
    organizationId: string,
    userId: string,
    required?: OrganizationRole
  ) {
    const membership = await this.members.findOne({
      where: { organizationId, userId }
    });
    if (!membership) throw new ForbiddenException("Organization membership required");
    if (required === "admin" && membership.role !== "admin") {
      throw new ForbiddenException("Organization admin permission required");
    }
    return membership;
  }

  private async requireBrandKit(brandKitId: string) {
    const kit = await this.brandKits.findOne({ where: { brandKitId } });
    if (!kit) throw new NotFoundException(`Brand Kit not found: ${brandKitId}`);
    return kit;
  }

  private async assertBrandKitNameAvailable(
    organizationId: string,
    name: string,
    exceptId?: string
  ) {
    const kits = await this.brandKits.find({ where: { organizationId } });
    if (
      kits.some(
        (kit) =>
          kit.brandKitId !== exceptId &&
          kit.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0
      )
    ) {
      throw new ConflictException(`Brand Kit name already exists: ${name}`);
    }
  }

  private async assertBrandAssetsAccessible(
    values: BrandKit["values"],
    userId: string
  ) {
    const assetIds = Array.from(
      new Set(
        [values.logoAssetId, ...values.approvedAssetIds].filter(
          (value): value is string => Boolean(value)
        )
      )
    );
    if (assetIds.length === 0) return;
    const rows = await this.dataSource.query<BrandAssetRow[]>(
      `
        SELECT assets.file_id, assets.mime_type
        FROM project_assets assets
        INNER JOIN project_members members
          ON members.project_id = assets.project_id
         AND members.user_id = $2
         AND members.status = 'accepted'
        WHERE assets.file_id = ANY($1::text[])
          AND assets.status = 'uploaded'
      `,
      [assetIds, userId]
    );
    if (rows.length !== assetIds.length) {
      throw new ForbiddenException("Brand Kit asset access denied");
    }
    const logo = rows.find((row) => row.file_id === values.logoAssetId);
    if (logo && !logo.mime_type.startsWith("image/")) {
      throw new BadRequestException("Brand Kit logo asset must be an image");
    }
  }
}

function applyLockedBrandValues(
  request: GenerateDeckRequest,
  kit: BrandKitEntity
): GenerateDeckRequest {
  const locked = new Set(kit.values.lockedFields);
  const design = { ...request.design };
  const metadata = { ...request.metadata };

  design.paletteOverride = replaceForbiddenColors(
    design.paletteOverride ?? {},
    kit.values.forbiddenColors,
    kit.values.palette
  );
  if (locked.has("palette")) design.paletteOverride = kit.values.palette;
  if (locked.has("tone")) metadata.tone = kit.values.tone;
  if (locked.has("mediaPolicy")) design.mediaPolicy = kit.values.mediaPolicy;
  if (locked.has("typography")) {
    const current = design.fontOverride;
    const currentMatchesBrand =
      current?.headingFontFamily === kit.values.typography.headingFontFamily &&
      current.bodyFontFamily === kit.values.typography.bodyFontFamily;
    design.fontOverride = {
      fontId: brandFontId(kit.values.typography.headingFontFamily),
      name: kit.values.typography.headingFontFamily,
      headingFontFamily: kit.values.typography.headingFontFamily,
      bodyFontFamily: kit.values.typography.bodyFontFamily,
      fallbackFamily: kit.values.typography.fallbackFamily,
      weights: current?.weights ?? [],
      supportsKorean: current?.supportsKorean ?? true,
      pptxEmbeddable: currentMatchesBrand && current.pptxEmbeddable,
      moodTags: current?.moodTags ?? [],
      license: current?.license ?? "",
      sourceUrl: current?.sourceUrl ?? "",
      recommendedTitleSize: current?.recommendedTitleSize ?? 48,
      recommendedBodySize: Math.max(18, current?.recommendedBodySize ?? 22),
      lineHeight: Math.max(1.2, current?.lineHeight ?? 1.24),
      widthFactor: current?.widthFactor ?? 1,
      overflowRisk: current?.overflowRisk ?? "medium"
    };
  }

  return {
    ...request,
    metadata,
    design,
    visualPlanPolicy: { mediaPolicy: design.mediaPolicy }
  };
}

function replaceForbiddenColors(
  palette: Record<string, string | undefined>,
  forbidden: string[],
  brandPalette: Record<string, string>
) {
  const forbiddenSet = new Set(forbidden.map((color) => color.toUpperCase()));
  return Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      color && forbiddenSet.has(color.toUpperCase())
        ? key === "accentColor"
          ? brandPalette.accentColor
          : brandPalette.primary
        : color
    ])
  );
}

function toOrganizationDto(entity: OrganizationEntity) {
  return {
    id: entity.organizationId,
    name: entity.name,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  };
}

function toBrandKitDto(entity: BrandKitEntity): BrandKit {
  return brandKitSchema.parse({
    id: entity.brandKitId,
    organizationId: entity.organizationId,
    name: entity.name,
    version: entity.version,
    values: entity.values,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  });
}

function brandFontId(font: string) {
  return font.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand-font";
}
