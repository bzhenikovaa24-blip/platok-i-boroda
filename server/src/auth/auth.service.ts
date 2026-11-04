import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { paths } from '../paths';
import { TeamsService } from '../teams/teams.service';

export interface TokenPayload {
  sub: number;
  name: string;
  team: number;
  iat: number;
  exp: number;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  team_id: number;
  created_at: string;
}

const TOKEN_TTL = 60 * 60 * 24 * 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private secret: Buffer;

  constructor(
    private readonly db: DatabaseService,
    private readonly teams: TeamsService,
  ) {
    this.secret = this.loadSecret();
  }

  private loadSecret(): Buffer {
    if (process.env.AUTH_SECRET) return Buffer.from(process.env.AUTH_SECRET);
    const file = path.join(path.dirname(paths.dbFile), 'secret.key');
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const key = randomBytes(32);
      fs.writeFileSync(file, key);
      return key;
    } catch {
      this.logger.warn('Не удалось сохранить ключ, токены будут жить до перезапуска');
      return randomBytes(32);
    }
  }

  private hash(password: string, salt: string) {
    return scryptSync(password, salt, 64).toString('hex');
  }

  private b64(data: string | Buffer) {
    return Buffer.from(data).toString('base64url');
  }

  sign(user: { id: number; username: string; team_id: number }) {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = { sub: user.id, name: user.username, team: user.team_id, iat: now, exp: now + TOKEN_TTL };
    const head = this.b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = this.b64(JSON.stringify(payload));
    const sig = createHmac('sha256', this.secret).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
  }

  verify(token: string): TokenPayload {
    const parts = (token || '').split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Неверный токен');
    const expected = createHmac('sha256', this.secret).update(`${parts[0]}.${parts[1]}`).digest();
    const got = Buffer.from(parts[2], 'base64url');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) throw new UnauthorizedException('Неверный токен');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new UnauthorizedException('Срок входа истёк, войди снова');
    return payload;
  }

  register(username: string, password: string) {
    const name = username.trim();
    if (this.db.get('SELECT 1 FROM users WHERE username = ?', [name])) throw new ConflictException('Такой логин уже занят');
    const team = this.teams.findOrCreate(name);
    const salt = randomBytes(16).toString('hex');
    const { lastId } = this.db.run('INSERT INTO users (username, password_hash, salt, team_id) VALUES (?, ?, ?, ?)', [
      name,
      this.hash(password, salt),
      salt,
      team.id,
    ]);
    const user = { id: lastId, username: name, team_id: team.id };
    return { token: this.sign(user), user: { id: lastId, username: name, teamId: team.id } };
  }

  login(username: string, password: string) {
    const row = this.db.get<UserRow>('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!row) throw new UnauthorizedException('Неверный логин или пароль');
    const a = Buffer.from(this.hash(password, row.salt), 'hex');
    const b = Buffer.from(row.password_hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Неверный логин или пароль');
    return { token: this.sign(row), user: { id: row.id, username: row.username, teamId: row.team_id } };
  }

  profile(userId: number) {
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw new UnauthorizedException('Пользователь не найден');
    const runs = this.db.get<any>(
      `SELECT COUNT(*) AS runs, COUNT(DISTINCT level_id) AS levels, COALESCE(SUM(deaths), 0) AS deaths,
              COALESCE(SUM(time_ms), 0) AS totalTimeMs FROM runs WHERE team_id = ?`,
      [user.team_id],
    );
    const best = this.db.get<any>(
      `SELECT COALESCE(SUM(s), 0) AS stars, COALESCE(SUM(g), 0) AS gems FROM (
         SELECT MAX(stars) AS s, MAX(gems) AS g FROM runs WHERE team_id = ? GROUP BY level_id)`,
      [user.team_id],
    );
    const races = this.db.get<any>(
      `SELECT COUNT(*) AS races, COALESCE(SUM(winner = 'girl'), 0) AS girlWins, COALESCE(SUM(winner = 'boy'), 0) AS boyWins
       FROM races WHERE team_id = ?`,
      [user.team_id],
    );
    const customs = this.db.get<any>('SELECT COUNT(*) AS n FROM custom_levels WHERE author = ?', [user.username]);
    return {
      user: { id: user.id, username: user.username, teamId: user.team_id, createdAt: user.created_at },
      stats: { ...runs, ...best, ...races, customLevels: customs.n },
    };
  }
}
