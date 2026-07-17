const clipboardImageExtensionByMime = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function getEditorClipboardImageFiles(
  clipboardData: Pick<DataTransfer, "files" | "items"> | null,
): File[] {
  if (!clipboardData) return [];

  const fileListImages = Array.from(clipboardData.files).filter(
    isClipboardImageFile,
  );
  const files =
    fileListImages.length > 0
      ? fileListImages
      : Array.from(clipboardData.items).flatMap((item) => {
          if (item.kind !== "file") return [];
          const file = item.getAsFile();
          return file && isClipboardImageFile(file) ? [file] : [];
        });

  return files.map(normalizeClipboardImageFileName);
}

function isClipboardImageFile(file: Pick<File, "name" | "type">) {
  if (file.type.toLowerCase().startsWith("image/")) return true;
  return /\.(?:jpe?g|png|webp)$/i.test(file.name);
}

function normalizeClipboardImageFileName(file: File, index: number) {
  if (file.name.trim()) return file;

  const extension = clipboardImageExtensionByMime.get(file.type.toLowerCase());
  if (!extension) return file;

  return new File(
    [file],
    index === 0
      ? `clipboard-image.${extension}`
      : `clipboard-image-${index + 1}.${extension}`,
    {
      lastModified: file.lastModified,
      type: file.type,
    },
  );
}
