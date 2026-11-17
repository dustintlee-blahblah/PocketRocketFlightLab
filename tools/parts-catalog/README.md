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
- **Slips in the source are not passed on.** The files' material units are not to be trusted (OpenRocket ignores
  them), so densities are read as kg and metres; a cloth weight over 5 kg/m² is taken as grams per square metre. A
  listed weight that makes a tube, ring or bulkhead less than a quarter or more than six times its material's
  density is not believed, and the material's density is used. A material with no believable density is left out,
  and the part keeps the builder's own.
- **Units.** Sizes are stored in mm and weights in g; the app converts them to metres and kg when it unpacks a list
  (`src/js/builder/parts-catalog.js`).

## The app's own additions (`extra/`)

Parts OpenRocket's files leave out, in the same `.orc` format, read after them. Each is written by a script beside
this file; don't edit the `.orc` by hand.

- **Top Flight Recovery X-Type parachutes** (`top_flight_xtype.py` writes `extra/top_flight_xtype.orc`): the X-Type
  (10 to 90 in.), thin mill X-Type (10 to 30 in.) and Ultra X-Type HD (18 to 90 in.), 28 chutes. OpenRocket models
  only round chutes and Top Flight publishes no area or Cd, so each is listed as an equivalent round chute: its size as
  the diameter, with the Cd that gives the drag area Top Flight's descent-rate chart implies (the chart's weight range
  read at 17 to 22 ft/s, sea-level air; the method and sources are in the script). Read the same way, the chart gives
  Top Flight's round chutes a Cd of about 1.1 to 1.3, above the 0.75 to 0.8 usually measured for flat round chutes, so
  these X-Type figures are likely optimistic (a slower descent than the real chute) by about as much. Weights are
  calculated from the fabric and lines, except the three thin mill sizes whose weights retailers list.

```
python3 tools/parts-catalog/top_flight_xtype.py --print   # writes extra/top_flight_xtype.orc, prints each chute's Cd
```
