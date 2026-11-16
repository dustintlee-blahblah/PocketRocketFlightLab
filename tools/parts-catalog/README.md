# Parts catalog

`build_catalog.py` builds `src/data/parts-catalog.js`, the builder's parts catalog: makers' body tubes, nose cones,
transitions, couplers, centering rings, bulkheads, launch lugs, parachutes and streamers. Python 3, standard library
only.

```
unzip -q OpenRocket-24.12.jar 'datafiles/components/*' -d orc        # the .orc files OpenRocket ships
python3 tools/parts-catalog/build_catalog.py orc/datafiles/components --compare   # what would change; writes nothing
python3 tools/parts-catalog/build_catalog.py orc/datafiles/components             # write the catalog
```

The source is OpenRocket's component files (`.orc`, XML): `database/` is Dave Cook's
[openrocket-database](https://github.com/dbcook/openrocket-database) (Apache License 2.0), and `internal/` is
OpenRocket's own lists (GPL v3), among them the parachute makers' files compiled by H. Craig Miller. See
THIRD_PARTY_NOTICES.md.

How it chooses:

- **`database/` first.** A maker listed there is taken from there only; `internal/` adds the makers it lacks
  (parachute makers, FlisKits and others). Makers listed under two names get one.
- **One entry per part number** of a maker and kind; a repeat is left out.
- **Kinds the builder has.** An engine block is listed with the centering rings. Rail buttons are left out (the
  builder has its own sizes).
- **Impossible sizes are left out** (no length, an inside diameter not smaller than the outside, a transition with
  equal ends), and counted in the tool's printout.
- **Weights.** A tube, coupler, ring or bulkhead with a listed weight gets the density that gives that weight, so the
  weight follows the length when the part is cut. A nose cone, transition or parachute keeps its listed weight. A
  streamer's material becomes a weight per area.
- **Units.** Sizes are stored in mm and weights in g; the app converts them to metres and kg when it unpacks a list
  (`src/js/builder/parts-catalog.js`).
