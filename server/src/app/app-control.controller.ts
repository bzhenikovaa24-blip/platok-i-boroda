import { ApiTags } from '@nestjs/swagger';
import { Controller, ForbiddenException, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { networkInterfaces } from 'os';
import { AppControlService } from './app-control.service';

function isLocal(req: Request) {
  const ip = req.ip || '';
  const proxied = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'];
  return !proxied && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
}

@ApiTags('Приложение')
@Controller('app')
export class AppControlController {
  constructor(private readonly control: AppControlService) {}

  @Get()
  info(@Req() req: Request) {
    return { appMode: this.control.appMode && isLocal(req), version: '2.0.0' };
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
  heartbeat(@Req() req: Request) {
    if (isLocal(req)) this.control.beat();
  }

  @Post('quit')
  quit(@Req() req: Request) {
    if (!this.control.appMode) throw new ForbiddenException('Сервер запущен не в режиме приложения');
    if (!isLocal(req)) throw new ForbiddenException('Только с этого компьютера');
    this.control.quit();
    return { ok: true };
  }
}
