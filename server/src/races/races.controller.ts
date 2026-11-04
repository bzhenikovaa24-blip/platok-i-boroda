import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SubmitRaceDto } from './dto/submit-race.dto';
import { RacesService } from './races.service';

@ApiTags('Гонки')
@Controller('races')
export class RacesController {
  constructor(private readonly races: RacesService) {}

  @Post()
  @ApiOperation({ summary: 'Сохранить результат гонки' })
  submit(@Body() dto: SubmitRaceDto) {
    return this.races.submit(dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Счёт побед и лучшие времена' })
  @ApiQuery({ name: 'teamId', required: false })
  stats(@Query('teamId') teamId?: string) {
    return this.races.stats(teamId ? Number(teamId) : undefined);
  }
}
