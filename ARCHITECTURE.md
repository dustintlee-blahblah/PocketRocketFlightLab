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

`BLD` is the source of truth for a design; `bldDerive()` (`builder/builder-ui.js`) turns it into `D` after every
change. Opening a file goes the other way: `loadDesignXml()` (`files/open-file.js`) reads an OpenRocket file with
`parseOrk()` (`files/openrocket-import.js`; RockSim files are first rewritten as OpenRocket XML by
`files/rocksim-import.js`) and the builder reads the same XML into parts with `bldFromOrk()` (`builder/ork-read.js`).
Saving writes `BLD` as OpenRocket XML (`builder/ork-export.js`) merged into the original file so that what the app
doesn't edit is kept (`builder/ork-merge.js`).

Settings, the current design and conditions are kept in `localStorage` (`core/storage.js`); recently opened files in
IndexedDB (`files/recent.js`).

## What happens when you tap Launch

1. `runNow()` (`ui/state.js`) reads the fields into `L` and checks the rail length, that each stage has a motor that
   lights, and that each motor fits its mount (`ui/launch-warnings.js`).
2. `runAll()` (`ui/results.js`) works out the static stability (`stability()`, or `stackStability()` for a staged
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
  ejection charge, after any delay, with a main parachute at a set height for dual deployment. Lower stages separate and are flown down on their own by `flyBooster()`.
- **Forces and moments.** Thrust from the motor's curve (`motorModel`), with the mass and inertia falling as propellant
  burns; gravity; drag from `cdParts()`; the normal force and its moment from `cnaPartsM()` with the angle of attack;
  pitch damping; fin cant roll forcing and roll damping (`rollPartsM()`); the earth's rotation (`coriolis()`).
- **Air.** `atmosphere()` (`physics/atmosphere.js`): the U.S. Standard Atmosphere 1976 shifted to the field's measured
  temperature and pressure, with humidity, or a forecast temperature profile aloft. Wind changes with height (a power
  law, or the winds-aloft table) with gusts (`flightWind()`).
- **Outputs.** `out`, the time history (altitude, speeds, Mach, angle of attack, stability...), and `st`, the summary
  (apogee, maximum speed, rail exit, stability at rail exit and in flight, deployment and landing speeds, drift, fin
  flutter margin, events and warnings).

Everything is deterministic for a given design and conditions; the dispersion run seeds its own random numbers.

## The aerodynamics and where it comes from

`physics/aerodynamics.js` holds the aerodynamic model. `aero(D)` turns a design into geometry (body sections, fin
sets, protuberances, reference area); the functions below use that geometry. Each term's source is cited where it's
computed. In outline:

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
- Base drag: Fleeman's base-pressure correlation, with the motor nozzle's exit area during the burn.
- Boattail separation (Hoerner), fin edges (stagnation pressure, Newtonian and Ackeret wave drag by edge type), launch
  lugs and rail buttons (Hoerner protuberance drag), tumbling (Allen–Perkins crossflow).
- `tests/drag-benchmarks.js` checks the drag model against two NACA reports (RM A53D02, RM E50D28).

## The other parts

- **Motors** (`motors/`): the built-in catalog (`data/motor-catalog.js`, generated; see `tools/motor-catalog/`), RASP
  `.eng` and RockSim `.rse` files, and clusters and airstarts combined into one motor per stage.
- **Recovery** (`recovery/ejection-charge.js`): black powder charge sizes for each compartment.
- **Flight log** (`flightlog/`): real flights logged with altimeter files (several makers' CSV formats, Excel), compared
  with the prediction, and a drag correction fitted to them.
- **Weather** (`weather/`): the forecast for the site and winds aloft.
- **Report** (`report/pdf-report.js`): the PDF flight report (jsPDF) and file downloads on each platform.
- **Animation** (`animation/`): the flight replayed as a side view, and its video export.

## The Android app

`android/` is a small Gradle project: `MainActivity` shows the page in a WebView; `Bridge` gives the page what a
browser can't do on Android (saving files, saving back to the file that was opened, reading shared files); `Chrome`
handles the file picker. Before each build, the `generateWebAsset` task copies the built page into the app's assets
with the fonts and PDF library switched to bundled copies.

## Tests

- `tests/golden.js` opens the built page in headless Chromium, flies designs under several conditions, motors and
  delays, and records everything the app computes. `npm test` compares the built-in examples with
  `tests/golden-snapshot.json`. A change that shouldn't alter results must pass unchanged.
- `tests/drag-benchmarks.js` compares the drag model with published wind-tunnel and free-flight measurements.
- Both run on every push and pull request (`.github/workflows/check.yml`), with lint, formatting and an Android build.
