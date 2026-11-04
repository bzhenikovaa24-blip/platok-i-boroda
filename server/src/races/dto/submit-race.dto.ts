import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

export class SubmitRaceDto {
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

  @ApiProperty({ example: 101 })
  @IsInt()
  @Min(1)
  levelId: number;

  @ApiProperty({ enum: ['girl', 'boy'] })
  @IsIn(['girl', 'boy'])
  winner: 'girl' | 'boy';

  @ApiPropertyOptional({ example: 25300, nullable: true })
  @ValidateIf((o) => o.girlMs !== null && o.girlMs !== undefined)
  @IsInt()
  @Min(1000)
  @Max(3_600_000)
  girlMs?: number | null;

  @ApiPropertyOptional({ example: 26100, nullable: true })
  @ValidateIf((o) => o.boyMs !== null && o.boyMs !== undefined)
  @IsInt()
  @Min(1000)
  @Max(3_600_000)
  boyMs?: number | null;
}
