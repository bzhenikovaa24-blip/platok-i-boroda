import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { paths } from '../paths';

const initSqlJs = require('sql.js');

type Row = Record<string, any>;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');
  private db: any;
  private saveTimer: NodeJS.Timeout | null = null;
  readonly file = paths.dbFile;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.open();
  }

  async onModuleInit() {
    await this.ready;
  }

  private async open() {
    const SQL = await initSqlJs({
      locateFile: (f: string) => path.join(path.dirname(require.resolve('sql.js')), f),
    });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      this.db = new SQL.Database(fs.readFileSync(this.file));
      this.logger.log(`База открыта: ${this.file}`);
    } else {
      this.db = new SQL.Database();
      this.logger.log(`Создана новая база: ${this.file}`);
    }
    this.db.run('PRAGMA foreign_keys = ON');
    this.migrate();
    this.saveNow();
  }

  onModuleDestroy() {
    this.saveNow();
  }

  private migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS levels (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        hint TEXT NOT NULL DEFAULT '',
        par_seconds INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        map TEXT NOT NULL,
        objects TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        level_id INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
        time_ms INTEGER NOT NULL,
        gems INTEGER NOT NULL,
        gems_total INTEGER NOT NULL,
        deaths INTEGER NOT NULL,
        stars INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_runs_level_time ON runs(level_id, time_ms);
      CREATE INDEX IF NOT EXISTS idx_runs_team ON runs(team_id);
      CREATE TABLE IF NOT EXISTS races (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        level_id INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
        winner TEXT NOT NULL CHECK (winner IN ('girl', 'boy')),
        girl_ms INTEGER,
        boy_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_races_team ON races(team_id);
      CREATE TABLE IF NOT EXISTS custom_levels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        author TEXT NOT NULL,
        data TEXT NOT NULL,
        plays INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        team_id INTEGER NOT NULL REFERENCES teams(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const cols = this.all<{ name: string }>('PRAGMA table_info(levels)').map((c) => c.name);
    if (!cols.includes('mode')) this.db.run("ALTER TABLE levels ADD COLUMN mode TEXT NOT NULL DEFAULT 'campaign'");
  }

  all<T = Row>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  }

  get<T = Row>(sql: string, params: any[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  run(sql: string, params: any[] = []): { lastId: number; changes: number } {
    this.db.run(sql, params);
    const lastId = this.get<{ id: number }>('SELECT last_insert_rowid() AS id').id;
    const changes = this.db.getRowsModified();
    this.scheduleSave();
    return { lastId, changes };
  }

  transaction(fn: () => void) {
    this.db.run('BEGIN');
    try {
      fn();
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 300);
  }

  saveNow() {
    if (!this.db) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const data: Uint8Array = this.db.export();
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, this.file);
  }
}
