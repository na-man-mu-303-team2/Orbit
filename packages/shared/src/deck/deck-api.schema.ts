import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { jobSchema } from "../jobs/job.schema";
import { deckSchema } from "./deck.schema";
import { deckIdSchema } from "./id.schema";
import { deckChangeRecordSchema, deckPatchSchema } from "./patch.schema";

type DeckApiIssuePath = Array<string | number>;

function addMismatchIssue(
  ctx: z.RefinementCtx,
  path: DeckApiIssuePath,
  message: string,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
}

function requireMatchingProject(
  ctx: z.RefinementCtx,
  projectId: string,
  deckProjectId: string,
  path: DeckApiIssuePath,
): void {
  if (projectId !== deckProjectId) {
    addMismatchIssue(ctx, path, "projectId must match deck.projectId");
  }
}

function requireMatchingDeckId(
  ctx: z.RefinementCtx,
  deckId: string,
  nestedDeckId: string,
  path: DeckApiIssuePath,
): void {
  if (deckId !== nestedDeckId) {
    addMismatchIssue(ctx, path, "deckId must match nested deckId");
  }
}

function requireMatchingVersion(
  ctx: z.RefinementCtx,
  version: number,
  deckVersion: number,
  path: DeckApiIssuePath,
): void {
  if (version !== deckVersion) {
    addMismatchIssue(ctx, path, "version must match deck.version");
  }
}

export const deckApiProjectIdSchema = z.string().min(1);

export const deckSnapshotIdSchema = z
  .string()
  .regex(/^snapshot_[A-Za-z0-9_-]+$/);

export const deckSnapshotReasonSchema = z.enum([
  "auto-save",
  "deck-replaced",
  "patch-applied",
  "snapshot-restore",
]);

export const deckApiErrorCodeSchema = z.enum([
  "DECK_NOT_FOUND",
  "SNAPSHOT_NOT_FOUND",
  "PROJECT_MISMATCH",
  "DECK_VALIDATION_FAILED",
  "PATCH_VALIDATION_FAILED",
  "STALE_BASE_VERSION",
  "SNAPSHOT_PROJECT_MISMATCH",
  "PATCH_APPLY_FAILED",
  "PATCH_CHAIN_INVALID",
  "PATCH_CHAIN_CHECKPOINT_MISMATCH",
]);

export const deckApiErrorSchema = z.object({
  code: deckApiErrorCodeSchema,
  message: z.string().min(1),
  details: z.array(z.string()).default([]),
});

export const deckSnapshotSchema = z.object({
  snapshotId: deckSnapshotIdSchema,
  projectId: deckApiProjectIdSchema,
  deckId: deckIdSchema,
  version: z.number().int().positive(),
  reason: deckSnapshotReasonSchema,
  createdAt: isoDateTimeSchema,
});

export const deckSnapshotDetailSchema = deckSnapshotSchema
  .extend({
    deck: deckSchema,
  })
  .superRefine((snapshot, ctx) => {
    requireMatchingProject(ctx, snapshot.projectId, snapshot.deck.projectId, [
      "deck",
      "projectId",
    ]);
    requireMatchingDeckId(ctx, snapshot.deckId, snapshot.deck.deckId, [
      "deck",
      "deckId",
    ]);
    requireMatchingVersion(ctx, snapshot.version, snapshot.deck.version, [
      "deck",
      "version",
    ]);
  });

export const deckPatchLogEntrySchema = z.object({
  projectId: deckApiProjectIdSchema,
  changeRecord: deckChangeRecordSchema,
});

export const getDeckResponseSchema = z
  .object({
    projectId: deckApiProjectIdSchema,
    deck: deckSchema,
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((response, ctx) => {
    requireMatchingProject(ctx, response.projectId, response.deck.projectId, [
      "deck",
      "projectId",
    ]);
  });

export const putDeckRequestSchema = z.object({
  deck: deckSchema,
  snapshotReason: deckSnapshotReasonSchema.optional(),
});

export const putDeckResponseSchema = z
  .object({
    deck: deckSchema,
    snapshot: deckSnapshotSchema,
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((response, ctx) => {
    requireMatchingProject(
      ctx,
      response.snapshot.projectId,
      response.deck.projectId,
      ["snapshot", "projectId"],
    );
    requireMatchingDeckId(ctx, response.snapshot.deckId, response.deck.deckId, [
      "snapshot",
      "deckId",
    ]);
    requireMatchingVersion(
      ctx,
      response.snapshot.version,
      response.deck.version,
      ["snapshot", "version"],
    );
  });

export const appendDeckPatchRequestSchema = z.object({
  patch: deckPatchSchema,
  snapshotReason: deckSnapshotReasonSchema.optional(),
});

export const appendDeckPatchResponseSchema = z
  .object({
    deck: deckSchema,
    changeRecord: deckChangeRecordSchema,
    snapshot: deckSnapshotSchema.nullable(),
    ooxmlSyncJob: jobSchema.optional(),
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((response, ctx) => {
    requireMatchingDeckId(
      ctx,
      response.changeRecord.deckId,
      response.deck.deckId,
      ["changeRecord", "deckId"],
    );
    requireMatchingVersion(
      ctx,
      response.changeRecord.afterVersion,
      response.deck.version,
      ["changeRecord", "afterVersion"],
    );
    if (response.snapshot) {
      requireMatchingProject(
        ctx,
        response.snapshot.projectId,
        response.deck.projectId,
        ["snapshot", "projectId"],
      );
      requireMatchingDeckId(
        ctx,
        response.snapshot.deckId,
        response.deck.deckId,
        ["snapshot", "deckId"],
      );
      requireMatchingVersion(
        ctx,
        response.snapshot.version,
        response.deck.version,
        ["snapshot", "version"],
      );
    }
  });

export const listDeckSnapshotsResponseSchema = z
  .object({
    projectId: deckApiProjectIdSchema,
    snapshots: z.array(deckSnapshotSchema),
  })
  .superRefine((response, ctx) => {
    response.snapshots.forEach((snapshot, index) => {
      if (snapshot.projectId !== response.projectId) {
        addMismatchIssue(
          ctx,
          ["snapshots", index, "projectId"],
          "snapshot.projectId must match response.projectId",
        );
      }
    });
  });

export const restoreDeckSnapshotResponseSchema = z
  .object({
    deck: deckSchema,
    restoredSnapshot: deckSnapshotSchema,
    updatedAt: isoDateTimeSchema,
  })
  .superRefine((response, ctx) => {
    requireMatchingProject(
      ctx,
      response.restoredSnapshot.projectId,
      response.deck.projectId,
      ["restoredSnapshot", "projectId"],
    );
    requireMatchingDeckId(
      ctx,
      response.restoredSnapshot.deckId,
      response.deck.deckId,
      ["restoredSnapshot", "deckId"],
    );
    requireMatchingVersion(
      ctx,
      response.restoredSnapshot.version,
      response.deck.version,
      ["restoredSnapshot", "version"],
    );
  });

export type DeckApiProjectId = z.infer<typeof deckApiProjectIdSchema>;
export type DeckSnapshotId = z.infer<typeof deckSnapshotIdSchema>;
export type DeckSnapshotReason = z.infer<typeof deckSnapshotReasonSchema>;
export type DeckApiErrorCode = z.infer<typeof deckApiErrorCodeSchema>;
export type DeckApiError = z.infer<typeof deckApiErrorSchema>;
export type DeckSnapshot = z.infer<typeof deckSnapshotSchema>;
export type DeckSnapshotDetail = z.infer<typeof deckSnapshotDetailSchema>;
export type DeckPatchLogEntry = z.infer<typeof deckPatchLogEntrySchema>;
export type GetDeckResponse = z.infer<typeof getDeckResponseSchema>;
export type PutDeckRequest = z.infer<typeof putDeckRequestSchema>;
export type PutDeckResponse = z.infer<typeof putDeckResponseSchema>;
export type AppendDeckPatchRequest = z.infer<
  typeof appendDeckPatchRequestSchema
>;
export type AppendDeckPatchResponse = z.infer<
  typeof appendDeckPatchResponseSchema
>;
export type ListDeckSnapshotsResponse = z.infer<
  typeof listDeckSnapshotsResponseSchema
>;
export type RestoreDeckSnapshotResponse = z.infer<
  typeof restoreDeckSnapshotResponseSchema
>;
