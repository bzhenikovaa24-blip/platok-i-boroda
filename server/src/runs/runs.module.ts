import { Module } from '@nestjs/common';
import { LevelsModule } from '../levels/levels.module';
import { TeamsModule } from '../teams/teams.module';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [TeamsModule, LevelsModule],
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule {}
