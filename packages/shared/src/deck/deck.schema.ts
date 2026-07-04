import { z } from "zod";

import { animationSchema } from "./animation.schema";
import {
  deckAnimationIdSchema,
  deckCueIdSchema,
  deckElementIdSchema,
  deckIdSchema,
  deckKeywordIdSchema,
  deckSlideIdSchema
} from "./id.schema";
import { slideActionSchema } from "./slide-action.schema";
import { deckElementSchema } from "./slide-object.schema";
import { themeColorSchema, themeSchema } from "./theme.schema";

export const deckSourceTypeSchema = z.enum(["manual", "import", "ai"]);

export const aiDeckAudienceSchema = z.enum([
  "general",
  "executive",
  "technical",
  "sales"
]);

export const aiDeckPurposeSchema = z.enum([
  "inform",
  "persuade",
  "teach",
  "report"
]);

export const aiDeckToneSchema = z.enum([
  "professional",
  "friendly",
  "confident",
  "concise"
]);

export const deckCreatedFromReferenceSchema = z.object({
  fileId: z.string().min(1)
});

export const deckCreatedFromSchema = z.object({
  topic: z.string().min(1),
  references: z.array(deckCreatedFromReferenceSchema).default([])
});

export const deckMetadataSchema = z.object({
  language: z.literal("ko").default("ko"),
  locale: z.literal("ko-KR").default("ko-KR"),
  sourceType: deckSourceTypeSchema.optional(),
  generatedBy: z.literal("ai").optional(),
  audience: aiDeckAudienceSchema.optional(),
  purpose: aiDeckPurposeSchema.optional(),
  tone: aiDeckToneSchema.optional(),
  createdFrom: deckCreatedFromSchema.optional()
});

export const wideDeckCanvasSchema = z.object({
  preset: z.literal("wide-16-9"),
  width: z.literal(1920),
  height: z.literal(1080),
  aspectRatio: z.literal("16:9")
});

export const standardDeckCanvasSchema = z.object({
  preset: z.literal("standard-4-3"),
  width: z.literal(1024),
  height: z.literal(768),
  aspectRatio: z.literal("4:3")
});

export const deckCanvasSchema = z.discriminatedUnion("preset", [
  wideDeckCanvasSchema,
  standardDeckCanvasSchema
]);

export const keywordTermSchema = z.string().trim().min(1);

export const keywordSchema = z.object({
  keywordId: deckKeywordIdSchema,
  text: keywordTermSchema,
  synonyms: z.array(keywordTermSchema).default([]),
  abbreviations: z.array(keywordTermSchema).default([]),
  required: z.boolean().default(true)
});

export const slideKeywordsSchema = z
  .array(keywordSchema)
  .superRefine((keywords, ctx) => {
    const terms = new Set<string>();

    keywords.forEach((keyword, keywordIndex) => {
      requireUniqueKeywordTerm(ctx, terms, keyword.text, [
        keywordIndex,
        "text"
      ]);

      keyword.synonyms.forEach((synonym, synonymIndex) => {
        requireUniqueKeywordTerm(ctx, terms, synonym, [
          keywordIndex,
          "synonyms",
          synonymIndex
        ]);
      });

      keyword.abbreviations.forEach((abbreviation, abbreviationIndex) => {
        requireUniqueKeywordTerm(ctx, terms, abbreviation, [
          keywordIndex,
          "abbreviations",
          abbreviationIndex
        ]);
      });
    });
  });

export const slideOrderSchema = z.number().int().positive();

export const slideLayoutSchema = z.enum([
  "title",
  "title-content",
  "section",
  "two-column",
  "image-left",
  "image-right",
  "chart-focus",
  "quote",
  "closing"
]);

export const slideBackgroundImageFitSchema = z.enum([
  "contain",
  "cover",
  "stretch"
]);

export const slideBackgroundImageSchema = z.object({
  src: z.string().min(1),
  alt: z.string().default(""),
  fit: slideBackgroundImageFitSchema.default("cover"),
  opacity: z.number().finite().min(0).max(1).default(1)
});

export const slideStyleSchema = z
  .object({
    layout: slideLayoutSchema.optional(),
    fontFamily: z.string().min(1).optional(),
    backgroundColor: themeColorSchema.optional(),
    textColor: themeColorSchema.optional(),
    accentColor: themeColorSchema.optional(),
    backgroundImage: slideBackgroundImageSchema.optional()
  })
  .default({});

export const slideSourceEvidenceSchema = z.object({
  fileId: z.string().min(1),
  quote: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
  confidence: z.number().finite().min(0).max(1).default(0.5)
});

export const slideAiNotesSchema = z
  .object({
    emphasisPoints: z.array(z.string().min(1)).default([]),
    sourceEvidence: z.array(slideSourceEvidenceSchema).default([])
  })
  .default({});

export const speechCuePhraseSchema = z.string().trim().min(1);

export const speechCueScriptAnchorSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(0)
  })
  .refine((anchor) => anchor.end > anchor.start, {
    message: "scriptAnchor.end는 start보다 커야 합니다."
  });

export const speechCueTriggerSchema = z.object({
  phrases: z.array(speechCuePhraseSchema).min(1),
  scriptAnchor: speechCueScriptAnchorSchema.optional()
});

export const speechCueHighlightActionSchema = z.object({
  type: z.literal("highlight"),
  elementId: deckElementIdSchema
});

export const speechCueAnimationActionSchema = z.object({
  type: z.literal("animation"),
  animationId: deckAnimationIdSchema
});

export const speechCueAdvanceSlideActionSchema = z.object({
  type: z.literal("advance-slide")
});

export const speechCueActionSchema = z.discriminatedUnion("type", [
  speechCueHighlightActionSchema,
  speechCueAnimationActionSchema,
  speechCueAdvanceSlideActionSchema
]);

export const speechCueSourceSchema = z.enum(["ai", "user"]);

export const speechCueSchema = z.object({
  cueId: deckCueIdSchema,
  trigger: speechCueTriggerSchema,
  action: speechCueActionSchema,
  source: speechCueSourceSchema,
  enabled: z.boolean().default(true)
});

export const slideSchema = z
  .object({
    slideId: deckSlideIdSchema,
    order: slideOrderSchema,
    title: z.string().default(""),
    thumbnailUrl: z.string().default(""),
    estimatedSeconds: z.number().int().positive().optional(),
    style: slideStyleSchema,
    speakerNotes: z.string().default(""),
    elements: z.array(deckElementSchema).default([]),
    keywords: slideKeywordsSchema.default([]),
    animations: z.array(animationSchema).default([]),
    actions: z.array(slideActionSchema).default([]),
    speechCues: z.array(speechCueSchema).default([]),
    aiNotes: slideAiNotesSchema.optional()
  })
  .superRefine((slide, ctx) => {
    const actionIds = new Set<string>();
    const cueIds = new Set<string>();
    const elementIds = new Set(slide.elements.map((element) => element.elementId));
    const keywordIds = new Set(slide.keywords.map((keyword) => keyword.keywordId));
    const animationIds = new Set(
      slide.animations.map((animation) => animation.animationId)
    );

    slide.actions.forEach((action, actionIndex) => {
      if (actionIds.has(action.actionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actions", actionIndex, "actionId"],
          message: "slide action IDs must be unique within the same slide"
        });
      } else {
        actionIds.add(action.actionId);
      }

      if (
        action.trigger.kind === "keyword" &&
        !keywordIds.has(action.trigger.keywordId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actions", actionIndex, "trigger", "keywordId"],
          message: "slide action must target a keyword in the same slide"
        });
      }

      if (
        action.effect.kind === "play-animation" &&
        !animationIds.has(action.effect.animationId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actions", actionIndex, "effect", "animationId"],
          message: "slide action must target an animation in the same slide"
        });
      }
    });

    slide.speechCues.forEach((cue, cueIndex) => {
      if (cueIds.has(cue.cueId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["speechCues", cueIndex, "cueId"],
          message: "같은 슬라이드 안에서 speech cue ID는 중복될 수 없습니다."
        });
      } else {
        cueIds.add(cue.cueId);
      }

      if (
        cue.action.type === "highlight" &&
        !elementIds.has(cue.action.elementId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["speechCues", cueIndex, "action", "elementId"],
          message: "speech cue highlight 대상은 같은 슬라이드의 element여야 합니다."
        });
      }

      if (
        cue.action.type === "animation" &&
        !animationIds.has(cue.action.animationId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["speechCues", cueIndex, "action", "animationId"],
          message: "speech cue animation 대상은 같은 슬라이드의 animation이어야 합니다."
        });
      }

      const scriptAnchor = cue.trigger.scriptAnchor;
      if (scriptAnchor && scriptAnchor.end > slide.speakerNotes.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["speechCues", cueIndex, "trigger", "scriptAnchor", "end"],
          message: "scriptAnchor.end는 speakerNotes 길이를 넘을 수 없습니다."
        });
      }
    });
  });

export const deckSchema = z.object({
  deckId: deckIdSchema,
  projectId: z.string().min(1),
  title: z.string().min(1),
  version: z.number().int().positive(),
  metadata: deckMetadataSchema.default({}),
  targetDurationMinutes: z.number().int().positive().default(10),
  canvas: deckCanvasSchema,
  theme: themeSchema.default({}),
  slides: z.array(slideSchema).min(1)
});

// Input 타입은 외부/레거시 deck JSON처럼 schema default 적용 전 값을 표현한다.
// 예: SlideInput에서는 speechCues를 생략할 수 있지만, parse 후 Slide에는 []로 정규화되어 항상 존재한다.
export type DeckInput = z.input<typeof deckSchema>;
export type SlideInput = z.input<typeof slideSchema>;

export type Deck = z.output<typeof deckSchema>;
export type DeckCanvas = z.output<typeof deckCanvasSchema>;
export type DeckMetadata = z.output<typeof deckMetadataSchema>;
export type DeckSourceType = z.output<typeof deckSourceTypeSchema>;
export type AiDeckAudience = z.output<typeof aiDeckAudienceSchema>;
export type AiDeckPurpose = z.output<typeof aiDeckPurposeSchema>;
export type AiDeckTone = z.output<typeof aiDeckToneSchema>;
export type DeckCreatedFrom = z.output<typeof deckCreatedFromSchema>;
export type Slide = z.output<typeof slideSchema>;
export type SlideLayout = z.infer<typeof slideLayoutSchema>;
export type SlideStyle = z.infer<typeof slideStyleSchema>;
export type SlideBackgroundImage = z.infer<typeof slideBackgroundImageSchema>;
export type SlideBackgroundImageFit = z.infer<
  typeof slideBackgroundImageFitSchema
>;
export type SlideSourceEvidence = z.infer<typeof slideSourceEvidenceSchema>;
export type SlideAiNotes = z.infer<typeof slideAiNotesSchema>;
export type SpeechCue = z.infer<typeof speechCueSchema>;
export type SpeechCueAction = z.infer<typeof speechCueActionSchema>;
export type SpeechCueSource = z.infer<typeof speechCueSourceSchema>;
export type SpeechCueTrigger = z.infer<typeof speechCueTriggerSchema>;
export type KeywordTerm = z.infer<typeof keywordTermSchema>;
export type Keyword = z.infer<typeof keywordSchema>;

function requireUniqueKeywordTerm(
  ctx: z.RefinementCtx,
  seen: Set<string>,
  rawValue: string,
  path: Array<string | number>
): void {
  const value = rawValue.toLocaleLowerCase("ko-KR");

  if (seen.has(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "keyword terms must be unique within the same slide"
    });
    return;
  }

  seen.add(value);
}
