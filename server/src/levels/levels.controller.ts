import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { LevelsService } from './levels.service';

@ApiTags('Уровни')
@Controller('levels')
export class LevelsController {
  constructor(private readonly levels: LevelsService) {}

  @Get()
  findAll() {
    return this.levels.findAll();
  }

  @Get('full')
  findAllFull() {
    return this.levels.findAllFull();
  }

  @Post('reload')
  reload() {
    return { loaded: this.levels.syncFromFile() };
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.levels.findOne(id);
  }
}
