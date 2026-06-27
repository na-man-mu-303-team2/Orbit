import { describe, expect, it, vi } from "vitest";
import { FilesService } from "./files.service";

describe("ORBIT-10 FilesService", () => {
  it("creates upload metadata with the shared file contract fields", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T00:00:00.000Z"));

    try {
      const service = new FilesService();

      const file = service.create({
        projectId: "project_demo_1",
        originalName: "deck.pdf",
        mimeType: "application/pdf",
        size: 1024,
        purpose: "reference-material"
      });

      expect(file).toEqual({
        fileId: expect.stringMatching(/^file_\d+_\d+$/),
        projectId: "project_demo_1",
        originalName: "deck.pdf",
        mimeType: "application/pdf",
        size: 1024,
        url: `/uploads/${file.fileId}`,
        purpose: "reference-material",
        createdAt: "2026-06-28T00:00:00.000Z"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists only files that belong to the requested project", () => {
    const service = new FilesService();
    const first = service.create({
      projectId: "project_demo_1",
      originalName: "deck.pdf",
      mimeType: "application/pdf",
      size: 100,
      purpose: "reference-material"
    });
    service.create({
      projectId: "project_other_1",
      originalName: "notes.txt",
      mimeType: "text/plain",
      size: 50,
      purpose: "reference-material"
    });

    expect(service.list("project_demo_1")).toEqual([first]);
  });
});
