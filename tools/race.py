import random

from build_levels import Level

WIDTH = 90
TRACKS = [
    ("Разминка", ["pool2", "wall", "pool2", "ledge", "pool2"]),
    ("Сквозь жижу", ["safe", "pool2", "pool3", "wall", "safe", "pool2", "ledge"]),
    ("Каменные ступени", ["ledge", "stones", "wall", "pool3", "lever", "pool2"]),
    ("Механизмы", ["box", "pool2", "platform", "lever", "pool3"]),
    ("Безумный забег", ["stones", "platform", "wall", "box", "pool3", "ledge"]),
]

LANES = {
    "g": {"floor": 9, "stand": 8, "gate_y": 1, "gate_h": 8, "plat": 7, "deadly": "G", "safe": "P", "gem": "p"},
    "b": {"floor": 19, "stand": 18, "gate_y": 11, "gate_h": 8, "plat": 17, "deadly": "P", "safe": "G", "gem": "g"},
}

LEN = {"pool2": 2, "safe": 4, "pool3": 3, "stones": 7, "wall": 1, "ledge": 5, "lever": 3, "box": 7, "platform": 9}


def plan(kinds, rng):
    segs = []
    u = 7
    cps = 0
    for kind in kinds:
        s = {"kind": kind, "u": u}
        if kind == "platform":
            s["u"] = u + 2
            s["w"] = 6
        segs.append(s)
        u = s["u"] + LEN[kind] + 5
        if cps < 2 and u > 28 + cps * 25:
            segs.append({"kind": "cp", "u": u})
            u += 4
            cps += 1
    return segs, u


def build_track(i, rng):
    name, kinds = TRACKS[i]
    lid = 101 + i
    hint = "Гонка! Кто первым добежит до флага. Каждый в своей дорожке: девочка сверху, бородач снизу."
    L = Level(lid, name, hint, 0, width=WIDTH)
    L.fill("#", 9, 1, 10, WIDTH - 2)
    segs, end = plan(kinds, rng)
    assert end < 82, (name, end)
    script = {}
    plat_i = 0
    for who, ln in LANES.items():
        L.put("a" if who == "g" else "b", ln["stand"], 2)
        sc = []
        for s in segs:
            u, k = s["u"], s["kind"]
            st, fl = ln["stand"], ln["floor"]
            if k == "pool2":
                L.fill(ln["deadly"], fl, u, fl, u + 1)
                sc += [f"gotoc {who} {u - 0.6:.2f}", f"hop {who} R 0.42"]
            elif k == "safe":
                L.fill(ln["safe"], fl, u, fl, u + 3)
                L.put(ln["gem"], st, u + 2)
            elif k == "pool3":
                L.fill("X", fl, u, fl, u + 2)
                sc += [f"gotoc {who} {u - 0.6:.2f}", f"hop {who} R 0.52"]
            elif k == "stones":
                for d in (0, 1, 5, 6):
                    L.put("X", fl, u + d)
                L.put(ln["gem"], st - 2, u + 3)
                sc += [f"gotoc {who} {u - 0.6:.2f}", f"hop {who} R 0.42",
                       f"gotoc {who} {u + 4.4:.2f}", f"hop {who} R 0.42"]
            elif k == "wall":
                L.fill("#", st - 1, u, st, u)
                sc += [f"gotoc {who} {u - 1.3:.2f}", f"hop {who} R 0.45"]
            elif k == "ledge":
                L.fill("#", st - 2, u, st, u + 4)
                L.put(ln["gem"], st - 3, u + 2)
                sc += [f"gotoc {who} {u - 1.6:.2f}", f"hop {who} R 0.35"]
            elif k == "lever":
                L.obj(type="lever", id=f"lv{who}{u}", x=u, y=st)
                L.obj(type="gate", id=f"gt{who}{u}", x=u + 2, y=ln["gate_y"], w=1, h=ln["gate_h"], trigger=[f"lv{who}{u}"])
                sc += [f"gotoc {who} {u + 0.5:.2f}", f"act {who}", "wait 0.5"]
            elif k == "box":
                L.obj(type="box", id=f"bx{who}{u}", x=u, y=st)
                L.obj(type="button", id=f"bt{who}{u}", x=u + 3, y=st)
                L.obj(type="gate", id=f"gb{who}{u}", x=u + 6, y=ln["gate_y"], w=1, h=ln["gate_h"], trigger=[f"bt{who}{u}"])
                sc += [f"gotoc {who} {u - 1:.2f}", f"gotoc {who} {u + 3.0:.2f}", "wait 0.7", f"hop {who} R 0.45"]
            elif k == "platform":
                w = s["w"]
                L.fill("X", fl, u, fl, u + w - 1)
                L.obj(type="platform", id=f"pl{who}{u}", x=u - 1, y=ln["plat"], w=2, h=1, tx=u + w - 1,
                      ty=ln["plat"], speed=70 + i * 6)
                L.put(ln["gem"], ln["plat"] - 1, u + w // 2)
                sc += [f"gotoc {who} {u - 2.0:.2f}", f"waitm {plat_i} 0", f"hop {who} R 0.22",
                       f"waitm {plat_i} 1", f"gotoc {who} {u + w + 2.5:.2f}"]
                plat_i += 1
            elif k == "cp":
                L.obj(type="checkpoint", id=f"cp{who}{u}", x=u, y=st, lane="girl" if who == "g" else "boy")
        L.obj(type="finish", id=f"fin{who}", x=86, y=ln["stand"], lane="girl" if who == "g" else "boy")
        sc += [f"gotoc {who} 86.5"]
        script[who] = sc
    d = L.to_dict()
    d["mode"] = "race"
    return d, script["g"] + script["b"] + ["wait 1"]


def build_races():
    rng = random.Random(77)
    return [build_track(i, rng) for i in range(len(TRACKS))]
