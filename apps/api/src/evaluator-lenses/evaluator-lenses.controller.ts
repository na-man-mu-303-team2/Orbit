import { Controller, Get, Req } from "@nestjs/common";

import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { EvaluatorLensesService } from "./evaluator-lenses.service";

@Controller("api/v1/evaluator-lenses")
export class EvaluatorLensesController {
  constructor(
    private readonly auth: AuthService,
    private readonly evaluatorLenses: EvaluatorLensesService,
  ) {}

  @Get()
  async list(@Req() request: SignedCookieRequest) {
    await getCurrentUser(this.auth, request);
    return this.evaluatorLenses.list();
  }
}
