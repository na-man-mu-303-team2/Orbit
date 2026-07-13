import {
  putRehearsalFocusProfileRequestSchema,
  rehearsalFocusProfileRevisionConflictSchema,
  rehearsalFocusProfileSchema,
} from "@orbit/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { parseRequest } from "../common/zod-request";
import { ProjectsService } from "../projects/projects.service";
import { RehearsalFocusProfilesRepository } from "./rehearsal-focus-profiles.repository";

@Injectable()
export class RehearsalFocusProfilesService {
  constructor(
    private readonly repository: RehearsalFocusProfilesRepository,
    private readonly projects: ProjectsService,
    @InjectPinoLogger(RehearsalFocusProfilesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async get(projectId: string, actorUserId: string) {
    await this.projects.assertCanReadProject(projectId, actorUserId);
    const profile = rehearsalFocusProfileSchema
      .nullable()
      .parse(await this.repository.getCurrent(projectId));
    return { profile };
  }

  getCurrent(projectId: string) {
    return this.repository.getCurrent(projectId);
  }

  async put(projectId: string, actorUserId: string, body: unknown) {
    const request = parseRequest(putRehearsalFocusProfileRequestSchema, body);
    await this.projects.assertCanWriteProject(projectId, actorUserId);
    const result = await this.repository.save(projectId, actorUserId, request);
    if (result.status === "missing") {
      throw new BadRequestException(
        "expectedRevision must be 0 when the rehearsal focus profile does not exist.",
      );
    }
    if (result.status === "conflict") {
      throw new ConflictException(
        rehearsalFocusProfileRevisionConflictSchema.parse({
          code: "REHEARSAL_FOCUS_PROFILE_REVISION_CONFLICT",
          expectedRevision: request.expectedRevision,
          actualRevision: result.currentProfile.revision,
          currentProfile: result.currentProfile,
        }),
      );
    }

    this.logger.info(
      {
        event: "rehearsal_focus_profile.updated",
        projectId,
        profileId: result.profile.profileId,
        revision: result.profile.revision,
        itemCount: result.profile.items.length,
        actorUserId,
      },
      "Rehearsal focus profile updated.",
    );
    return { profile: rehearsalFocusProfileSchema.parse(result.profile) };
  }
}
