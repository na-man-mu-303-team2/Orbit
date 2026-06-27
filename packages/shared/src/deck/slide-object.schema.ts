import { z } from "zod";

import { animationSchema } from "./animation.schema";
import { chartSchema } from "./chart.schema";

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

export const deckElementCoordinateSchema = z.number().finite().nonnegative();
export const deckElementSizeSchema = z.number().finite().positive();

export const deckElementBaseSchema = z.object({
  elementId: z.string().min(1),
  x: deckElementCoordinateSchema,
  y: deckElementCoordinateSchema,
  width: deckElementSizeSchema,
  height: deckElementSizeSchema,
  rotation: z.number().finite().default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
  zIndex: z.number().int().nonnegative().default(0),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  animations: z.array(animationSchema).default([])
});

const genericDeckElementPropsSchema = z.record(z.unknown()).default({});

const createGenericDeckElementSchema = <
  TElementType extends Exclude<z.infer<typeof deckElementTypeSchema>, "chart">
>(
  type: TElementType
) =>
  deckElementBaseSchema.extend({
    type: z.literal(type),
    props: genericDeckElementPropsSchema
  });

export const textElementSchema = createGenericDeckElementSchema("text");
export const rectElementSchema = createGenericDeckElementSchema("rect");
export const ellipseElementSchema = createGenericDeckElementSchema("ellipse");
export const lineElementSchema = createGenericDeckElementSchema("line");
export const arrowElementSchema = createGenericDeckElementSchema("arrow");
export const polygonElementSchema = createGenericDeckElementSchema("polygon");
export const starElementSchema = createGenericDeckElementSchema("star");
export const ringElementSchema = createGenericDeckElementSchema("ring");
export const imageElementSchema = createGenericDeckElementSchema("image");
export const groupElementSchema = createGenericDeckElementSchema("group");
export const customShapeElementSchema =
  createGenericDeckElementSchema("customShape");

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
export type DeckElement = z.infer<typeof deckElementSchema>;
