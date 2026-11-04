import json
import sys
from pathlib import Path

W, H = 32, 20
PARS = Path(__file__).resolve().parent / "pars.json"
SOLUTIONS = Path(__file__).resolve().parent / "solutions.json"


class Level:
    def __init__(self, lid, name, hint, par, width=W):
        self.w = width
        self.id = lid
        self.name = name
        self.hint = hint
        self.par = par
        self.g = [["." for _ in range(width)] for _ in range(H)]
        for x in range(width):
            self.g[0][x] = "#"
            self.g[H - 1][x] = "#"
        for y in range(H):
            self.g[y][0] = "#"
            self.g[y][width - 1] = "#"
        self.objects = []

    def fill(self, ch, r1, c1, r2=None, c2=None):
        r2 = r1 if r2 is None else r2
        c2 = c1 if c2 is None else c2
        for r in range(r1, r2 + 1):
            for c in range(c1, c2 + 1):
                self.g[r][c] = ch
        return self

    def put(self, ch, r, c):
        self.g[r][c] = ch
        return self

    def obj(self, **kw):
        self.objects.append(kw)
        return self

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "hint": self.hint,
            "par": self.par,
            "width": self.w,
            "height": H,
            "map": ["".join(r) for r in self.g],
            "objects": self.objects,
            **getattr(self, "extra", {}),
        }


def level1():
    L = Level(1, "Знакомство", "Девочка (WASD) проходит через розовую жижу, Бородач (стрелки) — через золотую. Зелёная губит обоих.", 45)
    L.fill("#", 13, 1, 13, 25).fill("#", 16, 28, 16, 30)
    L.fill("#", 7, 6, 7, 30).fill("#", 10, 1, 10, 3)
    L.fill("P", 19, 8, 19, 9).fill("G", 19, 15, 19, 16)
    L.fill("X", 13, 11, 13, 12)
    L.fill("P", 7, 12, 7, 13).fill("G", 7, 19, 7, 20)
    L.put("a", 18, 2).put("b", 18, 4)
    L.put("A", 6, 25).put("B", 6, 28)
    for r, c, t in [(18, 9, "p"), (18, 16, "g"), (11, 12, "p"), (10, 12, "g"),
                    (12, 20, "p"), (12, 6, "g"), (6, 13, "p"), (6, 20, "g")]:
        L.put(t, r, c)
    return L


def level2():
    L = Level(2, "Лифт и рычаг", "Встань на кнопку — лифт поедет. Рычаг переключается клавишей S / ↓.", 70)
    L.fill("#", 11, 1, 11, 25)
    L.fill("#", 11, 29, 18, 30)
    L.fill("#", 5, 6, 5, 30)
    L.fill("#", 8, 2, 8, 4)
    L.fill("G", 19, 13, 19, 15)
    L.fill("X", 5, 14, 5, 15)
    L.put("a", 18, 2).put("b", 18, 4)
    L.put("A", 4, 24).put("B", 4, 27)
    for r, c, t in [(18, 6, "p"), (18, 14, "g"), (10, 12, "p"), (10, 16, "g"),
                    (4, 10, "p"), (3, 15, "g")]:
        L.put(t, r, c)
    L.obj(type="button", id="b1", x=8, y=18)
    L.obj(type="lever", id="lv1", x=20, y=10)
    L.obj(type="lift", id="lift1", x=26, y=18, w=3, h=1, tx=26, ty=11, speed=90, trigger=["b1", "lv1"])
    return L


def level3():
    L = Level(3, "Разные дороги", "Каждому своя тропа. Рычаг одного открывает ворота другому.", 80)
    L.fill("#", 14, 3, 14, 27)
    L.fill("#", 8, 1, 8, 27)
    L.fill("#", 17, 1, 18, 1)
    L.fill("#", 17, 29, 18, 30)
    L.fill("#", 11, 29, 11, 30)
    L.fill("G", 19, 8, 19, 17)
    L.fill("P", 14, 9, 14, 18)
    L.fill("X", 8, 12, 8, 14)
    L.put("a", 18, 3).put("b", 18, 5)
    L.put("A", 7, 4).put("B", 7, 7)
    for r, c, t in [(13, 13, "p"), (13, 21, "p"), (18, 12, "g"), (18, 19, "g"),
                    (7, 10, "p"), (7, 18, "g"), (13, 26, "p"), (18, 27, "g")]:
        L.put(t, r, c)
    L.obj(type="lever", id="L1", x=22, y=13)
    L.obj(type="lever", id="L2", x=21, y=18)
    L.obj(type="gate", id="g1", x=24, y=15, w=1, h=4, trigger=["L1"])
    L.obj(type="gate", id="g2", x=25, y=9, w=1, h=5, trigger=["L2"])
    return L


def level4():
    L = Level(4, "Ящик над бездной", "Плывущая плита перевезёт через яд. Ящик можно толкать — он поможет забраться выше.", 75)
    L.fill("#", 8, 1, 8, 27)
    L.fill("#", 11, 29, 11, 30)
    L.fill("#", 14, 25, 18, 30)
    L.fill("X", 19, 8, 19, 18)
    L.fill("P", 8, 6, 8, 8).fill("G", 8, 14, 8, 16)
    L.put("a", 18, 2).put("b", 18, 4)
    L.put("A", 7, 2).put("B", 7, 4)
    for r, c, t in [(15, 12, "g"), (15, 14, "p"), (13, 27, "p"), (13, 29, "g"),
                    (7, 7, "p"), (7, 15, "g"), (7, 20, "p"), (7, 22, "g")]:
        L.put(t, r, c)
    L.obj(type="platform", id="m1", x=7, y=16, w=3, h=1, tx=17, ty=16, speed=70)
    L.obj(type="box", id="box1", x=21, y=18)
    return L


def level5():
    L = Level(5, "Храм двоих", "Финал: ящик на кнопку, лифт наверх, рычаг к дверям. Собери всё!", 110)
    L.fill("#", 10, 1, 10, 26)
    L.fill("#", 10, 30, 18, 30)
    L.fill("#", 5, 1, 5, 8)
    L.fill("#", 6, 13, 6, 16)
    L.fill("P", 19, 18, 19, 20).fill("G", 19, 22, 19, 24)
    L.fill("X", 10, 19, 10, 21)
    L.put("a", 18, 1).put("b", 18, 2)
    L.put("A", 9, 3).put("B", 9, 5)
    for r, c, t in [(18, 19, "p"), (18, 23, "g"), (18, 8, "p"), (18, 13, "g"),
                    (5, 14, "p"), (5, 15, "g"), (9, 17, "p"), (9, 23, "g")]:
        L.put(t, r, c)
    L.obj(type="box", id="box1", x=4, y=18)
    L.obj(type="button", id="b1", x=10, y=18)
    L.obj(type="gate", id="g1", x=16, y=11, w=1, h=8, trigger=["b1"])
    L.obj(type="platform", id="lift1", x=27, y=18, w=3, h=1, tx=27, ty=10, speed=70)
    L.obj(type="lever", id="lv1", x=12, y=9)
    L.obj(type="gate", id="g2", x=8, y=6, w=1, h=4, trigger=["lv1"])
    return L


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "shared" / "levels.json"
    levels = [f().to_dict() for f in (level1, level2, level3, level4)]
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from campaign import build_campaign, build_boss
    pars = json.loads(PARS.read_text(encoding="utf-8")) if PARS.exists() else {}
    solutions = {}
    L5, s5 = build_boss(5, 5005)
    L5.par = pars.get("5", 150)
    levels.append(L5.to_dict())
    solutions[5] = s5
    for L, script in build_campaign():
        L.par = pars.get(str(L.id), 60)
        levels.append(L.to_dict())
        solutions[L.id] = script
    from race import build_races
    for d, script in build_races():
        d["par"] = pars.get(str(d["id"]), 60)
        levels.append(d)
        solutions[d["id"]] = script
    SOLUTIONS.write_text(json.dumps(solutions, ensure_ascii=False, indent=1), encoding="utf-8")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(levels, ensure_ascii=False, indent=1), encoding="utf-8")
    js = out.parent.parent / "client" / "levels.js"
    js.write_text("window.EMBEDDED_LEVELS = " + json.dumps(levels, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"Сохранено уровней: {len(levels)} -> {out} и {js}")


if __name__ == "__main__":
    main()
