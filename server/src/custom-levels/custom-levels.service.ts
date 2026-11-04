import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CreateCustomLevelDto } from './dto/create-custom-level.dto';

const ALLOWED_TILES = new Set('.#IPGXabABpg'.split(''));
const ALLOWED_OBJECTS = new Set(['box', 'fan', 'portal', 'lever', 'gate']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface CustomRow {
  id: number;
  code: string;
  name: string;
  author: string;
  data: string;
  plays: number;
  created_at: string;
}

@Injectable()
export class CustomLevelsService {
  constructor(private readonly db: DatabaseService) {}

  private validateLevel(dto: CreateCustomLevelDto) {
    const { width, map, objects } = dto.level;
    map.forEach((row, i) => {
      if (row.length !== width) throw new BadRequestException(`Строка ${i}: длина ${row.length}, нужно ${width}`);
      for (const ch of row) if (!ALLOWED_TILES.has(ch)) throw new BadRequestException(`Недопустимый символ «${ch}» в строке ${i}`);
    });
    const all = map.join('');
    for (const [ch, title] of [['a', 'старт девочки'], ['b', 'старт бородача'], ['A', 'дверь девочки'], ['B', 'дверь бородача']]) {
      const n = all.split(ch).length - 1;
      if (n !== 1) throw new BadRequestException(`Нужен ровно один «${title}», найдено ${n}`);
    }
    for (const o of objects) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) throw new BadRequestException('Объект должен быть вида { type, x, y }');
      if (!ALLOWED_OBJECTS.has(String(o.type))) throw new BadRequestException(`Недопустимый объект: ${o.type}`);
      for (const key of ['x', 'y']) {
        const v = Number(o[key]);
        if (!Number.isInteger(v) || v < 0 || v >= (key === 'x' ? width : 20)) throw new BadRequestException(`Объект ${o.id}: ${key} вне карты`);
      }
    }
  }

  private makeCode(): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const bytes = randomBytes(6);
      const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!this.db.get('SELECT 1 FROM custom_levels WHERE code = ?', [code])) return code;
    }
    throw new Error('Не удалось придумать код');
  }

  create(dto: CreateCustomLevelDto) {
    this.validateLevel(dto);
    const code = this.makeCode();
    const { lastId } = this.db.run('INSERT INTO custom_levels (code, name, author, data) VALUES (?, ?, ?, ?)', [
      code,
      dto.name.trim(),
      dto.author.trim(),
      JSON.stringify(dto.level),
    ]);
    return { id: lastId, code };
  }

  list(limit = 30) {
    return this.db.all(
      `SELECT code, name, author, plays, created_at AS createdAt FROM custom_levels ORDER BY id DESC LIMIT ?`,
      [limit],
    );
  }

  findOne(code: string) {
    const row = this.db.get<CustomRow>('SELECT * FROM custom_levels WHERE code = ?', [code.toUpperCase()]);
    if (!row) throw new NotFoundException(`Уровень с кодом ${code} не найден`);
    return { code: row.code, name: row.name, author: row.author, plays: row.plays, createdAt: row.created_at, level: JSON.parse(row.data) };
  }

  play(code: string) {
    const { changes } = this.db.run('UPDATE custom_levels SET plays = plays + 1 WHERE code = ?', [code.toUpperCase()]);
    if (!changes) throw new NotFoundException(`Уровень с кодом ${code} не найден`);
    return { ok: true };
  }
}
