import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';

const dbFile = path.join(os.tmpdir(), `pib-test-${process.pid}-${Date.now()}.db`);
process.env.DB_FILE = dbFile;
process.env.AUTH_SECRET = 'test-secret';

const { AppModule } = require('../src/app.module');

describe('Платок и Борода API (e2e)', () => {
  let app: INestApplication;
  let teamId: number;
  let token: string;
  let code: string;
  const username = `tester${Date.now() % 100000}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useWebSocketAdapter(new WsAdapter(app));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const f of [dbFile, path.join(path.dirname(dbFile), 'secret.key')]) {
      try { fs.unlinkSync(f); } catch {}
    }
  });

  const http = () => request(app.getHttpServer());

  it('GET /api/health отвечает ok', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/levels возвращает кампанию и гонки', async () => {
    const res = await http().get('/api/levels').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(35);
    expect(res.body.some((l: any) => l.mode === 'race')).toBe(true);
  });

  it('GET /api/levels/:id отдаёт карту 20 строк', async () => {
    const res = await http().get('/api/levels/1').expect(200);
    expect(res.body.map).toHaveLength(20);
  });

  it('GET /api/levels/9999 — 404', async () => {
    await http().get('/api/levels/9999').expect(404);
  });

  it('POST /api/teams создаёт команду и находит её повторно', async () => {
    const a = await http().post('/api/teams').send({ name: 'Test Team' }).expect(201);
    const b = await http().post('/api/teams').send({ name: 'test team' }).expect(201);
    expect(a.body.id).toBe(b.body.id);
    teamId = a.body.id;
  });

  it('POST /api/teams без имени — 400', async () => {
    await http().post('/api/teams').send({}).expect(400);
  });

  it('POST /api/runs сохраняет прохождение и даёт место в таблице', async () => {
    const res = await http()
      .post('/api/runs')
      .send({ teamId, levelId: 1, timeMs: 30000, gems: 8, gemsTotal: 8, deaths: 0, stars: 3 })
      .expect(201);
    expect(res.body.rank).toBe(1);
    expect(res.body.personalBest).toBe(true);
  });

  it('POST /api/runs с неверными звёздами — 400', async () => {
    await http().post('/api/runs').send({ teamId, levelId: 1, timeMs: 30000, gems: 1, gemsTotal: 8, deaths: 0, stars: 7 }).expect(400);
  });

  it('GET /api/leaderboard/1 содержит команду', async () => {
    const res = await http().get('/api/leaderboard/1').expect(200);
    expect(res.body[0].teamId).toBe(teamId);
  });

  it('GET /api/teams/:id/progress показывает уровень 1', async () => {
    const res = await http().get(`/api/teams/${teamId}/progress`).expect(200);
    expect(res.body.find((p: any) => p.levelId === 1).bestStars).toBe(3);
  });

  it('POST /api/races сохраняет гонку, а для обычного уровня — 400', async () => {
    await http().post('/api/races').send({ teamId, levelId: 101, winner: 'girl', girlMs: 25000, boyMs: 26000 }).expect(201);
    await http().post('/api/races').send({ teamId, levelId: 1, winner: 'girl', girlMs: 25000 }).expect(400);
    const st = await http().get(`/api/races/stats?teamId=${teamId}`).expect(200);
    expect(st.body.girlWins).toBe(1);
  });

  it('Редактор: сохранить уровень, получить по коду, отметить игру', async () => {
    const map = Array.from({ length: 20 }, (_, y) =>
      Array.from({ length: 32 }, (_, x) => (x === 0 || x === 31 || y === 0 || y === 19 ? '#' : '.')).join(''),
    );
    const row = map[18].split('');
    row[2] = 'a';
    row[4] = 'b';
    row[26] = 'A';
    row[28] = 'B';
    map[18] = row.join('');
    const res = await http()
      .post('/api/custom-levels')
      .send({ name: 'Тест', author: 'jest', level: { width: 32, height: 20, map, objects: [{ type: 'box', id: 'b1', x: 10, y: 18 }] } })
      .expect(201);
    code = res.body.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const got = await http().get(`/api/custom-levels/${code}`).expect(200);
    expect(got.body.level.map).toHaveLength(20);
    await http().post(`/api/custom-levels/${code}/play`).expect(201);
    const list = await http().get('/api/custom-levels').expect(200);
    expect(list.body[0].plays).toBe(1);
  });

  it('Редактор: уровень без дверей — 400', async () => {
    const map = Array.from({ length: 20 }, () => '#'.repeat(32));
    await http().post('/api/custom-levels').send({ name: 'x', author: 'y', level: { width: 32, height: 20, map, objects: [] } }).expect(400);
  });

  it('Регистрация, вход и профиль', async () => {
    const reg = await http().post('/api/auth/register').send({ username, password: 'secret123' }).expect(201);
    expect(reg.body.token).toBeTruthy();
    await http().post('/api/auth/register').send({ username, password: 'secret123' }).expect(409);
    await http().post('/api/auth/login').send({ username, password: 'wrong-pass' }).expect(401);
    const login = await http().post('/api/auth/login').send({ username, password: 'secret123' }).expect(200);
    token = login.body.token;
    const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.user.username).toBe(username);
    expect(me.body.stats).toBeDefined();
  });

  it('Профиль без токена — 401', async () => {
    await http().get('/api/auth/me').expect(401);
    await http().get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });

  it('GET /api/stats считает прохождения', async () => {
    const res = await http().get('/api/stats').expect(200);
    expect(res.body.runs).toBeGreaterThanOrEqual(1);
  });
});
