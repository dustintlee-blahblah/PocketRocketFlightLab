#!/usr/bin/env python3
"""Writes extra/fruity_chutes.orc: Fruity Chutes' rocket parachutes, from Fruity Chutes' own store listings.

Source (retrieved 2026-11-19): each product's listing in Fruity Chutes' store, https://shop.fruitychutes.com/products.json
(the same text as each product page, e.g. https://shop.fruitychutes.com/products/60-elliptical-parachute-13lb-20fps).
Every figure below is the listing's: the weight, the packing volume (diameter x length where given), the rating and
the gore count. Fruity Chutes states the Cd: "Cd of 2.2" for every Iris, "Cd between 1.5 - 1.6" for the Classic
Elliptical (1.55 is used). The ratings imply about 2.1 for the Iris and 1.3-1.4 for the Elliptical (cd_from_rating, sea-level air): the stated
figures are used.

Part numbers are the store's SKUs without the colour suffix (IFC-36-N-OB, orange/black, is listed as IFC-36-N).
Lines: the gore count (one line per gore). The 168 in. Compact's listing gives "60 oz (44 oz)": 44 oz is used, as
60 oz is the 192 in. size's. The 36 in. HP Compact's packed shape and the packed shape of listings that give only a
volume are left out.
"""
from chutes import write

E = "Classic Elliptical"
# (SKU, size in., kind, weight oz, packed dia in., packed length in., gores)
IRIS = [
    # Iris Ultra Standard ("N")
    ("IFC-36-N", 36, "Iris Ultra Standard", 5, 2.6, 5.2, 8),
    ("IFC-48-N", 48, "Iris Ultra Standard", 7.5, 2.6, 7.8, 8),
    ("IFC-60-N", 60, "Iris Ultra Standard", 10.9, 3.9, 5.1, 12),
    ("IFC-72-N", 72, "Iris Ultra Standard", 13.4, 3.9, 6.2, 12),
    ("IFC-84-N", 84, "Iris Ultra Standard", 19, 3.9, 8.8, 12),
    ("IFC-96-N", 96, "Iris Ultra Standard", 25, 4.9, 7.4, 12),
    ("IFC-120-N", 120, "Iris Ultra Standard", 36, 4.9, 10.6, 12),
    # Iris Ultra Compact ("S"; "SR": the HP Compact)
    ("IFC-30-S", 30, "Iris Ultra Compact", 1.88, None, None, 8),
    ("IFC-36-S", 36, "Iris Ultra Compact", 2.41, None, None, 8),
    ("IFC-36-SR", 36, "Iris Ultra HP Compact", 2.9, None, None, 8),
    ("IFC-48-S", 48, "Iris Ultra Compact", 4.3, None, None, 8),
    ("IFC-60-S", 60, "Iris Ultra Compact", 6.8, None, None, 12),
    ("IFC-72-S", 72, "Iris Ultra Compact", 8.8, None, None, 12),
    ("IFC-84-S", 84, "Iris Ultra Compact", 13.4, None, None, 12),
    ("IFC-96-S", 96, "Iris Ultra Compact", 16.3, None, None, 12),
    ("IFC-120-S", 120, "Iris Ultra Compact", 22, 4.9, 6.8, 12),
    ("IFC-144-S", 144, "Iris Ultra Compact", 31, 5.9, 6.3, 14),
    ("IFC-168-S", 168, "Iris Ultra Compact", 44, 7.4, 5.7, 16),
    ("IFC-192-S", 192, "Iris Ultra Compact", 60, 7.4, 7.5, 18),
    ("IFC-240-S", 240, "Iris Ultra Compact", 101, 7.5, 10.7, 24),
    ("IFC-240-SPR", 240, "Iris Ultra Reinforced", 126, None, None, 24),
    # Iris Light ("SL")
    ("IFC-30-SL", 30, "Iris Light", 1.6, None, None, 6),
    ("IFC-36-SL", 36, "Iris Light", 2.1, None, None, 6),
    ("IFC-42-SL", 42, "Iris Light", 2.9, None, None, 8),
    # Iris Ultralight ("SUL"; "SULR" reinforced, 120 in. and up)
    ("IFC-30-SUL", 30, "Iris Ultralight", 1.34, 1.5, 4.2, 8),
    ("IFC-36-SUL", 36, "Iris Ultralight", 1.73, 1.8, 3.6, 8),
    ("IFC-48-SUL", 48, "Iris Ultralight", 2.62, 1.8, 5.7, 8),
    ("IFC-60-SUL", 60, "Iris Ultralight", 4, 2.6, 4.2, 12),
    ("IFC-66-SUL", 66, "Iris Ultralight", 4.77, 3, 3.7, 10),
    ("IFC-72-SUL", 72, "Iris Ultralight", 5.5, 3, 4.3, 12),
    ("IFC-84-SUL", 84, "Iris Ultralight", 6.9, 3, 5.5, 12),
    ("IFC-96-SUL", 96, "Iris Ultralight", 9, 3.5, 5.2, 12),
    ("IFC-120-SULR", 120, "Iris Ultralight", 12.4, 3.5, 7.1, 12),
    ("IFC-144-SULR", 144, "Iris Ultralight", 17.45, 5, 4.9, 14),
    ("IFC-168-SULR", 168, "Iris Ultralight", 25.8, 5, 7.3, 16),
]
ELLIPTICAL = [
    ("CFC-12-N", 12, E, 1.3, None, None, 8),
    ("CFC-15-N", 15, E, 1.5, None, None, 8),
    ("CFC-18-N", 18, E, 1.7, None, None, 8),
    ("CFC-24-N", 24, E, 2.2, None, None, 8),
    ("CFC-30-N", 30, E, 3.1, None, None, 8),
    ("CFC-36-N", 36, E, 4.5, None, None, 12),
    ("CFC-42-N", 42, E, 5.7, None, None, 12),
    ("CFC-48-N", 48, E, 7.3, None, None, 12),
    ("CFC-60-N", 60, E, 10.0, None, None, 12),
    ("CFC-12-S", 12, E + " Compact", 0.85, None, None, 8),
    ("CFC-15-S", 15, E + " Compact", 1, None, None, 8),
    ("CFC-18-S", 18, E + " Compact", 1.16, None, None, 8),
    ("CFC-24-S", 24, E + " Compact", 1.6, None, None, 8),
    ("CFC-30-S", 30, E + " Compact", 2.1, None, None, 8),
    ("CFC-36-S", 36, E + " Compact", 3.3, None, None, 12),
]

rows = [(pn, f"Parachute, {kind}, {s} in. (Cd 2.2, Fruity Chutes)", s, 2.2, g, oz, pd, pl) for pn, s, kind, oz, pd, pl, g in IRIS]
rows += [(pn, f"Parachute, {kind}, {s} in. (Cd 1.5-1.6, Fruity Chutes)", s, 1.55, g, oz, pd, pl) for pn, s, kind, oz, pd, pl, g in ELLIPTICAL]

if __name__ == "__main__":
    write("fruity_chutes", "Fruity Chutes", rows, "Fruity Chutes' rocket parachutes, from Fruity Chutes' own store listings.")
