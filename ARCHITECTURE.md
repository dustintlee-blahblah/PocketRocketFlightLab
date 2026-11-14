# How Pocket Rocket Flight Lab works

This is a map for people changing the code: how the app is put together, how a flight is computed, where each part of
the physics comes from, and which file to open for what. The README covers building and testing; CONTRIBUTING.md
covers how to send a change.

## The shape of the app

The app is one HTML page. `build.js` takes `src/index.html`, puts the stylesheet in place of its `@@include` line, and
bundles `src/js/main.js` and every module it imports (with esbuild) in place of its `@@bundle` line, giving
`web/pocket-rocket-flight-lab.html`: the page, its CSS and its JavaScript in one document. The same page is the web
version and, wrapped in an Android WebView, the Android app.

- **ES modules.** Each file in `src/js/` and `src/data/` is a module: it imports what it uses from other modules by name
  and exports what they need. ESLint checks every name (`no-undef`, unused imports), and `tools/unused-exports.js`
  finds exports nothing uses.
- **Loading a module only defines things.** A module's top level holds functions, classes and constants that need
  nothing from outside it. What it does when the app opens (wiring up buttons, reading saved settings, the first
  drawing) is in its exported `start()`. `src/js/main.js` imports every module, then calls the `start()`s in a fixed
  order, the order the start-up depends on. Keep it that way: a top-level statement that calls into another module
  could run before that module is ready.
- **Shared state.** A few variables are shared across modules: the design `D`, the conditions `L`, the builder's
  `BLD`, the last run `lastSim`, the chosen motors and so on. Other modules read them through their imports (always
  the current value) and change them with the setter their module exports (`setD(...)`, `setLastSim(...)`), since an
  imported name can't be assigned. Objects like `D` and `L` are also changed in place.
- **`window.__pr`** is a live view of every module's exports, for the tests and the browser console. The tests open
  the page with `window.PR_EXPOSE` set, which also makes each of them a global.
- **Moving code between modules.** `tools/move-code.js` moves declarations (with their comments) from one module to
  another, and `tools/relink.js` then rewrites every module's imports and exports from what it uses. `npm run lint`
  checks the imports are current, that no export is unused, and that no module does anything at load
  (`tools/check-module-tops.js`).
- **No framework.** The UI is HTML in `src/index.html`, updated with plain DOM calls; drawings are `<canvas>`.
- **Offline first.** Everything works without a network except the weather forecast (Open-Meteo) and, in the web
  version, the fonts and the PDF library from a CDN. The Android build bundles those (see `android/app/build.gradle`).
- **SI inside, display units at the edges.** Every value in the design, the conditions and the physics is in SI units
  (m, kg, s, N, rad). `src/js/ui/units.js` converts for display and input (`fmt`, `uname`, `fromDisp`).

## The data

| Name | What it is | Defined in |
|---|---|---|
| `D` | the design the physics flies: body sections, fin sets, masses, recovery, stages, all in SI | `design/defaults.js` |
| `L` | launch conditions: site, rail, wind, weather, deployment settings, dispersion spreads | `design/defaults.js` |
| `BLD` | the rocket builder's parts tree (nose, tubes, fins, mass items...), what the Rocket tab edits | `builder/model.js` |
| motor objects | a motor's thrust curve, masses and size, from the built-in catalog or a loaded file | `motors/` |
| `lastSim` | the last run: the flight's time history (`out`), its summary (`st`), stability, the wind table | `ui/results.js` |
| `lastMC` | the last landing dispersion run | `physics/monte-carlo.js` |

`BLD` is the source of truth for a design; `bldDerive()` (`builder/derive.js`) turns it into `D` after every
change. Opening a file goes the other way: `loadDesignXml()` (`files/open-file.js`) reads an OpenRocket file with
`parseOrk()` (`files/openrocket-import.js`; RockSim files are first rewritten as OpenRocket XML by
`files/rocksim-import.js`) and the builder reads the same XML into parts with `bldFromOrk()` (`builder/ork-read.js`).
Saving writes `BLD` as OpenRocket XML (`builder/ork-export.js`) merged into the original file so that what the app
doesn't edit is kept (`builder/ork-merge.js`).

Settings, the current design and conditions are kept in `localStorage` (`core/storage.js`); recently opened files in
IndexedDB (`files/recent.js`).

## What happens when you tap Launch

1. `runNow()` (`ui/state.js`) reads the fields into `L` and checks the rail length, that each stage has a motor that
   lights, that each motor fits its mount, and that the rocket's lugs or rail buttons suit the pad
   (`ui/launch-warnings.js`, `padGuideCheck()` in `ui/rso-checklist.js`).
2. `runAll()` (`ui/results.js`) works out the static stability (`stability()`, or `stackStability()` (`physics/staging.js`) for a staged
   rocket), flies the rocket with `simulate(D, L, motor, boosterMotor)`, and flies it again at five wind speeds for the
   wind table.
3. `renderResults()` draws the Results tab: the tiles, the flight chart, the animation, the RSO Checklist
   (`ui/rso-checklist.js`) and the flags.
4. `mcAuto()` starts the landing dispersion run (`physics/monte-carlo.js`), which flies the rocket many more times with
   its inputs varied and draws the landing ellipse when done.

## The flight simulation

`simulate()` in `physics/simulate.js` flies a design from the pad to landing.

- **State and integration.** Six degrees of freedom: position, velocity, the rocket's axis direction and its pitch, yaw
  and roll rates. A fourth-order Runge-Kutta step (`rk4Step`), 2 ms on the rail and under thrust, 10 ms coasting and
  up to 0.2 s under a parachute, shortened while a canopy fills or where the drag response is fast.
- **Phases.** On the rail (motion along the rail only), free flight (powered and coasting; a rocket that loses
  stability tumbles, with crossflow drag), then under drogue and main parachutes: deployed at apogee or by the motor's
  ejection charge, after any delay, with a main parachute at a set height for dual deployment. Lower stages separate and are flown down on their own by `flyBooster()`. Side boosters (OpenRocket's
  parallel stages, RockSim's detachable pods) drop away at their set event, taking their structure, motors, pods and
  fins with them (`GsAt()` switches to the aerodynamics without them).
- **Forces and moments.** Thrust from the motor's curve (`motorModel`), with the mass and inertia falling as propellant
  burns; gravity; drag from `cdParts()`; the normal force and its moment from `cnaPartsM()` with the angle of attack;
  pitch damping; fin cant roll forcing and roll damping (`rollPartsM()`); the earth's rotation (`coriolis()`, `physics/wind.js`).
- **Air.** `atmosphere()` (`physics/atmosphere.js`): the U.S. Standard Atmosphere 1976 shifted to the field's measured
  temperature and pressure, with humidity, or a forecast temperature profile aloft. Wind changes with height (a power
  law, or the winds-aloft table) with gusts (`flightWind()`, `physics/wind.js`). Parachutes fill over a distance (`physics/parachutes.js`), and
  each fin's flutter speed is checked against the airspeed (`physics/flutter.js`).
- **Outputs.** `out`, the time history (altitude, speeds, Mach, angle of attack, stability...), and `st`, the summary
  (apogee, maximum speed, rail exit, stability at rail exit and in flight, deployment and landing speeds, drift, fin
  flutter margin, events and warnings).

Everything is deterministic for a given design and conditions; the dispersion run seeds its own random numbers.

## The aerodynamics and where it comes from

`physics/aerodynamics.js` holds the aerodynamic model. `aero(D)` turns a design into geometry (body sections, fin
sets, protuberances, reference area); the functions below use that geometry. Each term's source is cited where it's
computed. In outline (AERODYNAMICS.md has every term, its source at each speed, and how well it's checked):

**Stability (normal force and center of pressure)**
- Barrowman's method (Barrowman 1966/1967): nose, shoulders and boattails from slender-body theory; fins from
  Diederich's formula with Prandtl–Glauert compressibility; fin-body interference. Fin properties are computed by thin
  spanwise strips, so any fin outline works (a trapezoid gives Barrowman's closed forms).
- Fin lift above Mach 1 from supersonic (Ackeret) theory, blended across Mach 0.9–1.5, with the fin's center moving
  toward Barrowman's supersonic location. Checked against the Arcas sounding rocket's measured center of pressure
  (NASA TN D-4013 below Mach 1, TN D-4014 at Mach 1.5–4.6).
- Body lift across the flow: CN = K·(planform area / reference area)·sin²α, with Galejs's K = 1.1. It moves the CP
  forward as the rocket tilts; the static CP includes it at a typical 2°.
- Five or more fins at one station shield each other (factors as OpenRocket uses: 5 fins 0.948 ... more than 8, 0.75).
- `CP_UNC` (2.3% of body length) is the model's measured error against the Arcas data; it gives the margin's
  uncertainty range.

**Drag (zero angle of attack, built up by component)**
- Skin friction: Prandtl–Schlichting turbulent flat plate, rough-wall law blended in by roughness Reynolds number,
  compressibility correction. Form factors from Hoerner (Fluid-Dynamic Drag).
- Nose pressure drag: Hoerner's shoulder-angle rule below the critical Mach number; NASA TR R-100 measurements through
  the transonic and supersonic range. Flares and shoulders above Mach 1: Bonney's cone correlation (via Fleeman).
  A rounded nose tip (`tipCapCd()`) costs nothing below Mach 0.8 and rises to modified Newtonian theory over its
  frontal area by Mach 1.3, with the sharp nose's drag over the rest, as DATCOM builds a spherically blunted cone.
- Base drag: Fleeman's correlation below Mach 0.95; above Mach 1.2, the measured base pressure in NACA TN 3819 (Love):
  bodies of revolution, the effect of a boattail and of fins at the base, and two-dimensional fin trailing edges; less
  the motor nozzle's exit area during the burn. See [AERODYNAMICS.md](AERODYNAMICS.md).
- Boattail separation (Hoerner), fin edges (stagnation pressure, Newtonian and Ackeret wave drag by edge type; blunt
  trailing edges below Mach 1 with Hoerner's two-dimensional base drag, 0.135/∛C_f from each fin's own friction), launch
  lugs and rail buttons (Hoerner protuberance drag), tumbling (Allen–Perkins crossflow).
- Pods and tube fins (`podAero()`, `tubeFinAero()`): each pod's body adds its nose and transition lift, friction,
  pressure and base drag, once per copy; tube fins as OpenRocket models them, with Ribner's lift for a short ring and
  the flow through the tubes from Darcy–Weisbach pipe friction.
- `tests/drag-benchmarks.js` checks the drag model against two NACA reports (RM A53D02, RM E50D28).

## The other parts

- **Rocket builder** (`builder/`): the parts model (`model.js`), the editor's fields (`fields.js`), the parts editor
  (`editor.js`), the side view (`side-view.js`), undo (`undo.js`), turning parts into a design (`derive.js`), reading,
  writing and merging OpenRocket files (`ork-read.js`, `ork-export.js`, `ork-merge.js`), and the tab itself
  (`builder-ui.js`).

- **Motors** (`motors/`): the built-in catalog (`data/motor-catalog.js`, generated; see `tools/motor-catalog/`), RASP
  `.eng` and RockSim `.rse` files, and clusters and airstarts combined into one motor per stage.
- **Wind Tunnel** (`ui/wind-tunnel.js`, on the Rocket tab): the design's drag, normal force and CP against Mach number
  and angle of attack, from the same functions the flight uses (`cdParts()`, `cnaPartsM()`, `normalForceAt()`). The
  shocks and surface pressures in its test section come from `physics/flow-picture.js` (Taylor–Maccoll cone flow,
  second-order shock-expansion), and the streamlines, boundary layer and separated regions from
  `physics/flow-streams.js` (slender-body potential flow, supersonic flow along Mach lines, and the drag model's
  transition and separation rules); both are drawn only and feed no number.
- **Recovery** (`recovery/ejection-charge.js`): black powder charge sizes for each compartment.
- **Flight log** (`flightlog/`): real flights logged with altimeter files (several makers' CSV formats, Excel), compared
  with the prediction, and a drag correction fitted to them.
- **Weather** (`weather/`): the forecast for the site and winds aloft.
- **Report** (`report/pdf-report.js`): the PDF flight report (jsPDF) and file downloads on each platform.
- **Animation** (`animation/`): the flight replayed as a side view, and its video export.

## Reading the code: names and landmarks

The code uses short names, the way the equations it implements do. This section is the key to them.

### Names you will meet everywhere

| Name | Means |
|---|---|
| `D` | the design the physics flies (see The data, above) |
| `L` | the launch conditions |
| `m`, `mb` | the sustainer's (or only) motor and the booster's motor; `mb1` a three-stage rocket's first-stage motor |
| `A` or `G` | the aerodynamic geometry from `aero(D)`: body sections (`segs`), fin sets (`fins`), protuberances (`bumps`), reference area (`Aref`), radius `R`, length `L`. In `simulate()` it is `G`, from `Gat(t)`: the geometry of whatever is still attached at time `t` |
| `S` | static stability: CP, CG and margin, from `stability()` or `stackStability()` |
| `st` | a flight's summary (apogee `maxAlt`, `maxV`, `offRail`, `tb` burnout, `tApo`, events, warnings) |
| `out` | a flight's time series: arrays `t`, `alt`, `vel`, `acc`, `thrust`... of equal length |
| `atm` | the air at a height, from `atmosphere()`: `rho`, `p`, `T`, speed of sound `a` |
| `M`, `v`, `q` | Mach number, airspeed (m/s), dynamic pressure ½ρv² |
| `k`, `p` (builder) | a part and its parent in the builder's tree; `kk` a part with its place worked out by `bldLayout()` |
| `c`, `e` (file readers) | an XML element being read |
| `tg` | a motor target: `"sustainer"`, `"booster"` or `"first"` |

Everything is in SI units (m, kg, s, N, radians) until it is shown; angles the user types are degrees and are converted
where they are read.

### Prefixes

Functions and variables of one feature share a prefix, which also tells you the folder:

| Prefix | Feature | Where |
|---|---|---|
| `bld` | the rocket builder (`bldNew`, `bldFields`, `bldRender`, `bldToOrk`...) | `builder/` |
| `fl` | the flight log (`flList`, `flFit`, `flOpen`...) | `flightlog/flight-log.js` |
| `cal` | drag calibration | `flightlog/drag-calibration.js` |
| `alt` | altimeter files | `flightlog/` |
| `md` | motor delays and the motor configuration picker | `ui/motor-delay.js` |
| `mc` | landing dispersion (Monte Carlo) | `physics/monte-carlo.js` |
| `wt` | the Wind Tunnel | `ui/wind-tunnel.js` |
| `wx` | the weather forecast | `weather/forecast.js` |
| `site` | saved launch sites | `ui/launch-sites.js` |
| `anim` | the flight animation | `animation/` |
| `bp` | black powder (ejection charges) | `recovery/ejection-charge.js` |
| `rso` | the RSO checklist | `ui/rso-checklist.js` |
| `pr` | app-wide helpers reachable from anywhere (`prToast`) | `files/save.js` |
| `render…`, `draw…` | put HTML on the page; paint a canvas | throughout |
| `set…` | the setter for a shared variable (`setD`, `setLastSim`) | beside the variable |

### Conventions

- **Fields.** A form is a list of rows, `[key, label, kind, dimension or options]` (`ui/forms.js` for the Range tab,
  `builder/fields.js` for parts). The input for launch field `key` has the id `f-<key>`; for a builder part's field,
  `bf-<key>`, with its Override switch at `bfo-<key>`. The "i" help for a key is in `ui/field-help.js`.
- **Result tiles** are `[label, value, unit]` triples in named groups (`resultGroups()` in `ui/results.js`); the
  Results tab and the PDF report both draw from that one list, so a new figure is added there once.
- **Checks** (RSO checklist, Launch warnings) return `[status, label, why]` with status `"good"`, `"warn"` or `"bad"`.
- **Overrides.** A value the user can override is stored as `x` with a switch `xOn`; `bldOvOn(part, "x")` says whether
  it is in force.
- **Comments.** Every function has a doc comment saying what it is for; physics comments name the source of each
  formula. A longer block comment above a group of functions ("see the note above") explains the feature as a whole.

### Inside the largest functions

Four functions are long because each is one job done in a fixed order, sharing a lot of working state. They are built
from named inner steps; read them by these landmarks.

**`simulate()`** (`physics/simulate.js`): set-up first (the motors' thrust and mass models `MS` and `MB`, staging times,
the geometry at each moment `Gat(t)`, parachutes), then:

| Inner function | What it does |
|---|---|
| `inertia(t)`, `rollI(t)` | mass properties at a time: CG, pitch and roll inertia |
| `deriv(t, s, ph)` | the equations of motion: the rate of change of the state `s` in phase `ph` (`"rail"`, `"flight"`, `"drogue"`, `"main"`, `"free"`). Everything physical is here |
| `stepSize()` | the next time step |
| `afterStep()`, `recordSample()` | bookkeeping after a step; adds a sample to `out` |
| `trackAscent()` | maximum speed, Mach, burnout, apogee |
| `stagingEvents()` | separation and upper-stage ignition |
| `railOrFlight()` | leaving the rail, tip-off, tumbling |
| `chutesAndStats()` | deployment and the descent's figures |
| `landing()` | touchdown |

The main loop (`while (t < 3600)`) takes one Runge-Kutta step of `deriv()` and then calls these in the order listed. The state `s` is
`[x, z, vx, vz, y, vy, bx, by, bz, wx, wy, wz, p, roll]`: position (x downrange, y crossrange, z up), velocity, the
rocket's axis as a unit vector `b`, its pitch/yaw angular velocity `w`, roll rate `p` and roll angle. Vectors are
written out by component (`bx, by, bz`), so a cross product is three lines. In `deriv`: `T` thrust, `FA` axial force
(drag), `N` normal force, `Mp` the pitching moment, `C2` the damping, `J` the mass properties from `inertia(t)`, `mm`
the mass, `u` the direction of the air moving past the rocket, and `d` and `q` (as `dx, dy, dz` and `qx, qy, qz`)
the body's two cross axes.

**`parseOrk()`** (`files/openrocket-import.js`) reads an OpenRocket file in one walk of its component tree:

| Part | What it does |
|---|---|
| helpers at the top (`txt`, `num`, `dens`, `lenOf`...) | read one value from an element; resolve automatic sizes |
| `walk(c, x, parent)` | the walk: one branch per component type (nose cone, body tube, fin set, parachute, mass component, launch lug...), each adding its mass with `addMass()` and recording its shape |
| `motorMountIn()` | a motor mount and its motor |
| `finalize(sel, label)` | builds a design from a set of stages: once for a single-stage rocket, per stage for a staged one |
| the end | recovery devices, the file's saved simulations, clusters |

**`bldFromOrk()`** (`builder/ork-read.js`) reads the same XML into builder parts, with a `case` per component type that
mirrors `walk()`. A new kind of part needs a branch in both, plus `bldToOrk()` (`builder/ork-export.js`) to write it.

**`buildReportPdf()`** (`report/pdf-report.js`) draws the report top to bottom; each section starts with a
`// ---- name` comment: page 1 (title block and the rocket's configuration), then page 2 on (apogee, stats, flags,
graphs, drift by wind speed, landing dispersion, the safety terms).

### Where to change what

| To change... | Look in |
|---|---|
| a drag or stability formula | `physics/aerodynamics.js` (`cdParts`, `cnaParts`), with its source in AERODYNAMICS.md |
| how the flight is flown | `deriv()` in `physics/simulate.js` |
| a part's fields in the builder | `builder/fields.js`; its defaults in `bldNew()` (`builder/model.js`); how it is drawn in `builder/side-view.js` |
| how a part is saved and opened | `builder/ork-export.js`, `builder/ork-read.js` and `files/openrocket-import.js` (all three) |
| a figure on the Results tab or in the report | `resultGroups()` in `ui/results.js` |
| a Launch warning or RSO checklist item | `ui/state.js` (`runNow`), `ui/launch-warnings.js`, `ui/rso-checklist.js` |
| a Range tab field | `ui/forms.js`, and its help in `ui/field-help.js` |
| the motor list | `tools/motor-catalog/` (the list is generated; don't edit `data/motor-catalog.js`) |
| the motor filters | `ui/motor-tab.js`, `motors/catalog-lookup.js` |

After any change: `npm test` (nothing that shouldn't move has moved), `npm run lint`, `npm run format:check`,
`npm run test:smoke`; after a change to the builder, a part's fields or the file format, `npm run test:roundtrip` too.

## The Android app

`android/` is a small Gradle project: `MainActivity` shows the page in a WebView; `Bridge` gives the page what a
browser can't do on Android (saving files, saving back to the file that was opened, reading shared files); `Chrome`
handles the file picker. Before each build, the `generateWebAsset` task copies the built page into the app's assets
with the fonts and PDF library switched to bundled copies.

## Tests

- `tests/golden.js` opens the built page in headless Chromium, flies designs under several conditions, motors and
  delays, and records everything the app computes. `npm test` compares the built-in examples with
  `tests/golden-snapshot.json`. A change that shouldn't alter results must pass unchanged. After the examples it flies
  designs made in the builder (`built` in the file): stages, a cluster, each rail guide, a side protuberance, canted
  fins, the current drag model, and files whose motor is missing or ambiguous; and it records the motor list and where
  each old motor id leads. A new feature that changes the flight gets a case there, added at the end so the cases
  before it don't move.
- `tests/smoke.js` clicks through the tabs and controls. It fails on any page error, and on a screen that comes up
  empty: the motor makers and motor list, the builder's tree, add-a-part list and drawing, the Range tab's fields, and
  the result tiles, chart, checklist and wind table.
- `tests/roundtrip.js` changes every editor field of every builder part through the real input, saves with the app's own
  save, reopens with its own open, and fails if a field was lost or the flight changed. A new part type goes in `TYPES`
  at its top; a field that legitimately reads back differently goes in `SAME`, with the reason.
- `tests/drag-benchmarks.js` compares the drag model with published wind-tunnel and free-flight measurements.
- `validation/` checks the app against OpenRocket and NASA's Arcas wind-tunnel data; VALIDATION.md has the results.
- The regression, smoke, save-and-reopen and drag tests run on every push and pull request (`.github/workflows/check.yml`), with lint, formatting and an Android build.
