import { Module } from '@nestjs/common';
import { LevelsModule } from '../levels/levels.module';
import { TeamsModule } from '../teams/teams.module';
import { RacesController } from './races.controller';
import { RacesService } from './races.service';

@Module({
  imports: [TeamsModule, LevelsModule],
  controllers: [RacesController],
  providers: [RacesService],
})
export class RacesModule {}
