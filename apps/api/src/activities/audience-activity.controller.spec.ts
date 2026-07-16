import type { OrbitConfig } from "@orbit/config";
import {
  ForbiddenException,
  UnsupportedMediaTypeException
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AudienceActivityController } from "./audience-activity.controller";

describe("AudienceActivityController", () => {
  it("rejects non-JSON and cross-origin response mutations before persistence", async () => {
    const responses = { upsert: vi.fn() };
    const controller = new AudienceActivityController(
      responses as never,
      { getAudienceActivity: vi.fn() } as never
    );
    const config = Reflect.get(controller, "config") as OrbitConfig;

    await expect(
      controller.upsertResponse(
        "session_1",
        "activity_1",
        {},
        {
          headers: {
            origin: config.WEB_ORIGIN,
            "content-type": "application/jsonp"
          }
        } as never
      )
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    await expect(
      controller.upsertResponse(
        "session_1",
        "activity_1",
        {},
        {
          headers: {
            origin: "https://invalid.example",
            "content-type": "application/json"
          }
        } as never
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(responses.upsert).not.toHaveBeenCalled();
  });
});
