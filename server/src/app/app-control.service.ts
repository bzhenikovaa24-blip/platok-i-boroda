import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class AppControlService implements OnModuleDestroy {
  private readonly logger = new Logger('App');
  readonly appMode = process.env.APP_MODE === '1';
  private lastBeat = Date.now() + 60_000;
  private timer: NodeJS.Timeout | null = null;
  private quitHandler: () => void = () => process.exit(0);

  onQuit(handler: () => void) {
    this.quitHandler = handler;
    if (this.appMode && !this.timer) {
      this.timer = setInterval(() => {
        if (Date.now() - this.lastBeat > 45_000) {
          this.logger.log('Окно игры закрыто — выключаю сервер');
          this.quit();
        }
      }, 10_000);
    }
  }

  beat() {
    this.lastBeat = Math.max(this.lastBeat, Date.now());
  }

  quit() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    setTimeout(() => this.quitHandler(), 300);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
