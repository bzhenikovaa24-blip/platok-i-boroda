import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LevelsService } from '../levels/levels.service';
import { TeamsService } from '../teams/teams.service';
import { SubmitRunDto } from './dto/submit-run.dto';


@Injectable()
export class RunsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly teams: TeamsService,
    private readonly levels: LevelsService,
  ) {}

  private int(value: unknown, field: string, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new BadRequestException(`${field}: ожидается целое число от ${min} до ${max}`);
    }
    return n;
  }

  submit(dto: SubmitRunDto) {
    if (!dto) throw new BadRequestException('Пустое тело запроса');
    const team = dto.teamId ? this.teams.findOne(this.int(dto.teamId, 'teamId', 1, 1e9)) : this.teams.findOrCreate(dto.teamName);
    const level = this.levels.findOne(this.int(dto.levelId, 'levelId', 1, 1e6));
    const timeMs = this.int(dto.timeMs, 'timeMs', 1000, 3_600_000);
    const gemsTotal = this.int(dto.gemsTotal, 'gemsTotal', 0, 500);
    const gems = this.int(dto.gems, 'gems', 0, gemsTotal);
    const deaths = this.int(dto.deaths, 'deaths', 0, 10_000);
    const stars = this.int(dto.stars, 'stars', 1, 3);

    const previous = this.db.get<{ best: number | null }>(
      'SELECT MIN(time_ms) AS best FROM runs WHERE team_id = ? AND level_id = ?',
      [team.id, level.id],
    );
    const { lastId } = this.db.run(
      `INSERT INTO runs (team_id, level_id, time_ms, gems, gems_total, deaths, stars)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [team.id, level.id, timeMs, gems, gemsTotal, deaths, stars],
    );
    const personalBest = previous.best === null || timeMs < previous.best;
    const rank = this.rankOf(level.id, team.id);
    return { id: lastId, team, levelId: level.id, timeMs, personalBest, rank };
  }

  rankOf(levelId: number, teamId: number): number {
    const rows = this.leaderboard(levelId, 1000);
    const idx = rows.findIndex((r) => r.teamId === teamId);
    return idx >= 0 ? idx + 1 : null;
  }

  leaderboard(levelId: number, limit = 10) {
    return this.db.all<any>(
      `WITH best AS (
         SELECT r.*, ROW_NUMBER() OVER (
           PARTITION BY r.team_id ORDER BY r.time_ms ASC, r.deaths ASC, r.id ASC
         ) AS rn
         FROM runs r WHERE r.level_id = ?
       )
       SELECT b.team_id AS teamId, t.name AS teamName, b.time_ms AS timeMs, b.gems, b.gems_total AS gemsTotal,
              b.deaths, b.stars, b.created_at AS createdAt
       FROM best b JOIN teams t ON t.id = b.team_id
       WHERE b.rn = 1
       ORDER BY b.time_ms ASC, b.deaths ASC
       LIMIT ?`,
      [levelId, limit],
    );
  }

  recent(limit = 20) {
    return this.db.all(
      `SELECT r.id, t.name AS teamName, l.name AS levelName, r.time_ms AS timeMs, r.gems, r.gems_total AS gemsTotal,
              r.deaths, r.stars, r.created_at AS createdAt
       FROM runs r JOIN teams t ON t.id = r.team_id JOIN levels l ON l.id = r.level_id
       ORDER BY r.id DESC LIMIT ?`,
      [limit],
    );
  }
}
