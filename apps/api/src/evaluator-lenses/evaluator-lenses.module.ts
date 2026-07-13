import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { EvaluatorLensesController } from "./evaluator-lenses.controller";
import { EvaluatorLensesService } from "./evaluator-lenses.service";

@Module({
  imports: [AuthModule],
  controllers: [EvaluatorLensesController],
  providers: [EvaluatorLensesService],
  exports: [EvaluatorLensesService],
})
export class EvaluatorLensesModule {}
