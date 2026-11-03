# Pocket Rocket Flight Lab

A flight simulator for hobby and high-power rockets that runs on a phone. Open an OpenRocket (`.ork`) or
RockSim (`.rkt`) design, or build one in the app, pick a motor, set the day's conditions, and get the
predicted flight: apogee, speeds, stability, staging, recovery, drift and landing dispersion, an RSO
checklist and a PDF flight report.

By Dustin Lee. Free software under the [GNU General Public License v3.0 or later](LICENSE).

## What it does

- 6-DOF flight simulation (position, pitch, yaw and roll) with Barrowman stability, a full drag
  build-up, wind with height and gusts, and the earth's rotation
- Single, two- and three-stage rockets, motor clusters and airstarts
- Opens OpenRocket and RockSim files and saves OpenRocket files, keeping everything the app doesn't edit
- Rocket builder, motor comparison, landing dispersion (Monte Carlo), fin flutter checks
- Flight log with altimeter imports (Featherweight, Altus Metrum, Eggtimer, PerfectFlite, Missile
  Works, Apogee) and drag calibration to real flights
- Weather forecast for the launch site, including winds aloft to about 100,000 ft

## Download

Get the newest Android app (`PocketRocketFlightLab.apk`) and the web version from the
[Releases page](https://github.com/dustintlee-blahblah/PocketRocketFlightLab/releases/latest).

**Before you use it:** rocketry is dangerous, and this app's results are computer estimates that can be
wrong. Use it at your own risk, verify your rocket's stability and recovery yourself, hold the
certification your motors require, and follow the safety codes and your Range Safety Officer. Users
under 18 need a parent or guardian's permission and adult supervision. The app shows its full safety and
liability disclaimer, which you must accept, the first time it opens.

## Support the app

Pocket Rocket Flight Lab is free, with no ads. If it helps your flying, you can chip in toward its
development on Venmo: [@PocketRocketFlightLab](https://venmo.com/u/PocketRocketFlightLab) (US only), or with
[PayPal](https://www.paypal.com/qrcodes/p2pqrc/6SFLPUHMKC9FY) (most countries). Thank you!

## Repository layout

```
src/                                the app's source, in files by area (see below)
build.js                            joins src/ into the single page the app ships
web/pocket-rocket-flight-lab.html   the built app: one HTML file (HTML, CSS and JavaScript)
android/                            Android app: a WebView around the same page, built with Gradle
tests/golden.js                     regression test: proves a change leaves every result the same
tools/                              one-off maintenance scripts
LICENSE                             GNU GPL v3
THIRD_PARTY_NOTICES.md              licenses of the bundled fonts, PDF library and data
```

`src/` holds the page (`index.html`, with `@@include` lines where the other files go), its styles
(`styles.css`), the JavaScript in `src/js/`, and data (the motor catalog and the example rockets) in
`src/data/`:

```
src/js/core/        start-up and on-device storage
src/js/physics/     atmosphere, body geometry, aerodynamics (drag and stability), the flight simulation,
                    landing dispersion (Monte Carlo)
src/js/motors/      the motor catalog, thrust curve files, clusters
src/js/design/      the default design, extra fin sets
src/js/recovery/    the ejection charge calculator
src/js/files/       OpenRocket and RockSim import, saving, recent files, the built-in examples
src/js/builder/     the rocket builder: its parts model and its .ork reading, writing and merging
src/js/ui/          the tabs, forms, results, RSO Checklist, Motor tab, settings
src/js/animation/   the flight animation and its video export
src/js/flightlog/   the flight log, altimeter files, drag calibration
src/js/report/      the PDF flight report
src/js/weather/     winds aloft and the weather forecast
```

The files are plain scripts that share one global scope, in the order `src/index.html` lists them.

## Working on the code

Requirements: Node.js 18 or later. For the regression test, also Playwright with its Chromium browser.

```
npm install            # Prettier and ESLint
node build.js          # src/ -> web/pocket-rocket-flight-lab.html
npm run format         # Prettier (print width 120)
npm run lint           # ESLint
```

Edit the files in `src/`, then build; don't edit `web/pocket-rocket-flight-lab.html` by hand.

### Regression test

`tests/golden.js` flies a set of design files (yours: `.ork` and `.rkt` files in folders you name)
and the built-in examples under several conditions, motors and delay settings, and records everything
the app computes: flight results, stability, RSO Checklist, charge timing, drag and stability
coefficients, Monte Carlo dispersion, the Results text and the saved `.ork`. Record a snapshot before a
change, then check against it after:

```
node build.js
node tests/golden.js record before.json --fixtures path/to/designs
# ...change the code, build again...
node tests/golden.js check before.json --fixtures path/to/designs
```

A change meant to leave behavior alone (formatting, comments, refactoring) must pass with no differences.

## Running the web version

Open `web/pocket-rocket-flight-lab.html` in a browser. It loads its fonts from Google Fonts and the PDF
library (jsPDF) from cdnjs; everything else is in the file.

## Building the Android app

Requirements: Android Studio (or the Android SDK command-line tools) and JDK 17.

```
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

Build the page first (`node build.js`). The Android build copies `web/pocket-rocket-flight-lab.html` into the app and switches it to the bundled fonts
and PDF library, so the app works offline (only the weather forecast uses the internet).

### Signing a release

Release builds are signed only when `android/keystore.properties` exists. Copy
`android/keystore.properties.example`, point it at your own keystore and fill in its passwords, then run
`./gradlew assembleRelease`. Keystores and `keystore.properties` are in `.gitignore`: never commit them.
A build signed with a different key can't update an installed copy of the official app.

## Data sources

- **Motors:** the built-in AeroTech, Cesaroni, Loki Research and Estes thrust curves come from the
  [OpenRocket motor database](https://github.com/openrocket/motor-database), which collects curves published on
  [ThrustCurve.org](https://www.thrustcurve.org/); one curve per motor, the certification curve where there is one.
  Other motors can be loaded from `.eng`, `.rse` or `.zip` files.
- **Weather:** NOAA GFS forecasts through [Open-Meteo](https://open-meteo.com/), data under CC BY 4.0.
  Open-Meteo's free API is for non-commercial use; a commercial version of this app would need an
  Open-Meteo API subscription.

## Name and trademarks

The GPL covers the program, not its name. If you distribute a modified version, please give it a
different name so it isn't mistaken for Pocket Rocket Flight Lab.

OpenRocket, RockSim, ThrustCurve and the motor and altimeter makers named here are names or trademarks
of their owners, used only to identify the files, motors and devices the app works with. This project
isn't affiliated with or endorsed by any of them, and it contains no code from OpenRocket or RockSim.

## Safety

Results are estimates. Rocketry can be dangerous: follow the NAR/Tripoli safety codes and your RSO's
decisions, and confirm every flight's stability and recovery yourself. The software comes with no
warranty; see sections 15 and 16 of the license.

## License

Copyright (C) 2026 Dustin Lee

This program is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version. See [LICENSE](LICENSE).
