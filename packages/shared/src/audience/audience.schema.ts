import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { deckSlideIdSchema } from "../deck/id.schema";
import {
  joinCodeSchema,
  presentationSessionSchema,
} from "../presentation/presentation.schema";

export const audienceIdSchema = z.string().regex(/^audience_[0-9a-f-]{36}$/);
export const audienceEventIdSchema = z.string().regex(/^event_[0-9a-f-]{36}$/);

export const audienceNicknameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^\r\n\t]+$/, "nickname must not contain control whitespace");

const unsafeAudienceFieldNames = new Set([
  "speakerNotes",
  "rawTranscript",
  "rawAudio",
  "presenterScript",
  "fileBase64",
  "apiKey",
  "token",
  "cookie",
  "password",
  "secret",
]);

export const audienceSafePayloadSchema = z
  .record(z.unknown())
  .superRefine((value, context) => {
    const unsafePath = findUnsafeAudienceFieldPath(value);
    if (!unsafePath) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `audience payload must not include ${unsafePath}`,
    });
  });

export const audienceParticipantSchema = z
  .object({
    audienceId: audienceIdSchema,
    sessionId: z.string().min(1),
    nickname: audienceNicknameSchema,
    joinedAt: isoDateTimeSchema,
    lastSeenAt: isoDateTimeSchema,
    joinedBeforeEnd: z.boolean(),
  })
  .strict();

export const audienceFeatureSettingsSchema = z
  .object({
    sessionId: z.string().min(1),
    qnaEnabled: z.boolean(),
    aiQnaEnabled: z.boolean(),
    pollsEnabled: z.boolean(),
    quizzesEnabled: z.boolean(),
    reactionsEnabled: z.boolean(),
    surveyEnabled: z.boolean(),
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .refine((settings) => !settings.aiQnaEnabled || settings.qnaEnabled, {
    message: "aiQnaEnabled requires qnaEnabled",
  });

const audienceFeatureSettingsUpdateFields = {
  qnaEnabled: z.boolean().optional(),
  aiQnaEnabled: z.boolean().optional(),
  pollsEnabled: z.boolean().optional(),
  quizzesEnabled: z.boolean().optional(),
  reactionsEnabled: z.boolean().optional(),
  surveyEnabled: z.boolean().optional(),
};

export const updateAudienceFeatureSettingsRequestSchema = z
  .object(audienceFeatureSettingsUpdateFields)
  .strict()
  .refine((settings) => Object.keys(settings).length > 0, {
    message: "at least one audience feature setting is required",
  })
  .refine(
    (settings) =>
      !(settings.qnaEnabled === false && settings.aiQnaEnabled === true),
    {
      message: "aiQnaEnabled requires qnaEnabled",
    },
  );

export const updateAudienceFeatureSettingsResponseSchema = z
  .object({
    features: audienceFeatureSettingsSchema,
  })
  .strict();

export const audienceRealtimeStateSchema = z
  .object({
    sessionId: z.string().min(1),
    slideId: deckSlideIdSchema.nullable(),
    slideIndex: z.number().int().nonnegative().nullable(),
    effectState: audienceSafePayloadSchema.default({}),
    activeInteractionId: z.string().min(1).nullable(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const audienceJoinRequestSchema = z
  .object({
    nickname: audienceNicknameSchema,
  })
  .strict();

export const audiencePublicSessionSchema = presentationSessionSchema
  .pick({
    sessionId: true,
    projectId: true,
    joinCode: true,
    status: true,
    entryStatus: true,
  })
  .strict();

export const audienceJoinResponseSchema = z
  .object({
    session: audiencePublicSessionSchema,
    participant: audienceParticipantSchema,
  })
  .strict();

export const audienceSessionLookupResponseSchema = z
  .object({
    session: audiencePublicSessionSchema,
  })
  .strict();

export const audienceStateResponseSchema = z
  .object({
    session: audiencePublicSessionSchema,
    participant: audienceParticipantSchema,
    state: audienceRealtimeStateSchema,
    features: audienceFeatureSettingsSchema,
  })
  .strict();

export const audienceEventActorTypeSchema = z.enum([
  "audience",
  "presenter",
  "system",
]);

export const audienceEventTypeSchema = z.enum([
  "audience.joined",
  "session.started",
  "session.ended",
  "slide.changed",
  "effect.changed",
  "feature.changed",
  "interaction.activated",
  "interaction.closed",
  "interaction.responded",
  "interaction.results.exposed",
  "question.submitted",
  "question.answered",
  "reaction.sent",
  "survey.submitted",
]);

export const audienceEventSchema = z
  .object({
    eventId: audienceEventIdSchema,
    sessionId: z.string().min(1),
    actorType: audienceEventActorTypeSchema,
    actorId: z.string().min(1).nullable(),
    type: audienceEventTypeSchema,
    payload: audienceSafePayloadSchema,
    occurredAt: isoDateTimeSchema,
  })
  .strict();

export const audienceJoinCodeParamsSchema = z
  .object({
    joinCode: joinCodeSchema,
  })
  .strict();

export function assertAudienceSafePayload(
  payload: unknown,
): Record<string, unknown> {
  return audienceSafePayloadSchema.parse(payload);
}

function findUnsafeAudienceFieldPath(
  value: unknown,
  path: string[] = [],
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const unsafePath = findUnsafeAudienceFieldPath(value[index], [
        ...path,
        String(index),
      ]);
      if (unsafePath) {
        return unsafePath;
      }
    }

    return null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (unsafeAudienceFieldNames.has(key)) {
      return nextPath.join(".");
    }

    const unsafePath = findUnsafeAudienceFieldPath(child, nextPath);
    if (unsafePath) {
      return unsafePath;
    }
  }

  return null;
}

export type AudienceParticipant = z.infer<typeof audienceParticipantSchema>;
export type AudienceFeatureSettings = z.infer<
  typeof audienceFeatureSettingsSchema
>;
export type AudienceRealtimeState = z.infer<typeof audienceRealtimeStateSchema>;
export type AudienceJoinRequest = z.infer<typeof audienceJoinRequestSchema>;
export type UpdateAudienceFeatureSettingsRequest = z.infer<
  typeof updateAudienceFeatureSettingsRequestSchema
>;
export type UpdateAudienceFeatureSettingsResponse = z.infer<
  typeof updateAudienceFeatureSettingsResponseSchema
>;
export type AudiencePublicSession = z.infer<typeof audiencePublicSessionSchema>;
export type AudienceJoinResponse = z.infer<typeof audienceJoinResponseSchema>;
export type AudienceSessionLookupResponse = z.infer<
  typeof audienceSessionLookupResponseSchema
>;
export type AudienceStateResponse = z.infer<typeof audienceStateResponseSchema>;
export type AudienceEvent = z.infer<typeof audienceEventSchema>;
export type AudienceEventType = z.infer<typeof audienceEventTypeSchema>;
