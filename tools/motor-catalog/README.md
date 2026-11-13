# Motor catalog

`build_catalog.py` builds `src/data/motor-catalog.js`, the app's built-in motors: every motor in OpenRocket's motor
database. Python 3, standard library only.

```
git clone --depth 1 -b gh-pages https://github.com/openrocket/motor-database ordb   # motors.db.gz
python3 tools/motor-catalog/build_catalog.py ordb/motors.db.gz --compare   # what would change; writes nothing
python3 tools/motor-catalog/build_catalog.py ordb/motors.db.gz             # write the catalog and the old-id map
```

`motors.db.gz` is the SQLite database OpenRocket downloads and flies, published weekly from
[openrocket/motor-database](https://github.com/openrocket/motor-database): ThrustCurve.org's motors with their data
files, the RASAero motor list (mostly older and out-of-production motors) and a few motors added by hand.

How it chooses:

- **Every maker**: all of the database's motors, under a short brand name (the one uploaded motor files are filed
  under). Left out: NoThrust (a zero-thrust placeholder), and the RASAero list's repeats of ThrustCurve.org motors
  under other names (same brand, diameter and common name, total impulse within 2%), so each motor is listed once,
  with its ThrustCurve.org data.
- **One thrust curve per motor**: of the motor's curves, the one closest to its certified total impulse and burn
  time, with certification files preferred over the manufacturer's and users'.
- **Stable ids**: `a-` plus the id of the motor's certification data file (or, without one, the manufacturer's file,
  then the file with the most points), so the id stays the same when a closer curve is added. Motors with no
  ThrustCurve.org file get `r-` plus maker, name and diameter.
- **Motor system** from the database's type and case: AeroTech RMS, DMS or single-use; Cesaroni Pro-X or Pro-X XL;
  Loki reload; Kosdon; hybrids; other makers' reloads and single-use motors; and "Older data" for the RASAero list.
- **Masses and delays** from the database (its 1000 and 100 delays are plugged placeholders, shown as P).

Motors whose ids change keep working through `src/data/old-motor-ids.js`, which the script rewrites: each old id
points at the same motor (same brand and diameter, the same name or common name, and the same total impulse).
`--compare` lists any motor of the previous catalog that isn't in the new one.

## The catalog shipped now

1,127 motors from OpenRocket's database version 20260920070751: AeroTech 319, Cesaroni 310, AMW 87, Contrail 67,
Loki 63, Gorilla 52, Hypertek 47, Kosdon 30, Estes 25, Ellis Mountain 24, Quest 19, Sky Ripper 17, Apogee 12,
Klima 9, RATT Works 9, West Coast Hybrids 6, Roadrunner 5, Tendera 5, Historical 4, Propulsion Polymers 4,
Rocketvision 4, Public Missiles 3, Southern Cross 3, Alpha Hybrids 1, DEAP EX 1 and Zeveta 1. Every motor of the
previous catalog (1,029: AeroTech, Cesaroni, Loki and Estes) is in it: 685 under the same id, 344 under a new one.
108 of those use a different curve now (the closest to the certified figures in today's data); 15 changed total
impulse by more than 2%, the most the AeroTech F62T (−11.5%) and F50T (+11%).
