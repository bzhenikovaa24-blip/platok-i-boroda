import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LevelsService } from '../levels/levels.service';
import { TeamsService } from '../teams/teams.service';
import { SubmitRaceDto } from './dto/submit-race.dto';


@Injectable()
export class RacesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly teams: TeamsService,
    private readonly levels: LevelsService,
  ) {}

  private ms(value: unknown, field: string): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1000 || n > 3_600_000) throw new BadRequestException(`${field}: время в мс от 1000 до 3600000`);
    return n;
  }

  submit(dto: SubmitRaceDto) {
    if (!dto) throw new BadRequestException('Пустое тело запроса');
    if (dto.winner !== 'girl' && dto.winner !== 'boy') throw new BadRequestException('winner: girl или boy');
    const team = dto.teamId ? this.teams.findOne(Number(dto.teamId)) : this.teams.findOrCreate(dto.teamName);
    const level = this.levels.findOne(Number(dto.levelId));
    if (level.mode !== 'race') throw new BadRequestException('Это не гоночная трасса');
    const girlMs = this.ms(dto.girlMs, 'girlMs');
    const boyMs = this.ms(dto.boyMs, 'boyMs');
    const { lastId } = this.db.run(
      'INSERT INTO races (team_id, level_id, winner, girl_ms, boy_ms) VALUES (?, ?, ?, ?, ?)',
      [team.id, level.id, dto.winner, girlMs, boyMs],
    );
    return { id: lastId, ok: true };
  }

  stats(teamId?: number) {
    const where = teamId ? 'WHERE team_id = ?' : '';
    const params = teamId ? [teamId] : [];
    const totals = this.db.get<any>(
      `SELECT COALESCE(SUM(winner = 'girl'), 0) AS girlWins, COALESCE(SUM(winner = 'boy'), 0) AS boyWins, COUNT(*) AS races
       FROM races ${where}`,
      params,
    );
    const tracks = this.db.all(
      `SELECT level_id AS levelId, COUNT(*) AS races,
              SUM(winner = 'girl') AS girlWins, SUM(winner = 'boy') AS boyWins,
              MIN(girl_ms) AS bestGirlMs, MIN(boy_ms) AS bestBoyMs
       FROM races ${where} GROUP BY level_id ORDER BY level_id`,
      params,
    );
    return { ...totals, tracks };
  }
}
