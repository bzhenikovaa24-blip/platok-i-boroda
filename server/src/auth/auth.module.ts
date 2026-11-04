import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [TeamsModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
})
export class AuthModule {}
