# Motor catalog

`build_catalog.py` builds `src/data/motor-catalog.js`, the app's built-in AeroTech, Cesaroni, Loki Research and Estes
motors, from the [OpenRocket motor database](https://github.com/openrocket/motor-database) (which collects
ThrustCurve.org's data). Python 3, standard library only.

```
git clone https://github.com/openrocket/motor-database
python3 tools/motor-catalog/build_catalog.py motor-database --compare   # what would change; writes nothing
python3 tools/motor-catalog/build_catalog.py motor-database             # write src/data/motor-catalog.js
```

How it chooses:

- **One thrust curve per motor**: of the data files ThrustCurve.org has for a motor, the one closest to the motor's
  certified total impulse and burn time, with certification files preferred over the manufacturer's and users'.
- **Stable ids**: a motor's id is `a-` plus the id of its certification data file (or, without one, the manufacturer's
  file, then the file with the most points), so the id stays the same when a closer curve is added.
- **Masses** from the chosen file's header, as OpenRocket reads them; otherwise the database's figures.

The generated file names the motor-database commit it came from.

## The catalog shipped now

The catalog in the app (1,029 motors) was built before this script, from an older copy of the motor files that no
longer exists in that form, then given the closest-to-certified curves for 17 motors in build 275. The database today
lists 685 motors for these four makers, so `--compare` against the current catalog shows large differences: many
older and out-of-production motors (mostly Cesaroni) are no longer in it, and some names and curves have changed.

Switching the app to a generated catalog is a decision of its own: it drops motors people may have picked (their
designs would need a new motor) and changes some results. Before switching, map the ids of motors that are still
there under a new id in `src/data/old-motor-ids.js`, so saved designs keep their motor.
