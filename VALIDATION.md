# How accurate is it?

A simulator is only worth trusting as far as it has been checked. This page collects the checks made on Pocket
Rocket Flight Lab's physics, what they found (including where the app is weaker), and how to run them yourself.
Everything here can be reproduced from this repository; the scripts are in `validation/` and `tests/`.

In short:

| Check | Against | Result |
|---|---|---|
| Apogee, 33 design files | OpenRocket 24.12, same files and conditions | median +0.9%, typical ±1.5% (65 flights) |
| Apogee, OpenRocket's own examples | OpenRocket 24.12 | median −0.2%, typical ±2.3% (34 flights) |
| Center of pressure | NASA wind-tunnel data, Arcas rocket, Mach 0.6–4.6 | RMS error 2.3% of body length |
| Total drag | NACA wind-tunnel data, Mach 0.6–4.6 | mean error 17% |
| Fin drag | NACA free-flight data, Mach 1.5–2.0 | mean error 0.022 in drag coefficient |

"Typical" is the median of the absolute differences: half the flights are closer than that, half further.

## Apogee against OpenRocket

[OpenRocket](https://openrocket.info) is the most widely used open-source rocket simulator, and most hobby designs
start in it, so it's the natural reference. The comparison flies the same design file with the same stored
simulation (motor, delay, launch site, weather, rail) in both programs: OpenRocket with its own engine, run headless
(`validation/openrocket/ORFlights.java`), and the app the way it does when you open that file and pick that run.

**33 design files** (OpenRocket's examples, the app's built-in examples, and designs flyers shared, from model
rockets on A motors to Mach 1.1 high-power flights): of their stored flights, 65 compare fairly. The app's apogee is
a median **0.9% higher** than OpenRocket's, with a typical difference of **±1.5%**, and 56 of the 65 within ±5%; top
speeds agree within a median 1.0%. The shared designs belong to the people who shared them and aren't in this
repository, so only the summary is given here. An earlier, broader comparison (98 OpenRocket and RockSim designs, up
to Mach 2.3, at build 270, with each program flying the same motor) found a median of +0.5% and a typical ±3.0%.

**OpenRocket's bundled examples** (anyone can rerun this; the per-flight results are in
[`validation/results/openrocket-examples.csv`](validation/results/openrocket-examples.csv)): of 60 stored flights,
34 can be compared fairly. The app's apogee is a median **0.2% lower**, typical **±2.3%**, with 27 of the 34 within
±5%; top speeds agree within a median 0.0%. The other 26 aren't compared, for reasons the script reports:

- **A parachute opens before apogee** (15): when the motor's delay is too short, the reported "apogee" is wherever the
  parachute happened to open, which depends on each program's deployment model more than on its flight physics.
- **Different motor data** (7): the app's motor catalog and OpenRocket's have a different curve for some motors
  (more than 3% apart in total impulse), or the app doesn't have the motor at all, so the two programs aren't flying
  the same motor.
- **Simulation extensions or scripts** (4): OpenRocket runs that use plug-ins, such as active roll control.

Where the compared flights differ most:

- **Pods with one- and two-fin sets**: in *Pods--powered with recovery deployment*, "Unpowered Pods" is 9% lower in
  the app and "BoosterOnly" 6% lower. Its pods carry fin sets of one and two fins, which OpenRocket treats by their
  actual direction and the app averages around the roll. The other pod, side-booster and tube-fin examples agree
  within 2%.
- **Airstarts and short, wide rockets**: the airstart examples fly 4–7% higher in the app; the "base drag hack"
  example 8% lower.

Among the flights not compared: *Simulation extensions* and *Simulation scripting* fly a HyperTEK L540 hybrid, which
isn't in the app's motor catalog, so the app keeps the motor that was chosen before (and says so).

## Center of pressure against wind-tunnel data

The CP decides stability, and stability decides whether a rocket flies straight, so it's checked against
measurements rather than another program. NASA measured the Arcas sounding rocket's CP in wind tunnels at small
angles of attack: a short and a long model below Mach 1 (TN D-4013, 1967) and the short model from Mach 1.5 to 4.6
(TN D-4014, 1967). `validation/arcas.js` builds both models from the reports' dimensions and finds the app's CP the
way a balance does, from the slopes of normal force and pitching moment over ±2°.

| Mach | 0.6 | 0.7 | 0.8 | 0.85 | 0.9 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Short model, measured | 75.0 | 73.5 | 72.0 | 71.0 | 71.5 | 78.0 | 74.5 | 70.5 | 67.0 | 63.8 | 61.0 | 57.5 |
| Short model, app | 75.2 | 75.4 | 75.7 | 75.9 | 76.1 | 78.5 | 73.7 | 69.4 | 65.4 | 61.8 | 58.4 | 54.7 |
| Long model, measured | 76.5 | 75.7 | 75.5 | 75.8 | 75.8 | | | | | | | |
| Long model, app | 75.2 | 75.4 | 75.8 | 76.0 | 76.2 | | | | | | | |

CP as a share of body length from the nose tip. **RMS error: 2.3% of body length.** That figure is what the app
uses for the "uncertainty margin" it shows beside the stability margin.

The weak spot: for the short model near Mach 0.85–0.9 the app puts the CP 4–5% of body length **further aft** than
measured, so it overstates stability there. The measured CP moves forward as the flow becomes transonic, and the
app's subsonic model doesn't capture that yet. The long model doesn't show it, so more data (NASA TM X-653 has some)
is needed before changing the model.

## Drag against wind-tunnel and free-flight data

`tests/drag-benchmarks.js` compares the drag build-up with two NACA reports, and runs on every change:

- **NACA RM A53D02**, total drag of a fineness-10 body with 72°-swept fins, Mach 0.6 to 4.6: mean error **17%**. The
  app is 12–21% high below Mach 1 and 7–25% low above it, so for this shape it's conservative subsonic and optimistic
  supersonic.
- **NACA RM E50D28**, the drag the RM-10's 60°-swept fins add, Mach 1.5 to 2.0 (free flight): mean error **0.022**
  in drag coefficient.

These bodies are more slender and faster than most hobby rockets, where the OpenRocket comparison above is the
better guide. The app can also fit its drag to your own flights (Flight Log & Calibration), which corrects the drag
for that rocket.

## Running the checks

You need the built page (`node build.js`) and Playwright's Chromium (`npx playwright install chromium`).

```
npm run validate:arcas                                   # CP against NASA's Arcas data
npm run test:drag                                        # drag against the NACA reports
npm run validate:openrocket -- --jar OpenRocket-24.12.jar   # apogee against OpenRocket's examples
```

The OpenRocket comparison also needs Java 17 or later and
[OpenRocket's release jar](https://github.com/openrocket/openrocket/releases/download/release-24.12/OpenRocket-24.12.jar).
Give it folders of your own `.ork` files after the jar to compare those instead, and `--csv results.csv` to save the
per-flight table.

## Reporting a difference

If the app disagrees with a real flight, OpenRocket or RockSim, please open an issue with the **Accuracy report**
template, with the design file, the motor and conditions, and the other number. Altimeter data from real flights is
the most valuable of all: it's the one reference that isn't another model.
