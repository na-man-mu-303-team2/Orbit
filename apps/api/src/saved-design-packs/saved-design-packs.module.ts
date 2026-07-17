import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { SavedDesignPackEntity } from "./saved-design-pack.entity";
import { SavedDesignPacksController } from "./saved-design-packs.controller";
import { SavedDesignPacksService } from "./saved-design-packs.service";

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([SavedDesignPackEntity])],
  controllers: [SavedDesignPacksController],
  providers: [SavedDesignPacksService],
  exports: [SavedDesignPacksService]
})
export class SavedDesignPacksModule {}
