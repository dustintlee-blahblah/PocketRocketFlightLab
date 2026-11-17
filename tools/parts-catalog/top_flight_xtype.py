#!/usr/bin/env python3
"""Writes extra/top_flight_xtype.orc: Top Flight Recovery's X-Type parachutes as equivalent round chutes.

usage: top_flight_xtype.py [--print]

OpenRocket models only round parachutes, so its parts files leave the X-Type chutes out (Dave Cook's top_flight.orc
says so). Top Flight publishes no canopy area or drag coefficient for them; what it does publish is a descent-rate
chart: for each size, the range of rocket weights it brings down at its recommended 17 to 22 ft/s. Each size here is
listed at its own size as the diameter, with the drag coefficient that gives the drag area that chart implies:

    a rocket of weight W falling steadily at v has  W = 1/2 rho v^2 CdA,  so  CdA = 2 W / (rho v^2).

The lightest rocket of a range is taken to fall at 17 ft/s and the heaviest at 22 ft/s. The two ends give two
estimates of CdA; the one used is their geometric mean, 2 g sqrt(Wmin Wmax) / (rho 17 22 ft^2/s^2), which brings a
rocket whose weight is the geometric middle of the range down at sqrt(17 x 22) = 19.3 ft/s. The chart states no air
density; sea-level standard air is used (1.225 kg/m3), as such charts usually assume. Cd = CdA / (pi/4 size^2).

The same chart, read the same way, gives Top Flight's round chutes a Cd of about 1.1 to 1.3 at 36 in. and over, well
above the 0.75 to 0.8 usually measured for flat round chutes: the chart is optimistic, and an X-Type listed from it is
likely optimistic by about as much. This is said in README.md beside this file.

Sources (retrieved 2026-11-16; Top Flight's own site could not be reached from where this was written):
  - Top Flight's X-Type descent chart ("X-TYPE 'CHUTES", "Top Flight recommends a descent rate of 17 to 22 ft. per
    sec."), as CS Rocketry shows it: https://www.csrocketry.com/recovery-supplies/top-flight-recovery/x-type.html
  - Sizes and the Ultra X-Type part numbers: https://performancehobbies.com/secure/store.aspx?groupid=39 (X-Type 10 to
    90 in., 10 to 30 in. also in thin mill; Ultra X-Type HD U-XTPar-24 to -90, flat braided shroud lines), and the 18 in.
    Ultra X-Type: https://www.rocketryforum.com/threads/new-top-flight-recovery-products-additions.145815/
  - Thin mill weights and part numbers (XTPAR-12TM 0.18 oz, XTPAR-18TM 0.20 oz, XTPAR-24TM 0.60 oz):
    https://brshobbies.com/top-flight-recovery-12-thin-mill-x-type-nylon-parachute/ (and the 18 and 24 in. pages)
  - Standard part numbers XTPAR-<size>: https://www.sierrafoxhobbies.com/es/parachutes-for-rockets-drones/221-xtpar-36-parachute-top-flight.html

Not published, and set here only for the calculated weight: the line count (8, two at the end of each arm) and the line
length (the chute's size). A chute with a listed weight uses that weight instead. The Ultra X-Type's fabric isn't
given: it is listed in the standard 1.7 oz ripstop, with the same chart (Top Flight gives one chart for its X-Types).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "extra", "top_flight_xtype.orc")

OZ, LB, IN, FT, G = 0.028349523125, 0.45359237, 0.0254, 0.3048, 9.80665
RHO = 1.225
V_LIGHT, V_HEAVY = 17 * FT, 22 * FT

# Top Flight's X-Type chart: size (in.), lightest and heaviest rocket (kg)
CHART = {
    10: (2 * OZ, 3 * OZ),
    18: (4 * OZ, 12 * OZ),
    24: (0.75 * LB, 1 * LB),
    30: (1 * LB, 1.75 * LB),
    36: (1.5 * LB, 2.5 * LB),
    42: (2.5 * LB, 3.5 * LB),
    48: (3.5 * LB, 4.5 * LB),
    54: (4.5 * LB, 5.5 * LB),
    60: (5.5 * LB, 7.5 * LB),
    70: (7.5 * LB, 9.5 * LB),
    80: (9.5 * LB, 12.5 * LB),
    90: (12.5 * LB, 17.5 * LB),
}
STD = "Nylon fabric, ripstop, 1.7 oz actual"
THIN = "Nylon fabric, ripstop, 1.1 oz actual"
# (part number, size in., fabric, line kind, listed weight in oz or None, line name)
LINES_STD = "Nylon Paracord, 110 lb, 1/16 in. dia."
LINES_ULTRA = "Nylon cord, flat braid, 325 lb, 1/8 in."
PARTS = (
    [(f"XTPAR-{s}", s, STD, "X-Type", None, LINES_STD) for s in CHART]
    + [
        ("XTPAR-10TM", 10, THIN, "X-Type, thin mill", None, LINES_STD),
        ("XTPAR-12TM", 12, THIN, "X-Type, thin mill", 0.18, LINES_STD),
        ("XTPAR-18TM", 18, THIN, "X-Type, thin mill", 0.20, LINES_STD),
        ("XTPAR-24TM", 24, THIN, "X-Type, thin mill", 0.60, LINES_STD),
        ("XTPAR-30TM", 30, THIN, "X-Type, thin mill", None, LINES_STD),
    ]
    + [(f"U-XTPAR-{s}", s, STD, "Ultra X-Type HD", None, LINES_ULTRA) for s in CHART if s >= 18]
)


def cd_of(size):
    """The equivalent round-chute Cd of an X-Type of this size (in.), on its size as the diameter. A size the chart
    has no row for (12 in.) takes the mean of the sizes on either side of it."""
    if size not in CHART:
        lo = max(s for s in CHART if s < size)
        hi = min(s for s in CHART if s > size)
        return (cd_of(lo) + cd_of(hi)) / 2
    w1, w2 = CHART[size]
    cda = 2 * G * math.sqrt(w1 * w2) / (RHO * V_LIGHT * V_HEAVY)
    return cda / (math.pi / 4 * (size * IN) ** 2)


def main():
    out = []
    for pn, s, fab, kind, oz, line in PARTS:
        cd = round(cd_of(s), 2)
        note = "" if s in CHART else " (no chart row: the mean of the 10 and 18 in. sizes)"
        mass = f'\n            <Mass Unit="oz">{oz}</Mass>' if oz else ""
        out.append(
            f"""        <!-- {pn}: Cd {cd} from Top Flight's descent chart{note} -->
        <Parachute>
            <Manufacturer>Top Flight Recovery</Manufacturer>
            <PartNumber>{pn}</PartNumber>
            <Description>Parachute, {kind}, {s} in., nylon (equivalent round chute, Cd {cd} from Top Flight's descent chart)</Description>
            <Material Type="SURFACE">{fab}</Material>
            <Diameter Unit="in">{s}.0</Diameter>
            <DragCoefficient>{cd}</DragCoefficient>
            <LineCount>8</LineCount>
            <LineLength Unit="in">{s}.0</LineLength>
            <LineMaterial Type="LINE">{line}</LineMaterial>{mass}
        </Parachute>
"""
        )
        if "--print" in sys.argv:
            print(f"{pn:12s} {s:3d} in  Cd {cd:.2f}  CdA {cd * math.pi / 4 * (s * IN) ** 2:.4f} m2{'  ' + str(oz) + ' oz' if oz else ''}{note}")
    xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!--
top_flight_xtype.orc - Top Flight Recovery X-Type parachutes as equivalent round chutes, for Pocket Rocket Flight Lab.
Generated by top_flight_xtype.py (see it for the method and sources); don't edit by hand.
The drag coefficient is on the chute's size as the diameter and comes from Top Flight's descent-rate chart, read at
17 to 22 ft/s in sea-level air. That chart, read the same way, makes Top Flight's round chutes draggier than flat round
chutes usually are, so these are likely optimistic too.
-->
<OpenRocketComponent>
    <Version>0.1</Version>
    <Materials>
        <Material UnitsOfMeasure="kg/m"><Name>{LINES_STD}</Name><Density>0.00160</Density><Type>LINE</Type></Material>
        <Material UnitsOfMeasure="kg/m"><Name>{LINES_ULTRA}</Name><Density>0.00417</Density><Type>LINE</Type></Material>
        <Material UnitsOfMeasure="kg/m2"><Name>{THIN}</Name><Density>0.0341</Density><Type>SURFACE</Type></Material>
        <Material UnitsOfMeasure="kg/m2"><Name>{STD}</Name><Density>0.0527</Density><Type>SURFACE</Type></Material>
    </Materials>
    <Components>
{"".join(out)}    </Components>
</OpenRocketComponent>
"""
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(xml)
    print("wrote", os.path.normpath(OUT), f"({len(PARTS)} parachutes)")


if __name__ == "__main__":
    main()
