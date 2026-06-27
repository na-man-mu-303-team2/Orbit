import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import {
  AUTH_SESSION_STORE,
  RedisAuthSessionStore
} from "./auth-session.store";
import { AuthService } from "./auth.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: AUTH_SESSION_STORE,
      useClass: RedisAuthSessionStore
    }
  ],
  exports: [AuthService]
})
export class AuthModule {}
