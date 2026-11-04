import { ApiTags } from '@nestjs/swagger';
import { Controller, ForbiddenException, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { networkInterfaces } from 'os';
import { AppControlService } from './app-control.service';

@ApiTags('Приложение')
@Controller('app')
export class AppControlController {
  constructor(private readonly control: AppControlService) {}

  @Get()
  info() {
    return { appMode: this.control.appMode, version: '2.0.0' };
  }

  @Get('lan')
  lan() {
    const port = Number(process.env.PORT) || 3000;
    const addresses = Object.values(networkInterfaces())
      .flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal)
      .map((a) => `http://${a.address}:${port}`);
    return { addresses };
  }

  @Post('heartbeat')
  @HttpCode(204)
  heartbeat() {
    this.control.beat();
  }

  @Post('quit')
  quit(@Req() req: Request) {
    const ip = req.ip || '';
    if (!this.control.appMode) throw new ForbiddenException('Сервер запущен не в режиме приложения');
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) throw new ForbiddenException('Только с этого компьютера');
    this.control.quit();
    return { ok: true };
  }
}
