import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { ChallengeQnaController } from "./challenge-qna.controller";
import { ChallengeQnaEvidenceCache } from "./challenge-qna-evidence-cache";
import { ChallengeQnaService } from "./challenge-qna.service";

@Module({
  imports: [AuthModule, FilesModule, JobsModule, ProjectsModule],
  controllers: [ChallengeQnaController],
  providers: [ChallengeQnaService, ChallengeQnaEvidenceCache],
})
export class ChallengeQnaModule {}
