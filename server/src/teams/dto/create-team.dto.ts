import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'Артур и Ко', description: 'Название команды, 1–24 символа' })
  @IsString()
  @Length(1, 24)
  name: string;
}
