import html
import os
import sqlite3
import sys
import webbrowser
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "game.db"
OUT = ROOT / "data" / "analytics.html"

PINK = "#ff5fa8"
GOLD = "#f2b636"
GREEN = "#5fdc6a"
INK = "#efe9f7"
MUTED = "#a99fbd"


def bar_chart(title, rows, color, unit="", width=760, fmt=lambda v: f"{v:g}"):
    if not rows:
        return f"<section><h2>{html.escape(title)}</h2><p class=muted>Пока нет данных</p></section>"
    bar_h, gap, label_w = 20, 8, 190
    peak = max(v for _, v in rows) or 1
    height = len(rows) * (bar_h + gap) + 10
    parts = []
    for i, (label, value) in enumerate(rows):
        y = i * (bar_h + gap) + 5
        w = (width - label_w - 70) * value / peak
        parts.append(
            f'<text x="{label_w - 8}" y="{y + 14}" text-anchor="end" fill="{MUTED}" font-size="12">{html.escape(str(label))}</text>'
            f'<rect x="{label_w}" y="{y}" width="{max(w, 2):.1f}" height="{bar_h}" rx="4" fill="{color}"/>'
            f'<text x="{label_w + w + 6:.1f}" y="{y + 14}" fill="{INK}" font-size="12">{fmt(value)}{unit}</text>'
        )
    return (f"<section><h2>{html.escape(title)}</h2>"
            f'<svg viewBox="0 0 {width} {height}" width="100%" role="img" aria-label="{html.escape(title)}">{"".join(parts)}</svg></section>')


def line_chart(title, points, color, width=760, height=220):
    if len(points) < 2:
        return f"<section><h2>{html.escape(title)}</h2><p class=muted>Нужно хотя бы два дня игры</p></section>"
    pad = 36
    peak = max(v for _, v in points) or 1
    step = (width - pad * 2) / (len(points) - 1)
    xy = [(pad + i * step, height - pad - (height - pad * 2) * v / peak) for i, (_, v) in enumerate(points)]
    path = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(xy))
    area = path + f" L{xy[-1][0]:.1f},{height - pad} L{xy[0][0]:.1f},{height - pad} Z"
    labels = "".join(
        f'<text x="{x:.1f}" y="{height - 12}" text-anchor="middle" fill="{MUTED}" font-size="11">{html.escape(d[5:])}</text>'
        for (x, _), (d, _) in zip(xy, points)
    )
    dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{color}"/>' for x, y in xy)
    grid = "".join(
        f'<line x1="{pad}" x2="{width - pad}" y1="{height - pad - (height - pad * 2) * k / 4:.1f}" y2="{height - pad - (height - pad * 2) * k / 4:.1f}" stroke="#2c2440"/>'
        f'<text x="{pad - 6}" y="{height - pad - (height - pad * 2) * k / 4 + 4:.1f}" text-anchor="end" fill="{MUTED}" font-size="10">{peak * k / 4:.0f}</text>'
        for k in range(5)
    )
    return (f"<section><h2>{html.escape(title)}</h2><svg viewBox=\"0 0 {width} {height}\" width=\"100%\" role=\"img\">"
            f'{grid}<path d="{area}" fill="{color}" opacity=".15"/><path d="{path}" fill="none" stroke="{color}" stroke-width="2.5"/>{dots}{labels}</svg></section>')


def ms(v):
    s = v / 1000
    return f"{int(s // 60)}:{s % 60:04.1f}"


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    if not DB.exists():
        print(f"База ещё не создана: {DB}")
        return
    con = sqlite3.connect(DB)
    q = lambda sql, *a: con.execute(sql, a).fetchall()
    tables = {r[0] for r in q("SELECT name FROM sqlite_master WHERE type='table'")}

    deadly = q("SELECT l.id || '. ' || l.name, ROUND(AVG(r.deaths), 2) FROM runs r JOIN levels l ON l.id = r.level_id "
               "GROUP BY l.id HAVING AVG(r.deaths) > 0 ORDER BY AVG(r.deaths) DESC LIMIT 12")
    times = q("SELECT l.id || '. ' || l.name, AVG(r.time_ms) FROM runs r JOIN levels l ON l.id = r.level_id "
              "WHERE l.mode != 'race' GROUP BY l.id ORDER BY l.id LIMIT 40") if "mode" in {c[1] for c in q("PRAGMA table_info(levels)")} else []
    popular = q("SELECT l.id || '. ' || l.name, COUNT(*) FROM runs r JOIN levels l ON l.id = r.level_id GROUP BY l.id ORDER BY COUNT(*) DESC LIMIT 10")
    per_day = q("SELECT substr(created_at, 1, 10) d, COUNT(*) FROM runs GROUP BY d ORDER BY d")
    stars = q("SELECT stars || ' ★', COUNT(*) FROM runs GROUP BY stars ORDER BY stars DESC")
    races = q("SELECT 'Девочка', COALESCE(SUM(winner='girl'),0) FROM races UNION ALL SELECT 'Бородач', COALESCE(SUM(winner='boy'),0) FROM races") if "races" in tables else []
    customs = q("SELECT name || ' (' || author || ')', plays FROM custom_levels WHERE plays > 0 ORDER BY plays DESC LIMIT 8") if "custom_levels" in tables else []
    totals = q("SELECT COUNT(*), COALESCE(SUM(deaths),0), COALESCE(SUM(gems),0), COALESCE(SUM(time_ms),0), (SELECT COUNT(*) FROM teams) FROM runs")[0]
    con.close()

    cards = [("Прохождений", totals[0]), ("Команд", totals[4]), ("Смертей", totals[1]), ("Кристаллов", totals[2]), ("Время в игре", ms(totals[3]))]
    body = "".join([
        bar_chart("Где чаще всего погибают (в среднем смертей за прохождение)", deadly, PINK),
        bar_chart("Среднее время прохождения уровней", times, GOLD, fmt=ms),
        bar_chart("Самые популярные уровни (число прохождений)", popular, GREEN),
        line_chart("Прохождения по дням", per_day, PINK),
        bar_chart("Сколько звёзд получают", stars, GOLD),
        bar_chart("Гонки: кто чаще побеждает", races, PINK),
        bar_chart("Самые популярные уровни игроков", customs, GREEN),
    ])
    OUT.write_text(f"""<!doctype html><html lang=ru><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Аналитика — Платок и Борода</title>
<style>
body{{margin:0;background:#120f1b;color:{INK};font:15px/1.5 system-ui,sans-serif}}
main{{max-width:860px;margin:0 auto;padding:28px 18px}}
h1{{margin:0 0 4px;font-size:28px}} h1 span{{color:{PINK}}} h1 b{{color:{GOLD}}}
h2{{font-size:16px;font-weight:600;margin:0 0 10px}}
section{{background:#1b1628;border:1px solid #2f2742;border-radius:14px;padding:16px;margin:14px 0}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0}}
.cards div{{background:#1b1628;border:1px solid #2f2742;border-radius:12px;padding:12px}}
.cards span{{display:block;color:{MUTED};font-size:12px}} .cards b{{font-size:22px}}
.muted,p{{color:{MUTED}}}
</style>
<main><h1><span>Платок</span> и <b>Борода</b> — аналитика</h1>
<p>Сформировано {datetime.now():%d.%m.%Y %H:%M} скриптом tools/analytics.py по базе data/game.db</p>
<div class=cards>{''.join(f'<div><span>{k}</span><b>{v}</b></div>' for k, v in cards)}</div>
{body}</main></html>""", encoding="utf-8")
    print(f"Аналитика сохранена: {OUT}")
    if "--open" in sys.argv:
        webbrowser.open(OUT.as_uri())


if __name__ == "__main__":
    main()
