import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Team {
  id: number;
  name: string;
  createdAt: string;
}

@Injectable()
export class TeamsService {
  constructor(private readonly db: DatabaseService) {}

  normalize(name: unknown): string {
    if (typeof name !== 'string') throw new BadRequestException('name должен быть строкой');
    const clean = name.replace(/\s+/g, ' ').trim();
    if (clean.length < 1 || clean.length > 24) throw new BadRequestException('Название команды: от 1 до 24 символов');
    return clean;
  }

  findOrCreate(rawName: unknown): Team {
    const name = this.normalize(rawName);
    const existing = this.findByName(name);
    if (existing) return existing;
    const { lastId } = this.db.run('INSERT INTO teams (name) VALUES (?)', [name]);
    return this.findOne(lastId);
  }

  findByName(name: string): Team | undefined {
    return this.db.get<Team>('SELECT id, name, created_at AS createdAt FROM teams WHERE name = ?', [name]);
  }

  findOne(id: number): Team {
    const team = this.db.get<Team>('SELECT id, name, created_at AS createdAt FROM teams WHERE id = ?', [id]);
    if (!team) throw new NotFoundException(`Команда ${id} не найдена`);
    return team;
  }

  findAll() {
    return this.db.all(
      `SELECT t.id, t.name, t.created_at AS createdAt,
              COUNT(r.id) AS runs,
              COUNT(DISTINCT r.level_id) AS levelsCompleted,
              COALESCE(SUM(r.deaths), 0) AS deaths
       FROM teams t LEFT JOIN runs r ON r.team_id = t.id
       GROUP BY t.id ORDER BY levelsCompleted DESC, runs DESC`,
    );
  }

  progress(id: number) {
    this.findOne(id);
    return this.db.all(
      `SELECT level_id AS levelId,
              MIN(time_ms) AS bestTimeMs,
              MAX(stars) AS bestStars,
              MAX(gems) AS bestGems,
              COUNT(*) AS completions
       FROM runs WHERE team_id = ?
       GROUP BY level_id ORDER BY level_id`,
      [id],
    );
  }
}
