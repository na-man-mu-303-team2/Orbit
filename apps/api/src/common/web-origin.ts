export function normalizeHttpOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveAllowedWebOrigins(webOrigin: string) {
  const normalizedOrigin = normalizeHttpOrigin(webOrigin);

  if (!normalizedOrigin) {
    return [];
  }

  const origins = new Set([normalizedOrigin]);
  const parsed = new URL(normalizedOrigin);

  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    const siblingHost = parsed.hostname === "localhost" ? "127.0.0.1" : "localhost";
    origins.add(`${parsed.protocol}//${siblingHost}${parsed.port ? `:${parsed.port}` : ""}`);
  }

  return [...origins];
}
