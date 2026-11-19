#!/usr/bin/env python3
"""Writes extra/b2_skyangle.orc: b2 Rocketry's SkyAngle parachutes as equivalent round chutes, from b2's own tables.

Sources (retrieved 2026-11-19):
  - b2 Rocketry's specifications: https://www.b2rocketry.com/Classic.htm (Classic / Classic II: load capacity, surface
    area, suspension line length, tested Cd, weights) and http://www.b2rocketry.com/parachut.htm, with the descent rate
    chart http://b2rocketry.com/PDF%20files/descent%20chart%2010-02.xls.pdf (the weight each brings down at 17, 20 and
    25 ft/s at sea level, from tests by the Parks College Parachute Research Group, CERT-3 sizes included).
  - The CERT-3 weights and line lengths, from b2's table as CS Rocketry shows it:
    https://www.csrocketry.com/recovery-supplies/skyangle/chutes.html (Drogue 6.0 oz, 24 in.; Large 34 oz, 80 in.;
    XLarge 45 oz, 100 in.; XXLarge 64 oz, 120 in.).

A SkyAngle is a three-line cross-shaped canopy, and b2's Cd is "based on the reference surface area of the circular cap
only", an area b2 doesn't give. So, as with the X-Type (top_flight_xtype.py), each is listed as an equivalent round
chute: its size (its line length) as the diameter, with the Cd that brings b2's own 20 ft/s load down at 20 ft/s in
sea-level air (chutes.cd_from_rating). The drag area is then b2's measured one, whatever the diameter.

b2 publishes no part numbers; the ones here are this app's (SA-<model>-<size>). Three lines each.
"""
from chutes import cd_from_rating, write

# size (line length) in., lb at 20 ft/s, Classic oz, Classic II oz
CLASSIC = [(20, 1.0, 3.0, 5.6), (24, 1.4, 3.5, 6.0), (28, 2.0, 4.0, 7.0), (32, 2.8, 4.5, 7.7), (36, 3.7, 5.0, 8.4),
           (44, 6.1, 7.0, 10.5), (52, 9.5, 9.0, 13.3), (60, 14.2, 10.0, 18.2)]
CERT3 = [("D", "Drogue", 24, 1.4, 6.0), ("L", "Large", 80, 22.4, 34), ("XL", "XLarge", 100, 45.2, 45), ("XXL", "XXLarge", 120, 83.1, 64)]

rows = []
for s, lb, oz1, oz2 in CLASSIC:
    cd = cd_from_rating(s, lb, 20)
    for code, name, oz in (("CL", "Classic", oz1), ("CL2", "Classic II", oz2)):
        rows.append((f"SA-{code}-{s}", f"Parachute, SkyAngle {name} {s} (equivalent round chute, b2's tested load)", s, cd, 3, oz, None, None))
for code, name, s, lb, oz in CERT3:
    rows.append((f"SA-C3-{code}", f"Parachute, SkyAngle CERT-3 {name} (equivalent round chute, b2's tested load)", s, cd_from_rating(s, lb, 20), 3, oz, None, None))

if __name__ == "__main__":
    import sys

    if "--print" in sys.argv:
        for r in rows:
            print(f"{r[0]:12s} {r[2]:4d} in  Cd {r[3]:.2f}  {r[5]} oz")
    write("b2_skyangle", "b2 Rocketry Company", rows, "b2 Rocketry's SkyAngle parachutes as equivalent round chutes, from b2's own tables.")
