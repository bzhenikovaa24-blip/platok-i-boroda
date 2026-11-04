import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsInt, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

export class CustomLevelDataDto {
  @ApiProperty({ example: 32 })
  @IsInt()
  @Min(16)
  @Max(120)
  width: number;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(20)
  @Max(20)
  height: number;

  @ApiProperty({ type: [String], description: 'Строки карты: # стена, I лёд, P/G/X жижи, a/b старты, A/B двери, p/g кристаллы' })
  @IsArray()
  @ArrayMinSize(20)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  map: string[];

  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'Объекты: box, fan, portal, lever, gate' })
  @IsArray()
  @ArrayMaxSize(80)
  @Type(() => Object)
  objects: Record<string, unknown>[];
}

export class CreateCustomLevelDto {
  @ApiProperty({ example: 'Мой первый уровень' })
  @IsString()
  @Length(1, 32)
  name: string;

  @ApiProperty({ example: 'Артур и Ко' })
  @IsString()
  @Length(1, 24)
  author: string;

  @ApiProperty({ type: CustomLevelDataDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CustomLevelDataDto)
  level: CustomLevelDataDto;
}
