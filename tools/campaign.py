import random

from build_levels import Level

NAMES = [
    "Тихий зал", "Двойные лужи", "Скрипучий рычаг", "Ящик и кнопка", "Ядовитый ручей",
    "Паром над бездной", "Три моста", "Перекрёсток стихий", "Каменные островки", "Сторожевые ворота",
    "Медленный паром", "Долгий коридор", "Зелёная топь", "Лабиринт рычагов", "Танцы на плитах",
    "Старые механизмы", "Сердце храма", "Быстрая переправа", "Испытание двоих", "Последний ключ",
    "Глубины храма", "Шёпот камней", "Мост теней", "Ядовитые залы", "Тень храма",
    "Ледяные залы", "Тёмный спуск", "Зеркальные порталы", "Ветер подземья", "Страж бури",
]

FIRST_HINT = {
    "lever": "Рычаг открывает ворота. Подойди и нажми S / ↓.",
    "box": "Столкни ящик на кнопку — ворота останутся открытыми.",
    "platform": "Плита катается над ядом: запрыгивай, когда она рядом.",
    "pool3": "Широкий яд: прыгай с самого края.",
    "stones": "Островки посреди яда: прыгай с края на край.",
}

BANDS = [
    {"floor": 19, "stand": 18, "gate_y": 14, "gate_h": 5, "plat": 17, "dir": 1, "lo": 6, "hi": 25},
    {"floor": 13, "stand": 12, "gate_y": 8, "gate_h": 5, "plat": 11, "dir": -1, "lo": 8, "hi": 23},
    {"floor": 7, "stand": 6, "gate_y": 1, "gate_h": 6, "plat": 5, "dir": 1, "lo": 8, "hi": 23},
]

LENGTH = {"pool2": 2, "pool3": 3, "stones": 7, "lever": 3, "box": 7, "platform": None, "cp": 2, "ice": 6, "portal": 5}

BOSS_BANDS = [
    {"floor": 19, "stand": 18, "gate_y": 14, "gate_h": 5, "plat": 17, "dir": 1, "lo": 6, "hi": 64},
    {"floor": 13, "stand": 12, "gate_y": 8, "gate_h": 5, "plat": 11, "dir": -1, "lo": 8, "hi": 62, "m": 71},
    {"floor": 7, "stand": 6, "gate_y": 1, "gate_h": 6, "plat": 5, "dir": 1, "lo": 8, "hi": 63},
]

BOSSES = {
    5: {"k": 0, "name": "Каменный страж", "style": 0, "hp": 3,
        "hint": "Первый босс! Длинный путь с контрольными точками, в конце — страж. Встаньте одновременно каждый на свою руну, чтобы ударить его. Розовые капли опасны бородачу, золотые — девочке, зелёные — обоим.",
        "rate": [2.8, 2.3, 1.8], "multi": [1, 1, 1], "speed": 0.4, "rollers": 0},
    10: {"k": 4, "name": "Огненный идол", "style": 1, "hp": 3,
         "hint": "Огненный идол кидается каплями чаще. Контрольные точки сохраняют путь.",
         "rate": [2.5, 2.0, 1.5], "multi": [1, 1, 2], "speed": 0.5, "rollers": 0},
    15: {"k": 9, "name": "Нефритовый змей", "style": 2, "hp": 3,
         "hint": "Новое: по полу арены катятся шары — перепрыгивайте их.",
         "rate": [2.3, 1.8, 1.4], "multi": [1, 2, 2], "speed": 0.65, "rollers": 4.5},
    20: {"k": 14, "name": "Ледяной владыка", "style": 3, "hp": 3,
         "hint": "Ледяной владыка быстрее и злее. Держитесь вместе.",
         "rate": [1.9, 1.5, 1.1], "multi": [1, 2, 3], "speed": 0.8, "rollers": 3.6},
    35: {"k": 29, "name": "Страж бури", "style": 6, "hp": 4,
         "hint": "Финал второй главы! Страж бури: четыре удара, ливень капель и шары. Держитесь вместе.",
         "rate": [1.5, 1.2, 0.95, 0.8], "multi": [2, 2, 3, 3], "speed": 1.1, "rollers": 2.4},
    25: {"k": 19, "name": "Король храма", "style": 4, "hp": 4,
         "hint": "Король храма держится четыре удара. Капли и шары летят со всех сторон.",
         "rate": [1.8, 1.4, 1.1, 0.9], "multi": [1, 2, 2, 3], "speed": 0.9, "rollers": 3.0},
    30: {"k": 24, "name": "Тень храма", "style": 5, "hp": 4,
         "hint": "Финальный босс! Тень храма быстрая и беспощадная. Пройдите её вместе — и храм ваш.",
         "rate": [1.6, 1.3, 1.0, 0.85], "multi": [2, 2, 3, 3], "speed": 1.0, "rollers": 2.6},
}


def col(band, u):
    return u if band["dir"] > 0 else band.get("m", 31) - u


def ctr(band, f):
    return f if band["dir"] > 0 else band.get("m", 31) + 1 - f


def seg_len(seg):
    if seg["kind"] == "platform":
        return seg["w"] + 3
    return LENGTH[seg["kind"]]


def unlocked(k):
    kinds = [("pool2", 4), ("lever", 2)]
    if k >= 3:
        kinds.append(("box", 2))
    if k >= 5:
        kinds.append(("platform", 2))
    if k >= 8:
        kinds.append(("pool3", 2 + k // 6))
    if k >= 11:
        kinds.append(("stones", 2 + k // 6))
    if k >= 25:
        kinds += [("ice", 4), ("portal", 4)]
    return kinds


def first_kind(k):
    return {3: "box", 5: "platform", 8: "pool3", 11: "stones", 1: "lever"}.get(k)


def plan_level(k, rng):
    target = min(3 + k // 2, 9)
    forced = first_kind(k)
    kinds = unlocked(k)
    picks = [forced] if forced else []
    while len(picks) < target:
        pool = [n for n, w in kinds for _ in range(w)]
        picks.append(rng.choice(pool))
    rng.shuffle(picks)
    if k == 19:
        picks = ["platform", "stones", "box", "pool3", "lever", "pool3"]
    segs = []
    for kind in picks:
        s = {"kind": kind}
        if kind == "pool2":
            s["t"] = rng.choice("PGX" if k > 2 else "PG")
        if kind == "platform":
            s["w"] = min(4 + k // 4, 7)
            s["speed"] = 55 + k * 2 if k < 19 else min(95 + (k - 19) * 2, 105)
        segs.append(s)
    placed = [[], [], []]
    turn = 0
    for s in segs:
        for attempt in range(3):
            bi = (turn + attempt) % 3
            b = BANDS[bi]
            start = placed[bi][-1]["u"] + seg_len(placed[bi][-1]) + 4 if placed[bi] else b["lo"]
            if s["kind"] == "platform":
                start = max(start, b["lo"] + 2)
            if start + seg_len(s) - 1 <= b["hi"]:
                s["u"] = start
                placed[bi].append(s)
                break
        turn += 1
    return placed


def emit(L, placed, bands, rng):
    script = {}
    occupied = [set() for _ in bands]
    plat_index = 0
    gem_owner = 0
    for bi, band in enumerate(placed):
        b = bands[bi]
        for s in band:
            u = s["u"]
            for x in range(u - 1, u + seg_len(s) + 1):
                occupied[bi].add(x)
            if s["kind"] in ("pool2", "pool3"):
                n = 2 if s["kind"] == "pool2" else 3
                t = s.get("t", "X")
                for i in range(n):
                    L.put(t, b["floor"], col(b, u + i))
                if t in "PG":
                    L.put("p" if t == "P" else "g", b["stand"], col(b, u))
            elif s["kind"] == "stones":
                for i in (0, 1, 5, 6):
                    L.put("X", b["floor"], col(b, u + i))
            elif s["kind"] == "lever":
                L.obj(type="lever", id=f"lv{bi}{u}", x=col(b, u), y=b["stand"])
                L.obj(type="gate", id=f"gt{bi}{u}", x=col(b, u + 2), y=b["gate_y"], w=1, h=b["gate_h"], trigger=[f"lv{bi}{u}"])
            elif s["kind"] == "box":
                L.obj(type="box", id=f"bx{bi}{u}", x=col(b, u), y=b["stand"])
                L.obj(type="button", id=f"bt{bi}{u}", x=col(b, u + 3), y=b["stand"])
                L.obj(type="gate", id=f"gb{bi}{u}", x=col(b, u + 6), y=b["gate_y"], w=1, h=b["gate_h"], trigger=[f"bt{bi}{u}"])
            elif s["kind"] == "ice":
                for i in range(4):
                    L.put("I", b["floor"], col(b, u + i))
                L.put("X", b["floor"], col(b, u + 4))
                L.put("X", b["floor"], col(b, u + 5))
            elif s["kind"] == "portal":
                L.obj(type="portal", id=f"pa{bi}{u}", to=f"pb{bi}{u}", x=col(b, u), y=b["stand"] - 1, hue=190)
                L.obj(type="portal", id=f"pb{bi}{u}", x=col(b, u + 4), y=b["stand"] - 1, hue=290)
                L.fill("#", b["gate_y"], col(b, u + 2), b["stand"], col(b, u + 2))
            elif s["kind"] == "cp":
                L.obj(type="checkpoint", id=f"cp{bi}{u}", x=min(col(b, u), col(b, u + 1)), y=b["stand"])
            elif s["kind"] == "platform":
                w = s["w"]
                for i in range(w):
                    L.put("X", b["floor"], col(b, u + i))
                near = sorted([col(b, u - 1), col(b, u)])[0]
                far = sorted([col(b, u + w - 1), col(b, u + w)])[0]
                L.obj(type="platform", id=f"pl{bi}{u}", x=near, y=b["plat"], w=2, h=1, tx=far, ty=b["plat"], speed=s["speed"])
                L.put("p" if gem_owner % 2 == 0 else "g", b["plat"] - 1, col(b, u + w // 2))
                gem_owner += 1
                s["index"] = plat_index
                plat_index += 1

        free = [u for u in range(b["lo"], b["hi"] + 1) if u not in occupied[bi]]
        rng.shuffle(free)
        for u in free[:max(2, (b["hi"] - b["lo"]) // 10)]:
            c = col(b, u)
            if L.g[b["stand"]][c] == ".":
                L.put("p" if gem_owner % 2 == 0 else "g", b["stand"], c)
                gem_owner += 1

    for who in "gb":
        for bi, band in enumerate(placed):
            sc = []
            b = bands[bi]
            D = "R" if b["dir"] > 0 else "L"
            J = f"jump {who} {D} 0.35" if bi < 2 else f"hop {who} {D} 0.42"
            for s in band:
                u = s["u"]
                k_ = s["kind"]
                if k_ in ("pool2", "pool3"):
                    t = s.get("t", "X")
                    safe = (t == "P" and who == "g") or (t == "G" and who == "b")
                    if not safe:
                        jj = J if (bi < 2 or k_ == "pool2") else f"hop {who} {D} 0.52"
                        sc += [f"gotoc {who} {ctr(b, u - 0.6):.2f}", jj]
                elif k_ == "stones":
                    sc += [f"gotoc {who} {ctr(b, u - 0.6):.2f}", J,
                           f"gotoc {who} {ctr(b, u + 4.4):.2f}", J]
                elif k_ == "ice":
                    sc += [f"runjump {who} {D} {ctr(b, u + 3.15):.2f}"]
                elif k_ == "portal":
                    sc += [f"walkport {who} {D}"]
                elif k_ == "lever":
                    if who == "g":
                        sc += [f"gotoc {who} {ctr(b, u + 0.5):.2f}", f"act {who}", "wait 0.5"]
                elif k_ == "box":
                    if who == "g":
                        sc += [f"gotoc {who} {ctr(b, u - 1):.2f}", f"gotoc {who} {ctr(b, u + 3.0):.2f}", "wait 0.7", J]
                    else:
                        sc += [f"gotoc {who} {ctr(b, u + 2.2):.2f}", J]
                elif k_ == "platform":
                    w = s["w"]
                    sc += [f"gotoc {who} {ctr(b, u - 2.0):.2f}", f"waitm {s['index']} 0", f"hop {who} {D} 0.22",
                           f"waitm {s['index']} 1", f"gotoc {who} {ctr(b, u + w + 2.5):.2f}"]
            script[(who, bi)] = sc
    return script


def build(lid, k, seed):
    rng = random.Random(seed)
    placed = plan_level(k, rng)
    kinds_here = {s["kind"] for band in placed for s in band}
    fk = first_kind(k)
    hint = FIRST_HINT.get(fk) if fk else None
    if not hint:
        hint = f"Сложность {k + 6} из 30. " + rng.choice([
            "Действуйте по очереди.", "Не торопитесь у края.", "Сначала думай, потом прыгай.",
            "Кристаллы — для трёх звёзд.", "Один открывает, другой проходит.",
        ])
    L = Level(lid, NAMES[k], hint, 0)
    L.fill("#", 13, 1, 13, 25).fill("#", 16, 28, 16, 30)
    L.fill("#", 7, 6, 7, 30).fill("#", 10, 1, 10, 3)
    L.put("a", 18, 2).put("b", 18, 4)
    L.put("A", 6, 25).put("B", 6, 28)

    script = emit(L, placed, BANDS, rng)
    lines = {"g": [], "b": []}
    for who in "gb":
        sc = lines[who]
        for bi in range(3):
            sc += script[(who, bi)]
            if bi == 0:
                sc += [f"gotoc {who} 26.5", f"jump {who} R 0.2", f"gotoc {who} 28.5", f"jumpthen {who} 0.3 L 0.3"]
            elif bi == 1:
                sc += [f"gotoc {who} 5.5", f"jump {who} L 0.2", f"gotoc {who} 3.5", f"jumpthen {who} 0.3 R 0.3"]
            else:
                sc += [f"gotoc {who} {25.5 if who == 'g' else 28.5}"]
    script_lines = lines["g"] + lines["b"] + ["wait 1"]

    if k % 2 == 1:
        L.g = [list(reversed(r)) for r in L.g]
        for o in L.objects:
            w = o.get("w", 1)
            o["x"] = 31 - o["x"] - w + 1
            if "tx" in o:
                o["tx"] = 31 - o["tx"] - w + 1
        mirrored = []
        for line in script_lines:
            p = line.split()
            if p[0] == "gotoc":
                p[2] = f"{32 - float(p[2]):.2f}"
            p = [{"L": "R", "R": "L"}.get(x, x) for x in p]
            mirrored.append(" ".join(p))
        script_lines = mirrored
    return L, script_lines, kinds_here


def plan_boss(k, rng):
    kinds = [kd for kd in unlocked(k) if kd[0] != "platform" or k >= 5]
    placed = [[], [], []]
    for bi, b in enumerate(BOSS_BANDS):
        u = b["lo"]
        first = True
        count = 0
        while True:
            if first and bi > 0:
                s = {"kind": "cp"}
                first = False
            elif bi == 0 and count == 3:
                s = {"kind": "cp"}
            else:
                pool = [n for n, w in kinds for _ in range(w)]
                kind = rng.choice(pool)
                s = {"kind": kind}
                if kind == "pool2":
                    s["t"] = rng.choice("PGX")
                if kind == "platform":
                    s["w"] = min(4 + k // 4, 7)
                    s["speed"] = 55 + k * 2
            start = u
            if s["kind"] == "platform":
                start = max(start, b["lo"] + 2)
            if start + seg_len(s) - 1 > b["hi"]:
                break
            s["u"] = start
            placed[bi].append(s)
            u = start + seg_len(s) + 4
            count += 1
    return placed


def build_boss(lid, seed):
    rng = random.Random(seed)
    info = BOSSES[lid]
    k = info["k"]
    placed = plan_boss(k, rng)
    L = Level(lid, "Босс: " + info["name"], info["hint"], 0, width=100)
    L.fill("#", 13, 1, 13, 65).fill("#", 16, 68, 16, 70).fill("#", 8, 71, 18, 71)
    L.fill("#", 7, 6, 7, 71).fill("#", 10, 1, 10, 3)
    L.fill("#", 16, 76, 16, 77).fill("#", 16, 87, 16, 88).fill("#", 13, 80, 13, 84)
    L.fill("#", 1, 93, 13, 98)
    L.put("a", 18, 2).put("b", 18, 4)
    L.put("A", 18, 95).put("B", 18, 97)
    L.put("p", 12, 82).put("g", 15, 77)

    script = emit(L, placed, BOSS_BANDS, rng)
    L.obj(type="checkpoint", id="cp_arena", x=67, y=6)
    plates = [[74, 18, 90, 18], [76, 15, 88, 15], [80, 12, 84, 12], [74, 18, 90, 18]][:info["hp"]]
    L.obj(type="boss", id="boss", x=82, y=3, hp=info["hp"], arena=[72, 92], plates=plates,
          rate=info["rate"], multi=info["multi"], speed=info["speed"], name=info["name"],
          style=info["style"], rollers=info["rollers"])
    L.obj(type="gate", id="bossgate", x=93, y=14, w=1, h=5, trigger=["boss"])

    lines = {"g": [], "b": []}
    for who in "gb":
        sc = lines[who]
        for bi in range(3):
            sc += script[(who, bi)]
            if bi == 0:
                sc += [f"gotoc {who} 66.5", f"jump {who} R 0.2", f"gotoc {who} 68.5", f"jumpthen {who} 0.3 L 0.3"]
            elif bi == 1:
                sc += [f"gotoc {who} 5.5", f"jump {who} L 0.2", f"gotoc {who} 3.5", f"jumpthen {who} 0.3 R 0.3"]
        sc += [f"gotoc {who} {74.5 if who == 'g' else 90.5}", "wait 1.2"]
    tail = [
        "hop g R 0.3", "gotoc g 76.5",
        "hop b L 0.3", "gotoc b 88.5", "wait 1.5",
        "hop g R 0.45", "gotoc g 80.5",
        "hop b L 0.45", "gotoc b 84.5", "wait 2.5",
    ]
    if info["hp"] > 3:
        tail += ["gotoc g 78", "gotoc g 74.5", "gotoc b 86", "gotoc b 90.5", "wait 2.5"]
    tail += ["gotoc g 95.5", "gotoc b 97.5", "wait 1"]
    return L, lines["g"] + lines["b"] + tail


def build_ch2(lid, k, seed):
    rng = random.Random(seed)
    kinds = unlocked(k)
    target = 6
    picks = ["ice", "portal"]
    while len(picks) < target:
        pool = [n for n, w in kinds for _ in range(w)]
        picks.append(rng.choice(pool))
    rng.shuffle(picks)
    segs = []
    for kind in picks:
        s = {"kind": kind}
        if kind == "pool2":
            s["t"] = rng.choice("PGX")
        if kind == "platform":
            s["w"] = 6
            s["speed"] = 90 + (k - 25) * 4
        segs.append(s)
    placed = [[], [], []]
    turn = 0
    for s in segs:
        for attempt in range(3):
            bi = (turn + attempt) % 3
            b = BANDS[bi]
            start = placed[bi][-1]["u"] + seg_len(placed[bi][-1]) + 4 if placed[bi] else b["lo"]
            if s["kind"] == "platform":
                start = max(start, b["lo"] + 2)
            if start + seg_len(s) - 1 <= b["hi"]:
                s["u"] = start
                placed[bi].append(s)
                break
        turn += 1
    hints = {
        25: "Глава 2. Лёд скользкий: разгоняйся и прыгай заранее. Вентиляторы поднимают вверх.",
        26: "Темно! Свет есть только вокруг вас и у факелов. Двигайтесь осторожно.",
        27: "Порталы переносят сквозь стены: просто зайди в голубой.",
        28: "Темнота, лёд и порталы сразу. Сложность растёт!",
    }
    L = Level(lid, NAMES[k], hints.get(k, ""), 0)
    L.fill("#", 13, 1, 13, 25).fill("#", 7, 6, 7, 30)
    L.obj(type="fan", id="fan1", x=27, y=12, w=3, h=7)
    L.obj(type="fan", id="fan2", x=2, y=6, w=3, h=7)
    L.put("a", 18, 2).put("b", 18, 4)
    L.put("A", 6, 25).put("B", 6, 28)
    if k in (26, 28):
        L.extra = {"dark": True}
    script = emit(L, placed, BANDS, rng)
    lines = {"g": [], "b": []}
    for who in "gb":
        sc = lines[who]
        for bi in range(3):
            sc += script[(who, bi)]
            if bi == 0:
                sc += [f"gotoc {who} 28.5", "wait 1.4", f"gotoc {who} 25.0"]
            elif bi == 1:
                sc += [f"gotoc {who} 3.5", "wait 1.4", f"gotoc {who} 6.8"]
            else:
                sc += [f"gotoc {who} {25.5 if who == 'g' else 28.5}"]
    return L, lines["g"] + lines["b"] + ["wait 1"]


def build_campaign(first_id=6, seeds=None):
    seeds = seeds or {}
    out = []
    for k in range(30):
        lid = first_id + k
        if 31 <= lid <= 34:
            L, script = build_ch2(lid, k, seeds.get(lid, 3000 + lid))
            out.append((L, script))
            continue
        if lid in BOSSES:
            L, script = build_boss(lid, seeds.get(lid, 5000 + lid))
        else:
            L, script, _ = build(lid, k, seeds.get(lid, 1000 + lid))
        out.append((L, script))
    return out
