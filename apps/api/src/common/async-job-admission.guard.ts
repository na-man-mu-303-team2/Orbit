import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

const asyncJobAdmissionMetadata = "orbit:async-job-admission";

export const RequiresAsyncJobAdmission = () =>
  SetMetadata(asyncJobAdmissionMetadata, true);

@Injectable()
export class AsyncJobAdmissionGuard implements CanActivate {
  private readonly mode =
    process.env.ASYNC_JOB_ADMISSION_MODE === "drain" ? "drain" : "enabled";

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresAdmission = this.reflector.getAllAndOverride<boolean>(
      asyncJobAdmissionMetadata,
      [context.getHandler(), context.getClass()],
    );

    if (!requiresAdmission || this.mode === "enabled") {
      return true;
    }

    throw new ServiceUnavailableException({
      code: "ASYNC_JOB_ADMISSION_DRAINING",
      message: "New asynchronous jobs are temporarily paused.",
    });
  }
}
