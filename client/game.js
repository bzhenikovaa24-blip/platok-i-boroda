(() => {
  const T = 30;
  const VW = 960;
  const VH = 600;
  const GRAVITY = 1800;
  const JUMP_V = 720;
  const SPEED = 230;
  const MAX_FALL = 900;
  const PW = 20;
  const PH = 38;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);

  const Api = {
    online: false,
    async init() {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        this.online = r.ok;
      } catch {
        this.online = false;
      }
      return this.online;
    },
    token: null,
    async req(method, url, body) {
      const headers = {};
      if (body) headers["Content-Type"] = "application/json";
      if (this.token) headers["Authorization"] = "Bearer " + this.token;
      const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) {
        let msg = await r.text();
        try {
          const j = JSON.parse(msg);
          msg = Array.isArray(j.message) ? j.message.join("; ") : j.message || msg;
        } catch {}
        const err = new Error(msg);
        err.status = r.status;
        throw err;
      }
      return r.status === 204 ? null : r.json();
    },
    local(key, fallback) {
      try {
        const v = localStorage.getItem("duo:" + key);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    saveLocal(key, value) {
      try { localStorage.setItem("duo:" + key, JSON.stringify(value)); } catch {}
    },
    async levels() {
      if (this.online) return this.req("GET", "/api/levels/full");
      return window.EMBEDDED_LEVELS || [];
    },
    async team(name) {
      if (this.online) return this.req("POST", "/api/teams", { name });
      return { id: "local:" + name, name };
    },
    async progress(team) {
      if (this.online) return this.req("GET", `/api/teams/${team.id}/progress`);
      const runs = this.local("runs", []).filter((r) => r.teamName === team.name);
      const best = {};
      for (const r of runs) {
        const b = best[r.levelId];
        if (!b || r.timeMs < b.bestTimeMs) best[r.levelId] = { levelId: r.levelId, bestTimeMs: r.timeMs, bestStars: Math.max(r.stars, b ? b.bestStars : 0), bestGems: Math.max(r.gems, b ? b.bestGems : 0), completions: (b ? b.completions : 0) + 1 };
        else { b.bestStars = Math.max(b.bestStars, r.stars); b.bestGems = Math.max(b.bestGems || 0, r.gems); b.completions++; }
      }
      return Object.values(best);
    },
    async submit(run) {
      if (this.online) return this.req("POST", "/api/runs", run);
      const runs = this.local("runs", []);
      runs.push({ ...run, createdAt: new Date().toISOString() });
      this.saveLocal("runs", runs);
      const sorted = runs.filter((r) => r.levelId === run.levelId).sort((a, b) => a.timeMs - b.timeMs);
      return { rank: sorted.findIndex((r) => r === runs[runs.length - 1]) + 1, personalBest: true };
    },
    async leaderboard(levelId) {
      if (this.online) return this.req("GET", `/api/leaderboard/${levelId}`);
      const best = {};
      for (const r of this.local("runs", []).filter((r) => r.levelId === levelId)) {
        if (!best[r.teamName] || r.timeMs < best[r.teamName].timeMs) best[r.teamName] = r;
      }
      return Object.values(best).sort((a, b) => a.timeMs - b.timeMs).slice(0, 10);
    },
    async saveCustom(body) {
      if (this.online) return this.req("POST", "/api/custom-levels", body);
      const all = this.local("customs", []);
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      all.unshift({ ...body, code, plays: 0, createdAt: new Date().toISOString() });
      this.saveLocal("customs", all.slice(0, 50));
      return { code };
    },
    async getCustom(code) {
      if (this.online) return this.req("GET", `/api/custom-levels/${encodeURIComponent(code)}`);
      const lv = this.local("customs", []).find((x) => x.code === code);
      if (!lv) throw new Error("not found");
      return lv;
    },
    async listCustom() {
      if (this.online) return this.req("GET", "/api/custom-levels");
      return this.local("customs", []);
    },
    async playCustom(code) {
      if (this.online) return this.req("POST", `/api/custom-levels/${encodeURIComponent(code)}/play`);
      return { ok: true };
    },
    async stats() {
      if (this.online) return this.req("GET", "/api/stats");
      const runs = this.local("runs", []);
      return {
        teams: new Set(runs.map((r) => r.teamName)).size,
        runs: runs.length,
        deaths: runs.reduce((s, r) => s + r.deaths, 0),
        gems: runs.reduce((s, r) => s + r.gems, 0),
      };
    },
    async submitRace(r) {
      if (this.online) return this.req("POST", "/api/races", r);
      const list = this.local("races", []);
      list.push({ ...r, createdAt: new Date().toISOString() });
      this.saveLocal("races", list);
      return { ok: true };
    },
    async raceStats(team) {
      if (this.online) return this.req("GET", `/api/races/stats?teamId=${team.id}`);
      const list = this.local("races", []).filter((r) => r.teamName === team.name);
      const tracks = {};
      for (const r of list) {
        const t = tracks[r.levelId] || (tracks[r.levelId] = { levelId: r.levelId, races: 0, girlWins: 0, boyWins: 0, bestGirlMs: null, bestBoyMs: null });
        t.races++;
        if (r.winner === "girl") t.girlWins++; else t.boyWins++;
        if (r.girlMs && (!t.bestGirlMs || r.girlMs < t.bestGirlMs)) t.bestGirlMs = r.girlMs;
        if (r.boyMs && (!t.bestBoyMs || r.boyMs < t.bestBoyMs)) t.bestBoyMs = r.boyMs;
      }
      return {
        girlWins: list.filter((r) => r.winner === "girl").length,
        boyWins: list.filter((r) => r.winner === "boy").length,
        tracks: Object.values(tracks),
      };
    },
  };

  const Ghosts = {
    load(id) {
      const all = Api.local("ghosts", {});
      return all[id] || {};
    },
    save(id, kind, data) {
      const all = Api.local("ghosts", {});
      all[id] = all[id] || {};
      all[id][kind] = data;
      Api.saveLocal("ghosts", all);
    },
  };

  const Ach = {
    list: [
      { id: "first", icon: "✦", title: "Первые шаги", desc: "Пройти первый уровень" },
      { id: "flawless", icon: "♥", title: "Без царапины", desc: "Пройти уровень без единой смерти" },
      { id: "collector", icon: "◆", title: "Коллекционер", desc: "Собрать все кристаллы на уровне" },
      { id: "three", icon: "★", title: "Три звезды", desc: "Получить три звезды на уровне" },
      { id: "boss1", icon: "☗", title: "Охотник на стражей", desc: "Победить первого босса" },
      { id: "perfectboss", icon: "♛", title: "Идеальный бой", desc: "Пройти уровень с боссом без смертей" },
      { id: "half", icon: "◐", title: "Половина пути", desc: "Пройти 15 уровней" },
      { id: "allboss", icon: "☠", title: "Гроза храма", desc: "Победить всех боссов обеих глав" },
      { id: "chapter2", icon: "❄", title: "Покорители подземья", desc: "Пройти вторую главу до конца" },
      { id: "builder", icon: "▦", title: "Архитектор", desc: "Сохранить свой уровень в редакторе" },
      { id: "shopper", icon: "◈", title: "Обновка", desc: "Купить образ в магазине" },
      { id: "final", icon: "♜", title: "Храм ваш", desc: "Пройти последний, 30-й уровень" },
      { id: "starfall", icon: "✶", title: "Звездопад", desc: "Собрать 45 звёзд в сумме" },
      { id: "race1", icon: "⚑", title: "Первый финиш", desc: "Закончить первую гонку" },
      { id: "photo", icon: "◎", title: "Фотофиниш", desc: "Выиграть гонку с отрывом меньше секунды" },
      { id: "queen", icon: "♀", title: "Королева трассы", desc: "Девочка выиграла 5 гонок" },
      { id: "king", icon: "♂", title: "Король трассы", desc: "Бородач выиграл 5 гонок" },
      { id: "marathon", icon: "∞", title: "Марафон", desc: "Проехать все пять трасс" },
      { id: "fashion", icon: "✿", title: "Модники", desc: "Сменить образ в меню «Образы»" },
      { id: "stubborn", icon: "⟳", title: "Упорство", desc: "Погибнуть 50 раз и не сдаться" },
    ],
    state: {},
    stats: { deaths: 0, girlWins: 0, boyWins: 0, tracks: [] },
    load() {
      this.state = Api.local("ach", {});
      this.stats = { ...this.stats, ...Api.local("achstats", {}) };
    },
    has(id) { return !!this.state[id]; },
    unlock(id) {
      if (this.state[id]) return;
      const a = this.list.find((x) => x.id === id);
      if (!a) return;
      this.state[id] = Date.now();
      Api.saveLocal("ach", this.state);
      setTimeout(() => {
        achToast(a);
        Sound.checkpoint();
      }, 900);
    },
    bump(key, n = 1) {
      this.stats[key] = (this.stats[key] || 0) + n;
      Api.saveLocal("achstats", this.stats);
      if (this.stats.deaths >= 50) this.unlock("stubborn");
    },
    afterLevel(g, stars) {
      const id = g.def.id;
      const boss = g.world.boss;
      if (id === 1) this.unlock("first");
      if (g.deaths === 0) this.unlock("flawless");
      if (g.gemsTotal > 0 && g.gemsCollected === g.gemsTotal) this.unlock("collector");
      if (stars === 3) this.unlock("three");
      if (boss) {
        this.unlock("boss1");
        if (g.deaths === 0) this.unlock("perfectboss");
      }
      if (id === 30) this.unlock("final");
      if (id === 35) this.unlock("chapter2");
    },
    afterProgress() {
      const done = Object.keys(progress).length;
      if (done >= 15) this.unlock("half");
      const bossIds = LEVELS.filter((l) => l.width > 32).map((l) => l.id);
      if (bossIds.length && bossIds.every((b) => progress[b])) this.unlock("allboss");
      const stars = Object.values(progress).reduce((s, p) => s + (p.bestStars || 0), 0);
      if (stars >= 45) this.unlock("starfall");
    },
    afterRace(g) {
      this.unlock("race1");
      const [a, b] = g.heroes.map((h) => h.finishT);
      if (a !== null && b !== null && Math.abs(a - b) < 1) this.unlock("photo");
      if (g.winner === "girl") this.bump("girlWins"); else this.bump("boyWins");
      if (this.stats.girlWins >= 5) this.unlock("queen");
      if (this.stats.boyWins >= 5) this.unlock("king");
      const tr = new Set(this.stats.tracks || []);
      tr.add(g.def.id);
      this.stats.tracks = [...tr];
      Api.saveLocal("achstats", this.stats);
      if (RACES.length && RACES.every((r) => tr.has(r.id))) this.unlock("marathon");
    },
  };

  const Settings = {
    volume: 0.7,
    music: true,
    shake: true,
    quality: "high",
    load() {
      try { Object.assign(this, JSON.parse(localStorage.getItem("duo:settings") || "{}")); } catch {}
    },
    save() {
      try {
        localStorage.setItem("duo:settings", JSON.stringify({ volume: this.volume, music: this.music, shake: this.shake, quality: this.quality }));
      } catch {}
    },
  };
  Settings.load();

  const Sound = {
    ctx: null,
    on: true,
    master: null,
    ensure() {
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          this.master = this.ctx.createGain();
          this.master.gain.value = Settings.volume;
          this.master.connect(this.ctx.destination);
        } catch {}
      }
    },
    tone(freq, dur, type = "square", vol = 0.06, slide = 0) {
      if (!this.on) return;
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur);
    },
    setVolume(v) {
      Settings.volume = v;
      if (this.master) this.master.gain.value = v;
    },
    jump(who) { this.tone(who === "girl" ? 520 : 330, 0.12, "square", 0.04, 260); },
    gem(who) { this.tone(who === "girl" ? 1180 : 880, 0.09, "triangle", 0.07); setTimeout(() => this.tone(who === "girl" ? 1560 : 1170, 0.12, "triangle", 0.06), 70); },
    lever() { this.tone(200, 0.08, "square", 0.05, -60); },
    button() { this.tone(300, 0.05, "sine", 0.06); },
    death() { this.tone(300, 0.5, "sawtooth", 0.07, -260); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, "triangle", 0.07), i * 110)); },
    checkpoint() { [660, 880, 990].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, "sine", 0.07), i * 80)); },
    boss() { this.tone(90, 0.9, "sawtooth", 0.08, 40); setTimeout(() => this.tone(70, 0.9, "sawtooth", 0.07, -20), 300); },
    bossHit() { this.tone(160, 0.35, "square", 0.08, -100); setTimeout(() => this.tone(1200, 0.2, "triangle", 0.06), 60); },
    bossDown() { [392, 330, 262, 196, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, i < 4 ? "sawtooth" : "triangle", 0.07), i * 120)); },
    drip() { this.tone(700, 0.12, "sine", 0.04, -400); },
    portal() { this.tone(300, 0.25, "sine", 0.06, 900); setTimeout(() => this.tone(1200, 0.15, "triangle", 0.04, -600), 80); },
    go() { this.tone(880, 0.35, "square", 0.07); setTimeout(() => this.tone(1320, 0.3, "triangle", 0.06), 90); },
  };

  const Music = {
    playing: false,
    timer: null,
    step: 0,
    next: 0,
    bus: null,
    scale: [0, 3, 5, 7, 10, 12, 15, 17],
    song: [[57, 0], [53, 2], [48, 4], [55, 3]],
    start() {
      if (this.playing || !Settings.music) return;
      Sound.ensure();
      if (!Sound.ctx) return;
      const c = Sound.ctx;
      this.bus = c.createGain();
      this.bus.gain.value = 0.0001;
      this.bus.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 1.5);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      this.bus.connect(lp).connect(Sound.master);
      this.playing = true;
      this.next = c.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 60);
    },
    stop() {
      if (!this.playing) return;
      this.playing = false;
      clearInterval(this.timer);
      const c = Sound.ctx;
      const bus = this.bus;
      bus.gain.setTargetAtTime(0.0001, c.currentTime, 0.3);
      setTimeout(() => bus.disconnect(), 1500);
    },
    note(midi, t, dur, type, vol) {
      const c = Sound.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    tick() {
      const c = Sound.ctx;
      const beat = 60 / 96 / 2;
      while (this.next < c.currentTime + 0.25) {
        const bar = Math.floor(this.step / 8) % this.song.length;
        const [root, shift] = this.song[bar];
        const i = this.step % 8;
        if (i % 4 === 0) this.note(root - 24, this.next, beat * 3.5, "triangle", 0.09);
        if (i === 6) this.note(root - 17, this.next, beat * 1.5, "triangle", 0.05);
        const arp = this.scale[(i * 3 + shift) % this.scale.length];
        if (i % 2 === 0 || (this.step * 7) % 5 === 0) this.note(root + arp, this.next, beat * 0.9, "sine", 0.035);
        if (i === 3 && bar % 2 === 1) this.note(root + 12 + this.scale[(bar + 4) % 8], this.next, beat * 2.5, "sine", 0.025);
        this.next += beat;
        this.step++;
      }
    },
  };

  const Pads = {
    prev: [{}, {}],
    poll() {
      if (!navigator.getGamepads) return;
      let pads;
      try { pads = navigator.getGamepads(); } catch { return; }
      const list = [...pads].filter(Boolean);
      for (let i = 0; i < 2; i++) {
        const p = list[i];
        const st = p ? {
          L: p.axes[0] < -0.4 || (p.buttons[14] && p.buttons[14].pressed),
          R: p.axes[0] > 0.4 || (p.buttons[15] && p.buttons[15].pressed),
          J: (p.buttons[0] && p.buttons[0].pressed) || (p.buttons[12] && p.buttons[12].pressed),
          S: (p.buttons[1] && p.buttons[1].pressed) || (p.buttons[2] && p.buttons[2].pressed) || (p.buttons[13] && p.buttons[13].pressed),
          P: p.buttons[9] && p.buttons[9].pressed,
        } : {};
        for (const k of ["L", "R", "J", "S", "P"]) {
          const code = `Pad${i}${k}`;
          if (st[k] && !this.prev[i][k]) { pressed.add(code); keys.add(code); }
          if (!st[k] && this.prev[i][k]) keys.delete(code);
        }
        this.prev[i] = st;
      }
    },
  };

  const keys = new Set();
  const pressed = new Set();
  window.addEventListener("keydown", (e) => {
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    Sound.ensure();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  const CONTROLS = {
    girl: { left: ["KeyA", "Pad0L"], right: ["KeyD", "Pad0R"], jump: ["KeyW", "Pad0J"], act: ["KeyS", "Pad0S"] },
    boy: { left: ["ArrowLeft", "Pad1L"], right: ["ArrowRight", "Pad1R"], jump: ["ArrowUp", "Pad1J"], act: ["ArrowDown", "Pad1S"] },
  };
  const held = (list) => list.some((k) => keys.has(k));
  const hit = (list) => list.some((k) => pressed.has(k));

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  const LIQUID = { P: "pink", G: "gold", X: "green" };
  const SOLID = new Set(["#", "P", "G", "X", "I"]);

  const COLORS = {
    pink: ["#ff5fa8", "#ffa3cd", "#c2306f"],
    gold: ["#f2b636", "#ffe08a", "#b07a12"],
    green: ["#4fd36b", "#a8f7a0", "#1f7a35"],
  };

  const SKINS = {
    girl: [
      { name: "Классика", sweater: "#ffd3e4", sweaterDark: "#f0b4cc", scarf: "#1c1b22", scarfDark: "#0d0d12", skirt: "#16161c", skirtLight: "#2a2a33", flat: "#121216" },
      { name: "Мята", sweater: "#c5f0dd", sweaterDark: "#9fd9c0", scarf: "#1f2b55", scarfDark: "#121a38", skirt: "#1e3a31", skirtLight: "#2f5547", flat: "#151a22" },
      { name: "Лаванда", sweater: "#ddd0ff", sweaterDark: "#c0adf2", scarf: "#5c1732", scarfDark: "#3d0d21", skirt: "#2a2333", skirtLight: "#3e3449", flat: "#1b1620" },
      { name: "Карамель", sweater: "#f3e2c4", sweaterDark: "#dcc59d", scarf: "#4a2d22", scarfDark: "#2f1b14", skirt: "#3a2a20", skirtLight: "#56402f", flat: "#2a1c14" },
      { name: "Небо", sweater: "#cfe6ff", sweaterDark: "#a9cdf5", scarf: "#eeeef4", scarfDark: "#c9c9d6", skirt: "#1d2b4f", skirtLight: "#2e4170", flat: "#1d2b4f" },
      { name: "Вишня", sweater: "#ff9fb4", sweaterDark: "#ec7f98", scarf: "#2b0f1a", scarfDark: "#170810", skirt: "#4a1424", skirtLight: "#6a2236", flat: "#1a0b10" },
    ],
    boy: [
      { name: "Классика", top: "#1b2a4e", topLight: "#2a3d6b", sleeve: "#142140", pants: "#c4c8cf", shoe: "#7cc8ff", sole: "#f4f7fb", cap: "#d8c39a", capDark: "#8a6a3c", brim: "#6b4f2a", beard: "#3a2417" },
      { name: "Ночь", top: "#1b1b21", topLight: "#2b2b33", sleeve: "#141418", pants: "#3a3d45", shoe: "#f2f2f2", sole: "#ffffff", cap: "#2a2a30", capDark: "#6a6a75", brim: "#18181c", beard: "#1e140e" },
      { name: "Олива", top: "#4b5a2e", topLight: "#5e6f3c", sleeve: "#3d4a24", pants: "#d8ccb0", shoe: "#f4f4f4", sole: "#d0d0d0", cap: "#a89a6a", capDark: "#5f5534", brim: "#4f4628", beard: "#4a2e1a" },
      { name: "Бордо", top: "#6a1f2e", topLight: "#832b3d", sleeve: "#561826", pants: "#4a4d55", shoe: "#1d1d22", sole: "#f0f0f0", cap: "#efe6d2", capDark: "#a08d66", brim: "#7a6a4a", beard: "#3a2417" },
      { name: "Спорт", top: "#e9e9ee", topLight: "#ffffff", sleeve: "#cfd0d8", pants: "#262a33", shoe: "#ff6a3d", sole: "#ffffff", cap: "#1f3d7a", capDark: "#a9c4ff", brim: "#142a55", beard: "#2c1a10" },
      { name: "Рыжий", top: "#2f4f4f", topLight: "#3e6464", sleeve: "#253f3f", pants: "#b8a88a", shoe: "#8a5a32", sole: "#e8dcc8", cap: "#c96a2a", capDark: "#7a3a12", brim: "#5a2a0a", beard: "#8a3f18" },
    ],
  };
  const skinSel = { girl: 0, boy: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem("duo:skins") || "{}");
    if (SKINS.girl[saved.girl]) skinSel.girl = saved.girl;
    if (SKINS.boy[saved.boy]) skinSel.boy = saved.boy;
    if (!localStorage.getItem("duo:owned") && (skinSel.girl || skinSel.boy)) {
      localStorage.setItem("duo:owned", JSON.stringify({ girl: [0, skinSel.girl], boy: [0, skinSel.boy] }));
    }
  } catch {}

  let LEVELS = [];
  let RACES = [];
  let ALL = [];
  let game = null;
  let state = "menu";
  let team = null;
  let progress = {};
  let paused = false;
  let lastTime = 0;
  let animT = 0;
  let BOT = false;

  class World {
    constructor(def) {
      this.def = def;
      this.grid = def.map.map((r) => r.split(""));
      this.w = def.width;
      this.h = def.height;
      this.gems = [];
      this.doors = {};
      this.spawn = {};
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const c = this.grid[y][x];
          if (c === "a") this.spawn.girl = { x, y };
          else if (c === "b") this.spawn.boy = { x, y };
          else if (c === "A") this.doors.girl = { x: x * T, y: (y - 1) * T, w: T, h: 2 * T, open: 0 };
          else if (c === "B") this.doors.boy = { x: x * T, y: (y - 1) * T, w: T, h: 2 * T, open: 0 };
          else if (c === "p" || c === "g") this.gems.push({ x: x * T + T / 2, y: y * T + T / 2, owner: c === "p" ? "girl" : "boy", taken: false, phase: Math.random() * 6 });
          if ("abABpg".includes(c)) this.grid[y][x] = ".";
        }
      }
      this.buttons = [];
      this.levers = [];
      this.gates = [];
      this.movers = [];
      this.boxes = [];
      this.checkpoints = [];
      this.finishes = {};
      this.fans = [];
      this.portals = [];
      this.dark = !!def.dark;
      this.boss = null;
      for (const o of def.objects || []) {
        if (o.type === "button") this.buttons.push({ id: o.id, x: o.x * T, y: o.y * T, pressed: false, depth: 0 });
        if (o.type === "lever") this.levers.push({ id: o.id, x: o.x * T, y: o.y * T, on: false, angle: -0.6 });
        if (o.type === "gate") this.gates.push({ id: o.id, x: o.x * T, y: o.y * T, w: o.w * T, fullH: o.h * T, h: o.h * T, open: 0, trigger: o.trigger || [], kind: "gate" });
        if (o.type === "lift" || o.type === "platform") {
          this.movers.push({
            id: o.id, kind: "mover", loop: o.type === "platform",
            x0: o.x * T, y0: o.y * T, x1: o.tx * T, y1: o.ty * T,
            x: o.x * T, y: o.y * T, w: o.w * T, h: o.h * T,
            speed: o.speed || 80, trigger: o.trigger || [], dir: 1, dx: 0, dy: 0, wait: 0,
          });
        }
        if (o.type === "box") this.boxes.push({ id: o.id, kind: "box", x: o.x * T + 1, y: o.y * T + 1, w: T - 2, h: T - 2, vy: 0, ground: null });
        if (o.type === "checkpoint") this.checkpoints.push({ id: o.id, lane: o.lane || null, tx: o.x, ty: o.y, x: o.x * T, y: o.y * T, touched: { girl: false, boy: false }, active: false, current: false, glow: 0 });
        if (o.type === "finish") this.finishes[o.lane] = { x: o.x * T, y: o.y * T, tx: o.x, ty: o.y };
        if (o.type === "fan") this.fans.push({ x: o.x * T, y: o.y * T, w: (o.w || 1) * T, h: (o.h || 4) * T, power: o.power || 1 });
        if (o.type === "portal") this.portals.push({ id: o.id, to: o.to, x: o.x * T, y: o.y * T, w: T, h: 2 * T, hue: o.hue || 190 });
        if (o.type === "boss") this.boss = new Boss(o);
      }
      this.pxW = this.w * T;
      for (const p of this.portals) p.pair = this.portals.find((q) => q.id === p.to) || null;
      this.torches = this.placeTorches();
      this.gemTotal = { girl: this.gems.filter((g) => g.owner === "girl").length, boy: this.gems.filter((g) => g.owner === "boy").length };
      this.staticLayer = this.renderStatic();
      this.bgLayer = makeBackground(Math.max(VW, VW + (this.pxW - VW) * 0.35), this.def.id || 1);
    }

    placeTorches() {
      const out = [];
      for (let y = 3; y < this.h - 1; y++) {
        for (let x = 2; x < this.w - 2; x++) {
          if (seeded(x * 13 + y * 7 + 5) > 0.11) continue;
          let floorBelow = false;
          for (let d = 1; d <= 3; d++) if (this.tile(x, y + d) === "#") floorBelow = d >= 2;
          if (!floorBelow) continue;
          if (this.tile(x, y) !== "." || this.tile(x, y - 1) !== "." || this.tile(x, y + 1) !== ".") continue;
          if (out.some((t) => Math.abs(t.tx - x) < 6 && Math.abs(t.ty - y) < 4)) continue;
          out.push({ tx: x, ty: y, x: x * T + T / 2, y: y * T + 8, phase: seeded(x + y) * 10 });
        }
      }
      return out;
    }

    tile(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return "#";
      return this.grid[y][x];
    }

    tileRects(r) {
      const out = [];
      const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 0.001) / T);
      const y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 0.001) / T);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const c = this.tile(x, y);
          if (SOLID.has(c)) out.push({ x: x * T, y: y * T, w: T, h: T, kind: "tile", ch: c });
        }
      }
      return out;
    }

    gateRect(g) {
      return { x: g.x, y: g.y, w: g.w, h: g.h, kind: "gate", ref: g };
    }

    solidsFor(r, skip) {
      const out = this.tileRects(r);
      for (const g of this.gates) if (g.h > 1 && overlap(r, g)) out.push(this.gateRect(g));
      for (const m of this.movers) if (m !== skip && overlap(r, m)) out.push(m);
      for (const b of this.boxes) if (b !== skip && overlap(r, b)) out.push(b);
      return out;
    }

    active(ids) {
      return ids.some((id) => {
        const b = this.buttons.find((x) => x.id === id);
        if (b) return b.pressed;
        if (id === "boss") return !!(this.boss && this.boss.dead);
        const l = this.levers.find((x) => x.id === id);
        return l ? l.on : false;
      });
    }

    renderStatic() {
      const c = document.createElement("canvas");
      c.width = this.w * T;
      c.height = this.h * T;
      const g = c.getContext("2d");
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.grid[y][x] === "#") drawStone(g, x, y, this);
          else if (this.grid[y][x] === "I") drawIce(g, x, y, this);
        }
      }
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.grid[y][x] === "#" && !SOLID.has(this.tile(x, y + 1))) drawHanging(g, x, y);
        }
      }
      for (const t of this.torches) drawTorchBracket(g, t);
      return c;
    }
  }

  function seeded(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function makeBackground(width, seed) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(width);
    c.height = VH;
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, "#1e1730");
    grd.addColorStop(0.55, "#161122");
    grd.addColorStop(1, "#0c0912");
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, VH);
    for (let y = 0; y < VH; y += 20) {
      const off = (y / 20) % 2 ? 20 : 0;
      for (let x = -off; x < c.width; x += 40) {
        const n = seeded(x * 0.37 + y * 1.91 + seed);
        g.fillStyle = `rgba(${150 + n * 40},${130 + n * 30},${190 + n * 40},${0.018 + n * 0.03})`;
        g.fillRect(x + 1, y + 1, 38, 18);
      }
    }
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = 1;
    for (let y = 0; y < VH; y += 20) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(c.width, y + 0.5);
      g.stroke();
    }
    for (let i = 0; i < c.width / 240; i++) {
      const x = i * 240 + 60 + seeded(i + seed) * 60;
      const w = 70;
      const top = 120 + seeded(i * 3 + seed) * 60;
      const ag = g.createLinearGradient(0, top, 0, VH);
      ag.addColorStop(0, "rgba(10,7,18,0)");
      ag.addColorStop(0.15, "rgba(10,7,18,0.55)");
      ag.addColorStop(1, "rgba(10,7,18,0.75)");
      g.fillStyle = ag;
      g.beginPath();
      g.moveTo(x, VH);
      g.lineTo(x, top + w / 2);
      g.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0);
      g.lineTo(x + w, VH);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(255,200,140,0.035)";
      g.beginPath();
      g.moveTo(x + 10, VH);
      g.lineTo(x + 10, top + w / 2);
      g.arc(x + w / 2, top + w / 2, w / 2 - 10, Math.PI, 0);
      g.lineTo(x + w - 10, VH);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(30,24,44,0.9)";
      g.fillRect(x - 16, top - 8, 14, VH);
      g.fillRect(x + w + 2, top - 8, 14, VH);
      g.fillStyle = "rgba(255,255,255,0.03)";
      g.fillRect(x - 16, top - 8, 3, VH);
      g.fillRect(x + w + 2, top - 8, 3, VH);
    }
    for (let i = 0; i < c.width / 240; i++) {
      const x = i * 240 + 190 + seeded(i * 5 + seed) * 20;
      const top = 30 + seeded(i * 13 + seed) * 30;
      const bh = 110 + seeded(i * 17 + seed) * 50;
      const pink = (i + seed) % 2 === 0;
      g.fillStyle = "rgba(60,40,80,0.55)";
      g.fillRect(x - 3, top - 4, 46, 5);
      g.fillStyle = pink ? "rgba(120,40,80,0.45)" : "rgba(120,90,30,0.45)";
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + 40, top);
      g.lineTo(x + 40, top + bh);
      g.lineTo(x + 20, top + bh - 14);
      g.lineTo(x, top + bh);
      g.closePath();
      g.fill();
      g.strokeStyle = pink ? "rgba(255,140,190,0.35)" : "rgba(255,210,120,0.35)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + 20, top + 24);
      g.lineTo(x + 30, top + 40);
      g.lineTo(x + 20, top + 56);
      g.lineTo(x + 10, top + 40);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(x + 20, top + 40, 4, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < c.width / 180; i++) {
      const x = seeded(i * 7 + seed) * c.width;
      const len = 40 + seeded(i * 11 + seed) * 140;
      g.strokeStyle = "rgba(120,105,150,0.18)";
      g.lineWidth = 2;
      for (let y = 0; y < len; y += 7) {
        g.beginPath();
        g.ellipse(x, y + 3, 2, 3.5, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    for (let i = 0; i < c.width / 70; i++) {
      const x = seeded(i + 40 + seed) * c.width, y = seeded(i + 80 + seed) * VH;
      g.fillStyle = `rgba(${seeded(i + 3) > 0.5 ? "255,95,168" : "242,182,54"},0.045)`;
      g.beginPath();
      g.arc(x, y, 40 + seeded(i + 7) * 90, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.06;
    g.fillStyle = "#e9d8ff";
    g.font = "22px serif";
    const glyphs = "☾✦◈⟡❖✧◇";
    for (let i = 0; i < c.width / 45; i++) {
      g.fillText(glyphs[i % glyphs.length], seeded(i + 90 + seed) * c.width, seeded(i + 190 + seed) * VH);
    }
    g.globalAlpha = 1;
    return c;
  }

  function drawStone(g, x, y, world) {
    const px = x * T, py = y * T;
    const n = seeded(x * 31 + y * 17);
    const base = 44 + Math.floor(n * 10);
    g.fillStyle = `rgb(${base + 6},${base - 1},${base + 20})`;
    g.fillRect(px, py, T, T);
    const off = (x + y) % 2 ? 0 : T / 2;
    for (let r = 0; r < 2; r++) {
      const by = py + r * 15;
      const shift = r ? off : (off + T / 2) % T;
      for (let k = -1; k < 2; k++) {
        const bx = px + shift + k * T;
        const x0 = Math.max(px, bx), x1 = Math.min(px + T, bx + T);
        if (x1 - x0 < 1) continue;
        const v = seeded(x * 5 + y * 9 + r * 3 + k);
        g.fillStyle = `rgba(${v > 0.5 ? "255,240,255" : "0,0,0"},${0.03 + v * 0.05})`;
        g.fillRect(x0 + 1, by + 1, x1 - x0 - 2, 13);
        g.fillStyle = "rgba(255,255,255,0.05)";
        g.fillRect(x0 + 1, by + 1, x1 - x0 - 2, 1);
      }
      g.fillStyle = "rgba(0,0,0,0.28)";
      g.fillRect(px, by + 14, T, 1);
      if (shift > 0 && shift < T) g.fillRect(px + shift, by, 1, 15);
    }
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fillRect(px, py, T, 1);
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(px, py + T - 1, T, 1);
    if (n > 0.72) {
      g.strokeStyle = "rgba(0,0,0,0.3)";
      g.beginPath();
      g.moveTo(px + 6 + n * 8, py + 3);
      g.lineTo(px + 12 + n * 4, py + 12);
      g.lineTo(px + 9, py + 19);
      g.lineTo(px + 15, py + 27);
      g.stroke();
    }
    const open = (dx, dy) => !SOLID.has(world.tile(x + dx, y + dy));
    if (n > 0.955 && (open(0, 1) || open(1, 0) || open(-1, 0))) {
      g.save();
      g.globalAlpha = 0.5;
      g.strokeStyle = n > 0.977 ? "#ff8fc4" : "#ffd36b";
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 6;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(px + 15, py + 6);
      g.lineTo(px + 22, py + 15);
      g.lineTo(px + 15, py + 24);
      g.lineTo(px + 8, py + 15);
      g.closePath();
      g.moveTo(px + 15, py + 10);
      g.lineTo(px + 15, py + 20);
      g.stroke();
      g.restore();
    }
    if (open(0, -1)) {
      g.fillStyle = "#6f5d93";
      g.fillRect(px, py, T, 4);
      g.fillStyle = "#8c78b4";
      g.fillRect(px, py, T, 1);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(px, py + 4, T, 2);
      for (let i = 0; i < 5; i++) {
        const mx = px + seeded(x * 7 + i + y) * (T - 3);
        const mh = 2 + seeded(i + x * 3) * 5;
        g.fillStyle = i % 2 ? "rgba(150,230,170,0.35)" : "rgba(110,200,140,0.3)";
        g.fillRect(mx, py - mh + 1, 2, mh);
      }
      if (seeded(x * 3 + y) > 0.75) {
        g.fillStyle = "rgba(170,240,190,0.35)";
        g.beginPath();
        g.ellipse(px + 8 + n * 14, py + 1, 5, 2, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (open(0, 1)) {
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(px, py + T - 4, T, 4);
    }
    if (open(-1, 0)) {
      g.fillStyle = "rgba(255,255,255,0.04)";
      g.fillRect(px, py, 2, T);
    }
    if (open(1, 0)) {
      g.fillStyle = "rgba(0,0,0,0.2)";
      g.fillRect(px + T - 2, py, 2, T);
    }
  }

  function drawIce(g, x, y, world) {
    const px = x * T, py = y * T;
    const grd = g.createLinearGradient(px, py, px, py + T);
    grd.addColorStop(0, "#cdeeff");
    grd.addColorStop(0.35, "#8cc8ec");
    grd.addColorStop(1, "#4d7fa8");
    g.fillStyle = grd;
    g.fillRect(px, py, T, T);
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px + 4, py + 8);
    g.lineTo(px + 12, py + 4);
    g.moveTo(px + 16, py + 16);
    g.lineTo(px + 26, py + 10);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillRect(px, py, T, 2);
    if (!SOLID.has(world.tile(x, y + 1))) {
      g.fillStyle = "#bfe6ff";
      for (let i = 0; i < 3; i++) {
        const ix = px + 4 + i * 10, ih = 5 + seeded(x * 3 + i) * 8;
        g.beginPath();
        g.moveTo(ix, py + T);
        g.lineTo(ix + 3, py + T + ih);
        g.lineTo(ix + 6, py + T);
        g.fill();
      }
    }
  }

  function drawFan(g, f) {
    const bx = f.x, by = f.y + f.h;
    g.save();
    g.globalCompositeOperation = "lighter";
    const grd = g.createLinearGradient(0, f.y, 0, by);
    grd.addColorStop(0, "rgba(160,220,255,0)");
    grd.addColorStop(1, "rgba(160,220,255,0.16)");
    g.fillStyle = grd;
    g.fillRect(f.x + 3, f.y, f.w - 6, f.h);
    g.strokeStyle = "rgba(200,240,255,0.35)";
    g.lineWidth = 1.5;
    for (let i = 0; i < f.w / 10; i++) {
      const sx = f.x + 6 + i * 10 + Math.sin(animT * 3 + i) * 2;
      const off = ((animT * 220 + i * 47) % f.h);
      g.beginPath();
      g.moveTo(sx, by - off);
      g.lineTo(sx, by - off - 18);
      g.stroke();
    }
    g.restore();
    g.fillStyle = "#3a3150";
    g.fillRect(bx, by - 8, f.w, 8);
    g.fillStyle = "#6f5d93";
    g.fillRect(bx, by - 8, f.w, 2);
    g.strokeStyle = "#cfc4e6";
    g.lineWidth = 2;
    const n = Math.max(1, Math.round(f.w / T));
    for (let k = 0; k < n; k++) {
      const cx = bx + T / 2 + k * T;
      for (let i = 0; i < 3; i++) {
        const a = animT * 14 + (i * Math.PI * 2) / 3;
        g.beginPath();
        g.moveTo(cx, by - 4);
        g.lineTo(cx + Math.cos(a) * 10, by - 4 + Math.sin(a) * 2);
        g.stroke();
      }
    }
  }

  function drawPortal(g, p) {
    const cx = p.x + T / 2, cy = p.y + T;
    g.save();
    g.globalCompositeOperation = "lighter";
    const lg = g.createRadialGradient(cx, cy, 2, cx, cy, 34);
    lg.addColorStop(0, `hsla(${p.hue},90%,70%,0.6)`);
    lg.addColorStop(1, `hsla(${p.hue},90%,50%,0)`);
    g.fillStyle = lg;
    g.fillRect(cx - 40, cy - 40, 80, 80);
    g.restore();
    g.fillStyle = "#1a1426";
    g.beginPath();
    g.ellipse(cx, cy, 11, 26, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `hsla(${p.hue + i * 25},90%,${65 + i * 8}%,${0.9 - i * 0.2})`;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(cx, cy, 13 - i * 3.5, 28 - i * 7, 0, animT * (3 + i) + i, animT * (3 + i) + i + Math.PI * 1.4);
      g.stroke();
    }
  }

  function drawHanging(g, x, y) {
    const r = seeded(x * 17 + y * 3);
    if (r < 0.72) return;
    const px = x * T + 6 + seeded(x + y * 5) * 18, py = (y + 1) * T;
    if (r > 0.9) {
      g.strokeStyle = "rgba(150,140,170,0.55)";
      g.lineWidth = 1.5;
      const len = 3 + Math.floor(seeded(x * 9) * 5);
      for (let i = 0; i < len; i++) {
        g.beginPath();
        g.ellipse(px, py + i * 6 + 3, 1.8, 3.2, 0, 0, Math.PI * 2);
        g.stroke();
      }
      return;
    }
    const len = 12 + seeded(x * 5 + y) * 34;
    g.strokeStyle = "rgba(90,170,110,0.55)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px, py);
    g.quadraticCurveTo(px + 4, py + len / 2, px - 1, py + len);
    g.stroke();
    g.fillStyle = "rgba(120,210,140,0.55)";
    for (let i = 6; i < len; i += 7) {
      const side = (i / 7) % 2 ? 1 : -1;
      g.beginPath();
      g.ellipse(px + 2 + side * 3, py + i, 3, 1.6, side * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawTorchBracket(g, t) {
    g.fillStyle = "#2d2538";
    g.fillRect(t.x - 2, t.y + 6, 4, 14);
    g.fillStyle = "#4a3d5e";
    g.beginPath();
    g.moveTo(t.x - 6, t.y + 2);
    g.lineTo(t.x + 6, t.y + 2);
    g.lineTo(t.x + 3, t.y + 9);
    g.lineTo(t.x - 3, t.y + 9);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.15)";
    g.fillRect(t.x - 6, t.y + 2, 12, 1);
  }

  function drawTorchLight(g, t) {
    const f = 0.85 + Math.sin(animT * 9 + t.phase) * 0.08 + Math.sin(animT * 23 + t.phase * 2) * 0.05;
    const rad = 95 * f;
    const lg = g.createRadialGradient(t.x, t.y, 2, t.x, t.y, rad);
    lg.addColorStop(0, "rgba(255,170,90,0.28)");
    lg.addColorStop(0.4, "rgba(255,120,60,0.1)");
    lg.addColorStop(1, "rgba(255,100,40,0)");
    g.fillStyle = lg;
    g.fillRect(t.x - rad, t.y - rad, rad * 2, rad * 2);
  }

  function drawTorchFlame(g, t) {
    const f = Math.sin(animT * 11 + t.phase);
    const h = 11 + f * 2;
    g.fillStyle = "#ff7a2e";
    g.beginPath();
    g.moveTo(t.x - 4.5, t.y + 2);
    g.quadraticCurveTo(t.x - 5, t.y - h * 0.5, t.x + f * 1.5, t.y - h);
    g.quadraticCurveTo(t.x + 5, t.y - h * 0.5, t.x + 4.5, t.y + 2);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffd36b";
    g.beginPath();
    g.moveTo(t.x - 2.5, t.y + 2);
    g.quadraticCurveTo(t.x - 2.5, t.y - h * 0.35, t.x + f, t.y - h * 0.65);
    g.quadraticCurveTo(t.x + 2.5, t.y - h * 0.35, t.x + 2.5, t.y + 2);
    g.closePath();
    g.fill();
  }

  function drawFinish(g, f, kind) {
    const col = COLORS[kind === "girl" ? "pink" : "gold"];
    const x = f.x + T / 2, base = f.y + T;
    g.fillStyle = "#cfc4e6";
    g.fillRect(x - 1.5, base - 70, 3, 70);
    g.fillStyle = "#4b4066";
    g.fillRect(x - 7, base - 5, 14, 5);
    const wave = (i) => Math.sin(animT * 6 + i * 0.8) * 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        g.fillStyle = (r + c) % 2 ? "#16121f" : "#f4f1f8";
        g.fillRect(x + 2 + c * 7, base - 68 + r * 7 + wave(c), 7, 7);
      }
    }
    g.save();
    g.globalCompositeOperation = "lighter";
    const lg = g.createLinearGradient(0, base - 90, 0, base);
    lg.addColorStop(0, col[0] + "00");
    lg.addColorStop(1, col[0] + "55");
    g.fillStyle = lg;
    g.fillRect(x - 18, base - 90, 36, 90);
    g.restore();
  }

  function drawCheckpoint(g, cp) {
    const x = cp.x + T / 2, base = cp.y + T;
    g.fillStyle = "#3a3150";
    g.fillRect(x - 9, base - 8, 18, 8);
    g.fillStyle = "#4b4066";
    g.fillRect(x - 6, base - 30, 12, 22);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(x - 6, base - 30, 2, 22);
    g.fillStyle = "#2a2238";
    g.fillRect(x - 8, base - 33, 16, 4);
    const y = base - 42 + Math.sin(animT * 2.5 + cp.tx) * 2;
    const lit = cp.active ? 1 : 0;
    if (cp.active || cp.touched.girl || cp.touched.boy) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const lg = g.createRadialGradient(x, y, 1, x, y, 40 + cp.glow * 20);
      lg.addColorStop(0, cp.active ? "rgba(200,255,220,0.45)" : "rgba(255,255,255,0.2)");
      lg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = lg;
      g.fillRect(x - 60, y - 60, 120, 120);
      g.restore();
    }
    const half = (side, on, color) => {
      g.fillStyle = on ? color : "#5a5070";
      g.beginPath();
      g.moveTo(x, y - 9);
      g.lineTo(x + side * 6, y);
      g.lineTo(x, y + 9);
      g.closePath();
      g.fill();
    };
    half(-1, cp.touched.girl || lit, COLORS.pink[0]);
    half(1, cp.touched.boy || lit, COLORS.gold[0]);
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.fillRect(x - 2, y - 5, 2, 3);
    if (cp.current) {
      g.strokeStyle = "rgba(200,255,220,0.5)";
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(x, y, 11 + Math.sin(animT * 4) * 1.5, 4, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }

  class Boss {
    constructor(o) {
      this.name = o.name || "Страж";
      this.homeX = o.x * T + T / 2;
      this.homeY = o.y * T;
      this.x = this.homeX;
      this.y = this.homeY;
      this.arena = [o.arena[0] * T, (o.arena[1] + 1) * T];
      this.hp = o.hp || 3;
      this.maxHp = this.hp;
      this.phase = 0;
      this.plates = o.plates;
      this.rate = o.rate || [2.4, 1.8, 1.3];
      this.multi = o.multi || [1, 1, 2];
      this.speed = o.speed || 0.5;
      this.style = o.style || 0;
      this.rollEvery = o.rollers || 0;
      this.rollT = 3;
      this.rollers = [];
      this.timer = 2.5;
      this.drops = [];
      this.stun = 0;
      this.flash = 0;
      this.hold = 0;
      this.awake = false;
      this.dead = false;
      this.deathT = 0;
      this.beam = 0;
      this.t = 0;
      this.pressed = { girl: false, boy: false };
      this.next = 0;
    }
    plateRects() {
      const p = this.plates[Math.min(this.phase, this.plates.length - 1)];
      return [
        { kind: "girl", x: p[0] * T, y: p[1] * T, zone: { x: p[0] * T + 2, y: p[1] * T + T - 10, w: T - 4, h: 10 } },
        { kind: "boy", x: p[2] * T, y: p[3] * T, zone: { x: p[2] * T + 2, y: p[3] * T + T - 10, w: T - 4, h: 10 } },
      ];
    }
  }

  function drawPlates(g, boss) {
    if (boss.dead) return;
    for (const p of boss.plateRects()) {
      const col = p.kind === "girl" ? COLORS.pink : COLORS.gold;
      const on = boss.pressed[p.kind];
      const cx = p.x + T / 2, by = p.y + T;
      g.save();
      g.globalCompositeOperation = "lighter";
      const lg = g.createRadialGradient(cx, by - 4, 1, cx, by - 4, on ? 46 : 30);
      lg.addColorStop(0, col[0] + (on ? "aa" : "55"));
      lg.addColorStop(1, col[0] + "00");
      g.fillStyle = lg;
      g.fillRect(cx - 50, by - 54, 100, 60);
      const beamH = 26 + Math.sin(animT * 5) * 4;
      const bg = g.createLinearGradient(0, by - beamH, 0, by);
      bg.addColorStop(0, col[0] + "00");
      bg.addColorStop(1, col[0] + "66");
      g.fillStyle = bg;
      g.fillRect(cx - 10, by - beamH, 20, beamH);
      g.restore();
      g.fillStyle = "#2a2238";
      g.fillRect(p.x + 1, by - 5, T - 2, 5);
      g.fillStyle = on ? col[1] : col[0];
      g.fillRect(p.x + 3, by - (on ? 5 : 7), T - 6, 3);
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.font = "bold 12px Rubik, sans-serif";
      g.textAlign = "center";
      g.fillText(p.kind === "girl" ? "♀" : "♂", cx, by - 12 + Math.sin(animT * 3) * 2);
    }
  }

  const BOSS_STYLES = [
    { top: "#6e6290", bottom: "#3a3150", horn: "#2a2238", trim: "#8f80b8" },
    { top: "#9a4e36", bottom: "#3e1a12", horn: "#2a0f0a", trim: "#ff9a4a" },
    { top: "#3f8a6c", bottom: "#163a2e", horn: "#0f2a20", trim: "#8dffc4" },
    { top: "#9cc4e4", bottom: "#355574", horn: "#dff2ff", trim: "#e8f8ff" },
    { top: "#b8974a", bottom: "#4a3812", horn: "#2a1f08", trim: "#ffe08a" },
    { top: "#3b2a58", bottom: "#0e0818", horn: "#05030a", trim: "#c08cff" },
    { top: "#4a9aa6", bottom: "#123238", horn: "#0a1c20", trim: "#9ff6ff" },
  ];

  function drawBoss(g, boss) {
    if (boss.dead && boss.deathT > 1.6) return;
    const x = boss.x, y = boss.y;
    g.save();
    if (boss.dead) {
      g.globalAlpha = Math.max(0, 1 - boss.deathT / 1.6);
      g.translate(rand(-3, 3), rand(-3, 3));
    }
    g.save();
    g.globalCompositeOperation = "lighter";
    const aura = g.createRadialGradient(x, y + 30, 10, x, y + 30, 120);
    const eyeCol = ["255,95,168", "242,182,54", "120,255,150", "255,90,90"][Math.min(boss.phase, 3)];
    aura.addColorStop(0, `rgba(${eyeCol},0.18)`);
    aura.addColorStop(1, `rgba(${eyeCol},0)`);
    g.fillStyle = aura;
    g.fillRect(x - 130, y - 100, 260, 260);
    g.restore();
    g.strokeStyle = "rgba(150,140,170,0.5)";
    g.lineWidth = 2;
    for (const side of [-1, 1]) {
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const cy = y - 6 - i * 7;
        g.moveTo(x + side * 34 + 2, cy);
        g.ellipse(x + side * 34, cy, 2, 3.5, 0, 0, Math.PI * 2);
      }
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = animT * 0.8 + (i / 6) * Math.PI * 2;
      const rx = x + Math.cos(a) * 62, ry = y + 32 + Math.sin(a) * 16;
      g.fillStyle = i % 2 ? COLORS.pink[0] : COLORS.gold[0];
      g.globalAlpha *= 0.8;
      g.save();
      g.translate(rx, ry);
      g.rotate(a);
      g.fillRect(-3, -3, 6, 6);
      g.restore();
      g.globalAlpha = boss.dead ? Math.max(0, 1 - boss.deathT / 1.6) : 1;
    }
    const hw = 46, hh = 58;
    const sg = g.createLinearGradient(0, y - 6, 0, y + hh * 1.2);
    const ST = BOSS_STYLES[boss.style] || BOSS_STYLES[0];
    sg.addColorStop(0, ST.top);
    sg.addColorStop(1, ST.bottom);
    g.fillStyle = sg;
    roundRect(g, x - hw, y, hw * 2, hh + 10, 18);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(g, x - hw + 4, y + 4, hw * 2 - 8, 10, 6);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.3)";
    g.lineWidth = 1;
    for (let r = 1; r < 5; r++) {
      g.beginPath();
      g.moveTo(x - hw + 4, y + r * 14);
      g.lineTo(x + hw - 4, y + r * 14);
      g.stroke();
    }
    g.fillStyle = ST.horn;
    g.beginPath();
    g.moveTo(x - hw - 8, y + 6);
    g.lineTo(x - hw + 6, y - 14);
    g.lineTo(x - hw + 14, y + 8);
    g.closePath();
    g.moveTo(x + hw + 8, y + 6);
    g.lineTo(x + hw - 6, y - 14);
    g.lineTo(x + hw - 14, y + 8);
    g.closePath();
    g.fill();
    g.strokeStyle = ST.trim;
    g.globalAlpha *= 0.7;
    g.lineWidth = 2;
    roundRect(g, x - hw + 3, y + 3, hw * 2 - 6, hh + 4, 15);
    g.stroke();
    g.globalAlpha = boss.dead ? Math.max(0, 1 - boss.deathT / 1.6) : 1;
    g.fillStyle = ST.trim;
    g.beginPath();
    g.moveTo(x, y + 4);
    g.lineTo(x + 6, y + 12);
    g.lineTo(x, y + 20);
    g.lineTo(x - 6, y + 12);
    g.closePath();
    g.fill();
    if (boss.style === 1) {
      for (let i = -2; i <= 2; i++) {
        const fh = 14 + Math.sin(animT * 12 + i) * 5 + (2 - Math.abs(i)) * 5;
        g.fillStyle = i % 2 ? "#ff7a2e" : "#ffb347";
        g.beginPath();
        g.moveTo(x + i * 14 - 7, y + 2);
        g.quadraticCurveTo(x + i * 14, y - fh, x + i * 14 + 7, y + 2);
        g.fill();
      }
    } else if (boss.style === 2) {
      g.strokeStyle = "#8dffc4";
      g.lineWidth = 2;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(x + side * 20, y + 52);
        g.bezierCurveTo(x + side * 50, y + 60, x + side * 46, y + 80 + Math.sin(animT * 3) * 6, x + side * 64, y + 84 + Math.sin(animT * 3 + 1) * 8);
        g.stroke();
      }
    } else if (boss.style === 3) {
      g.fillStyle = "#e8f8ff";
      for (let i = -3; i <= 3; i++) {
        const ih = 8 + ((i + 3) % 3) * 5;
        g.beginPath();
        g.moveTo(x + i * 12 - 4, y + hh + 9);
        g.lineTo(x + i * 12, y + hh + 9 + ih);
        g.lineTo(x + i * 12 + 4, y + hh + 9);
        g.fill();
      }
    } else if (boss.style === 6) {
      g.strokeStyle = "rgba(159,246,255,0.7)";
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const r = 52 + i * 10;
        const a0 = animT * (2 + i * 0.4) + i;
        g.beginPath();
        g.arc(x, y + 34, r, a0, a0 + 1.1);
        g.stroke();
      }
    } else if (boss.style === 5) {
      for (let i = 0; i < 7; i++) {
        const a = animT * 1.3 + i * 0.9;
        const wx = x + Math.sin(a) * (40 + i * 6), wy = y + 70 + ((animT * 30 + i * 23) % 60);
        g.fillStyle = `rgba(192,140,255,${0.25 - ((animT * 30 + i * 23) % 60) / 300})`;
        g.beginPath();
        g.arc(wx, wy, 6 + i % 3 * 2, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "#c08cff";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y - 14, 18 + Math.sin(animT * 3) * 2, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    } else if (boss.style === 4) {
      g.fillStyle = "#ffd36b";
      g.shadowColor = "#ffd36b";
      g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(x - 30, y + 2);
      for (let i = 0; i <= 4; i++) {
        g.lineTo(x - 30 + i * 15, y - 16 - (i % 2 ? 0 : 6));
        if (i < 4) g.lineTo(x - 30 + i * 15 + 7.5, y - 4);
      }
      g.lineTo(x + 30, y + 2);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = COLORS.pink[0];
      g.beginPath();
      g.arc(x, y - 6, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    const stunned = boss.stun > 0 && !boss.dead;
    for (const side of [-1, 1]) {
      const ex = x + side * 18, ey = y + 26;
      g.fillStyle = "#16121f";
      g.beginPath();
      g.ellipse(ex, ey, 11, 8, side * 0.15, 0, Math.PI * 2);
      g.fill();
      if (stunned) {
        g.strokeStyle = "#cfc4e6";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(ex - 5, ey - 4);
        g.lineTo(ex + 5, ey + 4);
        g.moveTo(ex + 5, ey - 4);
        g.lineTo(ex - 5, ey + 4);
        g.stroke();
      } else {
        g.fillStyle = `rgb(${eyeCol})`;
        g.shadowColor = `rgb(${eyeCol})`;
        g.shadowBlur = 16;
        g.beginPath();
        g.ellipse(ex + side * -1, ey + 1, 5.5, 4.5, 0, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "#fff";
        g.fillRect(ex - 2, ey - 2, 2, 2);
      }
    }
    g.fillStyle = "#16121f";
    roundRect(g, x - 20, y + 46, 40, 10, 4);
    g.fill();
    g.fillStyle = "#cfc4e6";
    for (let i = -16; i <= 12; i += 7) g.fillRect(x + i, y + 46, 4, 4);
    const dmg = boss.maxHp - boss.hp;
    g.strokeStyle = "rgba(10,6,16,0.8)";
    g.lineWidth = 2;
    if (dmg >= 1) {
      g.beginPath();
      g.moveTo(x - 30, y + 4);
      g.lineTo(x - 22, y + 16);
      g.lineTo(x - 28, y + 24);
      g.stroke();
    }
    if (dmg >= 2) {
      g.beginPath();
      g.moveTo(x + 34, y + 10);
      g.lineTo(x + 24, y + 40);
      g.lineTo(x + 32, y + 52);
      g.stroke();
    }
    if (dmg >= 3) {
      g.beginPath();
      g.moveTo(x - 4, y);
      g.lineTo(x + 4, y + 22);
      g.lineTo(x - 6, y + 40);
      g.stroke();
    }
    if (boss.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${boss.flash * 0.7})`;
      roundRect(g, x - hw, y, hw * 2, hh + 10, 18);
      g.fill();
    }
    g.restore();
  }

  function drawDrops(g, boss) {
    for (const r of boss.rollers) {
      if (r.warn > 0) {
        const a = 0.4 + Math.sin(animT * 20) * 0.3;
        g.fillStyle = `rgba(120,255,150,${a})`;
        g.font = "bold 22px Rubik, sans-serif";
        g.textAlign = "center";
        g.fillText(r.dir > 0 ? "»" : "«", r.x + r.dir * 10, r.y - 4);
        continue;
      }
      g.save();
      g.translate(r.x, r.y);
      g.rotate(r.spin);
      g.shadowColor = COLORS.green[0];
      g.shadowBlur = 12;
      g.fillStyle = "#3d6b4a";
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = COLORS.green[1];
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(6, 0);
      g.moveTo(0, -6);
      g.lineTo(0, 6);
      g.stroke();
      g.restore();
    }
    for (const d of boss.drops) {
      const col = COLORS[d.kind];
      if (d.tele > 0) {
        const k = 1 - d.tele / d.teleMax;
        g.strokeStyle = col[0];
        g.globalAlpha = 0.35 + k * 0.5;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(d.x, d.groundY - 2, 8 + k * 10, 3 + k * 2, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 0.12 + k * 0.15;
        g.fillStyle = col[0];
        g.fillRect(d.x - 1, d.y, 2, d.groundY - d.y);
        g.globalAlpha = 1;
      }
      g.save();
      g.shadowColor = col[0];
      g.shadowBlur = 12;
      g.fillStyle = col[0];
      g.beginPath();
      g.moveTo(d.x, d.y - 12);
      g.quadraticCurveTo(d.x + 9, d.y + 2, d.x, d.y + 8);
      g.quadraticCurveTo(d.x - 9, d.y + 2, d.x, d.y - 12);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = col[1];
      g.fillRect(d.x - 3, d.y - 3, 2, 4);
      g.restore();
    }
  }

  class Hero {
    constructor(kind, spawn) {
      this.kind = kind;
      this.ctrl = CONTROLS[kind];
      this.spawn = spawn;
      this.start = { ...spawn };
      this.reset();
    }
    reset() {
      this.x = this.spawn.x * T + (T - PW) / 2;
      this.y = (this.spawn.y + 1) * T - PH;
      this.w = PW;
      this.h = PH;
      this.vx = 0;
      this.vy = 0;
      this.ground = null;
      this.onGround = false;
      this.facing = this.kind === "girl" ? 1 : -1;
      this.walkT = 0;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.dead = false;
      this.atDoor = false;
      this.sink = 0;
      this.blink = rand(1, 4);
      this.squash = 0;
    }
  }

  class Game {
    constructor(def, index) {
      this.index = index;
      this.def = def;
      this.deaths = 0;
      this.time = 0;
      this.load();
    }
    load() {
      this.world = new World(this.def);
      this.heroes = [new Hero("girl", this.world.spawn.girl), new Hero("boy", this.world.spawn.boy)];
      if (this.ctrlOverride) for (const h of this.heroes) h.ctrl = this.ctrlOverride[h.kind];
      this.particles = [];
      this.collected = { girl: 0, boy: 0 };
      this.deadTimer = 0;
      this.winTimer = 0;
      this.finished = false;
      this.shake = 0;
      this.checkpoint = null;
      this.motes = [];
      this.stepT = 0;
      this.cam = { x: 0 };
      this.race = !!this.def.mode && this.def.mode === "race";
      if (this.race) {
        this.countdown = BOT ? 0 : 3.2;
        this.winner = null;
        this.firstT = 0;
        this.camR = { girl: 0, boy: 0 };
        for (const h of this.heroes) { h.cp = null; h.finishT = null; h.respawnT = 0; h.deaths = 0; }
        this.updateRaceCam(0, true);
        this.rec = { girl: [], boy: [] };
        this.recT = 0;
        this.ghosts = Ghosts.load(this.def.id);
        this.ghostHeroes = {};
        for (const h of this.heroes) {
          const gh = new Hero(h.kind, h.start);
          gh.ghost = true;
          this.ghostHeroes[h.kind] = gh;
        }
      }
      this.snapCamera();
    }
    restart(countDeath) {
      if (countDeath) this.deaths++;
      if (countDeath && this.checkpoint) {
        this.respawn();
        return;
      }
      const collected = this.collected;
      const taken = this.world.gems.map((g) => g.taken);
      this.load();
      if (countDeath) {
        this.collected = collected;
        this.world.gems.forEach((g, i) => (g.taken = taken[i]));
      } else {
        this.time = 0;
        this.deaths = 0;
      }
    }
    respawn() {
      const cp = this.checkpoint;
      const w = this.world;
      for (const h of this.heroes) {
        h.spawn = { x: cp.tx + (h.kind === "girl" ? 0 : 1), y: cp.ty };
        h.reset();
      }
      cp.snapshot.forEach((s, i) => {
        const b = w.boxes[i];
        b.x = s.x;
        b.y = s.y;
        b.vy = 0;
        b.ground = null;
      });
      if (w.boss) {
        w.boss.drops = [];
        w.boss.rollers = [];
        w.boss.timer = 2.5;
        w.boss.rollT = 3;
      }
      this.deadTimer = 0;
      this.particles = [];
      this.snapCamera();
      this.burst(cp.x + T / 2, cp.y, "#c8ffdc", 24, 160);
    }
    cameraTarget() {
      const w = this.world;
      if (w.pxW <= VW) return 0;
      const alive = this.heroes.filter((h) => !h.dead);
      const list = alive.length ? alive : this.heroes;
      const mid = list.reduce((s, h) => s + h.x + h.w / 2, 0) / list.length;
      let tx = mid - VW / 2;
      if (w.boss && w.boss.awake && !w.boss.dead && list.every((h) => h.x > w.boss.arena[0])) tx = Math.max(tx, w.boss.arena[0] - 40);
      return clamp(tx, 0, w.pxW - VW);
    }
    snapCamera() {
      this.cam.x = this.cameraTarget();
    }

    update(dt) {
      const w = this.world;
      if (this.finished) {
        this.updateParticles(dt);
        return;
      }
      if (this.deadTimer > 0) {
        this.deadTimer -= dt;
        this.updateParticles(dt);
        if (this.deadTimer <= 0) this.restart(true);
        return;
      }
      if (this.race) return this.updateRace(dt);
      this.time += dt;
      this.updateMechanics(dt);
      for (const b of w.boxes) this.updateBox(b, dt);
      for (const h of this.heroes) this.updateHero(h, dt);
      if (this.deadTimer > 0) return;
      this.updateCamera(dt);
      this.updateCheckpoints(dt);
      if (w.boss) this.updateBoss(w.boss, dt);
      if (this.deadTimer > 0) return;
      this.updateAmbient(dt);
      this.collectGems();

      let both = true;
      for (const h of this.heroes) {
        const d = w.doors[h.kind];
        const cx = h.x + h.w / 2;
        h.atDoor = d && Math.abs(cx - (d.x + T / 2)) < 14 && Math.abs(h.y + h.h - (d.y + d.h)) < 6;
        if (d) d.open += ((h.atDoor ? 1 : 0) - d.open) * Math.min(1, dt * 8);
        if (!h.atDoor) both = false;
      }
      if (both) {
        this.winTimer += dt;
        if (this.winTimer > 0.6) this.win();
      } else this.winTimer = 0;

      this.updateParticles(dt);
      this.shake = Math.max(0, this.shake - dt * 30);
    }

    updateRaceCam(dt, snap) {
      const w = this.world;
      for (const h of this.heroes) {
        const t = clamp(h.x + h.w / 2 - VW * 0.38, 0, Math.max(0, w.pxW - VW));
        this.camR[h.kind] = snap ? t : this.camR[h.kind] + (t - this.camR[h.kind]) * Math.min(1, dt * 6);
      }
      this.cam.x = this.camR.girl;
    }

    updateRace(dt) {
      const w = this.world;
      this.updateParticles(dt);
      this.shake = Math.max(0, this.shake - dt * 30);
      if (this.countdown > 0) {
        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        if (this.countdown <= 0) Sound.go();
        else if (Math.ceil(this.countdown) !== before) Sound.button();
        return;
      }
      this.time += dt;
      this.recT += dt;
      if (this.recT >= 0.05) {
        this.recT -= 0.05;
        for (const h of this.heroes) {
          if (h.finishT === null) this.rec[h.kind].push([Math.round(h.x), Math.round(h.y), h.facing, h.onGround ? 1 : 0, h.dead ? 1 : 0]);
        }
      }
      for (const kind of ["girl", "boy"]) {
        const gd = this.ghosts[kind];
        const gh = this.ghostHeroes[kind];
        if (!gd || !gh) continue;
        const i = Math.min(gd.pts.length - 1, Math.floor(this.time / 0.05));
        const pt = gd.pts[i];
        if (!pt) continue;
        const px = gh.x;
        gh.x = pt[0];
        gh.y = pt[1];
        gh.facing = pt[2];
        gh.onGround = !!pt[3];
        gh.hidden = !!pt[4] || this.time > gd.t + 1;
        gh.vx = (gh.x - px) / dt;
        gh.walkT = gh.onGround && Math.abs(gh.vx) > 20 ? gh.walkT + dt : 0;
      }
      this.updateMechanics(dt);
      for (const b of w.boxes) this.updateBox(b, dt);
      for (const h of this.heroes) {
        if (h.finishT !== null) { h.walkT = 0; continue; }
        if (h.dead) {
          h.respawnT -= dt;
          if (h.respawnT <= 0) {
            h.spawn = h.cp ? { x: h.cp.tx, y: h.cp.ty } : { ...h.start };
            h.reset();
            this.burst(h.x + h.w / 2, h.y + h.h / 2, "#c8ffdc", 18, 140);
          }
          continue;
        }
        this.updateHero(h, dt);
      }
      this.collectGems();
      for (const cp of w.checkpoints) {
        if (!cp.lane) continue;
        const h = this.heroes.find((x) => x.kind === cp.lane);
        if (!h || h.dead || h.cp === cp) continue;
        if (overlap(h, { x: cp.x - 8, y: cp.y - T, w: T + 16, h: 2 * T })) {
          h.cp = cp;
          cp.active = true;
          cp.touched[cp.lane] = true;
          cp.glow = 1;
          Sound.checkpoint();
          this.burst(cp.x + T / 2, cp.y - 10, "#c8ffdc", 20, 160);
        }
      }
      for (const h of this.heroes) {
        const f = w.finishes[h.kind];
        if (!f || h.dead || h.finishT !== null) continue;
        if (overlap(h, { x: f.x - 4, y: f.y - T, w: T + 8, h: 2 * T })) {
          h.finishT = this.time;
          const best = this.ghosts[h.kind];
          if (!BOT && (!best || h.finishT < best.t)) {
            Ghosts.save(this.def.id, h.kind, { t: h.finishT, pts: this.rec[h.kind] });
            this.newRecord = this.newRecord || [];
            this.newRecord.push(h.kind);
          }
          this.burst(f.x + T / 2, f.y - 10, COLORS[h.kind === "girl" ? "pink" : "gold"][1], 40, 240);
          if (!this.winner) {
            this.winner = h.kind;
            this.firstT = this.time;
            Sound.win();
            toast(h.kind === "girl" ? "Девочка финишировала первой!" : "Бородач финишировал первым!");
          } else Sound.checkpoint();
        }
      }
      if (this.heroes.every((h) => h.finishT !== null) || (!BOT && this.winner && this.time - this.firstT > 8)) {
        this.finished = true;
        onRaceComplete(this);
      }
      this.updateRaceCam(dt);
      this.updateAmbient(dt);
    }

    collectGems() {
      const w = this.world;
      for (const gem of w.gems) {
        if (gem.taken) continue;
        for (const h of this.heroes) {
          if (h.kind !== gem.owner || h.dead) continue;
          const r = { x: gem.x - 9, y: gem.y - 9, w: 18, h: 18 };
          if (overlap(h, r)) {
            gem.taken = true;
            this.collected[h.kind]++;
            Sound.gem(h.kind);
            this.burst(gem.x, gem.y, COLORS[h.kind === "girl" ? "pink" : "gold"][1], 16, 160);
          }
        }
      }
    }

    updateMechanics(dt) {
      const w = this.world;
      for (const b of w.buttons) {
        const zone = { x: b.x + 2, y: b.y + T - 10, w: T - 4, h: 10 };
        const was = b.pressed;
        b.pressed = this.heroes.some((h) => overlap(h, zone)) || w.boxes.some((x) => overlap(x, zone));
        if (b.pressed && !was) Sound.button();
        b.depth += ((b.pressed ? 1 : 0) - b.depth) * Math.min(1, dt * 18);
      }
      for (const l of w.levers) {
        const target = l.on ? 0.6 : -0.6;
        l.angle += (target - l.angle) * Math.min(1, dt * 14);
      }

      for (const g of w.gates) {
        const target = w.active(g.trigger) ? 1 : 0;
        let next = g.open + Math.sign(target - g.open) * dt * 2.2;
        next = target > g.open ? Math.min(target, next) : Math.max(target, next);
        const nh = g.fullH * (1 - next);
        if (nh > g.h) {
          const test = { x: g.x, y: g.y, w: g.w, h: nh };
          if (this.heroes.some((h) => overlap(h, test)) || w.boxes.some((b) => overlap(b, test))) next = g.open;
        }
        g.open = next;
        g.h = g.fullH * (1 - g.open);
      }

      for (const m of w.movers) {
        let tx, ty;
        if (m.loop) {
          if (m.wait > 0) { m.wait -= dt; m.dx = m.dy = 0; continue; }
          tx = m.dir > 0 ? m.x1 : m.x0;
          ty = m.dir > 0 ? m.y1 : m.y0;
        } else {
          const on = w.active(m.trigger);
          tx = on ? m.x1 : m.x0;
          ty = on ? m.y1 : m.y0;
        }
        const ddx = tx - m.x, ddy = ty - m.y;
        const dist = Math.hypot(ddx, ddy);
        const step = m.speed * dt;
        let mx = 0, my = 0;
        if (dist <= step) {
          mx = ddx; my = ddy;
          if (m.loop && dist > 0.001) { m.dir *= -1; m.wait = 0.6; }
          else if (m.loop) { m.dir *= -1; m.wait = 0.6; }
        } else {
          mx = (ddx / dist) * step;
          my = (ddy / dist) * step;
        }
        m.x += mx; m.y += my; m.dx = mx; m.dy = my;
      }
    }

    updateCamera(dt) {
      const w = this.world;
      if (w.pxW <= VW) { this.cam.x = 0; return; }
      const target = this.cameraTarget();
      this.cam.x += (target - this.cam.x) * Math.min(1, dt * 5);
      if (BOT) return;
      for (const h of this.heroes) {
        const lo = this.cam.x + 2, hi = this.cam.x + VW - h.w - 2;
        if (h.x < lo) { h.x = lo; if (h.vx < 0) h.vx = 0; }
        if (h.x > hi) { h.x = hi; if (h.vx > 0) h.vx = 0; }
      }
    }

    updateCheckpoints(dt) {
      for (const cp of this.world.checkpoints) {
        cp.glow = Math.max(0, cp.glow - dt);
        if (cp.active) continue;
        const zone = { x: cp.x - 8, y: cp.y - T, w: T + 16, h: 2 * T };
        for (const h of this.heroes) {
          if (!h.dead && overlap(h, zone) && !cp.touched[h.kind]) {
            cp.touched[h.kind] = true;
            Sound.button();
          }
        }
        if (cp.touched.girl && cp.touched.boy) {
          cp.active = true;
          cp.glow = 1;
          for (const o of this.world.checkpoints) o.current = false;
          cp.current = true;
          cp.snapshot = this.world.boxes.map((b) => ({ x: b.x, y: b.y }));
          this.checkpoint = cp;
          Sound.checkpoint();
          this.burst(cp.x + T / 2, cp.y - 10, "#c8ffdc", 26, 180);
          toast("Контрольная точка");
        }
      }
    }

    updateBoss(b, dt) {
      b.t += dt;
      b.flash = Math.max(0, b.flash - dt * 3);
      b.beam = Math.max(0, b.beam - dt);
      if (b.dead) {
        b.deathT += dt;
        if (b.deathT < 1.6 && Math.random() < 0.5) this.burst(b.x + rand(-40, 40), b.y + rand(0, 60), Math.random() < 0.5 ? COLORS.pink[1] : COLORS.gold[1], 3, 160);
        return;
      }
      if (!b.awake) {
        if (this.heroes.some((h) => h.x > b.arena[0] && h.x < b.arena[1] && h.y > b.homeY)) {
          b.awake = true;
          b.timer = 1.8;
          Sound.boss();
          toast(b.name + " пробудился!");
          setHint("");
          this.shake = 6;
        } else return;
      }
      const span = (b.arena[1] - b.arena[0]) * 0.28;
      const mid = (b.arena[0] + b.arena[1]) / 2;
      const speed = b.speed * (1 + b.phase * 0.35);
      const tx = mid + Math.sin(b.t * speed) * span;
      const ty = b.homeY + Math.sin(b.t * 1.9) * 7 + (b.stun > 0 ? 18 : 0);
      b.x += (tx - b.x) * Math.min(1, dt * 3);
      b.y += (ty - b.y) * Math.min(1, dt * 3);

      const plates = b.plateRects();
      for (const p of plates) {
        const h = this.heroes.find((x) => x.kind === p.kind);
        const was = b.pressed[p.kind];
        b.pressed[p.kind] = !!h && !h.dead && overlap(h, p.zone);
        if (b.pressed[p.kind] && !was) Sound.button();
      }
      if (b.stun > 0) b.stun -= dt;
      if (b.pressed.girl && b.pressed.boy && b.stun <= 0) {
        b.hold += dt;
        if (b.hold > 0.3) {
          b.hold = 0;
          b.hp--;
          b.flash = 1;
          b.beam = 0.7;
          b.stun = 1.6;
          b.drops = [];
          b.rollers = [];
          this.shake = 10;
          Sound.bossHit();
          for (const p of plates) this.burst(p.x + T / 2, p.y + T - 6, COLORS[p.kind === "girl" ? "pink" : "gold"][1], 20, 200);
          this.burst(b.x, b.y + 30, "#ffffff", 30, 240);
          if (b.hp <= 0) {
            b.dead = true;
            b.deathT = 0;
            Sound.bossDown();
            toast(b.name + " повержен! Путь к дверям открыт");
          } else {
            b.phase = Math.min(b.phase + 1, b.plates.length - 1);
            toast(`Удар! Осталось ${b.hp}`);
          }
          return;
        }
      } else b.hold = 0;

      if (!BOT && b.stun <= 0) {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.timer = b.rate[b.phase] + rand(-0.2, 0.2);
          const n = b.multi[b.phase];
          const alive = this.heroes.filter((h) => !h.dead);
          for (let i = 0; i < n; i++) {
            const target = alive[(b.next + i) % alive.length];
            const roll = Math.random();
            const kind = roll < 0.4 ? (target.kind === "girl" ? "gold" : "pink") : roll < 0.75 ? "green" : (target.kind === "girl" ? "pink" : "gold");
            const dx = clamp(target.x + target.w / 2 + target.vx * 0.35 + (i ? rand(-70, 70) : 0), b.arena[0] + 10, b.arena[1] - 10);
            let gy = b.y + 60;
            const col = Math.floor(dx / T);
            for (let r = Math.floor((b.y + 70) / T); r < this.world.h; r++) {
              if (SOLID.has(this.world.tile(col, r))) { gy = r * T; break; }
            }
            b.drops.push({ x: dx, y: b.y + 60, vy: 0, tele: 0.85, teleMax: 0.85, kind, groundY: gy });
          }
          b.next++;
          Sound.drip();
        }
      }
      for (const d of b.drops) {
        if (d.tele > 0) {
          d.tele -= dt;
          continue;
        }
        d.vy = Math.min(d.vy + 1500 * dt, 900);
        d.y += d.vy * dt;
        const r = { x: d.x - 6, y: d.y - 8, w: 12, h: 14 };
        for (const h of this.heroes) {
          if (h.dead || !overlap(h, r)) continue;
          const safe = (d.kind === "pink" && h.kind === "girl") || (d.kind === "gold" && h.kind === "boy");
          d.hit = true;
          if (safe) {
            this.burst(d.x, d.y, COLORS[d.kind][1], 10, 120);
          } else {
            this.die(h, d.kind);
            return;
          }
        }
        if (d.y >= d.groundY - 4) {
          d.hit = true;
          this.burst(d.x, d.groundY - 4, COLORS[d.kind][0], 12, 140);
        }
      }
      b.drops = b.drops.filter((d) => !d.hit);

      if (!BOT && b.rollEvery > 0 && b.stun <= 0) {
        b.rollT -= dt;
        if (b.rollT <= 0) {
          b.rollT = b.rollEvery + rand(-0.4, 0.4);
          const dir = Math.random() < 0.5 ? 1 : -1;
          b.rollers.push({ dir, x: dir > 0 ? b.arena[0] + 12 : b.arena[1] - 12, y: 19 * T - 10, warn: 1.0, spin: 0 });
        }
      }
      for (const r of b.rollers) {
        if (r.warn > 0) { r.warn -= dt; continue; }
        r.x += r.dir * 240 * dt;
        r.spin += r.dir * dt * 24;
        const rect = { x: r.x - 9, y: r.y - 9, w: 18, h: 18 };
        for (const h of this.heroes) {
          if (!h.dead && overlap(h, rect)) { this.die(h, "green"); return; }
        }
        if (Math.random() < dt * 20) this.particles.push({ x: r.x - r.dir * 8, y: r.y + 8, vx: -r.dir * 30, vy: rand(-40, -10), life: 0.3, max: 0.3, color: "rgba(160,255,190,0.6)", size: 2 });
        if (r.x < b.arena[0] - 10 || r.x > b.arena[1] + 10) r.gone = true;
      }
      b.rollers = b.rollers.filter((r) => !r.gone);
    }

    updateAmbient(dt) {
      const w = this.world;
      this.stepT -= dt;
      if (this.motes.length < (Settings.quality === "high" ? 36 : 0)) {
        this.motes.push({ x: this.cam.x + rand(0, VW), y: rand(0, VH), vx: rand(-6, 6), vy: rand(-8, -2), life: rand(4, 9), max: 9, s: rand(0.8, 2) });
      }
      for (const m of this.motes) {
        m.x += (m.vx + Math.sin(animT + m.y * 0.02) * 4) * dt;
        m.y += m.vy * dt;
        m.life -= dt;
      }
      this.motes = this.motes.filter((m) => m.life > 0 && m.x > this.cam.x - 40 && m.x < this.cam.x + VW + 40);
      if (this.stepT <= 0) {
        this.stepT = 0.16;
        for (const h of this.heroes) {
          if (h.dead || !h.onGround || Math.abs(h.vx) < 60) continue;
          const fx = h.x + h.w / 2, fy = h.y + h.h;
          if (h.sink > 2) {
            const kind = h.kind === "girl" ? "pink" : "gold";
            for (let i = 0; i < 3; i++) this.particles.push({ x: fx + rand(-6, 6), y: fy - 2, vx: rand(-40, 40) - h.vx * 0.2, vy: rand(-140, -60), life: 0.45, max: 0.45, color: COLORS[kind][1], size: rand(1.5, 2.8) });
          } else {
            this.particles.push({ x: fx - Math.sign(h.vx) * 6, y: fy - 1, vx: -h.vx * 0.15 + rand(-10, 10), vy: rand(-40, -15), life: 0.35, max: 0.35, color: "rgba(200,190,220,0.45)", size: rand(1.5, 3) });
          }
        }
      }
      if (Math.random() < dt * 2.5) {
        const x = Math.floor(rand(Math.max(1, this.cam.x / T), Math.min(w.w - 1, (this.cam.x + VW) / T)));
        for (let y = 1; y < w.h - 2; y++) {
          if (w.grid[y][x] === "#" && w.grid[y + 1][x] === "." && seeded(x * 7 + y) > 0.5) {
            this.particles.push({ x: x * T + 6 + seeded(x + y) * 18, y: (y + 1) * T, vx: 0, vy: 20, life: 1.2, max: 1.2, color: "rgba(180,200,255,0.55)", size: 1.6 });
            break;
          }
        }
      }
      if (Math.random() < dt * 6) {
        const x0 = Math.max(0, Math.floor(this.cam.x / T)), x1 = Math.min(w.w - 1, Math.floor((this.cam.x + VW) / T));
        const x = Math.floor(rand(x0, x1 + 1));
        for (let y = 1; y < w.h; y++) {
          const kind = LIQUID[w.grid[y][x]];
          if (kind) {
            this.particles.push({ x: x * T + rand(4, T - 4), y: y * T + 6, vx: rand(-15, 15), vy: rand(-90, -40), life: 0.5, max: 0.5, color: COLORS[kind][1], size: rand(1.5, 2.5) });
            break;
          }
        }
      }
    }

    updateBox(b, dt) {
      const w = this.world;
      if (b.ground && b.ground.kind === "mover") {
        this.moveBoxX(b, b.ground.dx);
        b.y += b.ground.dy;
      }
      b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
      b.y += b.vy * dt;
      b.ground = null;
      for (const s of w.solidsFor(b, b)) {
        if (b.vy > 0 && b.y + b.h - s.y < 20) {
          b.y = s.y - b.h;
          b.vy = 0;
          b.ground = s;
        } else if (b.vy < 0) {
          b.y = s.y + s.h;
          b.vy = 0;
        }
      }
    }

    moveBoxX(b, amt) {
      if (!amt) return 0;
      const w = this.world;
      const ox = b.x;
      b.x += amt;
      for (const s of w.solidsFor(b, b)) {
        if (s.y + s.h <= b.y + 2 || s.y >= b.y + b.h - 2) continue;
        if (amt > 0) b.x = Math.min(b.x, s.x - b.w);
        else b.x = Math.max(b.x, s.x + s.w);
      }
      for (const h of this.heroes) {
        if (h.ground === b) h.x += b.x - ox;
      }
      return b.x - ox;
    }

    updateHero(h, dt) {
      const w = this.world;
      const c = h.ctrl;
      h.blink -= dt;
      if (h.blink < -0.12) h.blink = rand(2, 5);
      h.squash = Math.max(0, h.squash - dt * 5);

      if (h.ground && h.ground.kind === "mover") {
        h.x += h.ground.dx;
        h.y += h.ground.dy;
      }
      for (const m of w.movers) {
        if (overlap(h, m) && (m.dy < 0 || h.y + h.h - m.y < 14)) {
          h.y = m.y - h.h;
          h.vy = 0;
          h.ground = m;
        }
      }

      let dir = 0;
      if (held(c.left)) dir -= 1;
      if (held(c.right)) dir += 1;
      const onIce = h.onGround && h.ground && h.ground.kind === "tile" && h.ground.ch === "I";
      h.onIce = onIce;
      const accel = onIce ? 380 : h.onGround ? 2600 : 1600;
      const target = dir * (onIce ? SPEED * 1.15 : SPEED);
      if (dir) h.facing = dir;
      if (h.vx < target) h.vx = Math.min(target, h.vx + accel * dt);
      else if (h.vx > target) h.vx = Math.max(target, h.vx - accel * dt);

      h.coyote = h.onGround ? 0.09 : h.coyote - dt;
      h.jumpBuf = hit(c.jump) ? 0.12 : h.jumpBuf - dt;
      if (h.jumpBuf > 0 && h.coyote > 0) {
        h.vy = -JUMP_V;
        h.jumpBuf = 0;
        h.coyote = 0;
        h.onGround = false;
        h.ground = null;
        Sound.jump(h.kind);
        this.burst(h.x + h.w / 2, h.y + h.h, "rgba(220,210,240,0.6)", 6, 60);
      }
      if (!held(c.jump) && h.vy < -260) h.vy = -260;

      let dx = h.vx * dt;
      let pushing = false;
      h.x += dx;
      for (const s of w.solidsFor(h)) {
        if (s.y + s.h <= h.y + 1 || s.y >= h.y + h.h - 1) continue;
        if (s.kind === "box" && dx !== 0) {
          const need = dx > 0 ? h.x + h.w - s.x : h.x - (s.x + s.w);
          this.moveBoxX(s, need * 0.85);
          pushing = true;
          if (overlap(h, s)) h.x = dx > 0 ? s.x - h.w : s.x + s.w;
          continue;
        }
        if (dx > 0) h.x = s.x - h.w;
        else if (dx < 0) h.x = s.x + s.w;
        else {
          const cx = h.x + h.w / 2;
          h.x = cx < s.x + s.w / 2 ? s.x - h.w : s.x + s.w;
        }
        h.vx = 0;
      }
      if (pushing) h.vx *= 0.9;
      h.x = clamp(h.x, 0, w.pxW - h.w);

      let inFan = false;
      for (const f of w.fans) {
        if (overlap(h, f)) {
          inFan = true;
          h.vy = Math.max(h.vy - 3300 * f.power * dt, -430);
        }
      }
      if (inFan && Math.random() < dt * 20) this.particles.push({ x: h.x + rand(0, h.w), y: h.y + h.h, vx: rand(-10, 10), vy: rand(-160, -90), life: 0.4, max: 0.4, color: "rgba(200,240,255,0.5)", size: 1.6 });
      const wasGround = h.onGround;
      const fallV = h.vy;
      h.vy = Math.min(h.vy + GRAVITY * dt, MAX_FALL);
      h.y += h.vy * dt;
      h.onGround = false;
      h.ground = null;
      for (const s of w.solidsFor(h)) {
        if (h.vy >= 0 && h.y + h.h - s.y <= Math.max(16, h.vy * dt + 6)) {
          h.y = s.y - h.h;
          h.vy = 0;
          h.onGround = true;
          h.ground = s;
        } else if (h.vy < 0 && s.y + s.h - h.y <= Math.abs(h.vy * dt) + 6) {
          h.y = s.y + s.h;
          h.vy = 0;
        }
      }
      if (h.onGround && !wasGround && fallV > 380) {
        h.squash = 1;
        this.burst(h.x + h.w / 2, h.y + h.h, "rgba(220,210,240,0.5)", 5, 50);
      }

      if (h.onGround && h.ground && h.ground.kind === "tile") {
        const row = Math.floor((h.y + h.h + 1) / T);
        const x0 = Math.floor((h.x + h.w / 2 - 3) / T), x1 = Math.floor((h.x + h.w / 2 + 3) / T);
        let liquid = null, safe = false;
        for (let x = x0; x <= x1; x++) {
          const ch = w.tile(x, row);
          if (LIQUID[ch]) {
            const kind = LIQUID[ch];
            const ok = (kind === "pink" && h.kind === "girl") || (kind === "gold" && h.kind === "boy");
            if (!ok) { liquid = kind; break; }
            safe = true;
          }
        }
        if (liquid) return this.die(h, liquid);
        h.sink += ((safe ? 7 : 0) - h.sink) * Math.min(1, dt * 12);
      } else {
        h.sink += (0 - h.sink) * Math.min(1, dt * 12);
      }

      if (h.onGround && Math.abs(h.vx) > 10) h.walkT += dt * Math.abs(h.vx) / SPEED;
      else h.walkT = 0;

      h.portalCd = Math.max(0, (h.portalCd || 0) - dt);
      if (h.portalCd <= 0) {
        for (const p of w.portals) {
          if (!p.pair || !overlap(h, { x: p.x + 6, y: p.y + 4, w: p.w - 12, h: p.h - 4 })) continue;
          this.burst(h.x + h.w / 2, h.y + h.h / 2, `hsl(${p.hue},90%,70%)`, 18, 160);
          h.x = p.pair.x + (T - h.w) / 2;
          h.y = p.pair.y + p.pair.h - h.h - 1;
          h.portalCd = 0.9;
          h.ground = null;
          this.burst(h.x + h.w / 2, h.y + h.h / 2, `hsl(${p.pair.hue},90%,70%)`, 18, 160);
          Sound.portal();
          break;
        }
      }

      if (hit(c.act)) {
        for (const l of w.levers) {
          const zone = { x: l.x - 6, y: l.y, w: T + 12, h: T };
          if (overlap(h, zone)) {
            l.on = !l.on;
            Sound.lever();
            this.burst(l.x + T / 2, l.y + 10, "#ffffff", 6, 80);
          }
        }
      }
      if (h.y > this.world.h * T + 50) this.die(h, "green");
    }

    die(h, liquid) {
      if (this.race) {
        if (h.dead || h.finishT !== null || this.finished) return;
        h.dead = true;
        h.respawnT = 1.0;
        h.deaths++;
        this.deaths++;
        Ach.bump("deaths");
        Sound.death();
        const c = COLORS[liquid] || COLORS.green;
        this.burst(h.x + h.w / 2, h.y + h.h / 2, c[0], 30, 240);
        return;
      }
      if (this.deadTimer > 0 || this.finished) return;
      Ach.bump("deaths");
      h.dead = true;
      this.deadTimer = 1.1;
      this.shake = 8;
      Sound.death();
      const col = COLORS[liquid] || COLORS.green;
      this.burst(h.x + h.w / 2, h.y + h.h / 2, col[0], 40, 260);
      this.burst(h.x + h.w / 2, h.y + h.h / 2, "#ffffff", 12, 180);
    }

    win() {
      if (this.finished) return;
      this.finished = true;
      Sound.win();
      for (const h of this.heroes) this.burst(h.x + h.w / 2, h.y + 10, COLORS[h.kind === "girl" ? "pink" : "gold"][1], 30, 220);
      onLevelComplete(this);
    }

    burst(x, y, color, n, power) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * power;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - power * 0.3, life: rand(0.4, 0.9), max: 0.9, color, size: rand(1.5, 3.5) });
      }
    }
    updateParticles(dt) {
      for (const p of this.particles) {
        p.vy += 600 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    }

    get gemsCollected() { return this.collected.girl + this.collected.boy; }
    get gemsTotal() { return this.world.gemTotal.girl + this.world.gemTotal.boy; }
    stars() {
      let s = 1;
      if (this.gemsCollected === this.gemsTotal) s++;
      if (this.time <= this.def.par) s++;
      return s;
    }

    draw(g) {
      if (this.race) return this.drawRace(g);
      const w = this.world;
      this.drawView(g, Math.round(this.cam.x));
      const vg = g.createRadialGradient(VW / 2, VH / 2, VH * 0.4, VW / 2, VH / 2, VH * 0.95);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.5)");
      g.fillStyle = vg;
      g.fillRect(0, 0, VW, VH);
      if (w.pxW > VW) {
        const k = this.cam.x / (w.pxW - VW);
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(VW / 2 - 80, VH - 8, 160, 3);
        g.fillStyle = "rgba(255,255,255,0.5)";
        g.fillRect(VW / 2 - 80 + k * 150, VH - 8, 10, 3);
      }
      if (this.deadTimer > 0) {
        g.fillStyle = `rgba(30,0,10,${0.4 * (1 - this.deadTimer / 1.1)})`;
        g.fillRect(0, 0, VW, VH);
      }
    }

    drawRace(g) {
      const half = VH / 2;
      const w = this.world;
      this.heroes.forEach((h, i) => {
        g.save();
        g.beginPath();
        g.rect(0, i * half, VW, half);
        g.clip();
        this.drawView(g, Math.round(this.camR[h.kind]));
        const vg = g.createLinearGradient(0, i * half, 0, i * half + half);
        vg.addColorStop(0, "rgba(0,0,0,0.25)");
        vg.addColorStop(0.15, "rgba(0,0,0,0)");
        vg.addColorStop(0.85, "rgba(0,0,0,0)");
        vg.addColorStop(1, "rgba(0,0,0,0.3)");
        g.fillStyle = vg;
        g.fillRect(0, i * half, VW, half);
        if (h.dead) {
          g.fillStyle = "rgba(40,0,15,0.35)";
          g.fillRect(0, i * half, VW, half);
        }
        g.restore();
        const col = COLORS[h.kind === "girl" ? "pink" : "gold"];
        const y0 = i * half + (i === 0 ? 44 : 14);
        g.fillStyle = "rgba(10,8,18,0.7)";
        roundRect(g, 12, y0, 214, 26, 8);
        g.fill();
        g.fillStyle = col[0];
        g.fillRect(12, y0, 4, 26);
        g.fillStyle = "#f1ecf7";
        g.font = "600 13px Rubik, sans-serif";
        g.textAlign = "left";
        const t = h.finishT !== null ? h.finishT : this.time;
        const status = h.finishT !== null ? (this.winner === h.kind ? "ПОБЕДА" : "финиш") : h.dead ? "…" : "";
        g.fillText(`${h.kind === "girl" ? "Девочка" : "Бородач"}  ${fmt(t)}  ☠${h.deaths}  ${status}`, 24, y0 + 17);
      });
      const grd = g.createLinearGradient(0, 0, VW, 0);
      grd.addColorStop(0, COLORS.pink[0]);
      grd.addColorStop(1, COLORS.gold[0]);
      g.fillStyle = "#0b0812";
      g.fillRect(0, half - 4, VW, 8);
      g.fillStyle = grd;
      g.fillRect(0, half - 1, VW, 2);
      const start = T * 2, end = (w.finishes.girl ? w.finishes.girl.x : w.pxW - T * 4);
      const bx = VW - 260, bw = 230;
      g.fillStyle = "rgba(10,8,18,0.8)";
      roundRect(g, bx - 10, half - 12, bw + 20, 24, 12);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.15)";
      g.fillRect(bx, half - 1, bw, 2);
      g.fillStyle = "#fff";
      g.fillRect(bx + bw - 2, half - 7, 2, 14);
      for (const h of this.heroes) {
        const k = clamp((h.x - start) / (end - start), 0, 1);
        g.fillStyle = COLORS[h.kind === "girl" ? "pink" : "gold"][0];
        g.beginPath();
        g.arc(bx + k * bw, half + (h.kind === "girl" ? -4 : 4), 5, 0, Math.PI * 2);
        g.fill();
      }
      if (this.countdown > 0) {
        const n = Math.ceil(this.countdown);
        const f = this.countdown - Math.floor(this.countdown);
        g.save();
        g.fillStyle = "rgba(8,6,14,0.35)";
        g.fillRect(0, 0, VW, VH);
        g.translate(VW / 2, VH / 2);
        g.scale(1 + (1 - f) * 0.3, 1 + (1 - f) * 0.3);
        g.globalAlpha = Math.min(1, f * 2 + 0.2);
        g.fillStyle = n === 3 ? COLORS.pink[0] : n === 2 ? "#ffffff" : COLORS.gold[0];
        g.font = "120px 'Russo One', sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(n), 0, 0);
        g.restore();
      } else if (this.time < 0.8) {
        g.save();
        g.globalAlpha = 1 - this.time / 0.8;
        g.fillStyle = "#c8ffdc";
        g.font = "90px 'Russo One', sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("МАРШ!", VW / 2, VH / 2);
        g.restore();
      }
    }

    drawView(g, camX) {
      const w = this.world;
      g.save();
      if (this.shake > 0 && Settings.shake) g.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
      g.drawImage(w.bgLayer, -Math.round(camX * 0.35), 0);
      g.translate(-camX, 0);
      const view = { x: camX - 120, w: VW + 240 };
      g.save();
      g.globalCompositeOperation = "lighter";
      if (Settings.quality === "high") for (const t of w.torches) if (t.x > view.x && t.x < view.x + view.w) drawTorchLight(g, t);
      g.restore();
      g.drawImage(w.staticLayer, 0, 0);
      for (const t of w.torches) if (t.x > view.x && t.x < view.x + view.w) drawTorchFlame(g, t);

      for (const gt of w.gates) drawGate(g, gt);
      drawLiquids(g, w, camX);
      for (const k of ["girl", "boy"]) if (w.doors[k]) drawDoor(g, w.doors[k], k);
      for (const k of ["girl", "boy"]) if (w.finishes[k]) drawFinish(g, w.finishes[k], k);
      for (const cp of w.checkpoints) drawCheckpoint(g, cp);
      for (const b of w.buttons) drawButton(g, b);
      for (const l of w.levers) drawLever(g, l);
      if (w.boss) drawPlates(g, w.boss);
      for (const f of w.fans) drawFan(g, f);
      for (const p of w.portals) drawPortal(g, p);
      for (const m of w.movers) drawMover(g, m, w);
      for (const b of w.boxes) drawBox(g, b);
      for (const gem of w.gems) if (!gem.taken) drawGem(g, gem);
      if (w.boss) {
        drawBoss(g, w.boss);
        if (w.boss.beam > 0) {
          g.save();
          g.globalCompositeOperation = "lighter";
          g.lineCap = "round";
          for (const p of w.boss.plateRects()) {
            g.strokeStyle = COLORS[p.kind === "girl" ? "pink" : "gold"][0];
            g.globalAlpha = w.boss.beam;
            g.lineWidth = 6 + Math.sin(animT * 40) * 2;
            g.beginPath();
            g.moveTo(p.x + T / 2, p.y + T - 6);
            g.lineTo(w.boss.x, w.boss.y + 30);
            g.stroke();
          }
          g.restore();
        }
      }
      if (this.race && this.ghostHeroes && this.time > 0) {
        for (const kind of ["girl", "boy"]) {
          const gh = this.ghostHeroes[kind];
          if (!this.ghosts[kind] || gh.hidden) continue;
          g.save();
          g.globalAlpha = 0.32;
          if (kind === "girl") drawGirl(g, gh); else drawBoy(g, gh);
          g.restore();
          g.fillStyle = "rgba(220,210,255,0.55)";
          g.font = "10px Rubik, sans-serif";
          g.textAlign = "center";
          g.fillText("рекорд", gh.x + gh.w / 2, gh.y - 18);
        }
      }
      for (const h of this.heroes) {
        if (h.dead) continue;
        if (h.kind === "girl") drawGirl(g, h);
        else drawBoy(g, h);
      }
      if (w.boss) drawDrops(g, w.boss);
      for (const lv of w.levers) {
        if (this.heroes.some((h) => overlap(h, { x: lv.x - 6, y: lv.y, w: T + 12, h: T }))) {
          g.fillStyle = "rgba(255,255,255,0.85)";
          g.font = "bold 11px Rubik, sans-serif";
          g.textAlign = "center";
          g.fillText("S / ↓", lv.x + T / 2, lv.y - 8 + Math.sin(animT * 6) * 2);
        }
      }
      for (const p of this.particles) {
        g.globalAlpha = clamp(p.life / p.max, 0, 1);
        g.fillStyle = p.color;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      for (const m of this.motes) {
        g.globalAlpha = clamp(Math.min(m.life, m.max - m.life) / 2, 0, 1) * 0.35;
        g.fillStyle = "#f3e6ff";
        g.fillRect(m.x, m.y, m.s, m.s);
      }
      g.globalAlpha = 1;
      g.restore();
      if (Settings.quality === "high") g.drawImage(renderLight(this, camX), 0, 0);
      const fog = g.createLinearGradient(0, VH - 90, 0, VH);
      fog.addColorStop(0, "rgba(120,90,160,0)");
      fog.addColorStop(1, "rgba(120,90,160,0.14)");
      g.fillStyle = fog;
      g.fillRect(0, VH - 90, VW, 90);
      g.globalAlpha = 0.06;
      g.fillStyle = "#d8c8ff";
      for (let i = 0; i < 3; i++) {
        const fx = ((animT * (12 + i * 6) - camX * (0.6 + i * 0.2)) % (VW + 400) + VW + 400) % (VW + 400) - 200;
        g.beginPath();
        g.ellipse(fx, VH - 20 - i * 14, 220, 22, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }

  const lightCanvas = document.createElement("canvas");
  lightCanvas.width = VW;
  lightCanvas.height = VH;
  const lctx = lightCanvas.getContext("2d");

  function punch(x, y, r, a = 1) {
    const gr = lctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${a})`);
    gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = gr;
    lctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function renderLight(game, camX) {
    const w = game.world;
    lctx.globalCompositeOperation = "source-over";
    lctx.clearRect(0, 0, VW, VH);
    lctx.fillStyle = w.dark ? "rgba(3,2,8,0.86)" : "rgba(7,4,16,0.5)";
    lctx.fillRect(0, 0, VW, VH);
    lctx.globalCompositeOperation = "destination-out";
    const inView = (x) => x > camX - 160 && x < camX + VW + 160;
    for (const t of w.torches) if (inView(t.x)) punch(t.x - camX, t.y, 150 + Math.sin(animT * 9 + t.phase) * 8);
    for (const h of game.heroes) if (!h.dead) punch(h.x + h.w / 2 - camX, h.y + h.h / 2, w.dark ? 150 : 105, 0.95);
    for (const p of w.portals) if (inView(p.x)) punch(p.x + T / 2 - camX, p.y + T, 70, 0.8);
    for (const gem of w.gems) if (!gem.taken && inView(gem.x)) punch(gem.x - camX, gem.y, 42, 0.7);
    for (const k of ["girl", "boy"]) { const d = w.doors[k]; if (d && inView(d.x)) punch(d.x + T / 2 - camX, d.y + T, 70, 0.6 + d.open * 0.4); }
    for (const cp of w.checkpoints) if (inView(cp.x) && (cp.active || cp.touched.girl || cp.touched.boy)) punch(cp.x + T / 2 - camX, cp.y - 10, 80, 0.8);
    const xs = Math.max(0, Math.floor(camX / T) - 1), xe = Math.min(w.w - 1, Math.floor((camX + VW) / T) + 1);
    for (let y = 0; y < w.h; y++) {
      for (let x = xs; x <= xe; x++) {
        if (LIQUID[w.grid[y][x]] && x % 2 === 0) punch(x * T + T - camX, y * T, 60, 0.6);
      }
    }
    if (w.boss && !(w.boss.dead && w.boss.deathT > 1.6)) {
      const b = w.boss;
      punch(b.x - camX, b.y + 30, 180, 0.8);
      if (!b.dead) for (const p of b.plateRects()) punch(p.x + T / 2 - camX, p.y + T - 4, 60, 0.7);
      for (const d of b.drops) punch(d.x - camX, d.y, 34, 0.6);
    }
    lctx.globalCompositeOperation = "source-over";
    return lightCanvas;
  }

  function drawLiquids(g, w, camX = 0) {
    const xs = Math.max(0, Math.floor(camX / T) - 1), xe = Math.min(w.w - 1, Math.floor((camX + VW) / T) + 1);
    for (let y = 0; y < w.h; y++) {
      for (let x = xs; x <= xe; x++) {
        const kind = LIQUID[w.grid[y][x]];
        if (!kind) continue;
        const [c1, c2, c3] = COLORS[kind];
        const px = x * T, py = y * T;
        const grd = g.createLinearGradient(0, py, 0, py + T);
        grd.addColorStop(0, c1);
        grd.addColorStop(1, c3);
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(px, py + T);
        for (let i = 0; i <= 6; i++) {
          const sx = px + (i / 6) * T;
          const sy = py + 6 + Math.sin(animT * 3 + (sx / 18)) * 2;
          g.lineTo(sx, sy);
        }
        g.lineTo(px + T, py + T);
        g.closePath();
        g.fill();
        g.fillStyle = c2;
        g.globalAlpha = 0.6;
        for (let i = 0; i < 2; i++) {
          const bx = px + seeded(x * 9 + i) * T;
          const by = py + T - ((animT * 14 + seeded(x + i * 5) * 30) % (T - 8));
          g.beginPath();
          g.arc(bx, by, 1.5, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        const glow = g.createLinearGradient(0, py - 14, 0, py + 6);
        glow.addColorStop(0, "rgba(0,0,0,0)");
        glow.addColorStop(1, c1 + "55");
        g.fillStyle = glow;
        g.fillRect(px, py - 14, T, 20);
      }
    }
  }

  function drawGate(g, gt) {
    if (gt.h < 1) return;
    g.save();
    g.beginPath();
    g.rect(gt.x, gt.y, gt.w, gt.h);
    g.clip();
    g.fillStyle = "#3d3456";
    g.fillRect(gt.x, gt.y, gt.w, gt.h);
    g.fillStyle = "#8b78b8";
    const off = gt.fullH - gt.h;
    for (let y = gt.y - off; y < gt.y + gt.h; y += 12) {
      g.fillRect(gt.x + 3, y, gt.w - 6, 3);
    }
    g.fillStyle = "#c9b8ff";
    g.fillRect(gt.x + gt.w / 2 - 2, gt.y, 4, gt.h);
    g.fillStyle = "#e7dcff";
    g.fillRect(gt.x, gt.y + gt.h - 4, gt.w, 4);
    g.restore();
  }

  function drawDoor(g, d, kind) {
    const col = kind === "girl" ? COLORS.pink : COLORS.gold;
    const x = d.x - 4, y = d.y + 2, w = d.w + 8, h = d.h - 2;
    g.fillStyle = "#3b3252";
    g.beginPath();
    g.moveTo(x - 6, y + h);
    g.lineTo(x - 6, y + 12);
    g.arc(x + w / 2, y + 14, w / 2 + 6, Math.PI, 0);
    g.lineTo(x + w + 6, y + h);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i < 4; i++) g.fillRect(x - 6, y + 18 + i * 11, 6, 1);
    for (let i = 0; i < 4; i++) g.fillRect(x + w, y + 18 + i * 11, 6, 1);
    g.fillStyle = col[0];
    g.globalAlpha = 0.35 + Math.sin(animT * 2 + (kind === "girl" ? 0 : 1.5)) * 0.25 + d.open * 0.4;
    g.beginPath();
    g.moveTo(x + w / 2, y - 7);
    g.lineTo(x + w / 2 + 4, y - 3);
    g.lineTo(x + w / 2, y + 1);
    g.lineTo(x + w / 2 - 4, y - 3);
    g.closePath();
    g.fill();
    g.fillRect(x - 4, y + h - 30, 2, 8);
    g.fillRect(x + w + 2, y + h - 30, 2, 8);
    g.globalAlpha = 1;
    g.fillStyle = "#4b4066";
    g.fillRect(x - 8, y + h - 3, w + 16, 3);
    g.fillStyle = "#2a2238";
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + 14);
    g.arc(x + w / 2, y + 14, w / 2, Math.PI, 0);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = col[0];
    g.globalAlpha = 0.25 + d.open * 0.5;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    const slide = d.open * (h - 10);
    g.fillStyle = col[2];
    g.fillRect(x + 4, y + 4 - slide, w - 8, h - 4);
    g.fillStyle = col[1];
    g.font = "bold 14px Rubik, sans-serif";
    g.textAlign = "center";
    g.fillText(kind === "girl" ? "♀" : "♂", x + w / 2, y + 26 - slide);
    g.restore();
    g.strokeStyle = col[1];
    g.lineWidth = 2;
    g.shadowColor = col[0];
    g.shadowBlur = 10 + d.open * 10;
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + 14);
    g.arc(x + w / 2, y + 14, w / 2, Math.PI, 0);
    g.lineTo(x + w, y + h);
    g.stroke();
    g.shadowBlur = 0;
  }

  function drawButton(g, b) {
    const d = b.depth * 4;
    g.fillStyle = "#2a2238";
    g.fillRect(b.x + 3, b.y + T - 4, T - 6, 4);
    g.fillStyle = b.pressed ? "#7dffb0" : "#c9b8ff";
    g.shadowColor = g.fillStyle;
    g.shadowBlur = b.pressed ? 12 : 4;
    g.fillRect(b.x + 6, b.y + T - 9 + d, T - 12, 5 - d * 0.5);
    g.shadowBlur = 0;
  }

  function drawLever(g, l) {
    const bx = l.x + T / 2, by = l.y + T;
    g.fillStyle = "#4a3f63";
    g.beginPath();
    g.arc(bx, by, 9, Math.PI, 0);
    g.fill();
    g.strokeStyle = "#cfc4e6";
    g.lineWidth = 3;
    g.lineCap = "round";
    const tipX = bx + Math.sin(l.angle) * 20, tipY = by - Math.cos(l.angle) * 20;
    g.beginPath();
    g.moveTo(bx, by - 3);
    g.lineTo(tipX, tipY);
    g.stroke();
    g.fillStyle = l.on ? "#7dffb0" : "#ff6f8f";
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 10;
    g.beginPath();
    g.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }

  function drawMover(g, m, w) {
    if (!m.loop) {
      g.strokeStyle = "rgba(200,190,230,0.15)";
      g.lineWidth = 2;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.moveTo(m.x0 + m.w / 2, m.y0 + m.h);
      g.lineTo(m.x1 + m.w / 2, m.y1);
      g.stroke();
      g.setLineDash([]);
    }
    const grd = g.createLinearGradient(0, m.y, 0, m.y + m.h);
    grd.addColorStop(0, "#a593d6");
    grd.addColorStop(1, "#5a4c82");
    g.fillStyle = grd;
    g.fillRect(m.x, m.y, m.w, m.h);
    g.fillStyle = "#e3d9ff";
    g.fillRect(m.x, m.y, m.w, 3);
    g.fillStyle = "rgba(0,0,0,0.25)";
    for (let i = 8; i < m.w; i += 16) g.fillRect(m.x + i, m.y + 8, 8, 4);
    const lit = m.loop || w.active(m.trigger);
    g.fillStyle = lit ? "#7dffb0" : "#ff6f8f";
    g.fillRect(m.x + m.w / 2 - 3, m.y + m.h - 6, 6, 3);
  }

  function drawBox(g, b) {
    g.fillStyle = "#8a5a32";
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = "#5e3a1c";
    g.lineWidth = 2;
    g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    g.beginPath();
    g.moveTo(b.x + 3, b.y + 3);
    g.lineTo(b.x + b.w - 3, b.y + b.h - 3);
    g.moveTo(b.x + b.w - 3, b.y + 3);
    g.lineTo(b.x + 3, b.y + b.h - 3);
    g.stroke();
    g.fillStyle = "rgba(255,230,190,0.2)";
    g.fillRect(b.x, b.y, b.w, 3);
  }

  function drawGem(g, gem) {
    const col = gem.owner === "girl" ? COLORS.pink : COLORS.gold;
    const y = gem.y + Math.sin(animT * 3 + gem.phase) * 3;
    g.save();
    g.translate(gem.x, y);
    g.shadowColor = col[0];
    g.shadowBlur = 14;
    g.fillStyle = col[0];
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(8, -2);
    g.lineTo(0, 10);
    g.lineTo(-8, -2);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = col[1];
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(4, -2);
    g.lineTo(0, 2);
    g.lineTo(-4, -2);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.fillRect(-3, -6, 2, 2);
    const tw = Math.max(0, Math.sin(animT * 2.3 + gem.phase * 3));
    if (tw > 0.85) {
      const k = (tw - 0.85) / 0.15;
      g.strokeStyle = `rgba(255,255,255,${k})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(5 - 5 * k, -7);
      g.lineTo(5 + 5 * k, -7);
      g.moveTo(5, -7 - 5 * k);
      g.lineTo(5, -7 + 5 * k);
      g.stroke();
    }
    g.restore();
  }

  function limb(g, x1, y1, x2, y2, color, width) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  function heroPose(h) {
    const moving = h.walkT > 0;
    const ph = h.walkT * 13;
    const swing = moving ? Math.sin(ph) * 5 : 0;
    const bob = moving ? Math.abs(Math.sin(ph)) * 1.2 : 0;
    const air = !h.onGround;
    const sq = h.squash;
    return { swing, bob, air, sx: 1 + sq * 0.12, sy: 1 - sq * 0.12 };
  }

  function drawShadow(g, h) {
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.ellipse(h.x + h.w / 2, h.y + h.h + 1 + h.sink * 0.2, 11, 3, 0, 0, Math.PI * 2);
    g.fill();
  }

  function drawGirl(g, h) {
    const p = heroPose(h);
    drawShadow(g, h);
    g.save();
    g.translate(h.x + h.w / 2, h.y + h.h + h.sink);
    g.scale(h.facing * p.sx * 1.18, p.sy * 1.18);
    g.translate(0, -p.bob);
    if (h.sink > 1) {
      g.beginPath();
      g.rect(-30, -60, 60, 60 - h.sink);
      g.clip();
    }
    const S = h.skin || SKINS.girl[skinSel.girl];
    const skin = "#f2c6a0", flat = S.flat;
    const sweater = S.sweater, sweaterDark = S.sweaterDark;
    const scarf = S.scarf, scarfDark = S.scarfDark, skirt = S.skirt, skirtLight = S.skirtLight;
    const step = p.air ? 3 : p.swing * 0.7;
    g.fillStyle = flat;
    g.beginPath();
    g.ellipse(-1.5 + step, -1.2, 3.6, 1.5, 0, 0, Math.PI * 2);
    g.ellipse(2.5 - step, -1.2, 3.6, 1.5, 0, 0, Math.PI * 2);
    g.fill();
    const sway = p.air ? -2 : p.swing * 0.35;
    g.fillStyle = skirt;
    g.beginPath();
    g.moveTo(-6.5, -15);
    g.lineTo(6.5, -15);
    g.quadraticCurveTo(8.5 + sway, -8, 8 + sway, -2.5);
    g.quadraticCurveTo(0 + sway, -1.2, -8 + sway, -2.5);
    g.quadraticCurveTo(-8.5 + sway, -8, -6.5, -15);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(235,225,255,0.35)";
    g.lineWidth = 0.9;
    g.stroke();
    g.strokeStyle = skirtLight;
    g.lineWidth = 0.8;
    for (const fx of [-3, 1, 4.5]) {
      g.beginPath();
      g.moveTo(fx * 0.8, -14);
      g.lineTo(fx + sway * 0.8, -3);
      g.stroke();
    }
    const armSwing = p.air ? -7 : -p.swing;
    limb(g, -6, -25, -7 - armSwing * 0.8, -15, sweaterDark, 4.5);
    g.fillStyle = sweater;
    roundRect(g, -8, -28, 16, 14.5, 5);
    g.fill();
    g.fillStyle = sweaterDark;
    g.fillRect(-7.5, -15.5, 15, 1.6);
    limb(g, 6, -25, 7 + armSwing * 0.8, -15, sweater, 4.5);
    g.fillStyle = skin;
    g.beginPath();
    g.arc(7 + armSwing * 0.8, -14.5, 2, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = scarfDark;
    g.beginPath();
    g.moveTo(-9, -31);
    g.quadraticCurveTo(-12, -22, -6, -20);
    g.lineTo(-2, -27);
    g.closePath();
    g.fill();
    g.fillStyle = scarf;
    g.beginPath();
    g.ellipse(0, -34, 8.6, 9.2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(235,225,255,0.35)";
    g.lineWidth = 0.9;
    g.stroke();
    g.beginPath();
    g.moveTo(-7, -30);
    g.quadraticCurveTo(0, -23, 7.5, -29);
    g.lineTo(5, -26);
    g.quadraticCurveTo(0, -24, -6, -26);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.14)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, -34, 7.4, Math.PI * 1.05, Math.PI * 1.55);
    g.stroke();
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(2.2, -33.5, 5, 5.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2a1a22";
    if (h.blink > 0) {
      g.beginPath();
      g.arc(4.3, -34.5, 1.1, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(0.8, -34.5, 1, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(3.3, -34.6, 2.2, 0.8);
      g.fillRect(-0.1, -34.6, 2, 0.8);
    }
    g.fillStyle = "rgba(255,120,150,0.45)";
    g.beginPath();
    g.arc(5.6, -32, 1.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#b5546a";
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(3.4, -31.5, 1.4, 0.2, Math.PI - 0.2);
    g.stroke();
    g.restore();
  }

  function drawBoy(g, h) {
    const p = heroPose(h);
    drawShadow(g, h);
    g.save();
    g.translate(h.x + h.w / 2, h.y + h.h + h.sink);
    g.scale(h.facing * p.sx * 1.18, p.sy * 1.18);
    g.translate(0, -p.bob);
    if (h.sink > 1) {
      g.beginPath();
      g.rect(-30, -60, 60, 60 - h.sink);
      g.clip();
    }
    const S = h.skin || SKINS.boy[skinSel.boy];
    const jeans = S.pants, shoe = S.shoe, skin = "#e0b088";
    const top = S.top, topLight = S.topLight;
    const beard = S.beard;
    const cap = S.cap, capDark = S.capDark, brim = S.brim;
    if (p.air) {
      limb(g, -3, -14, -6, -5, jeans, 5.5);
      limb(g, 3, -14, 6, -7, jeans, 5.5);
      g.fillStyle = shoe;
      g.fillRect(-9, -6, 7, 3.5);
      g.fillRect(4, -8, 7, 3.5);
    } else {
      limb(g, -3, -14, -3 + p.swing, -2, jeans, 5.5);
      limb(g, 3, -14, 3 - p.swing, -2, jeans, 5.5);
      g.fillStyle = shoe;
      g.fillRect(-6 + p.swing, -3.5, 8, 3.5);
      g.fillRect(0 - p.swing, -3.5, 8, 3.5);
      g.fillStyle = S.sole;
      g.fillRect(-6 + p.swing, -1.2, 8, 1.2);
      g.fillRect(0 - p.swing, -1.2, 8, 1.2);
    }
    const armSwing = p.air ? -7 : -p.swing;
    limb(g, -7, -25, -8 - armSwing * 0.8, -15, S.sleeve, 5);
    g.fillStyle = top;
    roundRect(g, -9.5, -29, 19, 17, 5);
    g.fill();
    g.fillStyle = topLight;
    g.fillRect(-9.5, -14.5, 19, 2.5);
    limb(g, 7, -25, 8 + armSwing * 0.8, -15, top, 5);
    g.fillStyle = skin;
    g.beginPath();
    g.arc(8 + armSwing * 0.8, -14.5, 2.2, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(0.5, -34.5, 6.8, 7.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = beard;
    g.beginPath();
    g.moveTo(-6, -35);
    g.quadraticCurveTo(-6, -26, 1, -25);
    g.quadraticCurveTo(7.8, -26, 7.3, -33.5);
    g.quadraticCurveTo(4, -30.5, 1.5, -32);
    g.quadraticCurveTo(-2, -30.5, -4, -33);
    g.closePath();
    g.fill();
    g.fillStyle = "#c98a73";
    g.fillRect(2.5, -30.8, 3, 1);
    g.fillStyle = "#1a1210";
    if (h.blink > 0) {
      g.beginPath();
      g.arc(4.2, -36, 1.1, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(0.6, -36, 1, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(3.2, -36, 2.2, 0.8);
      g.fillRect(-0.4, -36, 2, 0.8);
    }
    g.fillStyle = beard;
    g.fillRect(2.6, -38.3, 3.4, 1.1);
    g.fillRect(-0.9, -38.3, 2.8, 1.1);
    g.fillStyle = skin;
    g.beginPath();
    g.arc(-5.8, -34.5, 1.8, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(0, -39, 8, 6.4, 0, Math.PI, 0);
    g.lineTo(8, -38.5);
    g.lineTo(-8, -38.5);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = capDark;
    for (let yy = -46; yy < -38; yy += 3) {
      for (let xx = -9 + ((yy / 3) % 2 ? 1.5 : 0); xx < 9; xx += 3) {
        g.save();
        g.translate(xx, yy);
        g.rotate(Math.PI / 4);
        g.fillRect(-0.7, -0.7, 1.4, 1.4);
        g.restore();
      }
    }
    g.restore();
    g.fillStyle = brim;
    g.beginPath();
    g.moveTo(4, -39.5);
    g.quadraticCurveTo(13, -40, 13.5, -37.2);
    g.lineTo(4, -37.6);
    g.closePath();
    g.fill();
    g.fillStyle = capDark;
    g.fillRect(-8, -39, 16, 1.4);
    g.fillStyle = "#e5b93c";
    g.beginPath();
    g.arc(3, -42, 1.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = capDark;
    g.beginPath();
    g.arc(0, -45.3, 1.1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawThumb(c, def) {
    const g = c.getContext("2d");
    const s = c.width / (def.width * T);
    g.fillStyle = "#120f1b";
    g.fillRect(0, 0, c.width, c.height);
    const cell = c.width / def.width;
    const oy = Math.max(0, (c.height - def.height * cell) / 2);
    g.save();
    g.translate(0, oy);
    def.map.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        let col = null;
        if (ch === "#") col = "#4a4060";
        else if (ch === "I") col = "#9fd8ff";
        else if (ch === "P") col = COLORS.pink[0];
        else if (ch === "G") col = COLORS.gold[0];
        else if (ch === "X") col = COLORS.green[0];
        else if (ch === "p") col = COLORS.pink[1];
        else if (ch === "g") col = COLORS.gold[1];
        else if (ch === "A" || ch === "a") col = "#ff8fc4";
        else if (ch === "B" || ch === "b") col = "#ffd36b";
        if (col) {
          g.fillStyle = col;
          g.fillRect(x * cell, y * cell, cell + 0.3, cell + 0.3);
        }
      });
    });
    for (const o of def.objects || []) {
      g.fillStyle = o.type === "box" ? "#8a5a32" : "#c9b8ff";
      if (o.type === "boss") {
        g.fillStyle = "#ff5f7a";
        g.beginPath();
        g.arc((o.x + 0.5) * cell, (o.y + 1) * cell, cell * 2.2, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      g.fillRect(o.x * cell, o.y * cell, (o.w || 1) * cell, (o.h || 1) * cell);
    }
    g.restore();
    if ((def.objects || []).some((o) => o.type === "boss")) {
      g.fillStyle = "#ff5f7a";
      g.font = "bold 12px Rubik, sans-serif";
      g.fillText("БОСС", 6, 16);
    }
    return s;
  }

  function drawAvatar(c) {
    const g = c.getContext("2d");
    const S = c.width;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    const bg = g.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0, "#ff5fa8");
    bg.addColorStop(0.5, "#7a3a8a");
    bg.addColorStop(1, "#f2b636");
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
    const glow = g.createRadialGradient(S / 2, S * 0.45, S * 0.1, S / 2, S / 2, S * 0.6);
    glow.addColorStop(0, "rgba(255,255,255,0.25)");
    glow.addColorStop(1, "rgba(30,10,40,0.35)");
    g.fillStyle = glow;
    g.fillRect(0, 0, S, S);
    const k = S / 128;
    const girl = new Hero("girl", { x: 0, y: 0 });
    const boy = new Hero("boy", { x: 0, y: 0 });
    girl.skin = SKINS.girl[0];
    boy.skin = SKINS.boy[0];
    for (const h of [girl, boy]) { h.onGround = true; h.walkT = 0; h.blink = 3; h.sink = 0; }
    g.scale(k * 2.5, k * 2.5);
    girl.facing = 1;
    boy.facing = -1;
    girl.x = 14 - girl.w / 2; girl.y = 62 - girl.h;
    boy.x = 37 - boy.w / 2; boy.y = 63 - boy.h;
    drawGirl(g, girl);
    drawBoy(g, boy);
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = Math.max(1, S / 64);
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - g.lineWidth / 2, 0, Math.PI * 2);
    g.stroke();
  }

  const skinView = {
    heroes: null,
    open() {
      if (!this.heroes) this.heroes = { girl: new Hero("girl", { x: 0, y: 0 }), boy: new Hero("boy", { x: 0, y: 0 }) };
      $("wallet").textContent = Shop.wallet();
      this.refresh();
      show("screen-skins");
    },
    refresh() {
      for (const k of ["girl", "boy"]) {
        $("skin-name-" + k).textContent = SKINS[k][skinSel[k]].name;
        const sw = $("skin-sw-" + k);
        sw.innerHTML = "";
        const sk0 = SKINS[k][skinSel[k]];
        const owned = Shop.owns(k, skinSel[k]);
        const buy = $("skin-buy-" + k);
        buy.classList.toggle("hidden", owned);
        buy.textContent = `Купить за ${Shop.price(skinSel[k])} ◆`;
        buy.disabled = Shop.wallet() < Shop.price(skinSel[k]);
        buy.onclick = () => { if (Shop.buy(k, skinSel[k])) this.refresh(); };
        $("skin-name-" + k).textContent = sk0.name + (owned ? "" : " · закрыт");
        SKINS[k].forEach((sk, i) => {
          const b = document.createElement("button");
          if (!Shop.owns(k, i)) b.classList.add("locked");
          b.style.background = `linear-gradient(135deg, ${k === "girl" ? sk.sweater : sk.top} 50%, ${k === "girl" ? sk.scarf : sk.cap} 50%)`;
          b.title = sk.name;
          b.setAttribute("aria-label", sk.name);
          if (i === skinSel[k]) b.classList.add("on");
          b.onclick = () => this.set(k, i);
          sw.appendChild(b);
        });
      }
    },
    set(k, i) {
      skinSel[k] = (i + SKINS[k].length) % SKINS[k].length;
      $("wallet").textContent = Shop.wallet();
      if (Shop.owns(k, skinSel[k])) Shop.equip(k, skinSel[k]);
      try { localStorage.setItem("duo:skins", JSON.stringify(Shop.equipped)); } catch {}
      Ach.unlock("fashion");
      this.refresh();
    },
    draw(dt) {
      if (!this.heroes) return;
      for (const k of ["girl", "boy"]) {
        this.heroes[k].skin = SKINS[k][skinSel[k]];
        const c = $("skin-canvas-" + k), g = c.getContext("2d");
        g.clearRect(0, 0, c.width, c.height);
        const grd = g.createLinearGradient(0, 0, 0, c.height);
        grd.addColorStop(0, "#241b36");
        grd.addColorStop(1, "#120f1b");
        g.fillStyle = grd;
        g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = "#3a3150";
        g.fillRect(0, 168, c.width, 32);
        g.fillStyle = "#6f5d93";
        g.fillRect(0, 168, c.width, 4);
        const h = this.heroes[k];
        h.blink -= dt;
        if (h.blink < -0.12) h.blink = rand(2, 5);
        g.save();
        g.scale(3, 3);
        h.x = 100 / 3 - h.w / 2;
        h.y = 168 / 3 - h.h;
        h.onGround = true;
        h.walkT = animT * 0.6;
        h.facing = Math.sin(animT * 0.7) > 0 ? 1 : -1;
        h.sink = 0;
        if (k === "girl") drawGirl(g, h); else drawBoy(g, h);
        g.restore();
      }
    },
  };

  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
  }

  function show(id) {
    for (const s of document.querySelectorAll(".screen")) s.classList.add("hidden");
    if (id) $(id).classList.remove("hidden");
  }

  function setHint(text) {
    const el = $("hint");
    if (!text) { el.classList.add("hidden"); return; }
    el.textContent = text;
    el.classList.remove("hidden");
    el.style.opacity = 1;
    clearTimeout(setHint.t);
    setHint.t = setTimeout(() => (el.style.opacity = 0), 7000);
  }

  function startLevel(index) {
    if (!LEVELS[index]) return;
    game = new Game(LEVELS[index], index);
    if (Net.role === "host") Net.onHostStart(index);
    state = "play";
    paused = false;
    show(null);
    $("modal-win").classList.add("hidden");
    $("modal-pause").classList.add("hidden");
    $("hud").classList.remove("hidden");
    $("hud-level").textContent = `Уровень ${index + 1}: ${LEVELS[index].name}`;
    $("hud-name").textContent = team ? team.name : "";
    setHint(LEVELS[index].hint);
  }

  function setWinLabels(a, b, c) {
    $("win-l1").textContent = a;
    $("win-l2").textContent = b;
    $("win-l3").textContent = c;
  }

  function startRace(i) {
    if (!RACES[i]) return;
    game = new Game(RACES[i], -1);
    game.raceIndex = i;
    state = "play";
    paused = false;
    show(null);
    $("modal-win").classList.add("hidden");
    $("modal-pause").classList.add("hidden");
    $("hud").classList.remove("hidden");
    $("hud-level").textContent = `Гонка ${i + 1}: ${RACES[i].name}`;
    $("hud-name").textContent = team ? team.name : "";
    setHint(RACES[i].hint);
  }

  async function openRaces() {
    await ensureTeam().catch(() => {});
    let st = { girlWins: 0, boyWins: 0, tracks: [] };
    try { st = await Api.raceStats(team); } catch {}
    $("race-score").innerHTML = `<span class="pink">Девочка <b>${st.girlWins}</b></span><span class="vs">:</span><span class="gold"><b>${st.boyWins}</b> Бородач</span>`;
    const grid = $("race-grid");
    grid.innerHTML = "";
    RACES.forEach((def, i) => {
      const t = st.tracks.find((x) => x.levelId === def.id);
      const btn = document.createElement("button");
      btn.className = "level-card race";
      const c = document.createElement("canvas");
      c.width = 200;
      c.height = 100;
      drawThumb(c, def);
      btn.appendChild(c);
      const title = document.createElement("div");
      title.className = "lc-title";
      title.textContent = `${i + 1}. ${def.name}`;
      btn.appendChild(title);
      const meta = document.createElement("div");
      meta.className = "lc-meta";
      meta.innerHTML = t
        ? `<span class="pink">♀ ${t.bestGirlMs ? fmt(t.bestGirlMs / 1000) : "—"}</span><span class="gold">♂ ${t.bestBoyMs ? fmt(t.bestBoyMs / 1000) : "—"}</span>`
        : `<span>ещё не ездили</span><span>${"●".repeat(i + 1)}</span>`;
      btn.appendChild(meta);
      btn.onclick = () => startRace(i);
      grid.appendChild(btn);
    });
    show("screen-races");
  }

  function openAchievements() {
    const grid = $("ach-grid");
    grid.innerHTML = "";
    let n = 0;
    for (const a of Ach.list) {
      const on = Ach.has(a.id);
      if (on) n++;
      const d = document.createElement("div");
      d.className = "ach" + (on ? " on" : "");
      d.innerHTML = `<i>${a.icon}</i><div><b>${a.title}</b><span>${a.desc}</span></div>`;
      grid.appendChild(d);
    }
    $("ach-count").textContent = `${n} из ${Ach.list.length}`;
    $("ach-bar").style.width = `${(n / Ach.list.length) * 100}%`;
    show("screen-achievements");
  }

  function achToast(a) {
    const el = $("ach-toast");
    el.innerHTML = `<i>${a.icon}</i><div><span>Достижение</span><b>${a.title}</b></div>`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  async function onRaceComplete(g) {
    const [gi, bo] = g.heroes;
    const winner = g.winner || (gi.finishT !== null ? "girl" : "boy");
    $("win-title").textContent = winner === "girl" ? "Победила девочка в платке!" : "Победил бородач!";
    $("win-stars").innerHTML = `<span class="on crown ${winner}">♛</span>`;
    setWinLabels("Девочка", "Бородач", "Разрыв");
    $("win-time").textContent = gi.finishT !== null ? fmt(gi.finishT) : "не дошла";
    $("win-gems").textContent = bo.finishT !== null ? fmt(bo.finishT) : "не дошёл";
    $("win-deaths").textContent = gi.finishT !== null && bo.finishT !== null ? `${Math.abs(gi.finishT - bo.finishT).toFixed(2)} с` : "—";
    $("win-next").disabled = g.raceIndex >= RACES.length - 1;
    const recs = (g.newRecord || []).map((k) => (k === "girl" ? "девочки" : "бородача"));
    $("win-note").textContent = `Падений: девочка ${gi.deaths}, бородач ${bo.deaths}` + (recs.length ? ` · новый рекорд трассы у ${recs.join(" и ")}, призрак сохранён` : "");
    setTimeout(() => { if (game === g) $("modal-win").classList.remove("hidden"); }, 900);
    Ach.afterRace(g);
    Ach.bump("raceGems", g.gemsCollected);
    try {
      await ensureTeam();
      await Api.submitRace({
        teamId: team.id,
        teamName: team.name,
        levelId: g.def.id,
        winner,
        girlMs: gi.finishT !== null ? Math.round(gi.finishT * 1000) : null,
        boyMs: bo.finishT !== null ? Math.round(bo.finishT * 1000) : null,
      });
    } catch {}
  }

  async function onLevelComplete(g) {
    if (Net.role === "host") Net.send("event", { type: "win", stars: g.stars(), time: g.time, gems: `${g.gemsCollected}/${g.gemsTotal}`, deaths: g.deaths, boss: !!g.world.boss });
    if (g.def.custom) {
      setWinLabels("Время", "Кристаллы", "Смерти");
      $("win-title").textContent = "Свой уровень пройден!";
      $("win-stars").innerHTML = "";
      $("win-time").textContent = fmt(g.time);
      $("win-gems").textContent = `${g.gemsCollected}/${g.gemsTotal}`;
      $("win-deaths").textContent = g.deaths;
      $("win-note").textContent = g.fromEditor ? "Нажми «Дальше», чтобы вернуться в редактор" : "";
      $("win-next").disabled = !g.fromEditor;
      setTimeout(() => { if (game === g) $("modal-win").classList.remove("hidden"); }, 700);
      return;
    }
    const stars = g.stars();
    setWinLabels("Время", "Кристаллы", "Смерти");
    Ach.afterLevel(g, stars);
    $("win-title").textContent = g.index === LEVELS.length - 1 ? "Храм пройден!" : g.world.boss ? "Босс повержен!" : "Уровень пройден!";
    $("win-stars").innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? "on" : ""}">★</span>`).join("");
    $("win-time").textContent = fmt(g.time);
    $("win-gems").textContent = `${g.gemsCollected}/${g.gemsTotal}`;
    $("win-deaths").textContent = g.deaths;
    $("win-next").disabled = g.index >= LEVELS.length - 1;
    $("win-note").textContent = "Сохраняю результат…";
    setTimeout(() => { if (game === g) $("modal-win").classList.remove("hidden"); }, 700);
    try {
      const res = await Api.submit({
        teamId: team.id,
        teamName: team.name,
        levelId: g.def.id,
        timeMs: Math.round(g.time * 1000),
        gems: g.gemsCollected,
        gemsTotal: g.gemsTotal,
        deaths: g.deaths,
        stars,
      });
      $("win-note").textContent = res.rank ? `Место в таблице уровня: ${res.rank}${res.personalBest ? " · личный рекорд!" : ""}` : "Результат сохранён";
      await refreshProgress();
      Ach.afterProgress();
    } catch (e) {
      $("win-note").textContent = "Не удалось сохранить результат";
    }
  }

  async function refreshProgress() {
    if (!team) return;
    try {
      const list = await Api.progress(team);
      progress = {};
      for (const p of list) progress[p.levelId] = p;
    } catch {}
  }

  function unlockedCount() {
    let n = 1;
    for (let i = 0; i < LEVELS.length; i++) {
      if (progress[LEVELS[i].id]) n = i + 2;
      else break;
    }
    return Math.min(n, LEVELS.length);
  }

  async function ensureTeam() {
    if (Profile.user) return team;
    const name = ($("team-input").value || "").trim() || "Команда без имени";
    if (team && team.name === name) return team;
    Api.saveLocal("team", name);
    team = await Api.team(name);
    await refreshProgress();
    return team;
  }

  async function openLevels() {
    await ensureTeam();
    const grid = $("level-grid");
    grid.innerHTML = "";
    const open = unlockedCount();
    LEVELS.forEach((def, i) => {
      const btn = document.createElement("button");
      btn.className = "level-card" + (def.width > 32 ? " boss" : "");
      btn.disabled = i >= open;
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 100;
      drawThumb(c, def);
      const pr = progress[def.id];
      btn.innerHTML = `<div class="lc-title">${i + 1}. ${def.name}</div>`;
      btn.prepend(c);
      const meta = document.createElement("div");
      meta.className = "lc-meta";
      meta.innerHTML = `<span>${pr ? fmt(pr.bestTimeMs / 1000) : i >= open ? "🔒 закрыт" : "не пройден"}</span><span class="lc-stars">${pr ? "★".repeat(pr.bestStars) + "☆".repeat(3 - pr.bestStars) : ""}</span>`;
      btn.appendChild(meta);
      btn.onclick = () => startLevel(i);
      grid.appendChild(btn);
    });
    show("screen-levels");
  }

  async function openRecords(levelIndex = 0) {
    show("screen-records");
    const tabs = $("record-tabs");
    tabs.innerHTML = "";
    LEVELS.forEach((def, i) => {
      const b = document.createElement("button");
      b.textContent = LEVELS.length > 8 ? String(i + 1) : `${i + 1}. ${def.name}`;
      b.title = def.name;
      if (i === levelIndex) b.classList.add("active");
      b.onclick = () => openRecords(i);
      tabs.appendChild(b);
    });
    const body = $("records-body");
    $("records-level").textContent = `${levelIndex + 1}. ${LEVELS[levelIndex].name}`;
    body.innerHTML = `<tr><td colspan="6" class="empty">Загрузка…</td></tr>`;
    try {
      const rows = await Api.leaderboard(LEVELS[levelIndex].id);
      body.innerHTML = rows.length
        ? rows.map((r, i) => `<tr class="${team && r.teamName === team.name ? "me" : ""}"><td>${i + 1}</td><td>${escapeHtml(r.teamName)}</td><td>${fmt(r.timeMs / 1000)}</td><td>${r.gems}/${r.gemsTotal}</td><td>${r.deaths}</td><td style="color:var(--gold)">${"★".repeat(r.stars)}</td></tr>`).join("")
        : `<tr><td colspan="6" class="empty">Пока никто не прошёл этот уровень</td></tr>`;
    } catch {
      body.innerHTML = `<tr><td colspan="6" class="empty">Нет связи с сервером</td></tr>`;
    }
    try {
      const s = await Api.stats();
      const items = [
        ["Команд", s.teams],
        ["Прохождений", s.runs],
        ["Всего смертей", s.deaths],
        ["Собрано кристаллов", s.gems],
      ];
      if (s.hardestLevel) items.push(["Самый смертельный", s.hardestLevel]);
      $("global-stats").innerHTML = items.map(([k, v]) => `<div><span>${k}</span><b>${v ?? 0}</b></div>`).join("");
    } catch {
      $("global-stats").innerHTML = "";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function togglePause(force) {
    if (state !== "play" || !game || game.finished) return;
    paused = force !== undefined ? force : !paused;
    $("modal-pause").classList.toggle("hidden", !paused);
  }

  function toMenu() {
    if (Net.role === "host" && game) Net.send("event", { type: "menu" });
    state = "menu";
    game = null;
    paused = false;
    $("hud").classList.add("hidden");
    $("boss-bar").classList.add("hidden");
    $("modal-win").classList.add("hidden");
    $("modal-pause").classList.add("hidden");
    setHint("");
    show("screen-menu");
  }

  function setSoundLabel() {
    $("pause-sound").textContent = `Звук: ${Sound.on ? "вкл" : "выкл"}`;
  }

  const menuPreview = {
    girl: null,
    boy: null,
    init() {
      this.canvas = $("menu-preview");
      this.g = this.canvas.getContext("2d");
      this.girl = new Hero("girl", { x: 0, y: 0 });
      this.boy = new Hero("boy", { x: 0, y: 0 });
    },
    draw(dt) {
      const g = this.g;
      const W = this.canvas.width, H = this.canvas.height;
      g.clearRect(0, 0, W, H);
      g.save();
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, "#221a33");
      grd.addColorStop(1, "#130f1d");
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.scale(2.2, 2.2);
      const floorY = 78;
      for (let x = 0; x < W / 2.2; x += 15) {
        g.fillStyle = x > 40 && x < 70 ? COLORS.pink[0] : x > 100 && x < 130 ? COLORS.gold[0] : "#4a4060";
        g.fillRect(x, floorY + 3 + (x > 40 && x < 70 || x > 100 && x < 130 ? Math.sin(animT * 3 + x) : 0), 15, 20);
      }
      for (const [h, x, f] of [[this.girl, 50, 1], [this.boy, 108, -1]]) {
        h.blink -= dt;
        if (h.blink < -0.12) h.blink = rand(2, 5);
        h.x = x;
        h.y = floorY - PH + 3;
        h.onGround = true;
        h.walkT = animT * 0.5;
        h.facing = Math.sin(animT * 0.5 + (f > 0 ? 0 : 2)) > 0 ? 1 : -1;
        h.sink = 4;
        if (h.kind === "girl") drawGirl(g, h); else drawBoy(g, h);
      }
      g.restore();
    },
  };

  function frame(ts) {
    Pads.poll();
    const dt = Math.min(0.033, (ts - lastTime) / 1000 || 0);
    lastTime = ts;
    animT += dt;
    Story.tick(dt);
    if (state === "editor") {
      Editor.draw();
      pressed.clear();
      requestAnimationFrame(frame);
      return;
    }
    if (state === "play" && game) {
      if (pressed.has("Escape") || pressed.has("KeyP") || pressed.has("Pad0P") || pressed.has("Pad1P")) togglePause();
      if (pressed.has("KeyM")) { Sound.on = !Sound.on; if (Sound.master) Sound.master.gain.value = Sound.on ? Settings.volume : 0; setSoundLabel(); }
      if (Net.role === "guest") Net.guestFrame(dt);
      else if (!paused && !Story.lines) {
        if (pressed.has("KeyR") && !game.finished) { if (game.race) startRace(game.raceIndex); else game.restart(false); }
        const steps = 2;
        for (let i = 0; i < steps; i++) {
          game.update(dt / steps);
          if (i === 0) pressed.clear();
        }
      }
      if (Net.role === "host") Net.hostFrame(dt);
      game.draw(ctx);
      $("hud-time").textContent = fmt(game.time);
      $("hud-pink").textContent = `${game.collected.girl}/${game.world.gemTotal.girl}`;
      $("hud-gold").textContent = `${game.collected.boy}/${game.world.gemTotal.boy}`;
      $("hud-deaths").textContent = game.deaths;
      const boss = game.world.boss;
      const bar = $("boss-bar");
      if (boss && boss.awake && !(boss.dead && boss.deathT > 2)) {
        bar.classList.remove("hidden");
        $("boss-name").textContent = boss.name;
        $("boss-hp").innerHTML = Array.from({ length: boss.maxHp }, (_, i) => `<i class="${i < boss.hp ? "on" : ""}"></i>`).join("");
      } else bar.classList.add("hidden");
    } else {
      if (LEVELS[0]) {
        if (!frame.bg || frame.bgDef !== LEVELS[0]) {
          frame.bg = new World(LEVELS[0]);
          frame.bgDef = LEVELS[0];
        }
        ctx.drawImage(frame.bg.bgLayer, 0, 0);
        ctx.drawImage(frame.bg.staticLayer, 0, 0);
        drawLiquids(ctx, frame.bg);
        for (const gem of frame.bg.gems) drawGem(ctx, gem);
      } else {
        ctx.fillStyle = "#120f1b";
        ctx.fillRect(0, 0, VW, VH);
      }
      if (!$("screen-menu").classList.contains("hidden")) menuPreview.draw(dt);
      if (!$("screen-skins").classList.contains("hidden")) skinView.draw(dt);
    }
    pressed.clear();
    requestAnimationFrame(frame);
  }


  const Shop = {
    equipped: { ...skinSel },
    price(i) { return [0, 10, 15, 20, 30, 40][i] ?? 50; },
    owned() { return Api.local("owned", { girl: [0], boy: [0] }); },
    owns(k, i) { return i === 0 || this.owned()[k].includes(i); },
    spent() { return Api.local("spent", 0); },
    earned() { return Object.values(progress).reduce((s, p) => s + (p.bestGems || 0), 0) + (Ach.stats.raceGems || 0); },
    wallet() { return Math.max(0, this.earned() - this.spent()); },
    buy(k, i) {
      if (this.owns(k, i) || this.wallet() < this.price(i)) return false;
      const o = this.owned();
      o[k].push(i);
      Api.saveLocal("owned", o);
      Api.saveLocal("spent", this.spent() + this.price(i));
      this.equip(k, i);
      Sound.win();
      Ach.unlock("shopper");
      $("wallet").textContent = this.wallet();
      return true;
    },
    equip(k, i) {
      this.equipped[k] = i;
      try { localStorage.setItem("duo:skins", JSON.stringify(this.equipped)); } catch {}
    },
    syncSelection() {
      skinSel.girl = this.equipped.girl;
      skinSel.boy = this.equipped.boy;
    },
  };

  const STORY = {
    "before:1": [
      ["title", "Глава 1. Храм двоих"],
      ["boy", "Ну и где мы? Я же говорил: у старого дуба надо было налево."],
      ["girl", "Это древний храм. Говорят, в самом его сердце спрятан Кристалл Двух."],
      ["boy", "И что он делает?"],
      ["girl", "Открывается только тем, кто дойдёт вместе. Помни: розовая жижа — моя, золотая — твоя."],
      ["boy", "А зелёная?"],
      ["girl", "Зелёная — ничья. Не наступай."],
    ],
    "after:5": [
      ["boss", "Двое… прошли… Но глубже спят те, кто сильнее…"],
      ["boy", "Он рассыпался! Это мы его так?"],
      ["girl", "Вместе. Одному его было не пробить."],
    ],
    "after:10": [
      ["girl", "Жарко… У тебя борода не подпалилась?"],
      ["boy", "Борода в порядке. Кепку жалко."],
    ],
    "after:15": [
      ["boy", "Шары катятся, змей шипит… Может, домой?"],
      ["girl", "Мы на полпути. Не сдаёмся."],
    ],
    "after:20": [
      ["girl", "Холоднее только в общежитии зимой."],
      ["boy", "Там хотя бы чайник есть."],
    ],
    "after:25": [
      ["boss", "Корону… не отдам…"],
      ["girl", "Нам не нужна корона. Нам нужен Кристалл."],
    ],
    "after:30": [
      ["boss", "Кристалл Двух… ваш. Но храм глубже, чем вы думаете…"],
      ["boy", "Я так и знал. Там ещё подвал."],
      ["girl", "Тогда идём вниз."],
    ],
    "before:31": [
      ["title", "Глава 2. Подземье"],
      ["girl", "Здесь лёд и темнота. И порталы — заходишь в один, выходишь из другого."],
      ["boy", "И ветер. Держи платок крепче."],
      ["girl", "А ты держи кепку."],
    ],
    "after:35": [
      ["boss", "Двое, что держатся вместе… сильнее любой бури."],
      ["girl", "Мы дошли."],
      ["boy", "Теперь можно и поесть?"],
      ["girl", "Теперь можно."],
      ["title", "Конец второй главы. Спасибо, что играли вдвоём!"],
    ],
  };

  function STORY_REPLAY(key, done) {
    Story.lines = STORY[key];
    Story.i = 0;
    Story.done = done;
    $("story").classList.remove("hidden");
    Story.render();
  }

  const Story = {
    lines: null,
    i: 0,
    shown: 0,
    done: null,
    seen() { return Api.local("story", {}); },
    has(key) { return !!STORY[key] && !this.seen()[key]; },
    play(key, done) {
      if (!STORY[key] || BOT || Net.role) return done && done();
      const seen = this.seen();
      seen[key] = true;
      Api.saveLocal("story", seen);
      this.lines = STORY[key];
      this.i = 0;
      this.done = done;
      $("story").classList.remove("hidden");
      this.render();
    },
    render() {
      const [who, text] = this.lines[this.i];
      const el = $("story");
      el.dataset.who = who;
      $("story-name").textContent = who === "girl" ? "Девочка" : who === "boy" ? "Бородач" : who === "boss" ? "Голос из темноты" : "";
      this.full = text;
      this.shown = 0;
      $("story-text").textContent = "";
      this.drawPortrait(who);
    },
    tick(dt) {
      if (!this.lines) return;
      if (this.shown < this.full.length) {
        this.shown = Math.min(this.full.length, this.shown + dt * 45);
        $("story-text").textContent = this.full.slice(0, Math.floor(this.shown));
      }
      const who = this.lines[this.i][0];
      if (who === "girl" || who === "boy") this.drawPortrait(who);
    },
    next() {
      if (!this.lines) return;
      if (this.shown < this.full.length) { this.shown = this.full.length; $("story-text").textContent = this.full; return; }
      this.i++;
      if (this.i >= this.lines.length) return this.close();
      Sound.button();
      this.render();
    },
    close() {
      this.lines = null;
      $("story").classList.add("hidden");
      const d = this.done;
      this.done = null;
      if (d) d();
    },
    drawPortrait(who) {
      const c = $("story-face");
      const g = c.getContext("2d");
      g.clearRect(0, 0, c.width, c.height);
      if (who === "title") return;
      g.save();
      g.beginPath();
      g.arc(c.width / 2, c.height / 2, c.width / 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = who === "girl" ? "#3a1f33" : who === "boy" ? "#3a3020" : "#20182e";
      g.fillRect(0, 0, c.width, c.height);
      if (who === "boss") {
        const b = new Boss({ x: 0, y: 0, arena: [0, 1], plates: [[0, 0, 0, 0]], style: 0 });
        b.x = c.width / 2;
        b.y = 30;
        g.translate(0, 0);
        g.scale(1, 1);
        drawBoss(g, b);
      } else {
        const h = this.face || (this.face = { girl: new Hero("girl", { x: 0, y: 0 }), boy: new Hero("boy", { x: 0, y: 0 }) });
        const hero = h[who];
        hero.skin = SKINS[who][skinSel[who]];
        hero.onGround = true;
        hero.walkT = 0;
        hero.facing = who === "girl" ? 1 : -1;
        hero.blink = Math.sin(animT * 1.3) > -0.97 ? 1 : -0.05;
        g.scale(4.2, 4.2);
        hero.x = c.width / 8.4 - hero.w / 2;
        hero.y = c.height / 4.2 + 12 - hero.h;
        if (who === "girl") drawGirl(g, hero); else drawBoy(g, hero);
      }
      g.restore();
    },
  };

  const EDITOR_TOOLS = [
    ["#", "Стена"], ["I", "Лёд"], ["P", "Розовая"], ["G", "Золотая"], ["X", "Яд"],
    ["p", "◆ розовый"], ["g", "◆ золотой"], ["a", "Старт ♀"], ["b", "Старт ♂"], ["A", "Дверь ♀"], ["B", "Дверь ♂"],
    ["box", "Ящик"], ["fan", "Ветер"], ["portal", "Портал"], ["lever", "Рычаг"], [".", "Ластик"],
  ];

  const Editor = {
    def: null,
    tool: "#",
    undo: [],
    pending: null,
    game: null,
    hover: null,
    painting: false,
    name: "Мой уровень",
    blank() {
      const W = 32, H = 20;
      const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? "#" : ".")));
      g[18][2] = "a"; g[18][4] = "b"; g[18][26] = "A"; g[18][28] = "B";
      for (let x = 8; x < 20; x++) g[13][x] = "#";
      g[12][12] = "p"; g[12][15] = "g";
      return { width: W, height: H, map: g.map((r) => r.join("")), objects: [] };
    },
    open(def, name) {
      this.def = def ? JSON.parse(JSON.stringify(def)) : (Api.local("editorDraft", null) || this.blank());
      if (name) this.name = name;
      $("ed-name").value = this.name;
      this.undo = [];
      this.pending = null;
      state = "editor";
      game = null;
      $("hud").classList.add("hidden");
      $("modal-win").classList.add("hidden");
      $("modal-pause").classList.add("hidden");
      setHint("");
      show(null);
      $("editor").classList.remove("hidden");
      this.buildTools();
      this.rebuild();
      this.msg("Рисуй мышкой. Правая кнопка — стереть. Ctrl+Z — отменить.");
    },
    close() {
      $("editor").classList.add("hidden");
      $("ed-list").classList.add("hidden");
      toMenu();
    },
    buildTools() {
      const box = $("ed-tools");
      box.innerHTML = "";
      for (const [id, label] of EDITOR_TOOLS) {
        const b = document.createElement("button");
        b.className = "ed-tool" + (id === this.tool ? " on" : "");
        b.innerHTML = `<i class="sw sw-${id === "." ? "erase" : id === "#" ? "wall" : id}"></i><span>${label}</span>`;
        b.onclick = () => { this.tool = id; this.pending = null; this.buildTools(); };
        box.appendChild(b);
      }
    },
    msg(t, bad) {
      const el = $("ed-msg");
      el.textContent = t;
      el.classList.toggle("bad", !!bad);
    },
    snapshot() {
      this.undo.push(JSON.stringify(this.def));
      if (this.undo.length > 60) this.undo.shift();
    },
    rebuild() {
      try {
        const d = { ...this.def, id: 9999, name: this.name, hint: "", par: 60 };
        const has = (c) => d.map.some((r) => r.includes(c));
        if (!has("a") || !has("b")) { this.game = null; return; }
        this.game = new Game(d, -1);
      } catch (e) {
        this.game = null;
      }
      Api.saveLocal("editorDraft", this.def);
    },
    view: { s: 0.8, ox: 96, oy: 56 },
    tileAt(ev) {
      const r = canvas.getBoundingClientRect();
      const cx = ((ev.clientX - r.left) / r.width) * VW;
      const cy = ((ev.clientY - r.top) / r.height) * VH;
      const v = this.view;
      return { x: Math.floor((cx - v.ox) / v.s / T), y: Math.floor((cy - v.oy) / v.s / T) };
    },
    setTile(x, y, ch) {
      if (x <= 0 || x >= this.def.width - 1 || y <= 0 || y >= this.def.height) return;
      if (y === this.def.height - 1 && !"PGXI#".includes(ch)) return;
      const rows = this.def.map.map((r) => r.split(""));
      if ("abAB".includes(ch)) for (const row of rows) for (let i = 0; i < row.length; i++) if (row[i] === ch) row[i] = ".";
      rows[y][x] = ch;
      this.def.map = rows.map((r) => r.join(""));
    },
    removeObjectsAt(x, y) {
      const objs = this.def.objects;
      const gone = new Set();
      for (const o of objs) {
        const w = o.w || 1, h = o.h || (o.type === "portal" ? 2 : 1);
        if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) gone.add(o.id);
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (const o of objs) {
          if (gone.has(o.id)) continue;
          const lost = (o.trigger || []).some((t) => gone.has(t)) || (o.to && gone.has(o.to)) ||
            (o.type === "portal" && !o.to && objs.some((q) => q.to === o.id && gone.has(q.id))) ||
            (o.type === "lever" && objs.some((q) => (q.trigger || []).includes(o.id) && gone.has(q.id)));
          if (lost) { gone.add(o.id); changed = true; }
        }
      }
      this.def.objects = objs.filter((o) => !gone.has(o.id));
      return gone.size > 0;
    },
    uid(p) { return p + Math.random().toString(36).slice(2, 7); },
    apply(t, erase) {
      const { x, y } = t;
      if (x <= 0 || x >= this.def.width - 1 || y <= 0 || y >= this.def.height) return;
      const tool = erase ? "." : this.tool;
      if (tool === ".") {
        this.removeObjectsAt(x, y);
        this.setTile(x, y, y === this.def.height - 1 ? "#" : ".");
      } else if (tool.length === 1) {
        this.setTile(x, y, tool);
      } else if (tool === "box") {
        this.removeObjectsAt(x, y);
        this.def.objects.push({ type: "box", id: this.uid("bx"), x, y });
      } else if (tool === "fan") {
        const top = Math.max(1, y - 5);
        this.def.objects.push({ type: "fan", id: this.uid("fn"), x, y: top, w: 1, h: y - top + 1 });
      } else if (tool === "portal") {
        const py = Math.max(1, y - 1);
        if (!this.pending || this.pending.type !== "portal") {
          const id = this.uid("pa");
          this.def.objects.push({ type: "portal", id, x, y: py, hue: 190 });
          this.pending = { type: "portal", id };
          this.msg("Теперь кликни, куда портал выводит.");
        } else {
          const id = this.uid("pb");
          this.def.objects.push({ type: "portal", id, x, y: py, hue: 290 });
          const a = this.def.objects.find((o) => o.id === this.pending.id);
          if (a) a.to = id;
          this.pending = null;
          this.msg("Портал готов: голубой ведёт в фиолетовый.");
        }
      } else if (tool === "lever") {
        if (!this.pending || this.pending.type !== "lever") {
          const id = this.uid("lv");
          this.def.objects.push({ type: "lever", id, x, y });
          this.pending = { type: "lever", id };
          this.msg("Теперь кликни, где будут ворота (они растут вверх на 4 клетки).");
        } else {
          const top = Math.max(1, y - 3);
          this.def.objects.push({ type: "gate", id: this.uid("gt"), x, y: top, w: 1, h: y - top + 1, trigger: [this.pending.id] });
          this.pending = null;
          this.msg("Рычаг связан с воротами.");
        }
      }
      this.rebuild();
    },
    validate() {
      const all = this.def.map.join("");
      const count = (c) => all.split(c).length - 1;
      const need = [["a", "старт девочки"], ["b", "старт бородача"], ["A", "дверь девочки"], ["B", "дверь бородача"]];
      for (const [c, n] of need) if (count(c) !== 1) return `Нужен ровно один «${n}»`;
      if (this.pending) return "Закончи последний портал или рычаг";
      return null;
    },
    level() {
      return { width: this.def.width, height: this.def.height, map: this.def.map, objects: this.def.objects };
    },
    test() {
      const err = this.validate();
      if (err) return this.msg(err, true);
      $("editor").classList.add("hidden");
      startCustom({ ...this.level(), id: 9999, name: this.name, hint: "Тест твоего уровня. Esc — пауза, там можно вернуться в редактор.", par: 60, custom: true }, true);
    },
    async save() {
      const err = this.validate();
      if (err) return this.msg(err, true);
      this.name = ($("ed-name").value || "").trim() || "Мой уровень";
      try {
        await ensureTeam().catch(() => {});
        const res = await Api.saveCustom({ name: this.name, author: team ? team.name : "Аноним", level: this.level() });
        this.msg(`Сохранено! Код уровня: ${res.code} — отправь его другу.`);
        Ach.unlock("builder");
      } catch (e) {
        this.msg("Не получилось сохранить: " + (e.message || "ошибка"), true);
      }
    },
    async loadCode(code) {
      try {
        const lv = await Api.getCustom(code.toUpperCase());
        this.open(lv.level, lv.name);
        this.msg(`Загружен «${lv.name}» от ${lv.author}`);
      } catch {
        this.msg("Уровень с таким кодом не найден", true);
      }
    },
    async list() {
      const box = $("ed-list");
      box.classList.remove("hidden");
      const body = $("ed-list-body");
      body.innerHTML = "<p class='muted'>Загрузка…</p>";
      try {
        const rows = await Api.listCustom();
        body.innerHTML = rows.length ? "" : "<p class='muted'>Пока никто не сохранил уровней. Будь первым!</p>";
        for (const r of rows) {
          const d = document.createElement("div");
          d.className = "ed-row";
          d.innerHTML = `<div><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.author)} · код ${r.code} · сыграно ${r.plays}</span></div>`;
          const play = document.createElement("button");
          play.className = "btn small primary";
          play.textContent = "Играть";
          play.onclick = async () => {
            const lv = await Api.getCustom(r.code);
            Api.playCustom(r.code).catch(() => {});
            box.classList.add("hidden");
            $("editor").classList.add("hidden");
            startCustom({ ...lv.level, id: 9999, name: lv.name, hint: `Уровень от ${lv.author}`, par: 60, custom: true }, false);
          };
          const edit = document.createElement("button");
          edit.className = "btn small";
          edit.textContent = "Открыть";
          edit.onclick = () => { box.classList.add("hidden"); this.loadCode(r.code); };
          d.append(play, edit);
          body.appendChild(d);
        }
      } catch {
        body.innerHTML = "<p class='muted'>Список недоступен</p>";
      }
    },
    draw() {
      const v = this.view;
      ctx.fillStyle = "#0b0912";
      ctx.fillRect(0, 0, VW, VH);
      ctx.save();
      ctx.translate(v.ox, v.oy);
      ctx.scale(v.s, v.s);
      ctx.beginPath();
      ctx.rect(0, 0, VW, VH);
      ctx.clip();
      if (this.game) this.game.drawView(ctx, 0);
      else {
        ctx.fillStyle = "#120f1b";
        ctx.fillRect(0, 0, VW, VH);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= VW; x += T) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, VH); ctx.stroke(); }
      for (let y = 0; y <= VH; y += T) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(VW, y + 0.5); ctx.stroke(); }
      for (const o of this.def.objects) {
        if (o.type === "fan" || o.type === "gate") {
          ctx.strokeStyle = o.type === "fan" ? "rgba(160,220,255,0.6)" : "rgba(200,180,255,0.6)";
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(o.x * T + 2, o.y * T + 2, (o.w || 1) * T - 4, (o.h || 1) * T - 4);
          ctx.setLineDash([]);
        }
      }
      if (this.hover) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(this.hover.x * T + 1, this.hover.y * T + 1, T - 2, T - 2);
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.strokeRect(v.ox - 0.5, v.oy - 0.5, VW * v.s + 1, VH * v.s + 1);
    },
  };

  function startCustom(def, fromEditor) {
    game = new Game(def, -1);
    game.fromEditor = fromEditor;
    state = "play";
    paused = false;
    show(null);
    $("modal-win").classList.add("hidden");
    $("modal-pause").classList.add("hidden");
    $("hud").classList.remove("hidden");
    $("hud-level").textContent = `Свой уровень: ${def.name}`;
    $("hud-name").textContent = team ? team.name : "";
    setHint(def.hint);
  }

  function setupEditor() {
    let lastKey = "";
    canvas.addEventListener("contextmenu", (e) => { if (state === "editor") e.preventDefault(); });
    canvas.addEventListener("pointerdown", (e) => {
      if (state !== "editor") return;
      Editor.snapshot();
      Editor.painting = e.button === 2 ? "erase" : "paint";
      const t = Editor.tileAt(e);
      lastKey = t.x + ":" + t.y;
      Editor.apply(t, Editor.painting === "erase");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (state !== "editor") return;
      const t = Editor.tileAt(e);
      Editor.hover = t;
      const key = t.x + ":" + t.y;
      if (Editor.painting && key !== lastKey && (Editor.tool.length === 1 || Editor.painting === "erase")) {
        lastKey = key;
        Editor.apply(t, Editor.painting === "erase");
      }
    });
    window.addEventListener("pointerup", () => { Editor.painting = false; });
    canvas.addEventListener("pointerleave", () => { Editor.hover = null; });
    window.addEventListener("keydown", (e) => {
      if (state !== "editor" || document.activeElement.tagName === "INPUT") return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        const prev = Editor.undo.pop();
        if (prev) { Editor.def = JSON.parse(prev); Editor.pending = null; Editor.rebuild(); }
        e.preventDefault();
      }
    });
    $("ed-test").onclick = () => Editor.test();
    $("ed-save").onclick = () => Editor.save();
    $("ed-load").onclick = () => {
      $("ed-code-row").classList.toggle("hidden");
      $("ed-code").focus();
    };
    $("ed-code-go").onclick = () => { Editor.loadCode($("ed-code").value.trim()); $("ed-code-row").classList.add("hidden"); };
    $("ed-code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("ed-code-go").click(); });
    $("ed-browse").onclick = () => Editor.list();
    $("ed-list-close").onclick = () => $("ed-list").classList.add("hidden");
    $("ed-clear").onclick = () => { Editor.snapshot(); Editor.def = Editor.blank(); Editor.pending = null; Editor.rebuild(); };
    $("ed-exit").onclick = () => Editor.close();
    $("ed-name").oninput = (e) => { Editor.name = e.target.value; };
    $("btn-editor").onclick = () => Editor.open();
  }


  const Profile = {
    user: null,
    stats: null,
    async restore() {
      const t = Api.local("token", null);
      if (!t || !Api.online) return;
      Api.token = t;
      try {
        const me = await Api.req("GET", "/api/auth/me");
        this.apply(me.user, me.stats);
      } catch {
        Api.token = null;
        Api.saveLocal("token", null);
      }
    },
    apply(user, stats) {
      this.user = user;
      this.stats = stats || null;
      team = { id: user.teamId, name: user.username };
      $("team-input").value = user.username;
      $("team-input").disabled = true;
      $("btn-profile").textContent = "Профиль: " + user.username;
      refreshProgress();
    },
    async auth(kind) {
      const username = $("pf-user").value.trim();
      const password = $("pf-pass").value;
      $("pf-err").textContent = "";
      try {
        const res = await Api.req("POST", `/api/auth/${kind}`, { username, password });
        Api.token = res.token;
        Api.saveLocal("token", res.token);
        const me = await Api.req("GET", "/api/auth/me");
        this.apply(me.user, me.stats);
        this.render();
      } catch (e) {
        $("pf-err").textContent = e.message || "Ошибка";
      }
    },
    logout() {
      this.user = null;
      Api.token = null;
      Api.saveLocal("token", null);
      team = null;
      $("team-input").disabled = false;
      $("btn-profile").textContent = "Профиль";
      this.render();
    },
    async open() {
      if (this.user) {
        try { const me = await Api.req("GET", "/api/auth/me"); this.stats = me.stats; } catch {}
      }
      this.render();
      show("screen-profile");
    },
    render() {
      $("pf-offline").classList.toggle("hidden", Api.online);
      $("pf-form").classList.toggle("hidden", !Api.online || !!this.user);
      $("pf-card").classList.toggle("hidden", !this.user);
      if (!this.user) return;
      $("pf-name").textContent = this.user.username;
      const s = this.stats || {};
      const items = [
        ["Уровней пройдено", s.levels], ["Звёзд", s.stars], ["Лучшие кристаллы", s.gems], ["Смертей", s.deaths],
        ["Время в игре", fmt((s.totalTimeMs || 0) / 1000)], ["Гонок", s.races], ["Побед девочки", s.girlWins], ["Побед бородача", s.boyWins],
        ["Своих уровней", s.customLevels], ["Достижений", `${Ach.list.filter((a) => Ach.has(a.id)).length}/${Ach.list.length}`],
      ];
      $("pf-stats").innerHTML = items.map(([k, v]) => `<div><span>${k}</span><b>${v ?? 0}</b></div>`).join("");
    },
  };

  const Net = {
    ws: null,
    role: null,
    code: null,
    peer: false,
    sendT: 0,
    inputT: 0,
    lastInput: "",
    remote: { L: false, R: false, J: false, S: false },
    latest: null,
    status(t, bad) {
      const el = $("net-status");
      el.textContent = t;
      el.classList.toggle("bad", !!bad);
    },
    connect() {
      return new Promise((resolve, reject) => {
        if (this.ws && this.ws.readyState === 1) return resolve();
        const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
        ws.onopen = () => { this.ws = ws; resolve(); };
        ws.onerror = () => reject(new Error("Нет связи с сервером"));
        ws.onclose = () => {
          if (this.ws === ws) {
            this.ws = null;
            if (this.role) { toast("Связь потеряна"); this.reset(); }
          }
        };
        ws.onmessage = (m) => {
          let msg;
          try { msg = JSON.parse(m.data); } catch { return; }
          this.onMessage(msg.event, msg.data);
        };
      });
    },
    send(event, data) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ event, data }));
    },
    reset() {
      this.role = null;
      this.peer = false;
      this.code = null;
      this.latest = null;
      for (const k of ["NetL", "NetR", "NetJ", "NetS"]) keys.delete(k);
      $("net-host-box").classList.add("hidden");
      $("net-code-big").textContent = "";
    },
    async open() {
      show("screen-net");
      $("net-offline").classList.toggle("hidden", Api.online);
      $("net-main").classList.toggle("hidden", !Api.online);
      if (!Api.online) return;
      try {
        const lan = await Api.req("GET", "/api/app/lan");
        $("net-addr").textContent = lan.addresses.length ? lan.addresses.join("  или  ") : "адрес не найден — проверь, что ноутбук подключён к Wi-Fi";
      } catch {}
      const sel = $("net-level");
      sel.innerHTML = "";
      LEVELS.forEach((d, i) => {
        if (i < unlockedCount()) {
          const o = document.createElement("option");
          o.value = i;
          o.textContent = `${i + 1}. ${d.name}`;
          sel.appendChild(o);
        }
      });
    },
    async host() {
      try {
        await this.connect();
        this.send("host", {});
        this.status("Создаю комнату…");
      } catch (e) { this.status(e.message, true); }
    },
    async join() {
      const code = $("net-code").value.trim();
      if (!/^\d{4}$/.test(code)) return this.status("Код — 4 цифры", true);
      try {
        await this.connect();
        this.send("join", { code });
        this.status("Подключаюсь…");
      } catch (e) { this.status(e.message, true); }
    },
    onMessage(event, data) {
      if (event === "room") {
        this.role = data.role;
        this.code = data.code;
        if (data.role === "host") {
          $("net-host-box").classList.remove("hidden");
          $("net-code-big").textContent = data.code;
          this.status("Комната создана. Ждём второго игрока…");
          $("net-start").disabled = true;
        } else {
          this.status(`Ты в комнате ${data.code}. Ты играешь за бородача. Ждём, пока друг выберет уровень…`);
        }
      } else if (event === "peer") {
        this.peer = true;
        this.status("Друг подключился! Выбери уровень и жми «Начать». Ты — девочка.");
        $("net-start").disabled = false;
        Sound.checkpoint();
      } else if (event === "error") {
        this.status(data.message, true);
      } else if (event === "left") {
        toast(data.who === "host" ? "Хозяин комнаты вышел" : "Друг отключился");
        if (data.who === "host") { this.reset(); toMenu(); }
        else { this.peer = false; this.status("Друг отключился. Ждём снова…"); $("net-start").disabled = true; }
      } else if (event === "input" && this.role === "host") {
        const map = { L: "NetL", R: "NetR", J: "NetJ", S: "NetS" };
        for (const k of ["L", "R", "J", "S"]) {
          const on = !!data[k];
          if (on && !this.remote[k]) { keys.add(map[k]); pressed.add(map[k]); }
          if (!on) keys.delete(map[k]);
          this.remote[k] = on;
        }
      } else if (event === "state" && this.role === "guest") {
        this.latest = data;
      } else if (event === "event" && this.role === "guest") {
        if (data.type === "start") this.guestStart(data.index);
        if (data.type === "win") {
          setWinLabels("Время", "Кристаллы", "Смерти");
          $("win-title").textContent = data.boss ? "Босс повержен!" : "Уровень пройден!";
          $("win-stars").innerHTML = [1, 2, 3].map((i) => `<span class="${i <= data.stars ? "on" : ""}">★</span>`).join("");
          $("win-time").textContent = fmt(data.time);
          $("win-gems").textContent = data.gems;
          $("win-deaths").textContent = data.deaths;
          $("win-note").textContent = "Следующий уровень выбирает хозяин комнаты";
          $("win-next").disabled = true;
          $("win-retry").disabled = true;
          setTimeout(() => $("modal-win").classList.remove("hidden"), 600);
        }
        if (data.type === "menu") { toMenu(); show("screen-net"); this.status("Хозяин вернулся в меню. Ждём новый уровень…"); }
      }
    },
    start() {
      if (!this.peer) return;
      startLevel(Number($("net-level").value) || 0);
    },
    onHostStart(index) {
      game.ctrlOverride = {
        girl: { left: ["KeyA", "ArrowLeft", "Pad0L"], right: ["KeyD", "ArrowRight", "Pad0R"], jump: ["KeyW", "ArrowUp", "Pad0J"], act: ["KeyS", "ArrowDown", "Pad0S"] },
        boy: { left: ["NetL"], right: ["NetR"], jump: ["NetJ"], act: ["NetS"] },
      };
      for (const h of game.heroes) h.ctrl = game.ctrlOverride[h.kind];
      this.send("event", { type: "start", index });
      setHint("Игра по сети: ты — девочка (WASD или стрелки), друг управляет бородачом.");
    },
    guestStart(index) {
      $("win-retry").disabled = false;
      startLevel(index);
      game.netGuest = true;
      setHint("Игра по сети: ты — бородач (стрелки или WASD).");
    },
    hostFrame(dt) {
      if (!this.peer) return;
      this.sendT -= dt;
      if (this.sendT > 0) return;
      this.sendT = 0.05;
      this.send("state", this.snapshot(game));
    },
    guestFrame(dt) {
      const any = (list) => list.some((k) => keys.has(k));
      const inp = {
        L: any(["KeyA", "ArrowLeft", "Pad0L"]),
        R: any(["KeyD", "ArrowRight", "Pad0R"]),
        J: any(["KeyW", "ArrowUp", "Pad0J"]),
        S: any(["KeyS", "ArrowDown", "Pad0S"]),
      };
      const sig = JSON.stringify(inp);
      this.inputT -= dt;
      if (sig !== this.lastInput || this.inputT <= 0) {
        this.lastInput = sig;
        this.inputT = 0.2;
        this.send("input", inp);
      }
      if (this.latest && game) this.apply(game, this.latest);
      game.updateParticles(dt);
    },
    snapshot(g) {
      const w = g.world;
      const b = w.boss;
      return {
        id: g.def.id, t: g.time, d: g.deaths, f: g.finished, dt: g.deadTimer, cam: g.cam.x, sh: g.shake,
        h: g.heroes.map((h) => [Math.round(h.x), Math.round(h.y), Math.round(h.vx), h.facing, h.onGround ? 1 : 0, h.dead ? 1 : 0, +h.walkT.toFixed(2), +h.sink.toFixed(1), +h.squash.toFixed(2)]),
        m: w.movers.map((m) => [Math.round(m.x), Math.round(m.y)]),
        gt: w.gates.map((x) => +x.open.toFixed(3)),
        bx: w.boxes.map((x) => [Math.round(x.x), Math.round(x.y)]),
        bt: w.buttons.map((x) => (x.pressed ? 1 : 0)),
        lv: w.levers.map((x) => (x.on ? 1 : 0)),
        gm: w.gems.map((x) => (x.taken ? 1 : 0)).join(""),
        col: [g.collected.girl, g.collected.boy],
        cp: w.checkpoints.map((c) => [c.touched.girl ? 1 : 0, c.touched.boy ? 1 : 0, c.active ? 1 : 0, c.current ? 1 : 0]),
        dr: w.doors.girl ? [w.doors.girl.open, w.doors.boy.open] : null,
        boss: b ? {
          x: Math.round(b.x), y: Math.round(b.y), hp: b.hp, ph: b.phase, st: b.stun, fl: b.flash, dead: b.dead, dT: b.deathT, aw: b.awake, bm: b.beam,
          pr: [b.pressed.girl ? 1 : 0, b.pressed.boy ? 1 : 0],
          drops: b.drops.map((d) => [Math.round(d.x), Math.round(d.y), d.kind, +d.tele.toFixed(2), d.teleMax, d.groundY]),
          rl: b.rollers.map((r) => [Math.round(r.x), r.y, r.dir, +r.warn.toFixed(2), +r.spin.toFixed(2)]),
        } : null,
      };
    },
    apply(g, s) {
      if (g.def.id !== s.id) return;
      const w = g.world;
      g.time = s.t;
      g.deaths = s.d;
      g.deadTimer = s.dt;
      g.cam.x = s.cam;
      g.shake = s.sh;
      s.h.forEach((a, i) => {
        const h = g.heroes[i];
        [h.x, h.y, h.vx, h.facing] = a;
        h.onGround = !!a[4];
        h.dead = !!a[5];
        h.walkT = a[6];
        h.sink = a[7];
        h.squash = a[8];
      });
      s.m.forEach((a, i) => { if (w.movers[i]) { w.movers[i].x = a[0]; w.movers[i].y = a[1]; } });
      s.gt.forEach((o, i) => { const x = w.gates[i]; if (x) { x.open = o; x.h = x.fullH * (1 - o); } });
      s.bx.forEach((a, i) => { if (w.boxes[i]) { w.boxes[i].x = a[0]; w.boxes[i].y = a[1]; } });
      s.bt.forEach((v, i) => { const x = w.buttons[i]; if (x) { x.pressed = !!v; x.depth = v; } });
      s.lv.forEach((v, i) => { const x = w.levers[i]; if (x) { x.on = !!v; x.angle = v ? 0.6 : -0.6; } });
      [...s.gm].forEach((v, i) => {
        const gem = w.gems[i];
        if (gem && v === "1" && !gem.taken) {
          gem.taken = true;
          Sound.gem(gem.owner);
          g.burst(gem.x, gem.y, COLORS[gem.owner === "girl" ? "pink" : "gold"][1], 16, 160);
        }
      });
      g.collected.girl = s.col[0];
      g.collected.boy = s.col[1];
      s.cp.forEach((a, i) => { const c = w.checkpoints[i]; if (c) { c.touched.girl = !!a[0]; c.touched.boy = !!a[1]; c.active = !!a[2]; c.current = !!a[3]; } });
      if (s.dr && w.doors.girl) { w.doors.girl.open = s.dr[0]; w.doors.boy.open = s.dr[1]; }
      const b = w.boss;
      if (b && s.boss) {
        const o = s.boss;
        b.x = o.x; b.y = o.y; b.hp = o.hp; b.phase = o.ph; b.stun = o.st; b.flash = o.fl; b.dead = o.dead; b.deathT = o.dT; b.awake = o.aw; b.beam = o.bm;
        b.pressed.girl = !!o.pr[0];
        b.pressed.boy = !!o.pr[1];
        b.drops = o.drops.map((d) => ({ x: d[0], y: d[1], kind: d[2], tele: d[3], teleMax: d[4], groundY: d[5] }));
        b.rollers = o.rl.map((r) => ({ x: r[0], y: r[1], dir: r[2], warn: r[3], spin: r[4] }));
      }
    },
  };

  async function boot() {
    menuPreview.init();
    drawAvatar($("avatar"));
    window.__drawAvatar = drawAvatar;
    $("team-input").value = Api.local("team", "");
    const online = await Api.init();
    let appMode = false;
    if (online) {
      try { appMode = (await Api.req("GET", "/api/app")).appMode; } catch {}
      setInterval(() => { fetch("/api/app/heartbeat", { method: "POST" }).catch(() => {}); }, 10000);
      fetch("/api/app/heartbeat", { method: "POST" }).catch(() => {});
    }
    $("btn-quit").classList.toggle("hidden", !appMode);
    $("btn-quit").onclick = async () => {
      try { await Api.req("POST", "/api/app/quit"); } catch {}
      document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#cfc4e6;font:18px Rubik,sans-serif;background:#0d0b14">Игра закрыта. Окно можно закрыть.</div>';
      setTimeout(() => window.close(), 400);
    };
    try {
      if ("serviceWorker" in navigator && location.protocol.startsWith("http") && ["localhost", "127.0.0.1"].includes(location.hostname)) {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      }
    } catch {}
    let installEvt = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      installEvt = e;
      $("btn-install").classList.remove("hidden");
    });
    $("btn-install").onclick = async () => {
      if (!installEvt) return;
      installEvt.prompt();
      try { await installEvt.userChoice; } catch {}
      installEvt = null;
      $("btn-install").classList.add("hidden");
    };
    const goFull = () => {
      const el = $("stage");
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else el.requestFullscreen().catch(() => {});
      } catch {}
    };
    $("btn-full").onclick = goFull;
    $("set-full").onclick = goFull;
    let settingsReturn = "screen-menu";
    const openSettings = (from) => {
      settingsReturn = from;
      $("set-volume").value = Settings.volume;
      $("set-music").checked = Settings.music;
      $("set-shake").checked = Settings.shake;
      $("set-quality").value = Settings.quality;
      if (from === "pause") $("modal-pause").classList.add("hidden");
      show("screen-settings");
      renderPads();
    };
    const renderPads = () => {
      let pads = [];
      try { pads = [...navigator.getGamepads()].filter(Boolean); } catch {}
      $("pads-status").innerHTML = [0, 1].map((i) => pads[i]
        ? `<span class="on">${i ? "Бородач" : "Девочка"}: ${escapeHtml(pads[i].id.slice(0, 32))}</span>`
        : `<span>${i ? "Бородач" : "Девочка"}: не подключён</span>`).join("");
    };
    window.addEventListener("gamepadconnected", renderPads);
    window.addEventListener("gamepaddisconnected", renderPads);
    $("btn-settings").onclick = () => openSettings("screen-menu");
    $("pause-settings").onclick = () => openSettings("pause");
    $("settings-back").onclick = () => {
      if (settingsReturn === "pause") {
        show(null);
        $("modal-pause").classList.remove("hidden");
      } else show("screen-menu");
    };
    $("set-volume").oninput = (e) => { Sound.setVolume(Number(e.target.value)); Settings.save(); };
    $("set-volume").onchange = () => Sound.gem("girl");
    $("set-music").onchange = (e) => { Settings.music = e.target.checked; Settings.save(); if (Settings.music) Music.start(); else Music.stop(); };
    $("set-shake").onchange = (e) => { Settings.shake = e.target.checked; Settings.save(); };
    $("set-quality").onchange = (e) => { Settings.quality = e.target.value; Settings.save(); };
    const kick = () => { Sound.ensure(); if (Sound.ctx && Sound.ctx.state === "suspended") Sound.ctx.resume(); Music.start(); };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    const st = $("server-status");
    Ach.load();
    try {
      ALL = await Api.levels();
    } catch {
      ALL = window.EMBEDDED_LEVELS || [];
    }
    if (!ALL.length) ALL = window.EMBEDDED_LEVELS || [];
    const isRace = (d) => d.mode === "race" || (d.objects || []).some((o) => o.type === "finish");
    LEVELS = ALL.filter((d) => !isRace(d));
    RACES = ALL.filter(isRace);
    if (online) {
      st.textContent = `Сервер NestJS подключён · уровней: ${LEVELS.length}, трасс: ${RACES.length}`;
      st.className = "status-line ok";
    } else {
      st.textContent = "Офлайн-режим: рекорды хранятся в этом браузере";
      st.className = "status-line off";
    }

    $("btn-play").onclick = async () => {
      await ensureTeam();
      const i = unlockedCount() - 1;
      const id = LEVELS[i] && LEVELS[i].id;
      if (Story.has("before:" + id)) {
        show(null);
        Story.play("before:" + id, () => startLevel(i));
      } else startLevel(i);
    };
    $("story-next").onclick = () => Story.next();
    $("story-skip").onclick = () => Story.close();
    window.addEventListener("keydown", (e) => {
      if (!Story.lines) return;
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); Story.next(); }
      if (e.code === "Escape") Story.close();
    });
    $("btn-story").onclick = () => {
      const seen = Story.seen();
      const keys = Object.keys(STORY).filter((k) => seen[k]);
      if (!keys.length) return Story.play("before:1", () => show("screen-menu"));
      const order = Object.keys(STORY);
      let i = 0;
      const playNext = () => {
        if (i >= keys.length) return show("screen-menu");
        const k = order.filter((x) => keys.includes(x))[i++];
        STORY_REPLAY(k, playNext);
      };
      show(null);
      playNext();
    };
    setupEditor();
    $("btn-profile").onclick = () => Profile.open();
    $("pf-login").onclick = () => Profile.auth("login");
    $("pf-register").onclick = () => Profile.auth("register");
    $("pf-logout").onclick = () => Profile.logout();
    $("pf-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") Profile.auth("login"); });
    $("btn-net").onclick = () => Net.open();
    $("net-host").onclick = () => Net.host();
    $("net-join").onclick = () => Net.join();
    $("net-start").onclick = () => Net.start();
    $("net-code").addEventListener("keydown", (e) => { if (e.key === "Enter") Net.join(); });
    await Profile.restore();
    $("btn-levels").onclick = openLevels;
    $("btn-records").onclick = async () => { await ensureTeam().catch(() => {}); openRecords(game ? game.index : 0); };
    $("btn-help").onclick = () => show("screen-help");
    $("btn-skins").onclick = () => skinView.open();
    $("btn-races").onclick = openRaces;
    $("btn-ach").onclick = openAchievements;
    for (const b of document.querySelectorAll("[data-skin]")) b.onclick = () => skinView.set(b.dataset.skin, skinSel[b.dataset.skin] + Number(b.dataset.step));
    for (const b of document.querySelectorAll("[data-back]")) b.onclick = () => { Shop.syncSelection(); show("screen-menu"); };
    $("btn-pause").onclick = () => togglePause();
    $("pause-resume").onclick = () => togglePause(false);
    $("pause-restart").onclick = () => { game.restart(false); togglePause(false); };
    $("pause-sound").onclick = () => { Sound.on = !Sound.on; if (Sound.master) Sound.master.gain.value = Sound.on ? Settings.volume : 0; setSoundLabel(); };
    $("pause-menu").onclick = () => (game && game.fromEditor ? Editor.open(Editor.def) : toMenu());
    $("win-retry").onclick = () => (game.race ? startRace(game.raceIndex) : game.def.custom ? startCustom(game.def, game.fromEditor) : startLevel(game.index));
    $("win-menu").onclick = toMenu;
    $("win-next").onclick = () => {
      if (game.race) return startRace(game.raceIndex + 1);
      if (game.def.custom) return Editor.open(Editor.def);
      const cur = game.def.id;
      const nextIndex = game.index + 1;
      const go = () => {
        const nxt = LEVELS[nextIndex];
        if (!nxt) return toMenu();
        if (Story.has("before:" + nxt.id)) Story.play("before:" + nxt.id, () => startLevel(nextIndex));
        else startLevel(nextIndex);
      };
      $("modal-win").classList.add("hidden");
      if (Story.has("after:" + cur)) Story.play("after:" + cur, go);
      else go();
    };
    $("pause-restart").onclick = () => { if (game.race) startRace(game.raceIndex); else game.restart(false); togglePause(false); };
    $("team-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-play").click(); });

    window.__duo = { get game() { return game; }, startLevel, keys, pressed, Game, get levels() { return ALL; }, set bot(v) { BOT = v; }, startRace };
    requestAnimationFrame(frame);
  }

  boot();
})();
