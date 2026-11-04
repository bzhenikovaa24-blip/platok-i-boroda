import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from './auth.guard';
import { AuthService, TokenPayload } from './auth.service';
import { CredentialsDto } from './dto/credentials.dto';

@ApiTags('Профиль')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Регистрация игрока (создаёт команду с тем же именем)' })
  register(@Body() dto: CredentialsDto) {
    return this.auth.register(dto.username, dto.password);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Вход, возвращает токен' })
  login(@Body() dto: CredentialsDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Профиль и статистика текущего игрока' })
  me(@Req() req: { user: TokenPayload }) {
    return this.auth.profile(req.user.sub);
  }
}
