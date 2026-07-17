import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SmartArtLayoutEntity } from "./smart-art-layout.entity";
import { SmartArtLayoutsService } from "./smart-art-layouts.service";

@Module({
  imports: [TypeOrmModule.forFeature([SmartArtLayoutEntity])],
  providers: [SmartArtLayoutsService],
  exports: [SmartArtLayoutsService]
})
export class SmartArtLayoutsModule {}
