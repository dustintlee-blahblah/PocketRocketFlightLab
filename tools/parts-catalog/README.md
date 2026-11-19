# Parts catalog

`build_catalog.py` builds `src/data/parts-catalog.js`, the builder's parts catalog: makers' body tubes, nose cones,
transitions, couplers, centering rings, bulkheads, launch lugs, parachutes and streamers. Python 3, standard library
only.

```
unzip -q OpenRocket-24.12.jar 'datafiles/components/*' -d orc        # the .orc files OpenRocket ships
python3 tools/parts-catalog/build_catalog.py orc/datafiles/components --compare   # what would change; writes nothing
python3 tools/parts-catalog/build_catalog.py orc/datafiles/components             # write the catalog
```

The source is Dave Cook's [openrocket-database](https://github.com/dbcook/openrocket-database) (`database/` in the
jar: `.orc` files, XML, Apache License 2.0), and this app's own lists in `extra/`. OpenRocket's own lists (`internal/`,
GPL v3) are not read: since November 2026 the parachute makers they covered are listed in `extra/` from each maker's
own published specifications, and FlisKits (which sells only kits now and publishes no part sizes) and Front Range
Rocket Recovery (custom chutes, no published Cd or weights) are left out. See THIRD_PARTY_NOTICES.md.

How it chooses:

- **Makers listed under two names get one.**
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

## The app's own lists (`extra/`)

Parts gathered for this app from the makers' own published specifications (never from OpenRocket's files), in the same
`.orc` format, read after `database/`. Each is written by a script beside this file that names its sources; don't edit
the `.orc` by hand. Most makers publish no part numbers: those lists use the app's own (RM-, SA-). The shared writer is
`chutes.py`; where a maker states no Cd, it is worked out from the maker's own rating (the weight brought down at a
stated speed, sea-level air).

- **Fruity Chutes** (`fruity_chutes.py`, 50): Iris Ultra Standard, Compact, Light and Ultralight (Cd 2.2, as stated) and
  Classic Elliptical (1.5-1.6 stated; 1.55), with each listing's weight, packed size and gore count. Part numbers are
  the store's SKUs without the colour suffix; designs saved with the older zero-padded numbers (IFC-036-N) still match.
- **Rocketman** (`rocketman.py`, 127): Standard, High Performance and Ultra-Light High-Performance (Cd 2.2), Ultra-Light
  Parabolic, Pro Experimental Drogue, Kevlar and Ballistic Mach II (0.97), Elliptical (1.6), Ultra-Light Annular and
  Checkered Ring Sail (from the ratings).
- **Spherachutes** (`spherachutes.py`, 49): hemispherical Classic, Heavy Duty and Ultralight, and the minis, at Cd 0.75
  on the size (the cloth across), and the Apex drogues (0.61).
- **b2 Rocketry SkyAngle** (`b2_skyangle.py`, 20): Classic, Classic II and CERT-3, as equivalent round chutes (the line
  length as the diameter, the Cd from b2's tested 20 ft/s loads), as b2's own Cd is on an area it doesn't give.

- **Top Flight Recovery X-Type parachutes** (`top_flight_xtype.py` writes `extra/top_flight_xtype.orc`): the X-Type
  (10 to 90 in.), thin mill X-Type (10 to 30 in.) and Ultra X-Type HD (18 to 90 in.), 28 chutes. OpenRocket models
  only round chutes and Top Flight publishes no area or Cd, so each is listed as an equivalent round chute: its size
  (tip to tip) as the diameter, with Cd 0.53 from the measured drag of cross parachutes (Knacke, Parachute Recovery
  Systems Design Manual, Table 5-1: Dc/D0 1.15 to 1.19, CD0 0.60 to 0.85 on the cloth area, so 0.42 to 0.64 on the
  size; the middle is used). Top Flight's own descent chart gave 0.55 to 0.75 until November 2026, but the same chart
  makes Top Flight's round chutes 0.44 at 9 to 15 in. and 1.1 to 1.3 from 36 in. up, so it isn't relied on. Weights are
  calculated from the fabric and lines, except the three thin mill sizes whose weights retailers list.

```
python3 tools/parts-catalog/fruity_chutes.py; python3 tools/parts-catalog/rocketman.py; python3 tools/parts-catalog/spherachutes.py; python3 tools/parts-catalog/b2_skyangle.py
python3 tools/parts-catalog/top_flight_xtype.py --print   # writes extra/top_flight_xtype.orc, prints each chute's Cd
```
