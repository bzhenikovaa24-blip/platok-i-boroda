import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { exec } from 'child_process';
import * as http from 'http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppControlService } from './app/app-control.service';
import { paths } from './paths';

const port = Number(process.env.PORT) || 3000;
const url = `http://localhost:${port}`;

function openWindow() {
  if (!process.env.OPEN_BROWSER) return;
  if (process.platform === 'win32') {
    if (process.env.APP_MODE === '1') {
      exec(`start "" msedge --app=${url} --window-size=1280,860`, (err) => {
        if (err) exec(`start "" "${url}"`);
      });
    } else exec(`start "" "${url}"`);
  } else exec(`${process.platform === 'darwin' ? 'open' : 'xdg-open'} ${url}`);
}

function alreadyRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function bootstrap() {
  if (await alreadyRunning()) {
    Logger.log(`Игра уже запущена: ${url}`, 'Bootstrap');
    openWindow();
    return;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useWebSocketAdapter(new WsAdapter(app));
  const docs = new DocumentBuilder()
    .setTitle('Платок и Борода — API')
    .setDescription('REST API игры: уровни, команды, рекорды, гонки, свои уровни, профили игроков')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docs));
  app.enableShutdownHooks();
  app.useStaticAssets(paths.client);
  const control = app.get(AppControlService);
  control.onQuit(() => {
    app.close().finally(() => process.exit(0));
  });
  await app.listen(port);
  Logger.log(`Игра запущена: ${url}  (Ctrl+C — остановить сервер)`, 'Bootstrap');
  openWindow();
}

bootstrap();
