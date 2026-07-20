import { z } from "zod";

import {
  deckElementCoordinateSchema,
  deckElementRoleSchema,
  deckElementSizeSchema,
  textAlignSchema,
  textFontWeightSchema,
  textVerticalAlignSchema,
  textWritingModeSchema,
} from "../deck/slide-object.schema";
import { slideLayoutSchema } from "../deck/deck.schema";
import { deckElementIdSchema, deckSlideIdSchema } from "../deck/id.schema";
import { themeColorSchema } from "../deck/theme.schema";

export const maxCommunityTemplateSlides = 100;
export const maxCommunityTemplateSnapshotBytes = 10 * 1024 * 1024;

export const communityTemplateCategorySchema = z.enum([
  "business",
  "education",
  "portfolio",
  "event",
]);

export const communityTemplateIdSchema = z
  .string()
  .regex(/^community_template_[A-Za-z0-9_-]+$/)
  .max(200);

export const communityTemplateTitleSchema = z.string().trim().min(1).max(60);

export const communityTemplateFontFamilySchema = z.enum([
  "Pretendard",
  "Noto Sans KR",
  "Gowun Dodum",
  "NanumSquareRound",
  "Gmarket Sans",
]);

const canvasSchema = z.discriminatedUnion("preset", [
  z
    .object({
      preset: z.literal("wide-16-9"),
      width: z.literal(1920),
      height: z.literal(1080),
      aspectRatio: z.literal("16:9"),
    })
    .strict(),
  z
    .object({
      preset: z.literal("standard-4-3"),
      width: z.literal(1024),
      height: z.literal(768),
      aspectRatio: z.literal("4:3"),
    })
    .strict(),
]);

const paletteSchema = z
  .object({
    primary: themeColorSchema,
    secondary: themeColorSchema,
    surface: themeColorSchema,
    muted: themeColorSchema,
    border: themeColorSchema,
  })
  .strict();

const typographySchema = z
  .object({
    headingFontFamily: communityTemplateFontFamilySchema,
    bodyFontFamily: communityTemplateFontFamilySchema,
    titleSize: z.number().finite().positive(),
    headingSize: z.number().finite().positive(),
    bodySize: z.number().finite().positive(),
    captionSize: z.number().finite().positive(),
  })
  .strict();

const shadowSchema = z
  .object({
    color: themeColorSchema,
    blur: z.number().finite().nonnegative(),
    offsetX: z.number().finite(),
    offsetY: z.number().finite(),
    opacity: z.number().finite().min(0).max(1),
  })
  .strict();

const effectsSchema = z
  .object({
    borderRadius: z.number().finite().nonnegative(),
    shadow: shadowSchema.optional(),
  })
  .strict();

export const communityTemplateThemeSchema = z
  .object({
    name: z.literal("Community Template"),
    fontFamily: communityTemplateFontFamilySchema,
    backgroundColor: themeColorSchema,
    textColor: themeColorSchema,
    accentColor: themeColorSchema,
    palette: paletteSchema,
    typography: typographySchema,
    effects: effectsSchema,
  })
  .strict();

const gradientStopSchema = z
  .object({
    offset: z.number().finite().min(0).max(1),
    color: themeColorSchema,
    opacity: z.number().finite().min(0).max(1),
  })
  .strict();

const linearGradientPaintSchema = z
  .object({
    type: z.literal("linear-gradient"),
    angle: z.number().finite(),
    stops: z.array(gradientStopSchema).min(2),
  })
  .strict();

export const communityTemplatePatternPresetSchema = z.enum([
  "pct5",
  "pct10",
  "pct20",
  "pct25",
  "pct30",
  "pct40",
  "pct50",
  "pct60",
  "pct70",
  "pct75",
  "pct80",
  "pct90",
]);

const patternPaintSchema = z
  .object({
    type: z.literal("pattern"),
    preset: communityTemplatePatternPresetSchema,
    foreground: themeColorSchema,
    background: themeColorSchema,
  })
  .strict();

const paintSchema = z.union([
  themeColorSchema,
  z.literal("transparent"),
  linearGradientPaintSchema,
  patternPaintSchema,
]);

const elementShadowSchema = shadowSchema;

const shapePropsSchema = z
  .object({
    fill: paintSchema,
    stroke: paintSchema,
    strokeWidth: z.number().finite().nonnegative(),
    borderRadius: z.number().finite().nonnegative(),
    sides: z.number().int().min(3).max(12).optional(),
    dash: z.array(z.number().finite().positive()).optional(),
    lineCap: z.enum(["butt", "round", "square"]).optional(),
    lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
    shadow: elementShadowSchema.optional(),
  })
  .strict();

const elementBaseFields = {
  elementId: deckElementIdSchema,
  role: deckElementRoleSchema.optional(),
  x: deckElementCoordinateSchema,
  y: deckElementCoordinateSchema,
  width: deckElementSizeSchema,
  height: deckElementSizeSchema,
  rotation: z.number().finite(),
  opacity: z.number().finite().min(0).max(1),
  zIndex: z.number().int().nonnegative(),
  locked: z.boolean(),
  visible: z.boolean(),
};

const shapeElementSchemas = (
  ["rect", "ellipse", "line", "arrow", "polygon", "star", "ring"] as const
).map((type) =>
  z
    .object({
      ...elementBaseFields,
      type: z.literal(type),
      props: shapePropsSchema,
    })
    .strict(),
);

const bulletSchema = z
  .object({
    enabled: z.boolean(),
    character: z.literal("•"),
    indent: z.number().finite().nonnegative(),
  })
  .strict();

const bodyInsetSchema = z
  .object({
    left: z.number().finite().nonnegative(),
    right: z.number().finite().nonnegative(),
    top: z.number().finite().nonnegative(),
    bottom: z.number().finite().nonnegative(),
  })
  .strict();

const textPropsSchema = z
  .object({
    text: z.enum(["제목을 입력하세요", "내용을 입력하세요"]),
    bodyInset: bodyInsetSchema.optional(),
    fontFamily: communityTemplateFontFamilySchema.optional(),
    fontSize: z.number().finite().positive(),
    fontWeight: textFontWeightSchema,
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    color: themeColorSchema.optional(),
    align: textAlignSchema,
    verticalAlign: textVerticalAlignSchema,
    writingMode: textWritingModeSchema.optional(),
    lineHeight: z.number().finite().positive(),
    bullet: bulletSchema.optional(),
  })
  .strict();

const textElementSchema = z
  .object({
    ...elementBaseFields,
    type: z.literal("text"),
    props: textPropsSchema,
  })
  .strict();

const groupElementSchema = z
  .object({
    ...elementBaseFields,
    type: z.literal("group"),
    props: z.object({ childElementIds: z.array(deckElementIdSchema) }).strict(),
  })
  .strict();

const tableCellSchema = z
  .object({
    text: z.literal("내용"),
    fill: paintSchema,
    textColor: themeColorSchema.optional(),
    fontFamily: communityTemplateFontFamilySchema.optional(),
    fontSize: z.number().finite().positive(),
    fontWeight: textFontWeightSchema,
    align: textAlignSchema,
    verticalAlign: textVerticalAlignSchema,
    borderColor: themeColorSchema,
    borderWidth: z.number().finite().nonnegative(),
    colSpan: z.number().int().positive(),
    rowSpan: z.number().int().positive(),
  })
  .strict();

const tableElementSchema = z
  .object({
    ...elementBaseFields,
    type: z.literal("table"),
    props: z
      .object({
        rows: z.array(z.array(tableCellSchema)),
        columnWidths: z.array(z.number().finite().positive()).optional(),
        rowHeights: z.array(z.number().finite().positive()).optional(),
        borderColor: themeColorSchema,
        borderWidth: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict();

const chartStyleSchema = z
  .object({
    colors: z.array(themeColorSchema),
    backgroundColor: themeColorSchema.optional(),
    textColor: themeColorSchema.optional(),
    fontFamily: communityTemplateFontFamilySchema.optional(),
    titleFontSize: z.number().finite().positive().optional(),
    axisLabelFontSize: z.number().finite().positive().optional(),
    legendFontSize: z.number().finite().positive().optional(),
    dataLabelFontSize: z.number().finite().positive().optional(),
    showLegend: z.boolean(),
    legendPosition: z.enum(["top", "right", "bottom", "left"]),
    showDataLabels: z.boolean(),
    showGrid: z.boolean(),
    xAxisTitle: z.literal("항목"),
    yAxisTitle: z.literal("값"),
    unit: z.literal(""),
  })
  .strict();

const cartesianDataSchema = z.tuple([
  z
    .object({
      label: z.literal("항목 1"),
      series: z.literal("시리즈 1"),
      value: z.literal(10),
    })
    .strict(),
  z
    .object({
      label: z.literal("항목 2"),
      series: z.literal("시리즈 1"),
      value: z.literal(20),
    })
    .strict(),
  z
    .object({
      label: z.literal("항목 3"),
      series: z.literal("시리즈 1"),
      value: z.literal(30),
    })
    .strict(),
]);

const radialDataSchema = z.tuple([
  z.object({ label: z.literal("항목 1"), value: z.literal(10) }).strict(),
  z.object({ label: z.literal("항목 2"), value: z.literal(20) }).strict(),
  z.object({ label: z.literal("항목 3"), value: z.literal(30) }).strict(),
]);

const scatterDataSchema = z.tuple([
  z
    .object({ label: z.literal("항목 1"), x: z.literal(1), y: z.literal(10) })
    .strict(),
  z
    .object({ label: z.literal("항목 2"), x: z.literal(2), y: z.literal(20) })
    .strict(),
  z
    .object({ label: z.literal("항목 3"), x: z.literal(3), y: z.literal(30) })
    .strict(),
]);

const chartPropsSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("bar"),
      title: z.literal("샘플 차트"),
      style: chartStyleSchema,
      data: cartesianDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("line"),
      title: z.literal("샘플 차트"),
      style: chartStyleSchema,
      data: cartesianDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("pie"),
      title: z.literal("샘플 차트"),
      style: chartStyleSchema,
      data: radialDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("doughnut"),
      title: z.literal("샘플 차트"),
      style: chartStyleSchema,
      data: radialDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("scatter"),
      title: z.literal("샘플 차트"),
      style: chartStyleSchema,
      data: scatterDataSchema,
    })
    .strict(),
]);

const chartElementSchema = z
  .object({
    ...elementBaseFields,
    type: z.literal("chart"),
    props: chartPropsSchema,
  })
  .strict();

const customShapeNodeSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    inX: z.number().finite().optional(),
    inY: z.number().finite().optional(),
    outX: z.number().finite().optional(),
    outY: z.number().finite().optional(),
    mode: z.enum(["corner", "smooth"]),
  })
  .strict();

const safeSvgPathSchema = z
  .string()
  .min(1)
  .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/);

const customShapeElementSchema = z
  .object({
    ...elementBaseFields,
    type: z.literal("customShape"),
    props: z
      .object({
        pathData: safeSvgPathSchema,
        viewBoxWidth: z.number().finite().positive(),
        viewBoxHeight: z.number().finite().positive(),
        fill: paintSchema,
        stroke: paintSchema,
        strokeWidth: z.number().finite().nonnegative(),
        dash: z.array(z.number().finite().positive()).optional(),
        lineCap: z.enum(["butt", "round", "square"]).optional(),
        lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
        shadow: elementShadowSchema.optional(),
        closed: z.boolean(),
        nodes: z.array(customShapeNodeSchema),
      })
      .strict(),
  })
  .strict();

export const communityTemplateElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  ...shapeElementSchemas,
  groupElementSchema,
  customShapeElementSchema,
  chartElementSchema,
  tableElementSchema,
]);

export const communityTemplateSlideStyleSchema = z
  .object({
    layout: slideLayoutSchema.optional(),
    fontFamily: communityTemplateFontFamilySchema.optional(),
    backgroundColor: themeColorSchema.optional(),
    textColor: themeColorSchema.optional(),
    accentColor: themeColorSchema.optional(),
  })
  .strict();

export const communityTemplateSlideSchema = z
  .object({
    kind: z.literal("content"),
    slideId: deckSlideIdSchema,
    order: z.number().int().positive(),
    title: z.literal("슬라이드 제목"),
    style: communityTemplateSlideStyleSchema,
    elements: z.array(communityTemplateElementSchema),
  })
  .strict();

export const communityTemplateSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    canvas: canvasSchema,
    theme: communityTemplateThemeSchema,
    targetDurationMinutes: z.number().int().positive(),
    slides: z
      .array(communityTemplateSlideSchema)
      .max(maxCommunityTemplateSlides),
  })
  .strict();

export const communityTemplatePreviewSchema = z
  .object({
    canvas: canvasSchema,
    theme: communityTemplateThemeSchema,
    slide: communityTemplateSlideSchema,
  })
  .strict();

export type CommunityTemplateCategory = z.infer<
  typeof communityTemplateCategorySchema
>;
export type CommunityTemplateSnapshot = z.infer<
  typeof communityTemplateSnapshotSchema
>;
export type CommunityTemplatePreview = z.infer<
  typeof communityTemplatePreviewSchema
>;
export type CommunityTemplateSlide = z.infer<
  typeof communityTemplateSlideSchema
>;
export type CommunityTemplateElement = z.infer<
  typeof communityTemplateElementSchema
>;
