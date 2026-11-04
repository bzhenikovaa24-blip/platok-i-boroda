import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamsService } from './teams.service';

@ApiTags('Команды')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  findAll() {
    return this.teams.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Найти или создать команду' })
  create(@Body() body: CreateTeamDto) {
    return this.teams.findOrCreate(body.name);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teams.findOne(id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Лучшие результаты команды по уровням' })
  progress(@Param('id', ParseIntPipe) id: number) {
    return this.teams.progress(id);
  }
}
