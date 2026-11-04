import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import { DatabaseService } from '../database/database.service';
import { paths } from '../paths';
import { LevelDefinition, LevelSummary } from './level.types';

interface LevelRow {
  id: number;
  name: string;
  hint: string;
  par_seconds: number;
  width: number;
  height: number;
  map: string;
  objects: string;
  mode: string;
}

@Injectable()
export class LevelsService implements OnModuleInit {
  private readonly logger = new Logger('Levels');

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.ready;
    this.syncFromFile();
  }

  syncFromFile() {
    if (!fs.existsSync(paths.levelsFile)) {
      this.logger.warn(`Файл уровней не найден: ${paths.levelsFile}`);
      return 0;
    }
    const list: LevelDefinition[] = JSON.parse(fs.readFileSync(paths.levelsFile, 'utf-8'));
    this.db.transaction(() => {
      for (const l of list) {
        this.db.run(
          `INSERT INTO levels (id, name, hint, par_seconds, width, height, map, objects, mode, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, hint = excluded.hint, par_seconds = excluded.par_seconds,
             width = excluded.width, height = excluded.height, map = excluded.map,
             objects = excluded.objects, mode = excluded.mode, updated_at = excluded.updated_at`,
          [l.id, l.name, l.hint || '', l.par, l.width, l.height, l.map.join('\n'), JSON.stringify(l.objects || []), l.mode || 'campaign'],
        );
      }
    });
    this.logger.log(`Уровней загружено в базу: ${list.length}`);
    return list.length;
  }

  private toDefinition(r: LevelRow): LevelDefinition {
    return {
      id: r.id,
      name: r.name,
      hint: r.hint,
      par: r.par_seconds,
      width: r.width,
      height: r.height,
      map: r.map.split('\n'),
      objects: JSON.parse(r.objects),
      mode: r.mode === 'race' ? 'race' : 'campaign',
    };
  }

  findAllFull(): LevelDefinition[] {
    return this.db.all<LevelRow>('SELECT * FROM levels ORDER BY id').map((r) => this.toDefinition(r));
  }

  findAll(): LevelSummary[] {
    return this.findAllFull().map((l) => ({
      id: l.id,
      name: l.name,
      hint: l.hint,
      par: l.par,
      mode: l.mode,
      gems: l.map.join('').replace(/[^pg]/g, '').length,
    }));
  }

  findOne(id: number): LevelDefinition {
    const row = this.db.get<LevelRow>('SELECT * FROM levels WHERE id = ?', [id]);
    if (!row) throw new NotFoundException(`Уровень ${id} не найден`);
    return this.toDefinition(row);
  }
}
