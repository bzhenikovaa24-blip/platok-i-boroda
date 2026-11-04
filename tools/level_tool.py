import argparse
import html
import json
import os
import sqlite3
import sys
from collections import deque
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS = ROOT / "shared" / "levels.json"
DB = ROOT / "data" / "game.db"

SOLID = set("#PGXI")
LIQUID = {"P": "girl", "G": "boy", "X": None}
COLORS = {
    "#": "\033[48;5;60m  \033[0m",
    "I": "\033[48;5;153m  \033[0m",
    "P": "\033[48;5;205m  \033[0m",
    "G": "\033[48;5;214m  \033[0m",
    "X": "\033[48;5;71m  \033[0m",
    "p": "\033[38;5;205m◆ \033[0m",
    "g": "\033[38;5;214m◆ \033[0m",
    "a": "\033[38;5;205m♀ \033[0m",
    "b": "\033[38;5;214m♂ \033[0m",
    "A": "\033[48;5;53m\033[38;5;205m▌▐\033[0m",
    "B": "\033[48;5;94m\033[38;5;214m▌▐\033[0m",
    ".": "  ",
}


def setup_console():
    if os.name == "nt":
        os.system("")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


def load_levels():
    return json.loads(LEVELS.read_text(encoding="utf-8"))


def find(level, ch):
    return [(r, c) for r, row in enumerate(level["map"]) for c, x in enumerate(row) if x == ch]


def reachable(level, who):
    grid = level["map"]
    h, w = len(grid), len(grid[0])
    extra = set()
    for o in level.get("objects", []):
        if o["type"] in ("lift", "platform"):
            for (x, y) in ((o["x"], o["y"]), (o.get("tx", o["x"]), o.get("ty", o["y"]))):
                for dx in range(o.get("w", 1)):
                    extra.add((y, x + dx))
        if o["type"] == "box":
            extra.add((o["y"], o["x"]))

    def solid(r, c):
        return grid[r][c] in SOLID or (r, c) in extra

    def safe_floor(r, c):
        ch = grid[r][c]
        if ch in LIQUID:
            return LIQUID[ch] == who
        return solid(r, c)

    def standable(r, c):
        return 0 < r < h - 1 and not solid(r, c) and not solid(r - 1, c) and safe_floor(r + 1, c)

    start = find(level, "a" if who == "girl" else "b")[0]
    seen = {start}
    q = deque([start])
    while q:
        r, c = q.popleft()
        for dr in range(-4, 12):
            for dc in range(-4, 5):
                nr, nc = r + dr, c + dc
                if (nr, nc) in seen or not (0 < nr < h - 1 and 0 < nc < w - 1):
                    continue
                if dr < -3 and abs(dc) > 2:
                    continue
                if standable(nr, nc):
                    seen.add((nr, nc))
                    q.append((nr, nc))
    return seen


def validate(levels):
    ok = True
    ids = set()
    for lv in levels:
        errors, warns = [], []
        if lv["id"] in ids:
            errors.append("повторяющийся id")
        ids.add(lv["id"])
        rows = lv["map"]
        if len(rows) != lv["height"]:
            errors.append(f"строк {len(rows)}, ожидалось {lv['height']}")
        for i, r in enumerate(rows):
            if len(r) != lv["width"]:
                errors.append(f"строка {i}: длина {len(r)} вместо {lv['width']}")
        race = lv.get("mode") == "race"
        need = (("a", "старт девочки"), ("b", "старт бородача"))
        if not race:
            need += (("A", "дверь девочки"), ("B", "дверь бородача"))
        for ch, name in need:
            n = len(find(lv, ch))
            if n != 1:
                errors.append(f"{name}: найдено {n}, нужно ровно 1")
        if race:
            lanes = sorted(o.get("lane", "") for o in lv.get("objects", []) if o["type"] == "finish")
            if lanes != ["boy", "girl"]:
                errors.append("у гонки должно быть два финиша: girl и boy")
        triggers = {o["id"] for o in lv.get("objects", []) if o["type"] in ("button", "lever", "boss")}
        for o in lv.get("objects", []):
            for t in o.get("trigger", []):
                if t not in triggers:
                    errors.append(f"{o['id']}: неизвестный триггер {t}")
        gems_p, gems_g = len(find(lv, "p")), len(find(lv, "g"))
        if gems_p != gems_g:
            warns.append(f"кристаллов неравно: розовых {gems_p}, золотых {gems_g}")
        if not errors and not race:
            for who, door in (("girl", "A"), ("boy", "B")):
                if find(lv, door)[0] not in reachable(lv, who):
                    warns.append(f"грубая проверка: {('девочка', 'бородач')[who == 'boy']} может не дойти до двери (проверка без учёта механизмов)")
        status = "\033[32mOK\033[0m" if not errors else "\033[31mОШИБКА\033[0m"
        kind = "гонка" if race else ("босс" if any(o["type"] == "boss" for o in lv.get("objects", [])) else "уровень")
        print(f"[{status}] {kind} {lv['id']}. {lv['name']}  ({gems_p}+{gems_g} кристаллов, объектов: {len(lv.get('objects', []))}, норматив {lv['par']} c)")
        for e in errors:
            print(f"    ✗ {e}")
        for wmsg in warns:
            print(f"    ! {wmsg}")
        ok = ok and not errors
    return ok


def preview(levels, lid):
    lv = next((l for l in levels if l["id"] == lid), None)
    if not lv:
        print(f"Уровень {lid} не найден")
        return
    marks = {}
    for o in lv.get("objects", []):
        t = o["type"]
        sym = {"button": "\033[38;5;159m▁▁\033[0m", "lever": "\033[38;5;183m/ \033[0m", "box": "\033[48;5;94m▒▒\033[0m"}.get(t)
        if sym:
            marks[(o["y"], o["x"])] = sym
        elif t == "checkpoint":
            marks[(o["y"], o["x"])] = "\033[38;5;121m⚑ \033[0m"
        elif t == "boss":
            marks[(o["y"], o["x"])] = "\033[41m☠☠\033[0m"
        elif t == "gate":
            for dy in range(o["h"]):
                marks[(o["y"] + dy, o["x"])] = "\033[48;5;97m||\033[0m"
        elif t == "portal":
            marks[(o["y"], o["x"])] = "\033[48;5;45m()\033[0m"
            marks[(o["y"] + 1, o["x"])] = "\033[48;5;45m()\033[0m"
        elif t == "fan":
            for dy in range(o.get("h", 1)):
                for dx in range(o.get("w", 1)):
                    marks[(o["y"] + dy, o["x"] + dx)] = "\033[38;5;153m↑↑\033[0m"
        elif t in ("finish", "boss"):
            pass
        else:
            for dx in range(o.get("w", 1)):
                marks[(o["y"], o["x"] + dx)] = "\033[48;5;141m==\033[0m"
    print(f"\n  {lv['id']}. {lv['name']} — {lv['hint']}\n")
    for r, row in enumerate(lv["map"]):
        print("  " + "".join(marks.get((r, c), COLORS.get(ch, ch * 2)) for c, ch in enumerate(row)))
    print()


def fmt(ms):
    if ms is None:
        return "—"
    s = ms / 1000
    return f"{int(s // 60):02d}:{s % 60:04.1f}"


def report(as_html):
    if not DB.exists():
        print(f"База ещё не создана: {DB}\nЗапусти сервер и пройди хотя бы один уровень.")
        return
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    totals = con.execute(
        "SELECT (SELECT COUNT(*) FROM teams) teams, COUNT(*) runs, COALESCE(SUM(deaths),0) deaths, "
        "COALESCE(SUM(gems),0) gems, COALESCE(SUM(time_ms),0) total FROM runs"
    ).fetchone()
    per_level = con.execute(
        "SELECT l.id, l.name, l.par_seconds par, COUNT(r.id) runs, MIN(r.time_ms) best, "
        "ROUND(AVG(r.time_ms)) avg, ROUND(AVG(r.deaths),2) deaths, "
        "ROUND(100.0*SUM(r.gems)/NULLIF(SUM(r.gems_total),0),1) gem_pct "
        "FROM levels l LEFT JOIN runs r ON r.level_id=l.id GROUP BY l.id ORDER BY l.id"
    ).fetchall()
    teams = con.execute(
        "SELECT t.name, COUNT(DISTINCT r.level_id) levels, COUNT(r.id) runs, COALESCE(SUM(r.deaths),0) deaths, "
        "COALESCE(SUM(r.stars),0) stars FROM teams t LEFT JOIN runs r ON r.team_id=t.id "
        "GROUP BY t.id ORDER BY levels DESC, deaths ASC"
    ).fetchall()
    has_races = con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='races'").fetchone()
    races = con.execute(
        "SELECT l.name, COUNT(r.id) n, SUM(r.winner='girl') g, SUM(r.winner='boy') b, MIN(r.girl_ms) bg, MIN(r.boy_ms) bb "
        "FROM levels l JOIN races r ON r.level_id=l.id GROUP BY l.id ORDER BY l.id"
    ).fetchall() if has_races else []
    con.close()

    if as_html:
        out = ROOT / "data" / "report.html"
        rows_l = "".join(
            f"<tr><td>{r['id']}</td><td>{html.escape(r['name'])}</td><td>{r['runs']}</td><td>{fmt(r['best'])}</td>"
            f"<td>{fmt(r['avg'])}</td><td>{r['deaths'] if r['deaths'] is not None else '—'}</td>"
            f"<td>{r['gem_pct'] if r['gem_pct'] is not None else '—'}%</td>"
            f"<td><div class=bar style='width:{min(100, (r['runs'] or 0) * 10)}%'></div></td></tr>"
            for r in per_level
        )
        rows_t = "".join(
            f"<tr><td>{html.escape(t['name'])}</td><td>{t['levels']}</td><td>{t['runs']}</td><td>{t['deaths']}</td><td>{'★' * t['stars']}</td></tr>"
            for t in teams
        )
        rows_r = "".join(
            f"<tr><td>{html.escape(r['name'])}</td><td>{r['n']}</td><td>{r['g']}</td><td>{r['b']}</td><td>{fmt(r['bg'])}</td><td>{fmt(r['bb'])}</td></tr>"
            for r in races
        ) or "<tr><td colspan=6>Гонок ещё не было</td></tr>"
        out.write_text(f"""<!doctype html><html lang=ru><meta charset=utf-8><title>Отчёт — Платок и Борода</title>
<style>body{{font-family:system-ui;background:#141020;color:#eee;padding:24px;max-width:900px;margin:auto}}
h1{{color:#ff5fa8}}table{{width:100%;border-collapse:collapse;margin:12px 0 28px}}td,th{{padding:6px 8px;border-bottom:1px solid #333;text-align:left}}
th{{color:#aaa;font-weight:500}}.cards{{display:flex;gap:10px;flex-wrap:wrap}}.card{{background:#221b33;padding:12px 16px;border-radius:10px}}
.card b{{display:block;font-size:24px;color:#f2b636}}.bar{{height:8px;background:linear-gradient(90deg,#ff5fa8,#f2b636);border-radius:4px}}</style>
<h1>Платок и Борода — отчёт</h1><p>Сформирован {datetime.now():%d.%m.%Y %H:%M} скриптом tools/level_tool.py</p>
<div class=cards><div class=card>Команд<b>{totals['teams']}</b></div><div class=card>Прохождений<b>{totals['runs']}</b></div>
<div class=card>Смертей<b>{totals['deaths']}</b></div><div class=card>Кристаллов<b>{totals['gems']}</b></div>
<div class=card>Время в игре<b>{fmt(totals['total'])}</b></div></div>
<h2>Уровни</h2><table><tr><th>#</th><th>Уровень</th><th>Прохождений</th><th>Рекорд</th><th>Среднее</th><th>Смертей в среднем</th><th>Кристаллы</th><th>Популярность</th></tr>{rows_l}</table>
<h2>Гонки</h2><table><tr><th>Трасса</th><th>Заездов</th><th>Побед девочки</th><th>Побед бородача</th><th>Лучшее время ♀</th><th>Лучшее время ♂</th></tr>{rows_r}</table>
<h2>Команды</h2><table><tr><th>Команда</th><th>Уровней пройдено</th><th>Попыток</th><th>Смертей</th><th>Звёзды</th></tr>{rows_t}</table></html>""", encoding="utf-8")
        print(f"HTML-отчёт сохранён: {out}")
        return

    print(f"\n  Команд: {totals['teams']}   Прохождений: {totals['runs']}   Смертей: {totals['deaths']}   "
          f"Кристаллов: {totals['gems']}   Время в игре: {fmt(totals['total'])}\n")
    print(f"  {'#':<3}{'Уровень':<22}{'Проходов':>9}{'Рекорд':>10}{'Среднее':>10}{'Смерти':>8}{'Крист.':>8}")
    for r in per_level:
        pct = f"{r['gem_pct']}%" if r["gem_pct"] is not None else "—"
        print(f"  {r['id']:<3}{r['name']:<22}{r['runs']:>9}{fmt(r['best']):>10}{fmt(r['avg']):>10}"
              f"{str(r['deaths'] if r['deaths'] is not None else '—'):>8}{pct:>8}")
    if races:
        print(f"\n  {'Трасса':<22}{'Заездов':>8}{'♀ побед':>9}{'♂ побед':>9}")
        for r in races:
            print(f"  {r['name']:<22}{r['n']:>8}{r['g']:>9}{r['b']:>9}")
    print(f"\n  {'Команда':<26}{'Уровней':>8}{'Попыток':>9}{'Смертей':>9}  Звёзды")
    for t in teams:
        print(f"  {t['name']:<26}{t['levels']:>8}{t['runs']:>9}{t['deaths']:>9}  {'★' * t['stars']}")
    print()


def main():
    setup_console()
    p = argparse.ArgumentParser(description="Инструменты уровней и статистики игры «Платок и Борода»")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate", help="проверить shared/levels.json")
    pv = sub.add_parser("preview", help="нарисовать уровень в консоли")
    pv.add_argument("id", type=int)
    rp = sub.add_parser("report", help="статистика из data/game.db")
    rp.add_argument("--html", action="store_true", help="сохранить отчёт в data/report.html")
    args = p.parse_args()
    levels = load_levels()
    if args.cmd == "validate":
        sys.exit(0 if validate(levels) else 1)
    if args.cmd == "preview":
        preview(levels, args.id)
    if args.cmd == "report":
        report(args.html)


if __name__ == "__main__":
    main()
