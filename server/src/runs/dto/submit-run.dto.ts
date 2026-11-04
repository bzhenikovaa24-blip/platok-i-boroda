import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class SubmitRunDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  teamId?: number;

  @ApiPropertyOptional({ example: 'Артур и Ко' })
  @IsOptional()
  @IsString()
  @Length(1, 24)
  teamName?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  levelId: number;

  @ApiProperty({ example: 42500, description: 'Время прохождения в миллисекундах' })
  @IsInt()
  @Min(1000)
  @Max(3_600_000)
  timeMs: number;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(0)
  gems: number;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(0)
  @Max(500)
  gemsTotal: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(10_000)
  deaths: number;

  @ApiProperty({ example: 3, minimum: 1, maximum: 3 })
  @IsInt()
  @Min(1)
  @Max(3)
  stars: number;
}
