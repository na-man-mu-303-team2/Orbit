import { z } from "zod";

import { chartSchema } from "./chart.schema";
import { deckElementIdSchema } from "./id.schema";
import { themeColorSchema } from "./theme.schema";

export const deckElementTypeSchema = z.enum([
  "text",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "polygon",
  "star",
  "ring",
  "image",
  "group",
  "customShape",
  "chart"
]);

export const deckElementRoleSchema = z.enum([
  "background",
  "decoration",
  "title",
  "subtitle",
  "body",
  "caption",
  "media",
  "chart",
  "highlight",
  "footer"
]);

export const deckElementCoordinateSchema = z.number().finite().nonnegative();
export const deckElementSizeSchema = z.number().finite().positive();

export const deckElementBaseSchema = z.object({
  elementId: deckElementIdSchema,
  role: deckElementRoleSchema.optional(),
  x: deckElementCoordinateSchema,
  y: deckElementCoordinateSchema,
  width: deckElementSizeSchema,
  height: deckElementSizeSchema,
  rotation: z.number().finite().default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
  zIndex: z.number().int().nonnegative().default(0),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true)
});

export const deckElementPaintSchema = z.union([
  themeColorSchema,
  z.literal("transparent")
]);

export const deckElementShadowSchema = z.object({
  color: themeColorSchema.default("#000000"),
  blur: z.number().finite().nonnegative().default(0),
  offsetX: z.number().finite().default(0),
  offsetY: z.number().finite().default(0),
  opacity: z.number().finite().min(0).max(1).default(0.25)
});

export const shapeElementPropsSchema = z
  .object({
    fill: deckElementPaintSchema.default("transparent"),
    stroke: deckElementPaintSchema.default("transparent"),
    strokeWidth: z.number().finite().nonnegative().default(0),
    borderRadius: z.number().finite().nonnegative().default(0),
    shadow: deckElementShadowSchema.optional()
  })
  .default({});

export const textAlignSchema = z.enum([
  "left",
  "center",
  "right",
  "justify"
]);

export const textVerticalAlignSchema = z.enum(["top", "middle", "bottom"]);

export const textFontWeightSchema = z.union([
  z.enum(["normal", "medium", "semibold", "bold"]),
  z.number().int().min(100).max(900)
]);

export const textElementPropsSchema = z
  .object({
    text: z.string().default(""),
    fontFamily: z.string().min(1).optional(),
    fontSize: z.number().finite().positive().default(24),
    fontWeight: textFontWeightSchema.default("normal"),
    color: themeColorSchema.optional(),
    align: textAlignSchema.default("left"),
    verticalAlign: textVerticalAlignSchema.default("top"),
    lineHeight: z.number().finite().positive().default(1.2)
  })
  .default({});

export const imageFitSchema = z.enum(["contain", "cover", "stretch"]);

export const imageElementPropsSchema = z.object({
  src: z.string().min(1),
  alt: z.string().default(""),
  fit: imageFitSchema.default("contain")
});

export const groupElementPropsSchema = z
  .object({
    childElementIds: z.array(deckElementIdSchema).default([])
  })
  .default({});

export const customShapeElementPropsSchema = z.record(z.unknown()).default({});

type ShapeElementType =
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "polygon"
  | "star"
  | "ring";

const createShapeElementSchema = <TElementType extends ShapeElementType>(
  type: TElementType
) =>
  deckElementBaseSchema.extend({
    type: z.literal(type),
    props: shapeElementPropsSchema
  });

export const textElementSchema = deckElementBaseSchema.extend({
  type: z.literal("text"),
  props: textElementPropsSchema
});

export const rectElementSchema = createShapeElementSchema("rect");
export const ellipseElementSchema = createShapeElementSchema("ellipse");
export const lineElementSchema = createShapeElementSchema("line");
export const arrowElementSchema = createShapeElementSchema("arrow");
export const polygonElementSchema = createShapeElementSchema("polygon");
export const starElementSchema = createShapeElementSchema("star");
export const ringElementSchema = createShapeElementSchema("ring");

export const imageElementSchema = deckElementBaseSchema.extend({
  type: z.literal("image"),
  props: imageElementPropsSchema
});

export const groupElementSchema = deckElementBaseSchema.extend({
  type: z.literal("group"),
  props: groupElementPropsSchema
});

export const customShapeElementSchema = deckElementBaseSchema.extend({
  type: z.literal("customShape"),
  props: customShapeElementPropsSchema
});

export const chartElementSchema = deckElementBaseSchema.extend({
  type: z.literal("chart"),
  props: chartSchema
});

export const deckElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  rectElementSchema,
  ellipseElementSchema,
  lineElementSchema,
  arrowElementSchema,
  polygonElementSchema,
  starElementSchema,
  ringElementSchema,
  imageElementSchema,
  groupElementSchema,
  customShapeElementSchema,
  chartElementSchema
]);

export type DeckElementType = z.infer<typeof deckElementTypeSchema>;
export type DeckElementRole = z.infer<typeof deckElementRoleSchema>;
export type DeckElementPaint = z.infer<typeof deckElementPaintSchema>;
export type DeckElementShadow = z.infer<typeof deckElementShadowSchema>;
export type ShapeElementProps = z.infer<typeof shapeElementPropsSchema>;
export type TextAlign = z.infer<typeof textAlignSchema>;
export type TextVerticalAlign = z.infer<typeof textVerticalAlignSchema>;
export type TextFontWeight = z.infer<typeof textFontWeightSchema>;
export type TextElementProps = z.infer<typeof textElementPropsSchema>;
export type ImageFit = z.infer<typeof imageFitSchema>;
export type ImageElementProps = z.infer<typeof imageElementPropsSchema>;
export type GroupElementProps = z.infer<typeof groupElementPropsSchema>;
export type CustomShapeElementProps = z.infer<
  typeof customShapeElementPropsSchema
>;
export type DeckElement = z.infer<typeof deckElementSchema>;
