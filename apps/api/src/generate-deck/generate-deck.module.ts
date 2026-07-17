import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { SavedDesignPacksModule } from "../saved-design-packs/saved-design-packs.module";
import { PresentationBriefsModule } from "../presentation-briefs/presentation-briefs.module";
import { AiDeckPreviewController } from "./ai-deck-preview.controller";
import { AiDeckPreviewService } from "./ai-deck-preview.service";
import { DeckColorOptionsController } from "./deck-color-options.controller";
import { GenerateDeckController } from "./generate-deck.controller";
import { GenerateDeckService } from "./generate-deck.service";
import { StoryPlanReviewController } from "./story-plan-review.controller";
import { StoryPlanReviewService } from "./story-plan-review.service";

@Module({
  imports: [
    AuthModule,
    FilesModule,
    JobsModule,
    PresentationBriefsModule,
    ProjectsModule,
    SavedDesignPacksModule
  ],
  controllers: [
    AiDeckPreviewController,
    DeckColorOptionsController,
    GenerateDeckController,
    StoryPlanReviewController
  ],
  providers: [AiDeckPreviewService, GenerateDeckService, StoryPlanReviewService]
})
export class GenerateDeckModule {}
