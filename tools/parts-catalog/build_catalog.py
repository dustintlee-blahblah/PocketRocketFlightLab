#!/usr/bin/env python3
"""Builds src/data/parts-catalog.js, the builder's parts catalog, from OpenRocket's component files (.orc).

usage: build_catalog.py <folder holding database/ and internal/> [--compare]

See README.md beside this file. Python 3, standard library only.
"""
import glob
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "src", "data", "parts-catalog.js")

LEN = {"in": 0.0254, "mm": 0.001, "cm": 0.01, "m": 1.0, "ft": 0.3048}
MASS = {"kg": 1.0, "g": 0.001, "oz": 0.028349523125, "lb": 0.45359237}
# makers listed under more than one name: one name each
MAKER = {
    "BalsaMachining.com": "BalsaMachining",
    "LOC": "LOC Precision",
    "LOC/Precision": "LOC Precision",
    "SEMROC Astronautics": "SEMROC",
    "Quest Aerospace": "Quest",
}
SHAPES = {"OGIVE": "ogive", "CONICAL": "conical", "ELLIPSOID": "ellipsoid", "PARABOLIC": "parabolic", "POWER": "power", "HAACK": "haack"}
# OpenRocket's part kinds -> the catalog's lists (an engine block is a ring that stops the motor)
KIND = {
    "BodyTube": "tube",
    "NoseCone": "nose",
    "Transition": "transition",
    "TubeCoupler": "coupler",
    "CenteringRing": "ring",
    "EngineBlock": "ring",
    "BulkHead": "bulkhead",
    "LaunchLug": "lug",
    "Parachute": "chute",
    "Streamer": "streamer",
}
ORDER = ["tube", "nose", "transition", "coupler", "ring", "bulkhead", "lug", "chute", "streamer"]


def text(c, tag):
    e = c.find(tag)
    return (e.text or "").strip() if e is not None else ""


def length(c, tag):
    """A length in metres (0 if missing or unreadable)."""
    e = c.find(tag)
    if e is None or not (e.text or "").strip():
        return 0.0
    try:
        return float(e.text) * LEN.get(e.get("Unit") or "m", 1.0)
    except ValueError:
        return 0.0


def mass(c):
    e = c.find("Mass")
    if e is None or not (e.text or "").strip():
        return 0.0
    try:
        return float(e.text) * MASS.get(e.get("Unit") or "kg", 1.0)
    except ValueError:
        return 0.0


def num(c, tag):
    try:
        return float(text(c, tag))
    except ValueError:
        return 0.0


def mm(x):
    return round(x * 1000, 2)


def grams(x):
    return round(x * 1000, 2) if x > 0 else 0


def read_materials(root):
    out = {}
    ms = root.find("Materials")
    for m in ms if ms is not None else []:
        name, kind = text(m, "Name"), text(m, "Type")
        try:
            d = float(text(m, "Density"))
        except ValueError:
            continue
        if (m.get("UnitsOfMeasure") or "").startswith("g/"):
            d /= 1000
        if name and d > 0:
            out[(name, kind)] = d
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    compare = "--compare" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    src = args[0]
    # database/ (the maintained parts files) first; internal/ (OpenRocket's older lists) only adds makers database/ lacks
    files = []
    for sub in ("database", "internal"):
        files += [(sub, f) for f in sorted(glob.glob(os.path.join(src, sub, "*")), key=str.lower) if f.lower().endswith(".orc")]
    if not files:
        sys.exit("no .orc files under " + src)
    roots = [(sub, f, ET.parse(f).getroot()) for sub, f in files]
    shared = {}
    for _, _, r in roots:
        for k, v in read_materials(r).items():
            shared.setdefault(k, v)

    makers, mats, rows = [], [], {k: [] for k in ORDER}
    seen, dropped, main_makers = set(), {}, set()
    drop = lambda why: dropped.__setitem__(why, dropped.get(why, 0) + 1)

    def idx(lst, v):
        if v not in lst:
            lst.append(v)
        return lst.index(v)

    for sub, f, r in roots:
        own = read_materials(r)
        comps = r.find("Components")
        for c in comps if comps is not None else []:
            kind = KIND.get(c.tag)
            if not kind:
                drop("kind not in the builder (" + c.tag + ")")
                continue
            mk = text(c, "Manufacturer")
            mk = MAKER.get(mk, mk)
            pn = re.sub(r"\s+", " ", text(c, "PartNumber"))
            if not mk or not pn:
                drop("no maker or part number")
                continue
            if sub == "database":
                main_makers.add(mk)
            elif mk in main_makers:
                drop("older list of a maker already covered")
                continue
            key = (kind, mk.lower(), pn.lower())
            if key in seen:
                drop("listed twice")
                continue
            desc = re.sub(r"\s+", " ", text(c, "Description"))
            me = c.find("Material")
            mname = (me.text or "").strip() if me is not None else ""
            mkind = (me.get("Type") or "BULK") if me is not None else "BULK"
            dens = own.get((mname, mkind)) or shared.get((mname, mkind)) or 0
            m = mass(c)
            od, idd, ln = length(c, "OutsideDiameter"), length(c, "InsideDiameter"), length(c, "Length")
            row = None
            if kind in ("tube", "coupler", "ring", "lug"):
                if not (od > 0 and 0 < idd < od and ln > 0):
                    drop("impossible size")
                    continue
                # a listed weight sets the density, so the weight follows the length if the part is cut
                vol = math.pi / 4 * (od * od - idd * idd) * ln
                if m > 0 and vol > 0 and kind != "lug":
                    dens = m / vol
                row = [mm(od), mm(idd), mm(ln)]
            elif kind == "bulkhead":
                if not (od > 0 and ln > 0):
                    drop("impossible size")
                    continue
                vol = math.pi / 4 * od * od * ln
                if m > 0:
                    dens = m / vol
                row = [mm(od), mm(ln)]
            elif kind == "nose":
                shape = SHAPES.get(text(c, "Shape").upper())
                if not (od > 0 and ln > 0 and shape):
                    drop("impossible size")
                    continue
                wall = length(c, "Thickness")
                filled = text(c, "Filled").lower() == "true"
                row = [shape, mm(od), mm(ln), mm(length(c, "ShoulderDiameter")), mm(length(c, "ShoulderLength")), 0 if filled else mm(wall), 1 if filled else 0, grams(m)]
            elif kind == "transition":
                shape = SHAPES.get(text(c, "Shape").upper())
                d1, d2 = length(c, "ForeOutsideDiameter"), length(c, "AftOutsideDiameter")
                if not (d1 > 0 and d2 > 0 and ln > 0 and shape and shape != "ellipsoid" and abs(d1 - d2) > 1e-5):
                    drop("impossible size")
                    continue
                wall = length(c, "Thickness")
                filled = text(c, "Filled").lower() == "true"
                row = [shape, mm(d1), mm(d2), mm(ln), mm(length(c, "ForeShoulderDiameter")), mm(length(c, "ForeShoulderLength")), mm(length(c, "AftShoulderDiameter")), mm(length(c, "AftShoulderLength")), 0 if filled else mm(wall), 1 if filled else 0, grams(m)]
            elif kind == "chute":
                dia = length(c, "Diameter")
                if not dia > 0:
                    drop("impossible size")
                    continue
                cd = num(c, "DragCoefficient")
                row = [mm(dia), round(cd, 3) if 0 < cd < 5 else 0, int(num(c, "LineCount")), mm(length(c, "LineLength")), grams(m), mm(length(c, "PackedLength")), mm(length(c, "PackedDiameter"))]
            elif kind == "streamer":
                w, th = length(c, "Width"), length(c, "Thickness")
                if not (ln > 0 and w > 0):
                    drop("impossible size")
                    continue
                # a surface weight (kg/m²): the listed weight over the area, else the bulk density times the thickness
                if m > 0:
                    dens = m / (ln * w)
                elif mkind == "BULK":
                    dens = dens * th
                mkind = "SURFACE"
                row = [mm(ln), mm(w)]
            if not dens > 0:
                mname = ""
            mi = idx(mats, (mname, round(dens, 4 if mkind != "BULK" else 1), mkind[0])) if mname else -1
            seen.add(key)
            rows[kind].append([idx(makers, mk), pn, desc, mi] + row)

    for k in ORDER:
        rows[k].sort(key=lambda r: (makers[r[0]].lower(), r[1].lower()))
    j = lambda v: json.dumps(v, separators=(",", ":"), ensure_ascii=False)
    total = sum(len(rows[k]) for k in ORDER)
    head = f"""/**
 * The builder's parts catalog (generated data; not formatted). Makers' body tubes, nose cones, transitions, couplers,
 * rings, bulkheads, launch lugs, parachutes and streamers: {total} parts from {len(makers)} makers.
 * mk: makers. mt: materials [name, density (kg/m³; kg/m² for cloth), kind B(ulk) or S(urface)]. Then one compact row
 * per part, sizes in mm and weights in g (0 = not listed); every row starts [maker, part number, description, material]:
 *   tube, coupler, ring, lug: outside diameter, inside diameter, length
 *   bulkhead: outside diameter, thickness
 *   nose: shape, base diameter, length, shoulder diameter, shoulder length, wall, solid (1/0), weight
 *   transition: shape, front diameter, aft diameter, length, front shoulder diameter and length, aft shoulder diameter
 *     and length, wall, solid (1/0), weight
 *   chute: diameter, drag coefficient, lines, line length, weight, packed length, packed diameter
 *   streamer: length, width
 * Unpacked into builder parts in builder/parts-catalog.js. Generated by tools/parts-catalog/build_catalog.py from
 * OpenRocket's component files (Dave Cook's openrocket-database, Apache License 2.0, and OpenRocket's own lists,
 * GPL v3, among them H. Craig Miller's parachute files); see THIRD_PARTY_NOTICES.md. Don't edit by hand.
 */
"""
    body = "export const PARTS_DB = {\n  mk: " + j(makers) + ",\n  mt: " + j(mats) + ",\n"
    for k in ORDER:
        body += f"  {k}: [\n" + "".join("    " + j(r) + ",\n" for r in rows[k]) + "  ],\n"
    body += "};\n"
    for k in ORDER:
        print(f"{k:11s} {len(rows[k])}")
    print(f"total {total} parts, {len(makers)} makers, {len(mats)} materials, {len(head + body) // 1024} KB")
    for why, n in sorted(dropped.items(), key=lambda x: -x[1]):
        print(f"  left out: {n:5d}  {why}")
    if compare:
        old = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        print("no change" if old == head + body else "the catalog would change")
        return
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(head + body)
    print("wrote", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
