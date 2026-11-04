import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class CredentialsDto {
  @ApiProperty({ example: 'artur', description: 'Логин: 3–20 символов, буквы, цифры, _ и -' })
  @IsString()
  @Length(3, 20)
  @Matches(/^[\p{L}\d_-]+$/u, { message: 'Логин: только буквы, цифры, _ и -' })
  username: string;

  @ApiProperty({ example: 'secret123', description: 'Пароль: от 6 символов' })
  @IsString()
  @Length(6, 64)
  password: string;
}
