import { describe, expect, it, vi } from "vitest";
import type { Repository } from "typeorm";
import { SmartArtLayoutEntity } from "./smart-art-layout.entity";
import { SmartArtLayoutsService } from "./smart-art-layouts.service";

describe("SmartArtLayoutsService", () => {
  it("returns null instead of falling back to a preset with a different item count", async () => {
    const repository = {
      findOne: vi.fn(async () => null),
      find: vi.fn(),
    } as unknown as Repository<SmartArtLayoutEntity>;
    const service = new SmartArtLayoutsService(repository);

    await expect(service.findByTypeAndItemCount("card_grid", 6)).resolves.toBeNull();
    expect(repository.find).not.toHaveBeenCalled();
  });
});
