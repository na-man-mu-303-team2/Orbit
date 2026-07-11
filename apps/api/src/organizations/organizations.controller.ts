import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { OrganizationsService } from "./organizations.service";

@Controller("api/v1/organizations")
export class OrganizationsController {
  constructor(
    private readonly authService: AuthService,
    private readonly service: OrganizationsService
  ) {}

  @Get()
  async list(@Req() request: SignedCookieRequest) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.list(user.userId);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: SignedCookieRequest) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.create(user.userId, body);
  }

  @Post(":organizationId/members")
  async addMember(
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.addMember(organizationId, user.userId, body);
  }

  @Get(":organizationId/brand-kits")
  async listBrandKits(
    @Param("organizationId") organizationId: string,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.listBrandKits(organizationId, user.userId);
  }

  @Post(":organizationId/brand-kits")
  async createBrandKit(
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.createBrandKit(organizationId, user.userId, body);
  }

  @Patch(":organizationId/brand-kits/:brandKitId")
  async updateBrandKit(
    @Param("organizationId") organizationId: string,
    @Param("brandKitId") brandKitId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.updateBrandKit(organizationId, brandKitId, user.userId, body);
  }

  @Delete(":organizationId/brand-kits/:brandKitId")
  async deleteBrandKit(
    @Param("organizationId") organizationId: string,
    @Param("brandKitId") brandKitId: string,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.deleteBrandKit(organizationId, brandKitId, user.userId);
  }
}
