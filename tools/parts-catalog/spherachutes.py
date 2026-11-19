#!/usr/bin/env python3
"""Writes extra/spherachutes.orc: Spherachutes' hemispherical parachutes and drogues, from Spherachutes' own listings.

Source (retrieved 2026-11-19): Spherachutes' store, https://spherachutes.com/collections/parachutes (its products.json,
the same text as each product page, e.g. https://spherachutes.com/products/4-5-inch-spherachute), and its descent rate
chart page, https://spherachutes.com/pages/decent-rate-chart ("Based on a 16-22 ft/sec descent", "Cd Rate: 0.75").

A Spherachute's size is the canopy measured across its cloth (the 36 in. one is 22.92 in. across when open). The
Cd of 0.75 is on that size: Spherachutes' own payload range for the 36 in. (1.6-2.8 lb at 16-22 ft/s, 5,000 ft) gives
about 0.8 on it and about 2 on the open diameter. So each is listed at its size, with Cd 0.75; the Apex drogues at
Spherachutes' Cd 0.61, their size taken from the part number (AD-12 ... AD-30), as Spherachutes gives none.

Weights are the listings' body weights; lines are the gore counts (the Apex drogue's three). The packed sizes are
boxes, not cylinders, and are left out. Ultralight sizes without a stated weight (108 and 168 in.) are left out. Part
numbers are the store's SKUs (the -W variants, with weather-balloon attachments, are not listed separately); the minis
have none and are listed as HS-4.5 and so on.
"""
from chutes import write

# size in., gores, Classic oz, Heavy Duty oz, Ultralight oz (None: that style isn't sold or has no weight listed)
HEMI = [
    (18, 6, 0.6, 0.9, 0.2), (24, 6, 1.1, 1.3, 0.4), (30, 6, 1.2, 1.8, 0.6), (36, 6, 1.8, 2.3, 0.8), (42, 8, 2.7, 3.2, 1.2),
    (48, 8, 3.1, 3.7, 1.5), (54, 8, 3.8, 4.6, 1.7), (60, 8, 5, 5.6, 2.1), (66, 8, 5.2, 6.4, 2.6), (72, 8, 5.9, 7.1, 2.9),
    (84, 12, 7.2, None, 4.6), (96, 12, 13, None, 5.3), (108, 12, 16, None, None), (120, 12, 19, None, 7.7),
    (144, 18, 28.6, None, 11.7), (168, 18, 39, None, None), (192, 18, 53, None, 27),
]
STYLE = {"CL": "Classic", "HD": "Heavy Duty", "UL": "Ultralight"}
rows = []
for s, g, *w in HEMI:
    for code, oz in zip(STYLE, w):
        if oz:
            rows.append((f"HS-{s:03d}-{code}", f"Parachute, hemispherical, {STYLE[code]}, {s} in. (Cd 0.75, Spherachutes)", s, 0.75, g, oz, None, None))
for s, oz in [(4.5, 0.2), (5.5, 0.25), (6.5, 0.3)]:
    rows.append((f"HS-{s}", f"Parachute, hemispherical mini, {s} in. (Cd 0.75, Spherachutes)", s, 0.75, 6, oz, None, None))
for pn, s, oz, size in [("AD-12-SM", 12, 1.2, "Small"), ("AD-18-MD", 18, 1.9, "Medium"), ("AD-24-LG", 24, 2.8, "Large"), ("AD-30-XL", 30, 4.1, "Extra Large")]:
    rows.append((pn, f"Drogue, Apex, {size} (Cd 0.61, Spherachutes)", s, 0.61, 3, oz, None, None))

if __name__ == "__main__":
    write("spherachutes", "Spherachutes", rows, "Spherachutes' hemispherical parachutes and Apex drogues, from Spherachutes' own listings.")
