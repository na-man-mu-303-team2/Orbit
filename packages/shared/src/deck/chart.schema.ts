import { z } from "zod";

export const chartTypeSchema = z.enum([
  "bar",
  "line",
  "pie",
  "doughnut",
  "scatter"
]);

export const chartDatumSchema = z.object({
  label: z.string().min(1),
  value: z.number()
});

export const chartSchema = z.object({
  type: chartTypeSchema,
  data: z.array(chartDatumSchema).default([]),
  title: z.string().default("")
});

export type ChartType = z.infer<typeof chartTypeSchema>;
export type ChartDatum = z.infer<typeof chartDatumSchema>;
export type Chart = z.infer<typeof chartSchema>;
