import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubmitRunDto } from './dto/submit-run.dto';
import { RunsService } from './runs.service';

@ApiTags('Прохождения')
@Controller()
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post('runs')
  @ApiOperation({ summary: 'Сохранить прохождение уровня' })
  submit(@Body() dto: SubmitRunDto) {
    return this.runs.submit(dto);
  }

  @Get('runs/recent')
  recent(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number) {
    return this.runs.recent(Math.min(limit, 100));
  }

  @Get('leaderboard/:levelId')
  @ApiOperation({ summary: 'Таблица рекордов уровня' })
  leaderboard(
    @Param('levelId', ParseIntPipe) levelId: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.runs.leaderboard(levelId, Math.min(limit, 100));
  }
}
