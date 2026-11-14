# How accurate is it?

A simulator is only worth trusting as far as it has been checked. This page collects the checks made on Pocket
Rocket Flight Lab's physics, what they found (including where the app is weaker), and how to run them yourself.
Everything here can be reproduced from this repository; the scripts are in `validation/` and `tests/`. [AERODYNAMICS.md](AERODYNAMICS.md) maps
each part of the model to its source and to these checks.

**Build 288 changed the drag model.** The drag and apogee figures on this page were worked out with the model before
it and have not all been redone (that model was removed in build 303; the `v1.0-build302` tag is the last that
can run it, with `--model released` in the validation scripts). For the current model against the same
measurements, case by case and beside the previous one, see "The current drag model and the previous one" in
[AERODYNAMICS.md](AERODYNAMICS.md); in brief, its drag error on the wind-tunnel and free-flight models is about half
the previous model's below Mach 3, and its apogee error on the 23 measured flights is 6.0% against 8.3%. The scripts
below score the current model. The stability figures are unaffected.

In short:

| Check | Against | Result |
|---|---|---|
| Apogee, 33 design files | OpenRocket 24.12, same files and conditions | median +0.9%, typical ±1.5% (65 flights) |
| Apogee, OpenRocket's own examples | OpenRocket 24.12 | median −0.2%, typical ±2.3% (34 flights) |
| Center of pressure | NASA wind-tunnel data, Arcas rocket, Mach 0.6–4.6 | RMS error 2.3% of body length |
| Total drag | NACA free-flight data (RM A53D02), Mach 0.6–4.6 | mean error 14.4% |
| Fin drag | NACA wind-tunnel data (RM-10), Mach 1.5–2.0 | mean error 0.022 in drag coefficient |
| Drag, CP and CNα of a rocket never used for tuning | Aerobee 150A, manufacturer's data from wind-tunnel tests, Mach 0.1–5 | drag 4.9–6.9%, CP 0.8% of length, CNα 16% low |
| Drag of a rocket never used for tuning | NACA RM L55G28a, fin-stabilized cone-cylinder, free flight, Mach 2.5–3.9 | 8.4% low |
| Apogee of measured flights | 23 rockets from RASAero II's example files, Mach 0.55–3.6, up to 121,000 ft | mean error 9.9%, app high (RASAero II: 5.4%) |

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

- **NACA RM A53D02**, total drag of a fineness-10 body with 72°-swept fins in free flight, Mach 0.6 to 4.6: mean
  error **14.4%** (17% before the supersonic base drag followed NACA TN 3819). The app is 12–21% high below Mach 1
  and 8–20% low above it, so for this shape it's conservative subsonic and optimistic supersonic.
- **NACA RM E50D28**, the drag the RM-10's 60°-swept fins add, Mach 1.5 to 2.0 (Lewis 8- by 6-foot wind tunnel): mean error **0.022**
  in drag coefficient.

These bodies are more slender and faster than most hobby rockets, where the OpenRocket comparison above is the
better guide. The app can also fit its drag to your own flights (Flight Log & Calibration), which corrects the drag
for that rocket.

## Rockets the model was never tuned on

Every check above was used, at some point, to set or confirm a model constant, so agreeing with them is partly by
construction. The four rockets here are kept back purely for checking.

**Aerobee 150A.** The sounding rocket's drag, center of
pressure and lift-curve slope from Mach 0.1 to 5 are the manufacturer's, from Aerojet's wind-tunnel tests, as given in
Vought Astronautics Report AST/E1R-13319 (1961) and NASA TM X-55123 (Pressly et al., 1965). The geometry is a
15-inch, 289-inch rocket with a tangent-ogive nose and four beveled fins; the fin sizes are the
[open-aerospace project's](https://github.com/open-aerospace/aerobee-150) reconstruction, which is also where the
digitized curves come from.

| | Subsonic (below 0.8) | Transonic (0.8–1.2) | Supersonic (1.2–3) | High supersonic (3–5) |
|---|---|---|---|---|
| Drag, mean error (while thrusting) | 6.2% (app high) | 9.0% | 8.2% (app high) | 4.3% |
| CP, mean error | 1.1% of length (app forward) | 0.5% | 1.0% | 0.4% |
| CNα, mean error | 17.5% low | 11% low | 16.5% low | 16% low |

Drag and CP agree well across the whole range; the app's drag rise through Mach 1 comes late (10–15% low at Mach 1–1.1), and
from Mach 1.2 to 3 the app is now about 8% high, thrusting and coasting alike: since the supersonic base drag follows NACA
TN 3819 the Aerobee came out worse (3.8% before), while the two free-flight rockets came out better. The normal-force slope is about 16% low at every
speed. That may be the model (Barrowman's fin–body interference factor is a low-speed one) or the reconstructed fins
being smaller than the real ones: the CP, which bigger fins would move aft, is a little forward too. A drawing of the real
fins would settle it.

**NACA RM L55G28a.** Two rocket-propelled models of a fin-stabilized cone-cylinder (a 10° cone on a 7-inch body, 150
inches long, four steel fins at the base) flown by NACA Langley (reported 1955), their drag measured by radar and
on-board accelerometers while coasting at Mach 2.5–2.9 and 3.55–3.9, at Reynolds numbers of 85 to 210 million. The app
is 8.8% low at Mach 2.5–2.9 and 8.0% low at 3.55–3.9 (13.9–14.7% and 9.7–11.7% before the supersonic base drag
followed NACA TN 3819): low in the same way as RM A53D02. These fins, like the Aerobee's, have a sharp leading edge and
a blunt trailing edge, which the app can't describe yet (its "beveled" section is sharp at both ends), so their
trailing-edge base drag is still missing.

**NACA RM L56G24.** A rocket-powered free-flight model of a ballistic missile (Gillespie, 1956): a 7-inch body 118
inches long (fineness 16.9) ending in a 2° boattail, with four small 60° delta fins on the boattail, flown from Wallops
Island at Mach 1.6 to 2.8. Its coasting drag and its CP (from the pitching moment, Mach 1.7–2.1) were measured.

| | Mach 1.7–2.1 | Mach 2.6–2.8 |
|---|---|---|
| Drag, mean error | 11.9% low | 13.4% low |
| CP, mean error | 6.0% of length (app forward) | |

The drag gap is about 0.04 in Cd, roughly what the model's two accelerometer fairings near the CG (0.9 inch high and 14.5
inches long, top and bottom) and its nose probe would add; the app's design has neither, so this drag isn't a clean
check either way. The CP is another matter: the fairings sit at the CG, where they barely move it.

**NASA TM-2005-213541, configuration 3.** A slender missile model (Allen, 2005) in the Langley 8-Foot Transonic Pressure
Tunnel and Unitary Plan Wind Tunnel: a small ogive nose, a cone flaring to a 3.15-inch body 42.5 inches long, a short
boattail, and four small swept fins at the tail, Mach 0.6 to 3.95, the boundary layer tripped. The numbers come from the
report's own digital data (NTRS 20050165156), over ±2° as the app measures them. The axial force has the base pressure
taken out, so it is compared with the app's drag without its base drag.

| | Mach 0.6 | Mach 0.9–1.2 | Mach 1.7–2.9 | Mach 3.95 |
|---|---|---|---|---|
| Drag less base, mean error | 9.9% high | 49% high | 8.8% high | 13.5% high |
| CP, mean error | 7.6% of length (app forward) | 9.7% forward | 4.7% forward | 4.0% forward |
| CNα, mean error | 3.8% low | 14.5% low | 17.0% low | 25.5% low |

Two things stand out. Through Mach 1 the app's drag rises far too early and too much on this body (+37% at Mach 0.9,
where the tunnel measured no rise yet, and +60% at 1.19); its short nose and the cone behind it are what the app's
transonic drag works from, so that is where to look. And with the Aerobee and RM L56G24, this is the third rocket where
the app's CP is forward and its normal-force slope low, all three with small fins far behind a long body: the fins
seem to carry more lift than the app gives them, or the body less. Both are open (AERODYNAMICS.md, gaps 4, 7 and 12); neither has
been changed to fit these cases.

`node validation/accuracy.js --verbose` runs every case and prints these tables, keeping the tuned cases apart from the
check cases. The cases themselves, with their sources and geometry, are in `validation/cases.js`; a new measured
rocket is added there. Across the check cases the drag error by speed band is 6.2% subsonic, 9.0% transonic, 9.8%
supersonic and 5.2% from Mach 3 to 5 (total drag), the CP error 2.4%, 3.5%, 3.8% and 1.0% of the length, and the
normal-force slope 13–18% low throughout.

## Apogee against measured flights

Twenty-three rockets whose apogee was measured, from the example design files that come with RASAero II
([rasaero.com](https://www.rasaero.com)): student rockets (USAF Test Pilot School 2004, Cal Poly Pomona 2005), LDRS-26
and Black Rock flights from J to Q motors, and the high-altitude Qu8k (121,478 ft), Proteus 6 and Kinsel A-601.
`validation/flights.js` flies each in the app with the file's launch weight, CG, launch site, rail and wind, on RASAero's
own thrust curve for the motor (`validation/flight-motors.eng`, from OpenRocket's motor database). The geometry and
numbers are copied into `validation/cases.js` (`FLIGHTS`); the files themselves aren't in this repository.

| Flight | Max Mach | Measured (ft) | How | RASAero II | App |
|---|---|---|---|---|---|
| Thunder and Lightning, LDRS-26 | 0.55 | 3,577 | barometric altimeter | +11.5% | +16.2% |
| Gibb, LDRS-26 | 0.56 | 3,913 | barometric altimeter | +7.5% | +11.2% |
| Cancer Descending, LDRS-26 | 0.57 | 6,188 | average of two barometric altimeters | +2.3% | +5.4% |
| LOC/Precision EZI-65, LDRS-26 | 0.61 | 3,965 | barometric altimeter | +6.3% | +16.8% |
| USAF TPS 2004, Team 3 | 0.64 | 3,964 | barometric altimeter | −2.2% | −1.6% |
| USAF TPS 2004, Team 2 | 0.64 | 3,710 | barometric altimeter | +4.5% | +5.2% |
| USAF TPS 2004, Team 1 | 0.67 | 3,837 | barometric altimeter | +2.9% | +3.7% |
| Gary Byrum, LDRS-26 | 0.75 | 5,732 | barometric altimeter | −7.9% | +9.6% |
| Ion Drive, LDRS-26 | 0.79 | 8,027 | average of two barometric altimeters | +7.7% | −1.8% |
| Cal Poly Pomona 2005, Team Discovery | 0.82 | 4,930 | barometric altimeter | −1.9% | −0.4% |
| Blister | 0.84 | 9,026 | barometric altimeter | −8.0% | −1.8% |
| Cal Poly Pomona 2005, Team Columbia | 0.86 | 5,085 | barometric altimeter | −4.7% | −3.0% |
| Rabia, short fin can | 0.89 | 10,584 | barometric altimeter | −3.4% | +3.7% |
| Raven, LDRS-26 | 1.15 | 8,815 | barometric altimeter | +5.9% | +31.5% |
| Rabia | 1.21 | 12,745 | barometric altimeter | −4.3% | +11.5% |
| Torrent | 1.27 | 12,807 | barometric altimeter | +7.1% | +10.6% |
| Kline-Rogers L500 rocket, USXRL-89 | 2.09 | 24,771 | optical tracking | +7.0% | +10.1% |
| Full Metal Jacket, BALLS 005 | 2.29 | 37,981 | optical tracking | +2.1% | +4.0% |
| Kinsel A-601 (P4935) | 2.32 | 42,771 | GPS | −3.9% | +34.4% |
| Full Metal Jacket, Black Rock 6 | 2.44 | 30,038 | optical tracking | +8.4% | +3.3% |
| Proteus 6 (P9381) | 2.97 | 85,067 | integrated accelerometers | −4.2% | +19.4% |
| Don't Debate This (N5800 minimum diameter) | 3.09 | 56,573 | average of two barometric altimeters | +9.6% | +2.7% |
| Qu8k (Q18000) | 3.60 | 121,478 | integrated accelerometer | −1.5% | +20.7% |

| Mean absolute error (bias) | Flights | RASAero II | App |
|---|---|---|---|
| All | 23 | 5.4% (+1.8%) | 9.9% (+9.2%) |
| Below Mach 0.8 | 9 | 5.8% (+3.6%) | 7.9% (+7.2%) |
| Mach 0.8–1.2 | 5 | 4.8% (−2.4%) | 8.1% (+6.0%) |
| Above Mach 1.2 | 9 | 5.3% (+2.2%) | 13.0% (+13.0%) |

One more flight, shared by a flyer and not in this repository: a **CT Concept 98 with an external fin can** on a
Cesaroni 6251M1400 (Mach 1.6, Black Rock), **GPS apogee about 17,400 ft**. With the launch conditions of its run saved in
the app, the app gives 17,417 ft (+0.1%; build 283 gave 18,576, +6.8%, before the tail-cone fix below) and OpenRocket
24.12 16,875 ft (−3.0%). It isn't in the averages above, which cover the RASAero II files only.

**The app predicts high on real flights: by 9% on average, and 13% above Mach 1.2.** None of its constants were set
from these flights, and the comparison is not entirely independent of RASAero II either: these are the flights
RASAero II's author chose to publish, and its own model is partly calibrated on flights like them, which helps explain
its 5.4%. Flight-to-flight scatter is real too: the three Test Pilot School rockets are the same airframe on the same
motor within 0.16 lb, and their measured apogees spread over 7%.

**How the rockets were finished is the largest unknown.** The files describe most of these rockets as "Smooth (Zero
Roughness)", RASAero II's own setting, so they fly here with the nearest OpenRocket finish, polished (2 µm). How they
were really finished isn't recorded, and the result depends on it more than on any drag term tried so far:

| Finish given to the "zero roughness" rockets | Mean error | Bias | Above Mach 1.2 |
|---|---|---|---|
| Polished, 2 µm (as the files say; the headline numbers) | 9.9% | +9.2% | 13.0% |
| Smooth paint, 20 µm | 8.7% | +7.6% | 10.0% |
| Regular paint, 60 µm | 8.8% | +0.5% | 11.7% |

Regular paint takes away the bias but not the scatter (the student rockets then come out 9–13% low, the L500 15% low),
so the real finishes were probably mixed. The headline keeps the files' own setting rather than whichever finish fits
best, which would turn these check flights into tuning. The CT Concept 98 above, the one flight whose finish is known
(regular paint), agrees with its GPS apogee within 0.1%. A few rockets stay high whatever the finish: Kinsel A-601
(+34%), Qu8k (+21%), Raven (+16%), EZI-65 and Thunder and Lightning (+11%).

Hoerner's drag of surface imperfections (*Fluid-Dynamic Drag*, ch. V) was also tried and left out: a joint or step
between airframe sections sits inside the boundary layer and feels only its slow air (q_eff ≈ 0.75·q·(h/δ)^1/3), so even
a sharp 0.25 mm step adds about 0.2% to the drag. With one at every joint the mean error moved from 9.9% to 9.7%.

What the comparison shows so far:

- **Top speed agrees; the coast doesn't.** The app's top speed is within about 1–6% of RASAero II's on every flight,
  and on Proteus 6, the one flight with a measured top speed (3,201 ft/s from its accelerometers), the app's 3,235 ft/s
  is closer than RASAero II's 3,063. But several rockets coast much higher in the app: Raven +32%, Qu8k +21%, Proteus
  6 +19%. Real rockets lose more speed while coasting than the app's drag allows.
- **OpenRocket overshoots the same way.** The same designs flown in OpenRocket 24.12 (where it has the motor) give
  apogees as high as the app's or higher (Raven 12,587 ft against the app's 11,595 and a measured 8,815), so this isn't
  a fault peculiar to the app's code: both programs' drag build-ups come out below what these real rockets show.
- **Bevel lengths** (build 282). RASAero's "hexagonal" fins record how long the bevels are, and beveled fins in the
  app now take them (Ackeret: K = 1/e₁ + 1/e₃, each bevel capped at what a square edge would cost). That moved the
  mean error from 11.7% to 11.2% and above Mach 1.2 from 17.6% to 16.1%; the Kinsel A-601, beveled over about 1% of
  its chord, from +44% to +34%.
- **Tail cones** (build 284). The supersonic base drag's boattail correction gave steep, separated tail cones the
  relief of attached flow, and near Mach 1.2 removed nearly all base drag even behind gentle ones, against the RM-10's
  measured base pressure in flight (NACA TN 3320). It now counts only the attached share of a tail cone and fades in
  from Mach 1.5 to 2. Proteus 6 went from +33% to +19% and Qu8k from +36% to +21%; the mean error from 11.2% to 9.9%.
  The CT Concept 98 flight above is what showed it.
- **Compared with the build before the TN 3819 and trailing-edge changes**, the mean error went from 12.0% to 11.7%: 14
  flights closer, 3 further, 6 unchanged.

## Running the checks

You need the built page (`node build.js`) and Playwright's Chromium (`npx playwright install chromium`).

```
npm run validate:arcas                                   # CP against NASA's Arcas data
npm run test:drag                                        # drag against the NACA reports
npm run validate:openrocket -- --jar OpenRocket-24.12.jar   # apogee against OpenRocket's examples
npm run validate:accuracy                                # every measured rocket, by speed band
npm run validate:flights                                 # apogee against measured flights
```

The OpenRocket comparison also needs Java 17 or later and
[OpenRocket's release jar](https://github.com/openrocket/openrocket/releases/download/release-24.12/OpenRocket-24.12.jar).
Give it folders of your own `.ork` files after the jar to compare those instead, and `--csv results.csv` to save the
per-flight table.

## Reporting a difference

If the app disagrees with a real flight, OpenRocket or RockSim, please open an issue with the **Accuracy report**
template, with the design file, the motor and conditions, and the other number. Altimeter data from real flights is
the most valuable of all: it's the one reference that isn't another model.
