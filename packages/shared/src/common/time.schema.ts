import { z } from "zod";

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export function nowIso(): string {
  return new Date().toISOString();
}
