import { Module } from '@nestjs/common';
import { CustomLevelsController } from './custom-levels.controller';
import { CustomLevelsService } from './custom-levels.service';

@Module({
  controllers: [CustomLevelsController],
  providers: [CustomLevelsService],
})
export class CustomLevelsModule {}
