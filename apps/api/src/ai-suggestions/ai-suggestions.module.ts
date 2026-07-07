import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { DecksModule } from "../decks/decks.module";
import { ProjectsModule } from "../projects/projects.module";
import { AiSuggestionEntity } from "./ai-suggestion.entity";
import { AiSuggestionsController } from "./ai-suggestions.controller";
import { AiSuggestionsService } from "./ai-suggestions.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([AiSuggestionEntity]),
    AuthModule,
    ProjectsModule,
    DecksModule
  ],
  controllers: [AiSuggestionsController],
  providers: [AiSuggestionsService]
})
export class AiSuggestionsModule {}
