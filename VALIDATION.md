# How accurate is it?

A simulator is only worth trusting as far as it has been checked. This page collects the checks made on Pocket
Rocket Flight Lab's physics, what they found (including where the app is weaker), and how to run them yourself.
Everything here can be reproduced from this repository; the scripts are in `validation/` and `tests/`. [AERODYNAMICS.md](AERODYNAMICS.md) maps
each part of the model to its source and to these checks.

**Build 288 changed the drag model, and build 304 the center of pressure above Mach 1.** The summary table below,
"Apogee against measured flights" and "Weighed and logged hobby rockets" give the current model's figures (build
307). The sections on OpenRocket, the center of pressure, and drag against wind-tunnel and free-flight data were
worked out with the model before build 288 and have not been redone (that model was removed in build 303; the
`v1.0-build302` tag is the last that can run it); for the current model against those measurements, case by case,
see "How well each part is checked" in [AERODYNAMICS.md](AERODYNAMICS.md). The scripts score the current model.

In short:

| Check | Against | Result |
|---|---|---|
| Apogee, 33 design files | OpenRocket 24.12, same files and conditions | median +0.9%, typical ±1.5% (65 flights; before build 288, not redone) |
| Apogee, OpenRocket's own examples | OpenRocket 24.12 | median −0.2%, typical ±2.3% (34 flights; before build 288, not redone) |
| Center of pressure | NASA wind-tunnel data, Arcas rocket, Mach 0.6–4.6 | RMS error 3.1% of body length |
| Total drag | NACA free-flight data (RM A53D02), Mach 0.6–4.6 | mean error 7.7%, app low |
| Fin drag | NACA wind-tunnel data (RM-10), Mach 1.5–2.0 | mean error 0.011 in drag coefficient |
| Drag, CP and CNα of a rocket never used for tuning | Aerobee 150A, manufacturer's data from wind-tunnel tests, Mach 0.1–5 | drag 4.8–5.9%, CP 0.7% of length, CNα 10% |
| Drag of a rocket never used for tuning | NACA RM L55G28a, fin-stabilized cone-cylinder, free flight, Mach 2.5–3.9 | 1.2% |
| Apogee of measured flights | 23 rockets from RASAero II's example files, Mach 0.55–3.6, up to 121,000 ft | mean error 6.6%, bias +3.1% (RASAero II: 5.2%, −3.5%) |
| Drag above Mach 2 measured in a flight | Qu8k's flight recorder, Mach 2.0–2.8 coasting, 27,000–54,000 ft | app 12–22% high; the rocket bled tracking smoke into its base, which lowers its drag |
| Drag from Mach 2.1 down measured in a flight | Proto's flight recorder, coasting and falling, shape from a photograph | app within 8%, a little high |
| How drag changes with height in a supersonic coast | Four tracked two-stage flights, Mach 3.3–1.6, 28,000–70,000 ft | the app's rise is 0–8% more than the flights' |
| Apogee and coast drag of weighed, logged hobby rockets | 7 flights of 3 rockets, Harvey Mudd College data, Mach 0.3–0.9 | as their design files are set up (polished, no rail buttons): apogee 13.8% high, drag 15.7% low; with regular paint and rail buttons: apogee 3.5%, drag 6.3% |

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

The figures are for the current drag model (build 307). Seventeen of the apogees were read by barometric altimeters,
which read low in air warmer than standard, so those are compared with what the altimeter would have read at the
simulated apogee, for the app and for RASAero II alike (`--geometric` compares true heights instead; see "Notes on
the evidence" in [AERODYNAMICS.md](AERODYNAMICS.md)).

| Flight | Max Mach | Measured (ft) | How | RASAero II | App |
|---|---|---|---|---|---|
| Thunder and Lightning, LDRS-26 | 0.55 | 3,577 | barometric altimeter | +1.3% | +6.1% |
| Gibb, LDRS-26 | 0.56 | 3,913 | barometric altimeter | −2.4% | +1.5% |
| Cancer Descending, LDRS-26 | 0.57 | 6,188 | average of two barometric altimeters | −7.1% | −3.6% |
| LOC/Precision EZI-65, LDRS-26 | 0.60 | 3,965 | barometric altimeter | −3.4% | +9.2% |
| USAF TPS 2004, Team 3 | 0.64 | 3,964 | barometric altimeter | −7.0% | −5.2% |
| USAF TPS 2004, Team 2 | 0.65 | 3,710 | barometric altimeter | −0.5% | +1.5% |
| USAF TPS 2004, Team 1 | 0.67 | 3,837 | barometric altimeter | −2.3% | −0.1% |
| Gary Byrum, LDRS-26 | 0.76 | 5,732 | barometric altimeter | −16.3% | +3.2% |
| Ion Drive, LDRS-26 | 0.80 | 8,027 | average of two barometric altimeters | −2.2% | −7.2% |
| Cal Poly Pomona 2005, Team Discovery | 0.83 | 4,930 | barometric altimeter | −4.8% | +0.2% |
| Blister | 0.85 | 9,026 | barometric altimeter | −13.1% | −5.2% |
| Cal Poly Pomona 2005, Team Columbia | 0.88 | 5,085 | barometric altimeter | −7.1% | −1.5% |
| Rabia, short fin can | 0.90 | 10,584 | barometric altimeter | −10.2% | −0.6% |
| Raven, LDRS-26 | 1.15 | 8,815 | barometric altimeter | −3.8% | +22.0% |
| Rabia | 1.22 | 12,745 | barometric altimeter | −9.6% | +7.9% |
| Torrent | 1.29 | 12,807 | barometric altimeter | +1.1% | +14.5% |
| Kline-Rogers L500 rocket, USXRL-89 | 1.95 | 24,771 | optical tracking | +7.0% | −2.3% |
| Kinsel A-601 (P4935) | 2.11 | 42,771 | GPS | −3.9% | +5.8% |
| Full Metal Jacket, BALLS 005 | 2.28 | 37,981 | optical tracking | +2.1% | +1.8% |
| Full Metal Jacket, Black Rock 6 | 2.44 | 30,038 | optical tracking | +8.4% | +3.1% |
| Proteus 6 (P9381) | 2.95 | 85,067 | integrated accelerometers | −4.2% | +16.8% |
| Don't Debate This (N5800 minimum diameter) | 3.04 | 56,573 | average of two barometric altimeters | −1.2% | −14.0% |
| Qu8k (Q18000) | 3.57 | 121,478 | integrated accelerometer | −1.5% | +17.5% |

| Mean absolute error (bias) | Flights | RASAero II | App |
|---|---|---|---|
| All | 23 | 5.2% (−3.5%) | 6.6% (+3.1%) |
| Below Mach 0.8 | 8 | 5.0% (−4.7%) | 3.8% (+1.6%) |
| Mach 0.8–1.2 | 6 | 6.9% (−6.9%) | 6.1% (+1.3%) |
| Above Mach 1.2 | 9 | 4.3% (−0.2%) | 9.3% (+5.7%) |

Compared as true heights the app is 9.4% off (+8.8%) and RASAero II 5.4% (+1.8%).

One more flight, shared by a flyer and not in this repository: a **CT Concept 98 with an external fin can** on a
Cesaroni 6251M1400 (Mach 1.6, Black Rock), **GPS apogee about 17,400 ft**. With the launch conditions of its run saved in
the app, the app gave 17,417 ft (+0.1%) and OpenRocket 24.12 16,875 ft (−3.0%); that was under the model before build 288
and has not been rerun. It isn't in the averages above, which cover the RASAero II files only.

**The app is 7% off on these flights, a little high, and 9% above Mach 1.2.** None of its constants were set from
these flights, and the comparison is not entirely independent of RASAero II either: these are the flights RASAero
II's author chose to publish, and its own model is partly calibrated on flights like them. Flight-to-flight scatter
is real too: the three Test Pilot School rockets are the same airframe on the same motor within 0.16 lb, and their
measured apogees spread over 7%.

**What is left is mostly scatter.** Above Mach 1.2 three flights are within 3%, Kinsel A-601 and Rabia are 6–8%
high, and the rest are Qu8k (+17.5%), Proteus 6 (+16.8%), Torrent (+14.5%) and Don't Debate This (−14.0%); just
under Mach 1.2, Raven is +22%. Each of those has a reason of its own:

- **Qu8k: the motor and the measurement, not the drag.** Its flight recorder is public, and
  `validation/qu8k-coast.js` works through it (below). The thrust curve in the file is the pre-flight
  prediction: the recorder shows a peak of about 3,200 ft/s against the 3,800 ft/s the curve gives the app (and gave
  RASAero II in the flight report's own plot), about 130,000 N·s delivered against 142,000, and a burn to 10.6 s. The
  121,478 ft is the accelerometer integrated twice with no zero correction; with the +0.07 g the sensor reads in
  the near-vacuum coast taken off it is about 112,000 ft. And the rocket flew from a tower with no rail guide, though
  the file has one (it is flown here without). So this flight cannot judge the drag model by its apogee.
- **Proteus 6** was also measured by integrating accelerometers, and its recorder isn't public. The app's top speed
  (3,208 ft/s) matches the measured 3,201.
- **Don't Debate This** reached 56,000 ft, read by barometric altimeters. Its −14.1% assumes the air that high was as
  much warmer than standard as the air at the pad; as a true height it is −4.8%.
- **Raven** is a single flight of a 1.75 in rocket 42 diameters long with rounded fins; with regular paint it is +7%.
- **Torrent** has rounded fins too, and a 1/16 in step at its fin can. Until build 307 that step was charged most
  of stagnation pressure, two to seven times what steps measure (NASA TN D-8040), which hid about 7% of apogee;
  the rockets with rounded fins need more drag than the app gives them (AERODYNAMICS.md, known gaps).

**How the rockets were finished is the largest unknown.** The files describe most of these rockets as "Smooth (Zero
Roughness)", RASAero II's own setting, so they fly here with the nearest OpenRocket finish, polished (2 µm). How they
were really finished isn't recorded:

| Finish given to the "zero roughness" rockets | Mean error | Bias | Above Mach 1.2 |
|---|---|---|---|
| Polished, 2 µm (as the files say; the headline numbers) | 6.6% | +3.1% | 9.3% |
| Smooth paint, 20 µm | 6.3% | +1.6% | 8.4% |
| Regular paint, 60 µm | 8.8% | −5.5% | 10.7% |

Regular paint on all of them overshoots (the student rockets then come out 7–13% low, the L500 21% low), so the real
finishes were probably mixed, and smoother on these rockets than on the weighed hobby rockets further down, which
needed regular paint and rail buttons. The headline keeps the files' own setting rather than whichever finish fits
best, which would turn these check flights into tuning. Finish matters more above Mach 1 than below it: Proteus 6
goes from +16.8% polished to +9.5% with smooth paint and −4.5% with regular paint.

### Drag above Mach 2 measured in a flight: Qu8k's recorder

In the coast an axial accelerometer reads the drag over the mass and nothing else. Qu8k's R-DAS recorded it at 200 Hz
(the recorder file and the flight report are on the builder's page, ddeville.com), and the rocket was weighed after
the flight (154.5 lb), so each moment of the coast gives a drag coefficient. `validation/qu8k-coast.js` works it out
from 13.5 s (after the motor's tail-off) to 26 s (while the drag is still over 0.5 g), with the speed and height from
integrating the same accelerometer, and sets the app's coasting drag coefficient beside it at the same speed and
height. The quarter-second means of the recording are in `validation/cases.js` (`QU8K_COAST`).

| Mach | Height (ft) | Measured Cd | App | App against measured |
|---|---|---|---|---|
| 2.74 | 27,300 | 0.310 | 0.333 | +7% |
| 2.59 | 32,800 | 0.313 | 0.346 | +11% |
| 2.43 | 37,800 | 0.322 | 0.364 | +13% |
| 2.30 | 42,600 | 0.317 | 0.385 | +22% |
| 2.18 | 47,100 | 0.325 | 0.406 | +25% |
| 2.03 | 53,500 | 0.310 | 0.435 | +40% |

Over the whole stretch the app is **22% high** (measured 0.314, app 0.384) with the air aloft taken as warm as at the
pad, which is what the app assumes from a pad temperature, and **12% high** (0.331 against 0.372) with standard air
aloft; the day's upper air isn't known. With no zero correction it would be 33% and 23%. The measured coefficient
stays near 0.31 as the rocket climbs and slows; the app's rises, with its skin friction (the Reynolds number falls
with the thinning air) and its base drag (the Mach number falls).

**This is not a clean measurement of the airframe's drag, and nothing was changed on it.** Qu8k's motor carried a 6 in
by 4 in grain of tracking smoke in its forward closure (the flight report, on the motor), which burned through the
coast and vented through the nozzle into the base. Gas bled into a base raises the pressure there (it is how
base-bleed artillery shells gain range), and the thinner the air, the larger the bleed is beside the flow around the
base, so the base drag falls further the higher the rocket gets: the shape of the difference above. The four flights
below, with nothing burning in the coast, rise as the app does. What Qu8k's recorder does show is that the app's high
apogee for this rocket is not from too little drag: it comes from the thrust curve.

The same integration gives the apogee the accelerometer implies: about 113,000 ft with the zero taken off (integrated
to 40 s and coasting on from there), against the 121,478 ft reported from the uncorrected reading.

### Does the drag coefficient rise with height as the app says? Four tracked two-stage flights

The app takes the boundary layer as turbulent from the nose tip, so its skin-friction coefficient rises as a rocket
climbs into thinner air, and its base drag rises as the rocket slows. If the boundary layer turned laminar in the
thin air instead, a real rocket's drag coefficient would rise less than the app's, or fall. Four two-stage flights
tracked by Multitronix's Kate system (BALLS 2014, 2017 and 2019; apogees from 90,000 to 142,000 ft) test that: their
flight summaries (multitronix.com) plot the sustainer's accelerometer through the coast, and the plots are line work
the numbers can be read from. Neither the sustainers' weights nor their shapes are published, so only the change
along each coast can be compared: the drag deceleration over the dynamic pressure, as a ratio to its first point,
against the app's drag coefficient for a stand-in sustainer (a 4 in body 100 in long, 5:1 von Kármán nose, four
beveled fins) at the same Mach numbers and heights. `validation/coast-trend.js`; the readings are in
`validation/cases.js` (`KATE_COASTS`).

| Flight | From | To | Flight's rise | App's rise |
|---|---|---|---|---|
| Stratospheric Express | Mach 2.6, 28,500 ft | Mach 1.7, 55,900 ft | 1.30–1.43 | 1.40–1.43 |
| Anniversary Special | Mach 2.7, 27,700 ft | Mach 1.6, 56,100 ft | 1.35–1.50 | 1.49–1.52 |
| A Money Pit | Mach 2.4, 46,600 ft | Mach 2.1, 60,200 ft | 1.14–1.21 | 1.19–1.20 |
| SVJ2 | Mach 3.3, 39,300 ft | Mach 2.5, 70,300 ft | 1.39–1.57 | 1.39–1.41 |

Each range is from air aloft as warm as at the pad (the lower figure) to standard air aloft. Over the four coasts the
app's rise is 8% more than the flights' with warm air aloft and the same as theirs with standard air. So up to
60,000–70,000 ft these rockets' drag rose with height as a turbulent boundary layer's does, and the app's does; there
is no sign of a laminar boundary layer to allow for. The limits: the stand-in is not these rockets (a longer or
shorter body shifts the app's rise by a few points), the upper air on each day is bracketed, not known, and above
about 60,000 ft the drag is too small beside the rocket's tilt and the sensor's zero to read.

### Drag from Mach 2.1 down measured in a flight: Proto's recorder

"Proto" (Paul Gagnon, BALLS 2015) was a 98 mm minimum-diameter rocket on an N4036 research motor, tracked by
Multitronix's Kate system; the page for the flight (multitronix.com) gives the recorder's spreadsheet. Its recovery
failed, so the record holds a clean coast from Mach 2.1 to apogee at 39,700 ft and then a nose-first fall back
through Mach 0.9, and in both the accelerometer reads the drag over the mass. The accelerometer's speed agrees with
the GPS's within 1% once the GPS recovers. `validation/proto-coast.js`; the readings are in `validation/cases.js`
(`PROTO_COAST`).

Two things are not on the page and had to be worked out. **The burnout mass**: the rocket was 46 lb on the pad, and
the accelerometer through the burn gives 16,200 N·s, which is 7.4–8.0 kg of propellant, so 13.2 kg at burnout, give
or take 0.3 (2%). **The shape**: measured from the page's photograph of the rocket standing beside its builder,
scaled by the 48 in motor case that is its bare lower body (nose 25.4 in, body 88.7 in, three fins 13.1 in at the root
and 4.8 in span, taken as 3/16 in plate with beveled edges).

| Mach | Height (ft) | Measured Cd | App | App against measured |
|---|---|---|---|---|
| 2.11 | 9,900 | 0.471 | 0.531 | +13% |
| 1.82 | 13,700 | 0.526 | 0.571 | +8% |
| 1.60 | 17,000 | 0.549 | 0.597 | +9% |
| 1.36 | 21,000 | 0.592 | 0.622 | +5% |
| 1.10 | 25,700 | 0.618 | 0.655 | +6% |
| 0.90 | 29,500 | 0.475 | 0.486 | +2% |
| 0.80 | 31,500 | 0.487 | 0.498 | +2% |
| 0.87 (falling) | 24,200 | 0.463 | 0.480 | +4% |
| 0.94 (falling) | 12,900 | 0.452 | 0.480 | +6% |

That is with smooth paint and standard air aloft. By finish and upper air, the app's mean error is:

| Finish, air aloft | Coast above Mach 1.2 | Mach 0.75–1.2 | Falling, Mach 0.6–0.95 |
|---|---|---|---|
| Smooth paint, as warm as at the pad | 5.9% (+6%) | 6.1% (+1%) | 5.4% (+5%) |
| Smooth paint, standard | 8.1% (+8%) | 4.4% (+4%) | 7.1% (+7%) |
| Polished, as warm as at the pad | 1.2% (0%) | 5.7% (+1%) | 6.3% (+4%) |
| Polished, standard | 1.7% (+2%) | 4.1% (+4%) | 5.6% (+6%) |

So on this rocket the app is within about 8%, a little high, from Mach 2.1 to Mach 0.6, which is inside what the
burnout mass, the photograph and the unknown fin thickness allow (1/8 in fins would lower the app's figure by about
10% above Mach 1). The drag measured rising and falling agrees with itself within 5% at the same Mach number.

One thing it showed about the app: the fin can is a welded sleeve over the motor case, and how much of a step its
forward edge makes can't be seen. Entered as a 0.19 in step (a short transition from 3.9 to 4.28 in), the app's drag
came out 40–50% above the measurement over Mach 1 and about 20% above it below: it gave a short, steep increase in
diameter most of stagnation pressure, though a step that small lies inside the boundary layer. Build 307 gives
steps their measured drag (NASA TN D-8040; AERODYNAMICS.md, "Shoulders, flares and steps"), and with that the
0.19 in step comes out 20–30% above the measurement, so Proto's real step was smaller than that. The figures above
are for a flush fin can.

Hoerner's drag of surface imperfections (*Fluid-Dynamic Drag*, ch. V) was also tried and left out: a joint or step
between airframe sections sits inside the boundary layer and feels only its slow air (q_eff ≈ 0.75·q·(h/δ)^1/3), so even
a sharp 0.25 mm step adds about 0.2% to the drag.

Changes made because of these flights, under the model before build 288 (the figures in this list are that model's,
compared as true heights):

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

## Weighed and logged hobby rockets: apogee and drag in the coast

Harvey Mudd College's rocketry course (E178, Prof. Erik Spjut) publishes, for the ordinary kit rockets its students
fly, each rocket's design file, its weight and CG without a motor, and every flight's motor, air temperature, wind
and recorder files ([flight data page](https://pages.hmc.edu/spjut/AdvRoc/FlightData.md.html)). That is what the
apogee checks above lack: the rocket weighed, and an accelerometer on board.

Between burnout and apogee an accelerometer along the rocket reads the drag deceleration directly: gravity pulls on
the sensor and the rocket alike, so it doesn't show. With the rocket's weight that gives the drag coefficient,
whatever the motor did. `validation/cases.js` (LOGGED) has the seven flights that pass two checks on the sensor: the
launch weight the boost implies with the motor's rated impulse is within 12% of the weighed rocket, and the height the
accelerometer makes of the climb is within 8% of the barometer's. `npm run validate:logged` flies each one two ways:

| Flight | Barometer apogee, ft | App, as filed | App, painted with rail buttons | Coast Cd (Mach) | App, as filed | App, painted with rail buttons |
|---|---|---|---|---|---|---|
| Madcow Mini DX3, F67W, flight 1 | 1,730 | +15.0% | +3.0% | 0.717 (0.25) | −18.9% | +0.9% |
| Madcow Mini DX3, F67W, flight 3 | 1,597 | +22.7% | +10.3% | 0.774 (0.20) | −22.7% | −7.1% |
| Madcow Mini DX3, F67W, flight 5 | 1,723 | +12.6% | +1.4% | 0.765 (0.25) | −23.6% | −5.7% |
| Madcow Mini DX3, G79W | 3,010 | +13.7% | −4.2% | 0.664 (0.35) | −15.7% | +11.1% |
| Madcow Mini DX3, H128W | 4,095 | +22.3% | −2.6% | 0.717 (0.40) | −22.4% | +3.2% |
| LOC Vulcanite, G78G | 1,381 | +3.5% | −0.4% | 0.663 (0.20) | −2.2% | +7.7% |
| LOC Dual Deploy Vulcanite, I140W | 3,804 | +6.7% | −2.6% | 0.703 (0.30) | −4.7% | +8.6% |
| **Mean error (bias)** | | **13.8% (+13.8%)** | **3.5% (+0.7%)** | | **15.7% (−15.7%)** | **6.3% (+2.7%)** |

What it shows:

- **The design files are optimistic, not the model.** They are set to a polished finish and have no rail buttons or
  launch lug. Flown that way the app (and OpenRocket, which the app agrees with on these files) is 4–23% high. With
  regular paint (60 µm) and a pair of 1010 rail buttons it is within a few percent in both apogee and drag. What the
  rockets really had isn't recorded, so this is a plausible set-up, not a measured one.
- **Small rockets are where it matters.** A pair of 1010 rail buttons adds about a fifth to the drag of the 1.6 in
  Mini DX3 and a few percent to the 2.3 in Vulcanites; the buttons don't shrink with the rocket.
- So the app now says so: under the results, a design with a polished finish or with no rail buttons or lug gets a
  note with what each is worth on that flight and a button to change it.

What isn't in the set: flights whose recorder failed the two checks (among them every classic Featherweight Raven
file, whose accelerometer read 12–21% low against a second recorder on the same flights), the Estes rockets (their drag
is about the size of the sensor's resolution, and their fins aren't trapezoids), and the 38 mm prototype (two fin
sets). On those, the app's apogee as filed is within 4% for the Estes Top Shot's six flights and 0–5% high for four
J-motor flights of the prototype.

The same measurement is in the app: import a flight's altimeter file with an accelerometer column into the Flight
Log and it shows the drag the coast measured and can calibrate to it (`tests/coast.js` checks it against a flight of
known drag).

## Running the checks

You need the built page (`node build.js`) and Playwright's Chromium (`npx playwright install chromium`).

```
npm run validate:arcas                                   # CP against NASA's Arcas data
npm run test:drag                                        # drag against the NACA reports
npm run validate:openrocket -- --jar OpenRocket-24.12.jar   # apogee against OpenRocket's examples
npm run validate:accuracy                                # every measured rocket, by speed band
npm run validate:flights                                 # apogee against measured flights
npm run validate:logged                                  # apogee and coast drag against weighed, logged flights
npm run validate:qu8k                                    # drag above Mach 2 against Qu8k's flight recorder
npm run validate:proto                                   # drag from Mach 2.1 down against Proto's flight recorder
npm run validate:coast-trend                             # how drag changes with height in four tracked flights' coasts
```

The OpenRocket comparison also needs Java 17 or later and
[OpenRocket's release jar](https://github.com/openrocket/openrocket/releases/download/release-24.12/OpenRocket-24.12.jar).
Give it folders of your own `.ork` files after the jar to compare those instead, and `--csv results.csv` to save the
per-flight table.

## Reporting a difference

If the app disagrees with a real flight, OpenRocket or RockSim, please open an issue with the **Accuracy report**
template, with the design file, the motor and conditions, and the other number. Altimeter data from real flights is
the most valuable of all: it's the one reference that isn't another model.
