import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomLevelsService } from './custom-levels.service';
import { CreateCustomLevelDto } from './dto/create-custom-level.dto';

@ApiTags('Редактор уровней')
@Controller('custom-levels')
export class CustomLevelsController {
  constructor(private readonly levels: CustomLevelsService) {}

  @Post()
  @ApiOperation({ summary: 'Сохранить свой уровень и получить код' })
  create(@Body() dto: CreateCustomLevelDto) {
    return this.levels.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Последние сохранённые уровни' })
  list(@Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number) {
    return this.levels.list(Math.min(Math.max(limit, 1), 100));
  }

  @Get(':code')
  @ApiOperation({ summary: 'Уровень по коду' })
  findOne(@Param('code') code: string) {
    return this.levels.findOne(code);
  }

  @Post(':code/play')
  @ApiOperation({ summary: 'Отметить, что уровень сыграли' })
  play(@Param('code') code: string) {
    return this.levels.play(code);
  }
}
