import type { ExecutionContext } from "@nestjs/common";
import { ServiceUnavailableException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncJobAdmissionGuard } from "./async-job-admission.guard";

describe("AsyncJobAdmissionGuard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks marked endpoints while admission is draining", () => {
    vi.stubEnv("ASYNC_JOB_ADMISSION_MODE", "drain");
    const reflector = {
      getAllAndOverride: vi.fn(() => true),
    } as unknown as Reflector;
    const guard = new AsyncJobAdmissionGuard(reflector);

    expect(() => guard.canActivate(context())).toThrow(
      ServiceUnavailableException,
    );
  });

  it("keeps unmarked endpoints available while draining", () => {
    vi.stubEnv("ASYNC_JOB_ADMISSION_MODE", "drain");
    const reflector = {
      getAllAndOverride: vi.fn(() => false),
    } as unknown as Reflector;
    const guard = new AsyncJobAdmissionGuard(reflector);

    expect(guard.canActivate(context())).toBe(true);
  });

  function context(): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;
  }
});
