import {
  rehearsalFocusProfileSchema,
  type PutRehearsalFocusProfileRequest,
  type RehearsalFocusProfile,
} from "@orbit/shared";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";

type RehearsalFocusProfileRow = {
  profile_id: string;
  project_id: string;
  revision: number;
  items_json: unknown;
  created_by: string;
  updated_by: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type SaveRehearsalFocusProfileResult =
  | { status: "saved"; profile: RehearsalFocusProfile }
  | { status: "conflict"; currentProfile: RehearsalFocusProfile }
  | { status: "missing" };

@Injectable()
export class RehearsalFocusProfilesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  getCurrent(projectId: string) {
    return this.dataSource.transaction((manager) =>
      this.readCurrent(manager, projectId),
    );
  }

  save(
    projectId: string,
    actorUserId: string,
    request: PutRehearsalFocusProfileRequest,
  ): Promise<SaveRehearsalFocusProfileResult> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT project_id FROM projects WHERE project_id = $1 FOR UPDATE`,
        [projectId],
      );
      const current = await this.readCurrent(manager, projectId, true);
      if (
        (!current && request.expectedRevision !== 0) ||
        (current && request.expectedRevision !== current.revision)
      ) {
        if (!current) return { status: "missing" };
        return { status: "conflict", currentProfile: current };
      }

      const now = new Date();
      const profile = rehearsalFocusProfileSchema.parse({
        profileId: current?.profileId ?? `focus_profile_${randomUUID()}`,
        projectId,
        revision: (current?.revision ?? 0) + 1,
        items: request.items,
        createdBy: current?.createdBy ?? actorUserId,
        updatedBy: actorUserId,
        createdAt: current?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
      });

      await manager.query(
        `
          INSERT INTO rehearsal_focus_profiles (
            profile_id, project_id, revision, items_json,
            created_by, updated_by, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
          ON CONFLICT (project_id) DO UPDATE SET
            revision = EXCLUDED.revision,
            items_json = EXCLUDED.items_json,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
        `,
        [
          profile.profileId,
          projectId,
          profile.revision,
          JSON.stringify(profile.items),
          profile.createdBy,
          profile.updatedBy,
          profile.createdAt,
          profile.updatedAt,
        ],
      );

      return { status: "saved", profile };
    });
  }

  private async readCurrent(
    manager: EntityManager,
    projectId: string,
    lock = false,
  ) {
    const rows = (await manager.query(
      `SELECT * FROM rehearsal_focus_profiles WHERE project_id = $1${lock ? " FOR UPDATE" : ""}`,
      [projectId],
    )) as RehearsalFocusProfileRow[];
    const row = rows[0];
    if (!row) return null;

    return rehearsalFocusProfileSchema.parse({
      profileId: row.profile_id,
      projectId: row.project_id,
      revision: row.revision,
      items: row.items_json,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    });
  }
}

function toIso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
