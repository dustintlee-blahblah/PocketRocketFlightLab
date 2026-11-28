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

| Check                                                                    | Against                                                                                                                                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apogee, 33 design files                                                  | OpenRocket 24.12, same files and conditions                                                                                                                                 | median +0.9%, typical ±1.5% (65 flights; before build 288, not redone)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Apogee, OpenRocket's own examples                                        | OpenRocket 24.12                                                                                                                                                            | median −0.2%, typical ±2.3% (34 flights; before build 288, not redone)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Center of pressure                                                       | NASA wind-tunnel data, Arcas rocket, Mach 0.6–4.6                                                                                                                           | RMS error 3.1% of body length                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Total drag                                                               | NACA free-flight data (RM A53D02), Mach 0.6–4.6                                                                                                                             | mean error 6.6%, app low                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Fin drag                                                                 | NACA wind-tunnel data (RM-10), Mach 1.5–2.0                                                                                                                                 | 0.021 in drag coefficient, the app high (0.10 measured). Until build 341 this case had the fins a quarter too small on a plain cylinder and showed 0.011                                                                                                                                                                                                                                                                                                                                                         |
| Lift and CP of a rocket with 60° swept fins, Mach 1.5–2 and 6.9          | NACA RM L54I03 and RM E50D28, the RM-10 in wind tunnels                                                                                                                     | Mach 1.5–2: normal-force slope 27–40% high and CP 4.5–5.3% of the length too far aft, the unsafe direction (42–61% and 5.4–6.6% before build 342; AERODYNAMICS.md, gap 17). Mach 6.9: 6% and 1.1% of the length; the body's pressure drag within 0.001                                                                                                                                                                                                                                                           |
| A whole rocket in flight with its drag taken apart                       | NACA RM L55H02, the full-scale RM-10, Mach 1.2–2.8, Reynolds number 60–220 million                                                                                          | Total drag 7.5%: 5–7% too little at Mach 1.2–1.6, 13–15% too much at Mach 2–2.2, 3% at Mach 2.8. Base drag within 0.007 (0.023 too much at Mach 1.2); the body's pressure drag 0.010 too little; what the exhaust removes from the base 0.014 too little                                                                                                                                                                                                                                                         |
| Drag, CP and CNα of a rocket never used for tuning                       | Aerobee 150A, manufacturer's data from wind-tunnel tests, Mach 0.1–5                                                                                                        | drag 4.8–5.9%, CP 0.7% of length, CNα 10%                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Drag of a rocket never used for tuning                                   | NACA RM L55G28a, fin-stabilized cone-cylinder, free flight, Mach 2.5–3.9                                                                                                    | 1.2%                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Drag that antennas add above Mach 1                                      | NASA TM X-1771, Cajun sounding rocket model, wind tunnel, Mach 2.3–4.63                                                                                                     | 0.019 in drag coefficient on four long fairings (0.06–0.12 measured), 0.006 on two raked boxes (about 0.01 measured)                                                                                                                                                                                                                                                                                                                                                                                             |
| Drag that fins add above Mach 2                                          | NASA TM X-1684, Tomahawk sounding rocket model, wind tunnel, Mach 2.3–4.63                                                                                                  | 0.010 and 0.013 in drag coefficient on two fin sets (0.19–0.32 measured); the body alone 7–18% high                                                                                                                                                                                                                                                                                                                                                                                                              |
| A boattail's pressure drag through Mach 1                                | NACA RM A57I09 (a 6° boattail), RM L56K22 (cones of 3° to 16°) and NASA TM X-1960 (3° to 15°), wind tunnel, Mach 0.6–1.4; NASA TR R-100 figure 13(a), free flight, Mach 1.2 | 0.006–0.024 in drag coefficient, low, on boattails of 3° to 10°; within 0.01 at 15° (0.07–0.14 measured on the 6° one, 0.18–0.24 on the 15° ones). Before build 341 the app gave a third to a fifth of the measured drag: a misprinted coefficient in its source (AERODYNAMICS.md, Boattails)                                                                                                                                                                                                                    |
| Whole rockets with boattails, Mach 1.1–2                                 | NASA TR R-100 configurations 11 and 36, free flight; Arcas model, NASA TN D-4014                                                                                            | The app has 20.3% and 16.8% too much drag; on the Arcas with fins 9% too much at Mach 1.5–1.8. Before build 342's fin wave drag: 14.6% and 17.9%; before build 341's boattail correction: 6.2%, 12.5% and 4–5% too little. The excess is not the boattail's (flight models with no boattail show it too): AERODYNAMICS.md, gap 15                                                                                                                                                                                |
| Pressure drag of noses 3 diameters long, Mach 1.24–3.67                  | NACA Report 1386, seven nose shapes alone, wind tunnel                                                                                                                      | 0.007 in drag coefficient on average, the app a little high (0.07–0.24 measured); 0.02–0.025 high on the ogive and the paraboloid at Mach 1.24                                                                                                                                                                                                                                                                                                                                                                   |
| Small polished flight models, Mach 0.9–1.25                              | NACA RM L53I01, six models with three fins, free flight                                                                                                                     | 4.1% with natural transition (the setting for a polished model); 6% too much drag with the app's default, turbulent from every leading edge                                                                                                                                                                                                                                                                                                                                                                      |
| A rocket with rounded-edge flat fins, Mach 0.75–2.0                      | NACA TN 3697 and RM L50I08a, the NACA standard test body, free flight                                                                                                       | Within 2–4% to Mach 0.93; 7–13% too little drag at Mach 0.95–1.05; 12–21% too much at Mach 1.4–1.8 (AERODYNAMICS.md, gap 19)                                                                                                                                                                                                                                                                                                                                                                                     |
| Drag that 6% wings add, slab, diamond, circular arc, Mach 0.75–1.5       | NACA RM L50E19a, the standard test body with wings, free flight                                                                                                             | Slab: 0.09 too little drag below Mach 0.9 (the square trailing edge), 0.05 too much at Mach 1.1–1.2, within 0.01 at 1.4–1.5. Diamond and circular arc: 0.055 and 0.17 too much at Mach 1.05 (0.15 and 0.30 before build 347's sonic plateau), within 0.03 by 1.4 (AERODYNAMICS.md, gap 19)                                                                                                                                                                                                                       |
| Drag a tapered 4% wing adds, sharp or square trailing edge, Mach 0.8–1.5 | NACA TN 3550 (RM L50F26), the same body with a 4% wing whose trailing edge is 0, 1/3, 2/3 or all of the thickness, free flight                                              | Square back: 0.10–0.17 too little drag from Mach 0.8 to 1.02 (on the body's cross-section; half the measured base drag of the square edge), right at Mach 1.1–1.35, 0.03–0.04 too little at 1.4–1.5. Sharp: within 0.012 below Mach 0.95, 0.08–0.14 too much at Mach 1.0–1.2 (the sonic plateau on a 3-D wing, as RM L50E19a's circular arc). The 1/3 and 2/3 sections have no form in the app (AERODYNAMICS.md, gap 19)                                                                                         |
| Drag an unswept 4.5% hexagonal wing adds, Mach 0.9–1.55                  | NACA RM L51A15, a large rocket-boosted wing-body model, free flight                                                                                                         | 0.073 mean in Cd on the body's cross-section (+0.033 bias). The measured rise comes at Mach 0.94–0.98 and peaks at 0.98; the app's rises later and its plateau (Mach 1.0–1.1) is about 25% above the measured peak. From Mach 1.3 to 1.55, 0.035 too much: 6% of the wave drag is the beveled plate's single thickness (the wing's tapers with its chord), the rest within the friction's uncertainty. The app's linear-theory fin drag agrees with exact linear theory within 1% here (AERODYNAMICS.md, gap 19) |
| Drag that swept wings add, Mach 1.1–1.7                                  | NACA TN 3697, six wings with 6% double-wedge sections on a body, free flight                                                                                                | 0.001–0.003 on the wing area for five of the six, 0.002–0.007 too little on the two tapered wings of aspect ratio 4 from Mach 1.2 to 1.5 (0.007–0.024 measured). Before build 342: flat where the measured drag rises, up to 0.008 off                                                                                                                                                                                                                                                                           |
| Apogee of measured flights                                               | 23 rockets from RASAero II's example files, Mach 0.55–3.6, up to 121,000 ft                                                                                                 | mean error 6.3%, bias +2.4% (RASAero II: 5.2%, −3.4%)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Drag above Mach 2 measured in a flight                                   | Qu8k's flight recorder, Mach 2.0–2.8 coasting, 27,000–54,000 ft                                                                                                             | app 12–22% high; the rocket bled tracking smoke into its base, which lowers its drag                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Drag from Mach 2.1 down measured in a flight                             | Proto's flight recorder, coasting and falling, shape from a photograph                                                                                                      | app within 8%, a little high                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| How drag changes with height in a supersonic coast                       | Four tracked two-stage flights, Mach 3.3–1.6, 28,000–70,000 ft                                                                                                              | the app's rise is 0–4% more than the flights'                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Apogee and coast drag of weighed, logged hobby rockets                   | 7 flights of 3 rockets, Harvey Mudd College data, Mach 0.3–0.9                                                                                                              | as their design files are set up (polished, no rail buttons): apogee 13.8% high, drag 15.7% low; with regular paint and rail buttons: apogee 3.5%, drag 6.3%                                                                                                                                                                                                                                                                                                                                                     |

"Typical" is the median of the absolute differences: half the flights are closer than that, half further.

## How much weight each check can bear

The checks on this page do not agree with one another to better than several percent, and they can't: almost none
of them tests the drag model alone. Each also depends on something its source didn't record, most often how the
surface was finished, sometimes the motor's real thrust or how the apogee was measured. So each case carries a
grade, set from what its source records and not from how well the app does on it (`grade` and `unknown` in
`validation/cases.js`; `validation/accuracy.js` and `validation/flights.js` print the results by grade):

- **Grade 1: every input that decides the result is recorded.** The shape from a drawing, the conditions (Reynolds
  number or the day's air), the state of the surface or boundary layer, for a flight the weight and a measured
  thrust curve, and the quantity itself measured directly.
- **Grade 2: one of those had to be assumed**, and the assumption moves the result by several percent.
- **Grade 3: two or more assumed, or the measurement itself is in doubt.** A sanity check, not evidence for a few
  percent either way.

**Drag against wind-tunnel and free-flight data** (check cases: total drag and drag less base; mean error, bias in
brackets, number of points):

| Grade | Below Mach 0.8   | Mach 0.8–1.2     | Mach 1.2–3        | Mach 3–5        |
| ----- | ---------------- | ---------------- | ----------------- | --------------- |
| 1     | 13.6% (+13.6), 3 | 12.1% (+3.2), 10 | 11.5% (+10.7), 29 | 7.2% (+6.8), 11 |
| 2     | 20.1% (−20.1), 2 | 11.8% (−7.0), 32 | 8.5% (+1.6), 32   |                 |
| 3     | 7.6% (+3.9), 4   | 10.0% (−0.8), 4  | 7.3% (+7.3), 8    | 4.5% (+4.2), 10 |

Grade 1 is the NACA and NASA models with their conditions stated (RM L55G28a, TN D-4013 and D-4014, TR R-100
configuration 11, TM-2005-213541, and from build 341 the Tomahawk body of TM X-1684). Grade 2 is TR R-100
configuration 36 (its report suspects laminar flow on the model), RM L56G24 (fairings not dimensioned) and, from
build 341, the two bodies of RM A57I09 (their drag includes a transition ring's; the boattailed one also carries the
rest of the boattail shortfall near Mach 1) and the six small models of RM L53I01 (scored with natural transition,
the one assumption: polished models whose fins, at a chord Reynolds number near a million, TR R-100 shows carrying
laminar flow; with the app's default they have 6% too much drag). Build 342's fin wave drag (the area rule: AERODYNAMICS.md, Fins)
moved these again: grade 1 at Mach 1.2–3 from 9.8% to 11.5% (TR R-100's configuration 11, whose fins' steep unswept
trailing-edge bevels the earlier rule had treated as swept), grade 2 there from 9.4% to 8.9% (8.5% with the full-scale RM-10 of RM L55H02 added, whose curved afterbody is entered as a cone). Build 341's boattail correction moved the grade 1 figures: Mach
0.8–1.2 from 16.4% to 10.9% (the Arcas), Mach 1.2–3 from 5.1% to 9.8% (TR R-100's configuration 11 and the Arcas at
Mach 1.5 and 1.8 now read high: AERODYNAMICS.md, gap 15). Grade 3 is the Aerobee 150A (a manufacturer's curve with neither
finish nor Reynolds number).

**Apogee against measured flights** (the 23 RASAero II files):

| Grade                                            | Flights | RASAero II   | App          |
| ------------------------------------------------ | ------- | ------------ | ------------ |
| 1                                                | none    |              |              |
| 2: only the finish unrecorded                    | 16      | 5.8% (−5.5%) | 5.6% (+2.7%) |
| 3: the motor or the measurement in doubt as well | 7       | 4.0% (+1.3%) | 8.4% (+4.1%) |

No flight here is grade 1: none records its finish. Grade 3 is the flights on experimental motors (Kinsel A-601,
the L500, Full Metal Jacket twice, Proteus 6, Qu8k), two of them with an apogee from an accelerometer integrated
twice, and Don't Debate This, a barometric reading at 56,000 ft.

**Flight recorders:**

| Check                               | Grade | What had to be assumed                                                                             | App                                          |
| ----------------------------------- | ----- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Seven weighed, logged hobby flights | 2     | regular paint and rail buttons (the files say polished, with no launch hardware)                   | apogee 3.5%, drag in the coast 6.3%          |
| Proto, Mach 2.1–0.6                 | 2     | the shape from a photograph, the fins' thickness, the finish; the burnout mass is worked out to 2% | drag 1–8% high                               |
| Four tracked two-stage coasts       | 2     | a stand-in shape, so only the change along the coast is compared                                   | rise with height 0–4% more than the flights' |
| Qu8k, Mach 2.0–2.8                  | 3     | tracking smoke bled into the base through the coast                                                | drag 12–23% high                             |

**How to read this.**

- **Above Mach 1.2 the best data put the app within 5%, with little bias** (36 grade 1 points), and the lower grades
  don't contradict that.
- **Below Mach 1.2 the grade 1 points are two wind-tunnel models, and they are not the last word for a rocket in
  flight.** Both ran at a Reynolds number of about 5 million with the boundary layer tripped near the nose, and the
  app reads 10–15% high on them at Mach 0.6–0.7, nearly all of it skin friction. Whether that is the app's friction
  at so low a Reynolds number or the models' boundary layers not being fully turbulent behind their strips can't be
  told from the reports. A rocket in flight is at ten to a hundred times that Reynolds number, where the question
  doesn't arise, so the flights are the better guide here: 3.5% on the weighed hobby rockets, 3.8% on the eight
  RASAero II flights below Mach 0.8. From Mach 0.9 to 1.2 the two models pull opposite ways (AERODYNAMICS.md, gap
  12).
- **A flight's apogee can't be judged closer than its finish allows.** Between polished and regular paint the 23
  flights' mean error moves from 6.3% to 8.8% and the bias from +3% to −6%; the truth for each rocket is somewhere
  between and unrecorded.
- **The cases that miss by 15% or more each have a named unknown**, and across the grades the misses fall on both
  sides at every speed. A fault in the model would show as the well-recorded cases all missing the same way in one
  band. Only the two wind-tunnel models below Mach 0.8 do that, at a Reynolds number flights don't see.

So from a design file alone the app's drag is good to about 5–8%, and no case here can show better than that. For
a rocket that has flown once with an altimeter, calibrating the drag from that flight's coast (README, "Flight
log") removes the finish, the hardware and most of what is left.

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

- **Pods with one- and two-fin sets**: in _Pods--powered with recovery deployment_, "Unpowered Pods" is 9% lower in
  the app and "BoosterOnly" 6% lower. Its pods carry fin sets of one and two fins, which OpenRocket treats by their
  actual direction and the app averages around the roll. The other pod, side-booster and tube-fin examples agree
  within 2%.
- **Airstarts and short, wide rockets**: the airstart examples fly 4–7% higher in the app; the "base drag hack"
  example 8% lower.

Among the flights not compared: _Simulation extensions_ and _Simulation scripting_ fly a HyperTEK L540 hybrid, which
isn't in the app's motor catalog, so the app keeps the motor that was chosen before (and says so).

## Center of pressure against wind-tunnel data

The CP decides stability, and stability decides whether a rocket flies straight, so it's checked against
measurements rather than another program. NASA measured the Arcas sounding rocket's CP in wind tunnels at small
angles of attack: a short and a long model below Mach 1 (TN D-4013, 1967) and the short model from Mach 1.5 to 4.6
(TN D-4014, 1967). `validation/arcas.js` builds both models from the reports' dimensions and finds the app's CP the
way a balance does, from the slopes of normal force and pitching moment over ±2°.

| Mach                  | 0.6  | 0.7  | 0.8  | 0.85 | 0.9  | 1.5  | 2.0  | 2.5  | 3.0  | 3.5  | 4.0  | 4.6  |
| --------------------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Short model, measured | 75.0 | 73.5 | 72.0 | 71.0 | 71.5 | 78.0 | 74.5 | 70.5 | 67.0 | 63.8 | 61.0 | 57.5 |
| Short model, app      | 75.2 | 75.4 | 75.7 | 75.9 | 76.1 | 78.5 | 73.7 | 69.4 | 65.4 | 61.8 | 58.4 | 54.7 |
| Long model, measured  | 76.5 | 75.7 | 75.5 | 75.8 | 75.8 |      |      |      |      |      |      |      |
| Long model, app       | 75.2 | 75.4 | 75.8 | 76.0 | 76.2 |      |      |      |      |      |      |      |

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
- **NACA RM E50D28**, the drag the RM-10's 60°-swept fins add, Mach 1.5 to 2.0 (Lewis 8- by 6-foot wind tunnel): mean error **0.021**
  in drag coefficient (the case's fins and body corrected in build 342).

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

|                                    | Subsonic (below 0.8)         | Transonic (0.8–1.2) | Supersonic (1.2–3) | High supersonic (3–5) |
| ---------------------------------- | ---------------------------- | ------------------- | ------------------ | --------------------- |
| Drag, mean error (while thrusting) | 6.2% (app high)              | 9.0%                | 8.2% (app high)    | 4.3%                  |
| CP, mean error                     | 1.1% of length (app forward) | 0.5%                | 1.0%               | 0.4%                  |
| CNα, mean error                    | 17.5% low                    | 11% low             | 16.5% low          | 16% low               |

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

|                  | Mach 1.7–2.1                 | Mach 2.6–2.8 |
| ---------------- | ---------------------------- | ------------ |
| Drag, mean error | 11.9% low                    | 13.4% low    |
| CP, mean error   | 6.0% of length (app forward) |              |

The drag gap is about 0.04 in Cd, roughly what the model's two accelerometer fairings near the CG (0.9 inch high and 14.5
inches long, top and bottom) and its nose probe would add; the app's design has neither, so this drag isn't a clean
check either way. The CP is another matter: the fairings sit at the CG, where they barely move it.

**NASA TM-2005-213541, configuration 3.** A slender missile model (Allen, 2005) in the Langley 8-Foot Transonic Pressure
Tunnel and Unitary Plan Wind Tunnel: a small ogive nose, a cone flaring to a 3.15-inch body 42.5 inches long, a short
boattail, and four small swept fins at the tail, Mach 0.6 to 3.95, the boundary layer tripped. The numbers come from the
report's own digital data (NTRS 20050165156), over ±2° as the app measures them. The axial force has the base pressure
taken out, so it is compared with the app's drag without its base drag.

|                            | Mach 0.6                     | Mach 0.9–1.2 | Mach 1.7–2.9 | Mach 3.95    |
| -------------------------- | ---------------------------- | ------------ | ------------ | ------------ |
| Drag less base, mean error | 9.9% high                    | 49% high     | 8.8% high    | 13.5% high   |
| CP, mean error             | 7.6% of length (app forward) | 9.7% forward | 4.7% forward | 4.0% forward |
| CNα, mean error            | 3.8% low                     | 14.5% low    | 17.0% low    | 25.5% low    |

(With build 307's drag the middle column is 25% high: the early rise was the fins', whose drag near Mach 1 is now
read from NACA Report 1253's chart for stubby wings. The paragraph below describes the model before it.)

Two things stand out. Through Mach 1 the app's drag rises far too early and too much on this body (+37% at Mach 0.9,
where the tunnel measured no rise yet, and +60% at 1.19); its short nose and the cone behind it are what the app's
transonic drag works from, so that is where to look. And with the Aerobee and RM L56G24, this is the third rocket where
the app's CP is forward and its normal-force slope low, all three with small fins far behind a long body: the fins
seem to carry more lift than the app gives them, or the body less. Both are open (AERODYNAMICS.md, gaps 4, 7 and 12); neither has
been changed to fit these cases.

`node validation/accuracy.js --verbose` runs every case and prints these tables, keeping the tuned cases apart from the
check cases. The cases themselves, with their sources and geometry, are in `validation/cases.js`; a new measured
rocket is added there. Across the check cases the drag error by speed band is 10.1% subsonic, 7.4% transonic, 9.3%
supersonic and 3.9% from Mach 3 to 5 (total drag; the transonic figure was 10.4% and the supersonic 9.4% before the six
RM L53I01 models were added, which are scored with natural transition), the CP error 2.4%, 2.7%, 2.4% and 1.3% of the length, and the
normal-force slope 18% low below Mach 1.2, 16% off from Mach 1.2 to 3 (the RM-10's swept fins are 27–40% high there:
AERODYNAMICS.md, gap 17) and within about 10% above.

## Apogee against measured flights

Twenty-three rockets whose apogee was measured, from the example design files that come with RASAero II
([rasaero.com](https://www.rasaero.com)): student rockets (USAF Test Pilot School 2004, Cal Poly Pomona 2005), LDRS-26
and Black Rock flights from J to Q motors, and the high-altitude Qu8k (121,478 ft), Proteus 6 and Kinsel A-601.
`validation/flights.js` flies each in the app with the file's launch weight, CG, launch site, rail, rail guides or launch shoes and wind, on RASAero's
own thrust curve for the motor (`validation/flight-motors.eng`, from OpenRocket's motor database). The geometry and
numbers are copied into `validation/cases.js` (`FLIGHTS`); the files themselves aren't in this repository.

The figures are for the current drag model (build 307), with the air aloft as build 350 takes it, the fins' leading-edge radius from build 322 (it moved Kinsel A-601, Don't Debate This and Qu8k, the three files that give one, by 0.2–1.5%). Seventeen of the apogees were read by barometric altimeters,
which read low in air warmer than standard, so those are compared with what the altimeter would have read at the
simulated apogee, for the app and for RASAero II alike (`--geometric` compares true heights instead; see "Notes on
the evidence" in [AERODYNAMICS.md](AERODYNAMICS.md)).

| Flight                                     | Max Mach | Measured (ft) | How                                  | RASAero II | App    |
| ------------------------------------------ | -------- | ------------- | ------------------------------------ | ---------- | ------ |
| Thunder and Lightning, LDRS-26             | 0.55     | 3,577         | barometric altimeter                 | +1.9%      | +6.5%  |
| Gibb, LDRS-26                              | 0.56     | 3,913         | barometric altimeter                 | −1.8%      | +1.2%  |
| Cancer Descending, LDRS-26                 | 0.57     | 6,188         | average of two barometric altimeters | −6.2%      | −2.9%  |
| LOC/Precision EZI-65, LDRS-26              | 0.60     | 3,965         | barometric altimeter                 | −2.8%      | +9.7%  |
| USAF TPS 2004, Team 3                      | 0.64     | 3,964         | barometric altimeter                 | −6.8%      | −5.1%  |
| USAF TPS 2004, Team 2                      | 0.65     | 3,710         | barometric altimeter                 | −0.2%      | +1.7%  |
| USAF TPS 2004, Team 1                      | 0.67     | 3,837         | barometric altimeter                 | −2.1%      | +0.1%  |
| Gary Byrum, LDRS-26                        | 0.76     | 5,732         | barometric altimeter                 | −15.5%     | +3.9%  |
| Ion Drive, LDRS-26                         | 0.80     | 8,027         | average of two barometric altimeters | −1.1%      | −6.4%  |
| Cal Poly Pomona 2005, Team Discovery       | 0.83     | 4,930         | barometric altimeter                 | −4.6%      | +0.3%  |
| Blister                                    | 0.85     | 9,026         | barometric altimeter                 | −12.5%     | −4.6%  |
| Cal Poly Pomona 2005, Team Columbia        | 0.88     | 5,085         | barometric altimeter                 | −6.9%      | −1.4%  |
| Rabia, short fin can                       | 0.90     | 10,584        | barometric altimeter                 | −9.1%      | +0.3%  |
| Raven, LDRS-26                             | 1.15     | 8,815         | barometric altimeter                 | −2.2%      | +23.3% |
| Rabia                                      | 1.21     | 12,745        | barometric altimeter                 | −8.5%      | +6.8%  |
| Torrent                                    | 1.29     | 12,807        | barometric altimeter                 | +2.5%      | +15.5% |
| Kline-Rogers L500 rocket, USXRL-89         | 1.92     | 24,771        | optical tracking                     | +7.0%      | −7.9%  |
| Kinsel A-601 (P4935)                       | 2.05     | 42,771        | GPS                                  | −3.9%      | +0.8%  |
| Full Metal Jacket, BALLS 005               | 2.28     | 37,981        | optical tracking                     | +2.1%      | +0.1%  |
| Full Metal Jacket, Black Rock 6            | 2.44     | 30,038        | optical tracking                     | +8.4%      | +1.1%  |
| Proteus 6 (P9381)                          | 2.99     | 85,067        | integrated accelerometers            | −4.2%      | +17.0% |
| Don't Debate This (N5800 minimum diameter) | 3.05     | 56,573        | average of two barometric altimeters | +4.1%      | −12.5% |
| Qu8k (Q18000)                              | 3.61     | 121,478       | integrated accelerometer             | −1.5%      | +14.8% |

| Mean absolute error (bias) | Flights | RASAero II   | App          |
| -------------------------- | ------- | ------------ | ------------ |
| All                        | 23      | 5.0% (−2.8%) | 6.3% (+2.7%) |
| Below Mach 0.8             | 8       | 4.7% (−4.2%) | 3.9% (+1.9%) |
| Mach 0.8–1.2               | 6       | 6.1% (−6.1%) | 6.1% (+1.9%) |
| Above Mach 1.2             | 9       | 4.7% (+0.7%) | 8.5% (+4.0%) |

Compared as true heights the app is 9.0% off (+7.6%) and RASAero II 5.4% (+1.8%). RASAero II's figures above moved
in build 350 (5.2% to 5.0%) only because its predicted apogees are turned into altimeter readings with the app's air,
which build 350 changed aloft.

Three more flights, shared by flyers with their permission (their design files stay out of this repository). The two
Estes flights were logged by an altimeter that reports peak and average acceleration, coast-to-apogee and
apogee-to-ejection times, ejection altitude and top speed; its accelerometer stops at about 23 g, and above that its
acceleration and top speed read low.

| Flight                                        | Mach | Measured                                                                 | App              |           |
| --------------------------------------------- | ---- | ------------------------------------------------------------------------ | ---------------- | --------- |
| CT Concept 98, Cesaroni 6251M1400, Black Rock | 1.5  | GPS apogee about 17,400 ft                                               | 17,294 ft        | −0.6%     |
| Estes Partizon, AeroTech I205W                | 0.97 | apogee 4,263 ft (ejection 0.9 s before it, at 4,213 ft)                  | 4,312 ft         | +1.1%     |
| Estes Ascender, AeroTech H135W                | 0.77 | top speed 880 ft/s, peak 22.9 g, ejection at 3,943 ft, 2 s before apogee | 866 ft/s, 22.0 g | see below |

- **Concept 98**: as the flyer set it up, with its pair of rail buttons, its tail cone painted rather than smooth, the field's
  3,898 ft elevation and its saved weather. Before the rail buttons and paint were added the app gave 18,075 ft (+3.9%);
  OpenRocket 24.12 gives 16,875 ft (−3.0%) on that earlier file. Until build 341 the app gave 17,452 ft (+0.3%): this
  rocket's tail cone is a 16° boattail to 0.72 of the diameter, the flow counted as attached to it, and build 341's
  boattail correction (AERODYNAMICS.md, Boattails) roughly doubles its drag above Mach 0.9. Direct measurements of
  15° boattails at Mach 1.2 to 1.3 (NASA TM X-1960) agree with the corrected value within 0.01, so the earlier
  match rested on too little boattail drag; what offsets it on this rocket is not known (gap 15).
- **Partizon**: flown at the launch conditions saved with the file, on a 10 s delay, which puts the charge 0.6 s before
  apogee as on the flight; the app's coast from burnout to apogee, 10.6 s, matches the altimeter's 10.8 s. The
  altimeter's peak of 23.0 g is its limit (the app gives 47 g), so its 905 ft/s top speed reads low (the app
  gives 1,101 ft/s).
- **Ascender**: the charge fired while the rocket was still climbing, so its 4,030 ft top altitude is short of a full
  apogee and isn't graded. Its boost is: peak acceleration and top speed agree within 4%, below the altimeter's limit.
  The app passes 3,943 ft about 5.6 s after burnout, which fits the motor's shortest delay (6 s); with that delay the app
  gives 4,224 ft for the highest point after ejection (+4.8% on the logged 4,030 ft). Without the early charge it would
  have reached 4,869 ft.

Rerun Nov 23 from the files as the flyers last sent them; the earlier figures in this section's notes come from older
builds and earlier versions of the files.

None of these is in the averages above, which cover the RASAero II files only. `node validation/shared-flights.js
--dir <folder>` flies them again from a folder holding the three design files (kept outside the repository).

**The app is 7% off on these flights, a little high, and 9% above Mach 1.2.** None of its constants were set from
these flights, and the comparison is not entirely independent of RASAero II either: these are the flights RASAero
II's author chose to publish, and its own model is partly calibrated on flights like them. Flight-to-flight scatter
is real too: the three Test Pilot School rockets are the same airframe on the same motor within 0.16 lb, and their
measured apogees spread over 7%.

**What is left is mostly scatter.** Above Mach 1.2 three flights are within 3%, Rabia is 6% high and the L500 7%
low, and the rest are Qu8k (+13.4%), Proteus 6 (+16.1%), Torrent (+14.5%) and Don't Debate This (−14.2%); just
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
- **Don't Debate This** reached 56,000 ft, read by barometric altimeters. Its −14.2% rests on how warm the air was
  all the way up, which the pad's temperature only suggests (the offset is carried through the troposphere and
  dropped above it; carried all the way up, as before build 307, it was −14.0%); as a true height it is −5.3%.
- **Raven** is a single flight of a 1.75 in rocket 42 diameters long with rounded fins; with regular paint it is +7%.
  Audited Nov 22 against its RASAero II file with Raven, Torrent and Rabia: the cases match the files part for part,
  and opened in the app through its own reader each flies to the case's apogee (with the boundary layer the
  validation uses; the reader takes the files' "Turbulence False" as natural transition, 2–3% higher). The weather is
  plausible (LDRS-26 was at Jean, Nevada, July 12–17, 2007, so 100°F is likely). What is uncertain is the motor:
  the app's J570W curve (the 1998 TMT test file on ThrustCurve.org) integrates to 1,034 N·s, 6% above the 973 N·s
  ThrustCurve.org lists for the motor; at 973 N·s Raven's top speed is RASAero II's (1,251 against 1,243 ft/s) and
  its error +15.6% in place of +22.0%, and Gary Byrum's (the other J570W) would go from +3.2% to a little below zero. The app's
  other motors' curves here differ from their listed impulse by 2.7% (I284W, below) and 5.3% (K550W, above); the rest
  are within 1.1%. The curves are flown as published (Dustin, Nov 23: scaling every catalog motor to its listed impulse
  was tried and taken back: it moved the 23 flights from 6.3% to 6.6%, bias +2.4% to +1.8%, and would have set the
  app apart from OpenRocket, which flies the same curves).
- **Torrent** has rounded fins too, and a 1/16 in step at its fin can. Until build 307 that step was charged most
  of stagnation pressure, two to seven times what steps measure (NASA TN D-8040), which hid about 7% of apogee;
  the rockets with rounded fins need more drag than the app gives them (AERODYNAMICS.md, known gaps).

**How the rockets were finished is the largest unknown.** The files describe most of these rockets as "Smooth (Zero
Roughness)", RASAero II's own setting, so they fly here with the nearest OpenRocket finish, polished (2 µm). How they
were really finished isn't recorded:

| Finish given to the "zero roughness" rockets            | Mean error | Bias  | Above Mach 1.2                              |
| ------------------------------------------------------- | ---------- | ----- | ------------------------------------------- |
| Polished, 2 µm (as the files say; the headline numbers) | 6.3%       | +2.7% | 8.5%                                        |
| Smooth paint, 20 µm                                     | 6.2%       | +1.2% | 8.3%                                        |
| Regular paint, 60 µm                                    | 8.8%       | −5.9% | 10.7% (8 flights: one falls below Mach 1.2) |

Regular paint on all of them overshoots (the student rockets then come out 7–13% low, the L500 24% low), so the real
finishes were probably mixed, and smoother on these rockets than on the weighed hobby rockets further down, which
needed regular paint and rail buttons. The headline keeps the files' own setting rather than whichever finish fits
best, which would turn these check flights into tuning. Finish matters more above Mach 1 than below it: Proteus 6
goes from +16.1% polished to +8.8% with smooth paint and −5.4% with regular paint. (`node validation/flights.js
--zero-finish smooth` or `normal` flies these rockets with the other finish.)

### Drag above Mach 2 measured in a flight: Qu8k's recorder

In the coast an axial accelerometer reads the drag over the mass and nothing else. Qu8k's R-DAS recorded it at 200 Hz
(the recorder file and the flight report are on the builder's page, ddeville.com), and the rocket was weighed after
the flight (154.5 lb), so each moment of the coast gives a drag coefficient. `validation/qu8k-coast.js` works it out
from 13.5 s (after the motor's tail-off) to 26 s (while the drag is still over 0.5 g), with the speed and height from
integrating the same accelerometer, and sets the app's coasting drag coefficient beside it at the same speed and
height. The quarter-second means of the recording are in `validation/cases.js` (`QU8K_COAST`).

| Mach | Height (ft) | Measured Cd | App   | App against measured |
| ---- | ----------- | ----------- | ----- | -------------------- |
| 2.74 | 27,300      | 0.310       | 0.333 | +7%                  |
| 2.59 | 32,800      | 0.313       | 0.346 | +11%                 |
| 2.43 | 37,800      | 0.322       | 0.364 | +13%                 |
| 2.30 | 42,600      | 0.317       | 0.385 | +22%                 |
| 2.18 | 47,100      | 0.325       | 0.406 | +25%                 |
| 2.03 | 53,500      | 0.310       | 0.435 | +40%                 |

Over the whole stretch the app is **23% high** (measured 0.305, app 0.375) with the air aloft as the app takes it
from the pad's temperature (as much warmer than standard as the pad through the troposphere, standard above it),
and **12% high** (0.331 against 0.372) with standard air all the way up; the day's upper air isn't known. With no
zero correction it would be 34% and 23%. The measured coefficient
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

| Flight                | From                | To                  | Flight's rise | App's rise |
| --------------------- | ------------------- | ------------------- | ------------- | ---------- |
| Stratospheric Express | Mach 2.6, 28,500 ft | Mach 1.7, 55,900 ft | 1.28–1.43     | 1.37–1.43  |
| Anniversary Special   | Mach 2.7, 27,700 ft | Mach 1.5, 60,800 ft | 1.30–1.47     | 1.54–1.61  |
| A Money Pit           | Mach 2.5, 46,600 ft | Mach 2.1, 60,200 ft | 1.21          | 1.19–1.20  |
| SVJ2                  | Mach 3.3, 39,300 ft | Mach 2.5, 70,300 ft | 1.50–1.57     | 1.37–1.41  |

Each range is from the air aloft as the app takes it from the pad's temperature (the lower figure) to standard air
all the way up. Over the four coasts the app's rise is 4% more than the flights' with the first and the same as
theirs with the second; flight by flight it is from 10% less (SVJ2) to 19% more (Anniversary Special). So up to
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

| Mach           | Height (ft) | Measured Cd | App   | App against measured |
| -------------- | ----------- | ----------- | ----- | -------------------- |
| 2.11           | 9,900       | 0.471       | 0.531 | +13%                 |
| 1.82           | 13,700      | 0.526       | 0.571 | +8%                  |
| 1.60           | 17,000      | 0.549       | 0.597 | +9%                  |
| 1.36           | 21,000      | 0.592       | 0.622 | +5%                  |
| 1.10           | 25,700      | 0.618       | 0.655 | +6%                  |
| 0.90           | 29,500      | 0.475       | 0.486 | +2%                  |
| 0.80           | 31,500      | 0.487       | 0.498 | +2%                  |
| 0.87 (falling) | 24,200      | 0.463       | 0.480 | +4%                  |
| 0.94 (falling) | 12,900      | 0.452       | 0.480 | +6%                  |

That is with smooth paint and standard air aloft. By finish and upper air, the app's mean error is:

| Finish, air aloft                   | Coast above Mach 1.2 | Mach 0.75–1.2 | Falling, Mach 0.6–0.95 |
| ----------------------------------- | -------------------- | ------------- | ---------------------- |
| Smooth paint, as warm as at the pad | 5.9% (+6%)           | 6.1% (+1%)    | 5.5% (+5%)             |
| Smooth paint, standard              | 8.1% (+8%)           | 4.4% (+4%)    | 7.1% (+7%)             |
| Polished, as warm as at the pad     | 1.2% (0%)            | 5.7% (+1%)    | 6.4% (+4%)             |
| Polished, standard                  | 1.7% (+2%)           | 4.1% (+4%)    | 5.6% (+6%)             |

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

Hoerner's drag of surface imperfections (_Fluid-Dynamic Drag_, ch. V) was also tried and left out: a joint or step
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

| Flight                           | Barometer apogee, ft | App, as filed      | App, painted with rail buttons | Coast Cd (Mach) | App, as filed      | App, painted with rail buttons |
| -------------------------------- | -------------------- | ------------------ | ------------------------------ | --------------- | ------------------ | ------------------------------ |
| Madcow Mini DX3, F67W, flight 1  | 1,730                | +15.0%             | +3.0%                          | 0.717 (0.25)    | −18.9%             | +0.9%                          |
| Madcow Mini DX3, F67W, flight 3  | 1,597                | +22.7%             | +10.3%                         | 0.774 (0.20)    | −22.7%             | −7.1%                          |
| Madcow Mini DX3, F67W, flight 5  | 1,723                | +12.6%             | +1.4%                          | 0.765 (0.25)    | −23.6%             | −5.7%                          |
| Madcow Mini DX3, G79W            | 3,010                | +13.7%             | −4.2%                          | 0.664 (0.35)    | −15.7%             | +11.1%                         |
| Madcow Mini DX3, H128W           | 4,095                | +22.3%             | −2.6%                          | 0.717 (0.40)    | −22.4%             | +3.2%                          |
| LOC Vulcanite, G78G              | 1,381                | +3.5%              | −0.4%                          | 0.663 (0.20)    | −2.2%              | +7.7%                          |
| LOC Dual Deploy Vulcanite, I140W | 3,804                | +6.7%              | −2.6%                          | 0.703 (0.30)    | −4.7%              | +8.6%                          |
| **Mean error (bias)**            |                      | **13.8% (+13.8%)** | **3.5% (+0.7%)**               |                 | **15.7% (−15.7%)** | **6.3% (+2.7%)**               |

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

## The apogee range on the Results tab

The small ± beside the apogee, and the top of the range the waiver check uses, come from the measured flights above.
For the flight's band of top speeds, `validation/flights.js --accuracy` takes where each real apogee landed against the
app's prediction and writes the mean and standard deviation to `src/data/apogee-accuracy.js`:

| Top speed      | Flights | Mean  | Standard deviation | 1σ range (shown) | 90% range (waiver check) |
| -------------- | ------- | ----- | ------------------ | ---------------- | ------------------------ |
| Below Mach 0.8 | 8       | −1.4% | 4.6%               | −6.6% to +3.9%   | −10.6% to +7.9%          |
| Mach 0.8–1.2   | 6       | −0.5% | 9.1%               | −11.4% to +10.4% | −20.3% to +19.4%         |
| Above Mach 1.2 | 9       | −4.6% | 9.3%               | −15.1% to +5.8%  | −22.8% to +13.6%         |

Negative is lower than predicted. With this few flights each range is a prediction interval for one more flight
(Student's t for that many flights, widened by √(1 + 1/n)), so the 1σ range is a little wider than one standard
deviation; the ranges tighten as flights are added. The range is uneven where the app has tended to predict high or low,
but the predicted apogee itself isn't moved. The flights were weighed and not calibrated, so two allowances are added
(root-sum-square) by judgment: an estimated weight widens the range 10% down and 3.6% up (at 90%), and a drag
calibrated to one of your own flights replaces the band's figures with 3%. The dispersion run's spread is added the same
way. Mach 0.8–1.2 is wide on both sides because of one flight (Raven, 22% under its prediction); the shared flights
(Partizon +1.1%, Concept 98 −0.6%) aren't in it, because their design files aren't in this repository.

## Running the checks

You need the built page (`node build.js`) and Playwright's Chromium (`npx playwright install chromium`).

```
npm run validate:arcas                                   # CP against NASA's Arcas data
npm run test:drag                                        # drag against the NACA reports
npm run validate:openrocket -- --jar OpenRocket-24.12.jar   # apogee against OpenRocket's examples
npm run validate:accuracy                                # every measured rocket, by speed band
npm run validate:flights                                 # apogee against measured flights
node validation/flights.js --accuracy src/data/apogee-accuracy.js   # the Results tab's apogee range from them
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
