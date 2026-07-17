import { Body, Controller, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest
} from "../auth/current-user";
import { GenerateDeckService } from "./generate-deck.service";

@Controller("api/v1/ai")
export class DeckColorOptionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly generateDeckService: GenerateDeckService
  ) {}

  @Post("deck-color-options")
  async createOptions(
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    await getCurrentUser(this.authService, request);
    return this.generateDeckService.createColorOptions(body);
  }

  @Post("deck-color-customization")
  async customizePalette(
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    await getCurrentUser(this.authService, request);
    return this.generateDeckService.customizeColorPalette(body);
  }
}
