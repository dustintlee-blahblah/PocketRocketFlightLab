#!/usr/bin/env python3
"""Writes extra/rocketman.orc: Rocketman's rocket parachutes, from Rocketman's own store listings.

Source (retrieved 2026-11-19): the product listings in Rocketman's store, https://www.the-rocketman.com/collections/
rocket-parachutes, /collections/drogue and /collections/specialty-chutes (the products.json of each collection, the same
text as the product pages, e.g. https://www.the-rocketman.com/products/rocketman-high-performance-cd-2-2-parachutes).
Every weight, packed size, rating and gore count below is the listing's.

Cd: Rocketman's own figure where it gives one: 2.2 for the High Performance and Ultra-Light High-Performance lines,
1.6 for the Elliptical, 0.97 for the Ultra-Light Parabolic, the Pro Experimental Drogue, the Kevlar and the Ballistic
Mach II. The Standard, Annular and Ring Sail chutes have no stated Cd; theirs is the one Rocketman's own 20 ft/s rating
implies in sea-level air (chutes.cd_from_rating). The Standard's ratings are the same table as the Parabolic's
(Cd 0.97), and imply about 0.8-0.9.

Rocketman publishes no part numbers; the ones here are this app's (RM-<line>-<size>). Sizes without a listed weight are
left out of the Kevlar, Ballistic and Pro Drogue lines (their fabric is unlike the builder's default nylon); the other
lines' few gaps are not listed either. The Standard's ratings stop at 17 ft/s from 30 ft up: those sizes use the
17 ft/s rating. Odd entries in the listings, as written there and not used: the HP 168 in. 25 ft/s rating (21.9), the
store's own gram figures (the body text's weights are used), the Ballistic 5 ft weight without a unit.
"""
from chutes import cd_from_rating, write

OZ_PER_LB = 16
rows = []


def add(line, code, size_in, cd, gores, oz, pd=None, pl=None, note=""):
    ft = size_in / 12
    label = f"{ft:g} ft" if size_in % 12 == 0 else f"{size_in:g} in."
    rows.append((f"RM-{code}-{size_in:g}", f"Parachute, {line}, {label} (Cd {cd:.2f}{note}, Rocketman)", size_in, cd, gores, oz, pd, pl))


# Standard (High, Mid and Low Power): size ft, weight oz, packed D x L in., lb at 20 ft/s (or at 17 from 30 ft)
STD = [
    (1, 1, 2.6, 1.0, 0.40), (2, 1.5, 2.6, 1.5, 1.13), (3, 2.4, 2.6, 2.25, 2.8), (4, 3.5, 2.6, 3.5, 5.0),
    (5, 5.0, 3.0, 4.0, 8.0), (6, 6.0, 3.0, 5.0, 11.5), (7, 8.0, 3.0, 6.5, 15), (8, 10, 4.0, 6.5, 20),
    (9, 12, 4.0, 7.5, 26), (10, 14, 4.0, 8.5, 32), (12, 17, 4.0, 11.0, 43), (14, 27.7, 4.0, 14.0, 60),
    (16, 32, 4.0, 20.0, 80), (18, 36.5, 6.0, 10.0, 100), (19, 45.4, 4.0, 25.0, 112), (20, 50.0, 6.0, 14.0, 124),
    (24, 65.0, 6.0, 18.0, 187), (30, 5.31 * OZ_PER_LB, 8.0, 18.0, None), (40, 8.4 * OZ_PER_LB, 8.0, 26.0, None),
]
STD17 = {30: 219.0, 40: 352.0}
for ft, oz, pd, pl, lb20 in STD:
    cd = cd_from_rating(ft * 12, lb20, 20) if lb20 else cd_from_rating(ft * 12, STD17[ft], 17)
    add("Standard", "STD", ft * 12, cd, 8, oz, pd, pl, ", from Rocketman's rating")

# High Performance CD 2.2: size in., gores, weight oz, packed D x L in.
HP = [
    (24, 8, 3.1, 2.0, 2.75), (30, 8, 3.9, 2.0, 3.34), (36, 8, 4.8, 2.6, 4.52), (48, 8, 7.2, 2.6, 6.78),
    (60, 12, 10.1, 4.0, 4.01), (72, 12, 12.6, 4.0, 5.01), (84, 12, 15.3, 4.0, 6.08), (96, 12, 18.5, 4.0, 7.36),
    (108, 12, 21.5, 4.0, 8.75), (120, 12, 25, 4.0, 11.19), (144, 14, 32.07, 6.0, 5.67), (168, 16, 45.9, 6.0, 8.11),
    (192, 18, 65.17, 6.0, 11.52), (216, 18, 95.58, 8.0, 10.2), (240, 18, 7.8 * OZ_PER_LB, 8.0, 13.92),
    (288, 24, 8.5 * OZ_PER_LB, 8.0, 20.0), (360, 24, 9.6 * OZ_PER_LB, 10.0, 18.0),
]
for s, g, oz, pd, pl in HP:
    add("High Performance", "HP", s, 2.2, g, oz, pd, pl)

# Ultra-Light High-Performance CD 2.2: size in., gores, weight oz (packed volume only: no shape)
ULHP = [(12, 8, 0.3), (18, 8, 0.5), (24, 8, 0.7), (30, 8, 1.1), (36, 8, 1.5), (48, 8, 2.2), (60, 12, 3.4), (72, 12, 4.6),
        (84, 12, 5.95), (96, 12, 7.3), (108, 12, 8.7), (120, 12, 10.4), (144, 14, 12.4), (168, 16, 14.6), (192, 18, 17.7),
        (216, 22, 23.5)]
for s, g, oz in ULHP:
    add("Ultra-Light High-Performance", "ULHP", s, 2.2, g, oz)

# Ultra-Light Parabolic, Cd 0.97, 4 lines: size ft, weight oz
ULP = [(1, 0.32), (2, 0.644), (3, 1.112), (4, 1.67), (5, 2.27), (6, 3.40), (7, 3.72), (8, 4.878), (9, 5.75), (10, 6.57),
       (12, 8.37), (14, 10.82), (16, 12.71), (18, 14.58), (19, 20.885), (20, 21.858)]
for ft, oz in ULP:
    add("Ultra-Light Parabolic", "ULP", ft * 12, 0.97, 4, oz)

# Elliptical, Cd 1.6: size in., weight oz, packed D x L in., gores
ELL = [(12, 1.5, 1.375, 3.5, 8), (18, 1.7, 1.375, 5, 8), (24, 2.1, 1.9, 4.29, 8), (36, 4.4, 2.6, 4.52, 8), (48, 7.2, 2.6, 6.78, 8),
       (60, 9.9, 4.0, 4.01, 12), (72, 12.6, 4.0, 5.01, 12), (84, 15.3, 4.0, 6.08, 12), (96, 18.5, 4.0, 7.36, 12),
       (120, 25, 4.0, 11.19, 12)]
for s, oz, pd, pl, g in ELL:
    add("Elliptical", "ELL", s, 1.6, g, oz, pd, pl)

# Pro Experimental Drogue, Cd 0.97, 4 lines: size ft, weight oz, packed D x L in.
PRO = [(1, 1.6, 2.0, 3.5), (2, 2.7, 2.0, 6.0), (3, 4.5, 2.0, 8.0), (4, 7.7, 3.0, 8.0), (5, 8.5, 3.0, 9.0), (6, 12.2, 4.0, 7.0),
       (7, 14.3, 4.0, 9.0), (8, 18.3, 4.0, 10.0), (9, 21.3, 4.0, 12.0), (10, 22.8, 4.0, 13.0), (12, 29.4, 4.0, 15.0),
       (14, 40, 6.0, 12.0)]
for ft, oz, pd, pl in PRO:
    add("Pro Experimental Drogue", "PRO", ft * 12, 0.97, 4, oz, pd, pl)

# Kevlar Flame Proof, Cd 0.97: size ft, weight oz, packed D x L in.
KEV = [(1, 2.1, 2.0, 7.0), (2, 3.5, 2.6, 4.5), (3, 6.6, 3.0, 6.0), (4, 11.1, 4.0, 5.0), (5, 14.2, 4.0, 6.5), (8, 38.5, 4.0, 18.0)]
for ft, oz, pd, pl in KEV:
    add("Kevlar Flame Proof", "KEV", ft * 12, 0.97, 4, oz, pd, pl)

# Ballistic Mach II, Cd 0.97: size ft, weight oz, packed D x L in. (5 ft: weight written without a unit, left out)
BAL = [(1, 3.3, 3.0, 4.0), (2, 6, 4.0, 5.0), (3, 11.3, 4.0, 7.0), (4, 18, 4.0, 8.5), (6, 31.6, 4.0, 17.0), (7, 40, 6.0, 13.0),
       (12, 160, 8.0, 17.71)]
for ft, oz, pd, pl in BAL:
    add("Ballistic Mach II", "BAL", ft * 12, 0.97, 4, oz, pd, pl)

# Ultra-Light Annular: size ft, gores, weight oz, packed D x L in., lb at 20 ft/s
ANN = [(3, 12, 3.5, 3.0, 2.91, 3.4), (4, 12, 4.7, 3.0, 3.90, 6.0), (5, 14, 6.2, 3.0, 5.15, 9.5), (6, 14, 7.5, 3.0, 6.23, 13.4),
       (7, 16, 8.9, 3.0, 7.40, 18.2), (8, 16, 10.1, 4.0, 4.72, 23.7), (9, 18, 11.6, 4.0, 5.42, 30.0), (10, 18, 12.9, 4.0, 6.03, 36.9),
       (12, 20, 15.6, 4.0, 7.29, 53.5), (14, 20, 18.1, 4.0, 8.46, 72.5), (16, 22, 20.9, 4.0, 9.77, 94.8)]
for ft, g, oz, pd, pl, lb in ANN:
    add("Ultra-Light Annular", "ANN", ft * 12, cd_from_rating(ft * 12, lb, 20), g, oz, pd, pl, ", from Rocketman's rating")

# Checkered Ring Sail: size ft, gores, weight oz, packed D x L in., lb at 20 ft/s
RS = [(2, 10, 1.32, 2.0, 3.0, 1.27), (3, 10, 2.22, 2.0, 4.15, 2.86), (4, 12, 3.76, 2.0, 7.03, 5.11), (5, 12, 5.33, 3.0, 4.43, 7.95),
      (6, 14, 7.58, 3.0, 6.30, 11.5), (7, 14, 15.62, 4.0, 7.30, 15.7), (8, 14, 18.86, 4.0, 8.82, 20.5), (9, 14, 22.36, 4.0, 10.46, 25.8),
      (10, 16, 28.03, 4.0, 13.11, 32), (12, 18, 38.99, 4.0, 18.24, 46), (14, 22, 54.41, 4.0, 26.45, 62.5), (16, 22, 66.0, 6.0, 14.0, 95),
      (18, 22, 80.0, 6.0, 16.0, 135)]
for ft, g, oz, pd, pl, lb in RS:
    add("Checkered Ring Sail", "RS", ft * 12, cd_from_rating(ft * 12, lb, 20), g, oz, pd, pl, ", from Rocketman's rating")

if __name__ == "__main__":
    import sys

    if "--print" in sys.argv:
        for r in rows:
            print(f"{r[0]:14s} Cd {r[3]:.2f}  {r[5]} oz")
    write("rocketman", "Rocketman", rows, "Rocketman's rocket parachutes, from Rocketman's own store listings.")
