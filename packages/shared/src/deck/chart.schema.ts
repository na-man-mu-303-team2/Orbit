import { z } from "zod";

import { themeColorSchema } from "./theme.schema";

export const chartTypeSchema = z.enum([
  "bar",
  "line",
  "pie",
  "doughnut",
  "scatter"
]);

export const chartLegendPositionSchema = z.enum([
  "top",
  "right",
  "bottom",
  "left"
]);

export const chartStyleSchema = z
  .object({
    colors: z.array(themeColorSchema).default([]),
    backgroundColor: themeColorSchema.optional(),
    textColor: themeColorSchema.optional(),
    showLegend: z.boolean().default(true),
    legendPosition: chartLegendPositionSchema.default("bottom"),
    showDataLabels: z.boolean().default(false),
    showGrid: z.boolean().default(true),
    xAxisTitle: z.string().default(""),
    yAxisTitle: z.string().default(""),
    unit: z.string().default("")
  })
  .default({});

export const cartesianChartDatumSchema = z.object({
  label: z.string().min(1),
  value: z.number().finite()
});

export const radialChartDatumSchema = z.object({
  label: z.string().min(1),
  value: z.number().finite().nonnegative()
});

export const scatterChartDatumSchema = z.object({
  label: z.string().min(1).optional(),
  x: z.number().finite(),
  y: z.number().finite()
});

const chartBaseSchema = z.object({
  title: z.string().default(""),
  style: chartStyleSchema
});

export const barChartSchema = chartBaseSchema.extend({
  type: z.literal("bar"),
  data: z.array(cartesianChartDatumSchema).default([])
});

export const lineChartSchema = chartBaseSchema.extend({
  type: z.literal("line"),
  data: z.array(cartesianChartDatumSchema).default([])
});

export const pieChartSchema = chartBaseSchema.extend({
  type: z.literal("pie"),
  data: z.array(radialChartDatumSchema).default([])
});

export const doughnutChartSchema = chartBaseSchema.extend({
  type: z.literal("doughnut"),
  data: z.array(radialChartDatumSchema).default([])
});

export const scatterChartSchema = chartBaseSchema.extend({
  type: z.literal("scatter"),
  data: z.array(scatterChartDatumSchema).default([])
});

export const chartSchema = z.discriminatedUnion("type", [
  barChartSchema,
  lineChartSchema,
  pieChartSchema,
  doughnutChartSchema,
  scatterChartSchema
]);

export type ChartType = z.infer<typeof chartTypeSchema>;
export type ChartLegendPosition = z.infer<typeof chartLegendPositionSchema>;
export type ChartStyle = z.infer<typeof chartStyleSchema>;
export type CartesianChartDatum = z.infer<typeof cartesianChartDatumSchema>;
export type RadialChartDatum = z.infer<typeof radialChartDatumSchema>;
export type ScatterChartDatum = z.infer<typeof scatterChartDatumSchema>;
export type ChartDatum =
  | CartesianChartDatum
  | RadialChartDatum
  | ScatterChartDatum;
export type Chart = z.infer<typeof chartSchema>;
