type ProjectAssetDescriptor = {
  fileId: string;
  projectId: string;
};

function parseProjectAssetDescriptor(src: string): ProjectAssetDescriptor | null {
  if (!src) {
    return null;
  }

  try {
    const baseOrigin =
      typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const url = new URL(src, baseOrigin);
    const proxyMatch = url.pathname.match(
      /^\/api\/v1\/projects\/([^/]+)\/assets\/([^/]+)\/content$/,
    );

    if (proxyMatch) {
      return {
        projectId: decodeURIComponent(proxyMatch[1]),
        fileId: decodeURIComponent(proxyMatch[2]),
      };
    }

    const nestedMinioMatch = url.pathname.match(
      /\/orbit-local\/projects\/([^/]+)\/assets\/([^/]+)\/[^/]+$/,
    );
    const flatUuidMinioMatch = url.pathname.match(
      /\/orbit-local\/projects\/([^/]+)\/assets\/(file_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-[^/]+$/,
    );
    const flatLegacyMinioMatch = url.pathname.match(
      /\/orbit-local\/projects\/([^/]+)\/assets\/([^/]+?)-[^/]+$/,
    );
    const minioMatch =
      nestedMinioMatch ?? flatUuidMinioMatch ?? flatLegacyMinioMatch;

    if (!minioMatch) {
      return null;
    }

    return {
      projectId: decodeURIComponent(minioMatch[1]),
      fileId: decodeURIComponent(minioMatch[2]),
    };
  } catch {
    return null;
  }
}

function createProjectAssetProxyPath(projectId: string, fileId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(
    fileId,
  )}/content`;
}

export function normalizeEditorAssetUrl(src: string) {
  const descriptor = parseProjectAssetDescriptor(src);

  if (!descriptor) {
    return src;
  }

  return createProjectAssetProxyPath(descriptor.projectId, descriptor.fileId);
}

export function resolveEditorAssetUrl(src: string) {
  if (!src) {
    return src;
  }

  if (typeof window === "undefined") {
    return normalizeEditorAssetUrl(src);
  }

  const normalizedPath = normalizeEditorAssetUrl(src);
  return normalizedPath.startsWith("/api/")
    ? `${window.location.origin}${normalizedPath}`
    : normalizedPath;
}
