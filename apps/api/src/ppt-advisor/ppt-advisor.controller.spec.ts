import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { authSessionCookieName } from "../auth/auth.constants";
import { PptAdvisorController } from "./ppt-advisor.controller";

const validBody = {
  question: "발표 장수를 추천해줘",
  brief: { duration: 7, tone: "friendly" },
  design: {
    mediaPolicy: "ai-generated",
    referencePolicy: "references-first",
  },
  history: [],
};

describe("PptAdvisorController", () => {
  it("requires an authenticated user and forwards validated input", async () => {
    const authService = {
      me: vi.fn().mockResolvedValue({ user: { userId: "user_1" } }),
    };
    const advisorService = {
      advise: vi.fn().mockResolvedValue({ answer: "7장", suggestions: [] }),
    };
    const controller = new PptAdvisorController(
      authService as never,
      advisorService as never,
    );

    await expect(
      controller.advise(validBody, {
        signedCookies: { [authSessionCookieName]: "session_1" },
      } as never),
    ).resolves.toEqual({ answer: "7장", suggestions: [] });
    expect(advisorService.advise).toHaveBeenCalledWith(
      expect.objectContaining({ question: "발표 장수를 추천해줘" }),
      "user_1",
    );
  });

  it("rejects missing authentication and malformed requests", async () => {
    const controller = new PptAdvisorController(
      { me: vi.fn().mockResolvedValue({ user: { userId: "user_1" } }) } as never,
      { advise: vi.fn() } as never,
    );

    await expect(controller.advise(validBody, { signedCookies: {} } as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      controller.advise(
        { ...validBody, question: "" },
        { signedCookies: { [authSessionCookieName]: "session_1" } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
