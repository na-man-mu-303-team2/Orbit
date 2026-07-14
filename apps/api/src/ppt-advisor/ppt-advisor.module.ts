import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PptAdvisorController } from "./ppt-advisor.controller";
import {
  PPT_ADVISOR_FETCH,
  PptAdvisorService,
} from "./ppt-advisor.service";

@Module({
  imports: [AuthModule],
  controllers: [PptAdvisorController],
  providers: [
    PptAdvisorService,
    {
      provide: PPT_ADVISOR_FETCH,
      useValue: fetch,
    },
  ],
})
export class PptAdvisorModule {}
