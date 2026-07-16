import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

export type ActivityResultRunRow = {
  activity_run_id: string;
  project_id: string;
  session_id: string;
  activity_id: string;
  source_slide_id: string;
  version: number;
  supersedes_activity_run_id: string | null;
  definition_snapshot: unknown;
  definition_fingerprint: string;
  status: "draft" | "open" | "closed" | "results";
  revision: number;
  is_current: boolean;
  response_count: number;
  opened_at: Date | string | null;
  closed_at: Date | string | null;
  revealed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type ActivityResultResponseRow = {
  response_id: string;
  answers_json: unknown;
  display_name: string | null;
  revision: number;
  submitted_at: Date | string;
  updated_at: Date | string;
};

export type ActivityResultTextRow = {
  entry_id: string;
  question_id: string;
  text_value: string;
  display_name: string | null;
  moderation_status: "pending" | "approved" | "hidden";
  answered_at: Date | string | null;
  updated_at: Date | string;
};

const runColumns = `
  runs.activity_run_id, runs.project_id, runs.session_id, runs.activity_id,
  runs.source_slide_id, runs.version, runs.supersedes_activity_run_id,
  runs.definition_snapshot, runs.definition_fingerprint, runs.status,
  runs.revision, runs.is_current, runs.response_count, runs.opened_at,
  runs.closed_at, runs.revealed_at, runs.created_at, runs.updated_at
`;

@Injectable()
export class ActivityResultsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findRun(
    projectId: string,
    sessionId: string,
    runId: string
  ): Promise<ActivityResultRunRow | null> {
    const rows = await this.dataSource.query<ActivityResultRunRow[]>(
      `
        SELECT ${runColumns}
        FROM activity_runs AS runs
        INNER JOIN presentation_sessions AS sessions
          ON sessions.project_id = runs.project_id AND sessions.session_id = runs.session_id
        WHERE runs.project_id = $1 AND runs.session_id = $2 AND runs.activity_run_id = $3
        LIMIT 1
      `,
      [projectId, sessionId, runId]
    );
    return rows[0] ?? null;
  }

  async findCurrentRun(
    projectId: string,
    sessionId: string,
    activityId: string
  ): Promise<ActivityResultRunRow | null> {
    const rows = await this.dataSource.query<ActivityResultRunRow[]>(
      `
        SELECT ${runColumns}
        FROM activity_runs AS runs
        INNER JOIN presentation_sessions AS sessions
          ON sessions.project_id = runs.project_id AND sessions.session_id = runs.session_id
        WHERE runs.project_id = $1 AND runs.session_id = $2
          AND runs.activity_id = $3 AND runs.is_current
        LIMIT 1
      `,
      [projectId, sessionId, activityId]
    );
    return rows[0] ?? null;
  }

  async findActiveRun(
    projectId: string,
    sessionId: string
  ): Promise<ActivityResultRunRow | null> {
    const rows = await this.dataSource.query<ActivityResultRunRow[]>(
      `
        SELECT ${runColumns}
        FROM presentation_sessions AS sessions
        INNER JOIN activity_runs AS runs
          ON runs.project_id = sessions.project_id
         AND runs.session_id = sessions.session_id
         AND runs.activity_run_id = sessions.active_activity_run_id
        WHERE sessions.project_id = $1 AND sessions.session_id = $2
        LIMIT 1
      `,
      [projectId, sessionId]
    );
    return rows[0] ?? null;
  }

  listSessionRuns(projectId: string, sessionId: string) {
    return this.dataSource.query<ActivityResultRunRow[]>(
      `
        SELECT ${runColumns}
        FROM activity_runs AS runs
        INNER JOIN presentation_sessions AS sessions
          ON sessions.project_id = runs.project_id AND sessions.session_id = runs.session_id
        WHERE runs.project_id = $1 AND runs.session_id = $2
        ORDER BY runs.created_at ASC, runs.version ASC
      `,
      [projectId, sessionId]
    );
  }

  listResponses(projectId: string, runId: string) {
    return this.dataSource.query<ActivityResultResponseRow[]>(
      `
        SELECT response_id, answers_json, display_name, revision, submitted_at, updated_at
        FROM activity_responses
        WHERE project_id = $1 AND activity_run_id = $2
        ORDER BY submitted_at ASC
      `,
      [projectId, runId]
    );
  }

  async findOwnResponse(
    projectId: string,
    runId: string,
    audienceId: string
  ): Promise<ActivityResultResponseRow | null> {
    const rows = await this.dataSource.query<ActivityResultResponseRow[]>(
      `
        SELECT response_id, answers_json, display_name, revision, submitted_at, updated_at
        FROM activity_responses
        WHERE project_id = $1 AND activity_run_id = $2 AND audience_id = $3
        LIMIT 1
      `,
      [projectId, runId, audienceId]
    );
    return rows[0] ?? null;
  }

  listTextEntries(projectId: string, runId: string) {
    return this.dataSource.query<ActivityResultTextRow[]>(
      `
        SELECT entries.entry_id, entries.question_id, entries.text_value,
               responses.display_name, entries.moderation_status,
               entries.answered_at, entries.updated_at
        FROM activity_text_entries AS entries
        INNER JOIN activity_responses AS responses
          ON responses.project_id = entries.project_id
         AND responses.response_id = entries.response_id
        WHERE entries.project_id = $1 AND responses.activity_run_id = $2
        ORDER BY entries.updated_at DESC
      `,
      [projectId, runId]
    );
  }
}
