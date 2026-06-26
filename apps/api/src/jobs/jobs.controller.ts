import { jobTypeSchema } from "@orbit/shared";
import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { JobsService } from "./jobs.service";

const createJobSchema = z.object({
  projectId: z.string().min(1).optional(),
  type: jobTypeSchema,
  payload: z.record(z.unknown()).optional()
});

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  createJob(@Body() body: unknown) {
    return this.jobsService.create(createJobSchema.parse(body));
  }

  @Get(":jobId")
  async getJob(@Param("jobId") jobId: string) {
    const job = await this.jobsService.get(jobId);
    if (!job) {
      throw new NotFoundException(`Job not found: ${jobId}`);
    }
    return job;
  }
}

