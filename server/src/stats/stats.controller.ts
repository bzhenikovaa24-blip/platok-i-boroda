import { ApiTags } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@ApiTags('Статистика')
@Controller()
export class StatsController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'platok-i-boroda', time: new Date().toISOString() };
  }

  @Get('stats')
  stats() {
    const totals = this.db.get<any>(
      `SELECT (SELECT COUNT(*) FROM teams) AS teams,
              COUNT(*) AS runs,
              COALESCE(SUM(deaths), 0) AS deaths,
              COALESCE(SUM(gems), 0) AS gems,
              COALESCE(SUM(time_ms), 0) AS totalTimeMs
       FROM runs`,
    );
    const hardest = this.db.get<any>(
      `SELECT l.name, AVG(r.deaths) AS avgDeaths
       FROM runs r JOIN levels l ON l.id = r.level_id
       GROUP BY l.id ORDER BY avgDeaths DESC LIMIT 1`,
    );
    const perLevel = this.db.all(
      `SELECT l.id, l.name, COUNT(r.id) AS runs, MIN(r.time_ms) AS bestTimeMs,
              ROUND(AVG(r.deaths), 2) AS avgDeaths
       FROM levels l LEFT JOIN runs r ON r.level_id = l.id
       GROUP BY l.id ORDER BY l.id`,
    );
    return { ...totals, hardestLevel: hardest && hardest.avgDeaths > 0 ? hardest.name : null, perLevel };
  }
}
