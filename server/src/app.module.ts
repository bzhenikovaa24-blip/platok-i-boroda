import { Module } from '@nestjs/common';
import { AppControlModule } from './app/app-control.module';
import { AuthModule } from './auth/auth.module';
import { CustomLevelsModule } from './custom-levels/custom-levels.module';
import { DatabaseModule } from './database/database.module';
import { NetModule } from './net/net.module';
import { LevelsModule } from './levels/levels.module';
import { RacesModule } from './races/races.module';
import { RunsModule } from './runs/runs.module';
import { StatsModule } from './stats/stats.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [AppControlModule, DatabaseModule, LevelsModule, TeamsModule, RunsModule, RacesModule, StatsModule, CustomLevelsModule, AuthModule, NetModule],
})
export class AppModule {}
