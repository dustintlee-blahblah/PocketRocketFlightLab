# The aerodynamic model, term by term

Pocket Rocket Flight Lab works out drag and stability the way every practical rocket and missile code does (USAF
DATCOM, Missile DATCOM, the Aeroprediction Code, RASAero): the rocket is split into pieces (skin, nose, shoulders,
boattail, base, fins, rail buttons), each piece gets the method best supported by measurements for it, and the pieces
are added. No single equation covers a rocket from a standstill to Mach 5. The flow below about Mach 0.8, through the
speed of sound, and well above it behave differently, and the transonic range in between has no closed-form theory
at all, only measurements.

This page is the map: for every term, which source governs it at which speed, where one source hands over to the next,
and how well each part has been checked against real measurements. Each term's code is in
`src/js/physics/aerodynamics.js` (and the fin edge helpers in `src/js/core/units-and-fin-edges.js`), with the same
sources cited beside it. [VALIDATION.md](VALIDATION.md) has the full comparisons and how to rerun them.

## Speed bands

| Band | Mach | What changes |
|---|---|---|
| Subsonic | below 0.8 | Drag is mostly skin friction and base. Compressibility only scales things a little. |
| Transonic | 0.8–1.2 (fins to 1.5) | Shocks form on the nose and fins; drag rises steeply and the CP moves. Measured data only. |
| Supersonic | 1.2–4 | Wave drag from shocks; linear supersonic theory works for thin fins and slender noses. |
| Hypersonic edge | 4–6 | Past most of the measured data; blended into modified Newtonian theory. |

Where one method hands over to another the two are blended smoothly over a stated Mach range (a smoothstep), so no
coefficient jumps.

## The current drag model and the previous one

**From build 288 the model described in this section (called the test model below, the name it had while it was being
built) is the app's drag model.** The one it replaced, called the released model below and described term by term in
the rest of this page, is kept as Settings → Drag model → Previous, and the rest of this page's drag tables describe
it; where the two differ, the table just below says how. Stability (the center of pressure and normal force) is the
same in both.

Settings → Drag model switches between the test (current) model and the released (previous) one. The test model
was built term by term from public sources, mainly the method choices in the Missile DATCOM final report (Vukelich et al., AFWAL-TR-86-3091
Volume I, 1988, approved for public release) and the NACA and NASA reports it relies on. A term not yet moved over is
computed exactly as the released model computes it. Flights, the landing dispersion, flight-log calibration and the
Wind Tunnel follow the setting; with the previous model chosen, the Wind Tunnel also draws the current model's drag.
A drag calibration is kept with the model it was fitted with. The code is in `src/js/physics/drag-model.js`.

| Term | Test model | Released model |
|---|---|---|
| Skin friction compressibility | Van Driest II (Aero. Eng. Review, October 1956; Hopkins and Inouye, AIAA J., 1971) at the skin's own temperature, as a ratio to the incompressible value | (1 + 0.144 M²)^−0.65, adiabatic wall |
| Skin temperature | In a flight, followed from the pad's air temperature as the boundary layer heats the skin (below). With no flight history (the Wind Tunnel, the drag cases) the skin is fully heated, as on a wind tunnel model. | not used |
| Body base pressure | NASA TR R-100 (Stoney, 1961), fig. 3: the flight-measured curve for a cylindrical afterbody, Mach 0.5 to 2 (the middle of its band: 0.136 below Mach 0.9, a peak of 0.214 at Mach 1.05, meeting TN 3819 at Mach 2). Missile DATCOM takes cylinder base drag from this report. TN 3819 above Mach 2, and its boattail and fin corrections above Mach 1, as released. | Fleeman below 0.95 (0.12 + 0.13 M²: 0.17 at Mach 0.6, 0.24 at 0.95), blended into TN 3819's basic curve by Mach 1.2 |
| Nose wave drag above Mach 2 | Second-order shock-expansion (Syvertson and Dennis, NACA Report 1328) from the exact Taylor–Maccoll cone solution at the tip, summed over the nose (the routine behind the Wind Tunnel's flow picture), taking over from the TR R-100 curves between Mach 2 and 2.5. Missile DATCOM's choice; its report found the method about 20% high below Mach 2. Pointed noses only. | TR R-100 curves to Mach 3.6, then Bonney or the nearest shape's trend, blended into modified Newtonian theory from Mach 4 to 6 |
| Boattail ending at the base, above Mach 1 | TR R-100's equation 1 for conical afterbodies: a wave drag of (0.0010·θ + 0.00071·θ²)/M·[1 − (base radius/maximum radius)ⁿ], θ in degrees, n = 4 below Mach 3.5 and 3 above (it approximates the second-order theory of NACA TN 2972), fading in from Mach 1 to 1.2; and the base pressure times base radius/maximum radius. For the attached share of the boattail, slopes to 15°. | No wave drag on an attached boattail; base pressure by TN 3819's boattail correction, fading in from Mach 1.5 to 2 |
| Everything else | as released | |

**The skin's temperature in flight.** One temperature for the whole skin. The boundary layer heats it at
h·(Taw − Tw), with h from the body's own friction coefficient by the Reynolds–Colburn analogy (St = Cf/2·Pr^−2/3) and
Taw the adiabatic wall temperature (recovery factor 0.89). The heat goes into the wall down to the depth a steadily
heated thick solid would have warmed, √(π·α·t)/2 (Carslaw and Jaeger), up to the wall's thickness: all of a thin
metal skin, only the outer part of a composite or paper one. The wall's thickness and density come from the design
file (a body average); its heat capacity and diffusivity are typical values for the density's class (steel and
titanium, aluminium, laminates, paper and plastics). Left out: the motor's heat, radiation, the fins' thinner
sections, and the much hotter nose tip and fin leading edges, so it is the temperature the friction sees, not a check
on what the airframe survives. A cooler skin has more friction, so a rocket's drag is highest early in a fast flight.

Against the same measurements (mean absolute error), term by term:

| Case | Released | Test: friction only | Test: friction and base | Test: first four terms | Test: with the fin term | Test: boattails and transonic fins |
|---|---|---|---|---|---|---|
| NACA RM A53D02, total drag, free flight (tuned) | 14.4% | 10.3% | 8.1% | 8.6% | 6.2% | 6.2% |
| NACA RM E50D28, fin drag, wind tunnel (tuned; fin thickness corrected, see Fins) | 0.027 Cd, low | | | 0.027 Cd, low | 0.013 Cd | 0.013 Cd |
| NACA RM L55G28a, total drag, free flight (check) | 8.4%, low | 2.8% | 2.8% | 2.6% | 2.7% | 2.7% |
| NASA TN D-4013, Arcas short model, 15° boattail, total drag, wind tunnel (check) | 25.4%, high | | | 22.0% | 7.2% |
| TR R-100 configuration 11, 8° boattail, total drag, free flight (check) | 16.7%, low | | | 7.2% | 6.9% |
| TR R-100 configuration 36, 4° boattail, total drag, free flight (check) | 24.0%, high | | | | 13.8%, high |
| TR R-100 figure 5, pressure drag of 45° fins 2.8% thick (check) | 0.028 Cd | | | 0.028 Cd | 0.012 Cd | 0.012 Cd |
| Aerobee 150A, drag coasting, wind tunnel (check) | 4.9% | 9.1%, high | 9.2%, high | 7.8%, high | 9.3%, high | 9.3%, high |
| Aerobee 150A, drag thrusting, wind tunnel (check) | 6.9% | 9.1%, high | 10.3% | 9.8% | 7.9% | 7.9% |
| Aerobee 150A, what the exhaust removes (coasting less thrusting), Mach 2–5 (check) | 0.002 Cd | | | | | 0.002 Cd |
| 23 measured flights, apogee | 9.9% (+9.2% bias) | 8.7% (+7.5%) | 9.7% (+9.3%) | 9.7% (+9.5%) | 8.3% (+7.0%) | 8.3% (+7.0%) |
| the flights below Mach 0.8 | 7.9% | 7.8% | 9.5% | 9.5% | 9.5% | 9.5% |
| the 9 flights above Mach 1.2 | 13.0% | 9.9% | 11.0% | 11.2% | 7.5% | 7.5% |
| the same 23 flights, as the altimeter reads (below) | 8.3% (+3.9%) | | | | | 5.8% (+1.7%) |
| the flights below Mach 0.8, as the altimeter reads | 4.7% (−0.5%) | | | | | 4.3% (+2.0%) |
| the 9 flights above Mach 1.2, as the altimeter reads | 12.2% (+10.4%) | | | | | 7.0% (+1.9%) |

**Friction.** The skin's temperature has two limits: held at the pad temperature the friction-only column reads 9.2%,
0.030, 13.4% high, 24.3% high, 16.0% high, 7.8% and 7.9%; fully heated it reads 10.3%, 0.027, 2.8%, 9.1%, 9.1%, 8.9%
and 10.4%. The drag cases have no flight history, so the test model flies them fully heated: right for the wind
tunnel cases, unknown for the two free-flight models. The measured flights are flown with the skin followed in time,
but `validation/cases.js` gives every one of them the same placeholder wall (2 mm, density 1000), which heats within a
few seconds. Flown as 3 mm aluminium they give 8.4% (9.1% above Mach 1.2), as 6 mm 8.2% (8.8%). Published build
details give only the Qu8k's material (aluminium); each rocket's real wall is the missing input there.

**Base.** TR R-100's flight-measured base pressure is lower than Fleeman's correlation at subsonic speeds (0.136
against 0.17–0.24) and a little higher from Mach 1.2 to 2. Against measured drag it is the better curve: RM A53D02
goes from 12% high to 4.5% high at Mach 0.6 and from 10.3% to 8.1% overall. Against measured apogees it is worse, by
about a point at every speed: the flights want more drag than the model has, and Fleeman's higher subsonic base
drag was supplying some of it. This is gap 8 below (real rockets coast lower than the model says) made plainer: the
missing drag is not in the base of a clean body. The fin correction above Mach 1 is TN 3819's increment over its own
body curve, so on R-100's higher curve from Mach 1 to 2 it may count some of the fins' effect twice.

**Nose.** Shock-expansion reads 4–9% under the released nose drag from Mach 2.5 to 4 and above it past Mach 5, where
the released model blends into Newtonian theory. The first-four-terms column's changes from the one before are all the nose's.

**Boattails.** Three cases check them: two rocket-boosted models from TR R-100's appendix (configuration 11, an 8°
boattail to 0.67 of the diameter with delta fins; configuration 36, 4° to 0.72 with 45° untapered fins) and the
Arcas short model in the wind tunnel (NASA TN D-4013: 15° to 0.65, Mach 0.6 to 1.2, with the base's own force given
separately). The measured flights' boattails are all steeper than 25° and count as separated. The NACA models were
polished metal: flown with a 2 µm finish the test model's friction matches the report's own estimate for
configuration 11 at Mach 2 (0.110); with 20 µm it was a third higher, because at those Reynolds numbers 20 µm is
rough.

The last column changes three things in the test model, each from the Arcas data:

- The flow stays on a boattail up to 15° (none past 25°; the released model starts to separate it at 8°, after
  Hoerner). The Arcas base reads at or above free-stream pressure below Mach 0.95, which it could not behind a
  separated cone.
- The base-radius rule for the base pressure applies below Mach 1 too.
- The afterbody's wave drag (TR R-100's equation 1) fades in from Mach 0.88 to 1 instead of from 1 to 1.2. With
  its fins off the Arcas model gains about 0.15 of pressure drag over that range; the equation gives 0.14 at Mach 1.

The Arcas case goes from 22% to 7%. What is left: the test model is 15% high below Mach 0.8, where the tunnel's base
force is negative (−0.04; a sting was in the wake) and the model's is +0.04; configuration 11 is 8% low at Mach 1.1
and 10% high at Mach 2; configuration 36 is 13–27% high throughout, about half of it below Mach 1 where the
report suspects laminar flow on the fins, and its nose (a curved tip faired into a cone) is only roughly what the
app can describe.

**Fins near Mach 1.** The Arcas fins (30° sweep, 4.3% thick) add 0.03 on their own area from Mach 0.95 to 1.05 (fins
on minus fins off, less friction), twice what thin-airfoil theory gives, and are back on it by Mach 1.2. The test
model now takes the larger of the linear term and a transonic peak, 5.7·(t/c)^(5/3) times the released model's
sweep factor, which also gives the 0.0055 peak of TR R-100's 45° fins. The released model's bump has the same form
with 9.36, fitted to the Arcas total drag when its base drag was too high.

**Most of the missing coast drag was the altimeters.** Seventeen of the 23 apogees were read by barometric
altimeters, which turn pressure into height with the standard atmosphere whatever the day's temperature. In air
warmer than standard the same pressure change spans more height, so the altimeter reads low: about 1% for every
3 °C, 9% at LDRS-26's 100 °F (Featherweight's Raven manual says 10% or more; Nakka's flights with GPS and a
barometric altimeter side by side show the same). The flights were compared as true heights. `validation/flights.js`
now compares those 17 with what the altimeter would have read at the simulated apogee (both the app's and RASAero
II's predictions; `--geometric` gives the old comparison). The test model's error falls from 8.3% (+7.0% bias) to
5.8% (+1.7%), and below Mach 0.8 from 9.5% to 4.1%; RASAero II's becomes 5.2% with a −3.3% bias, so on this
reading it has slightly too much drag, not the app too little. Limits: it assumes no altimeter's reading was
corrected for temperature afterwards, and that the air aloft is as much warmer than standard as the air at the
pad, which is doubtful for Don't Debate This (56,000 ft; 15.7% low on this reading, 6.9% as true height). What is
left below Mach 0.8 is the EZI-65 (+13%, entered at 70 °F where the other LDRS-26 flights have 100 °F) and Thunder
and Lightning (+6%); above it, Raven (+22%) and Proteus 6 (+15%, measured by accelerometer).

The Results tab now says what a barometric altimeter would read for the predicted apogee when the day's air puts
it 2% or more from the true height.

The paragraphs below were written before this, from true heights; the factors in them are about 10% too large for
the warm-day altimeter flights.

**What was looked at after that, and what came of it.**

- _Power-on base drag._ While the motor burns the app takes the base drag off the nozzle's exit area and leaves
  it on the rest. The Aerobee's two curves, thrusting and coasting, overlap from Mach 2 to 5, and their difference
  is that term measured: 0.034 at Mach 2 falling to 0.011 at Mach 5. The app gives it within 0.005 (the new "what
  the exhaust removes" case). Hoerner (p. 16-10) reports the pressure on the ring around a nozzle falling to about
  −0.2 at Mach 2 with the jet running, twice the coasting value, which would add drag; the Aerobee curves show no
  such thing. Below Mach 2 nothing here checks it.
- _Base drag below Mach 1._ Hoerner's rule for bodies (0.029/√ of the forebody's drag on the base area, ch. III,
  equations 34 and 35) has the base-diameter-cubed form the test model uses behind boattails, but its level is a
  third to a half of TR R-100's flight-measured 0.136 on a long rocket. Tried in the test model, it fixed the Arcas
  and configuration 36 below Mach 1 and put the eight slowest flights 10.7% high (from 2%). The flights and TR
  R-100 agree with each other, so the level stays.
- _Square and rounded fin edges._ Hoerner's sections between walls (ch. III, figures 22 and 23): a blunt leading
  edge adds 0.4 on its face over a rounded one, and a corner radius of 0.2 of the thickness is enough to lose it.
  So a rounded leading edge keeps no drag below Mach 1, and the test model's square leading edge now has 0.4
  there in place of 0.8 (a flat face in three-dimensional flow). Only Gary Byrum's rocket has square fins: +1.5% to
  +3.1%. On the altimeter's reading the nine rockets with rounded fins need 1.10 times the model's drag on average
  (0.87 to 1.39) and the other fourteen 0.99; flown as square they need 0.95. Too scattered to act on.
- _Protuberances above Mach 1._ Hoerner's free-flight values at Mach 1 to 2 (p. 20-14: 0.75 for a forward-facing
  step, 0.45 for a rear-facing one, 0.8 for blunt rings, 2.0 for round rivet heads) bracket what the app gives a
  blunt box there (about 1.3). A streamlined shroud above Mach 1 is still an estimate.
- _Configuration 36's nose_ is now a power-series shape that follows the sketch (exponent 0.45): 16.8% to 13.8%.
  The rest is not the nose.
- _The altimeter correction high up._ With a well-mixed layer to 3 km above the pad and the standard tropopause in
  place of a uniform shift, the 23 flights come to 6.0% (+2.2%) from 5.8% (+1.7%), and Don't Debate This to 12.5%
  low from 15.7%. The result does not hang on the profile; that one flight does.
- _The EZI-65's 70 °F_ is what its file says, and the file is not here to check. At 100 °F it would be 9% high, not
  13%.
- _Above Mach 5_ nothing checks the drag. The app now says so on any flight that gets there.
- _A design with a protuberance opens in OpenRocket 24.12_ with its weight and position kept and a warning for each
  of the three tags it does not know.

**A second round of sources: MIL-HDBK-762 and the Arcas at Mach 1.5 to 4.63.** Two more public documents were
checked against the test model: the US Army handbook *Design of Aerodynamically Stabilized Free Rockets*
(MIL-HDBK-762, 1990, the successor of AMCP 706-280 that Missile DATCOM takes its boattail and flare methods from) and
the supersonic half of the Arcas wind-tunnel tests (NASA TN D-4014), whose drag had not been used. Four things changed
and one was confirmed.

- *Confirmed: the base below Mach 1.* The handbook's base-pressure data (figure 5-140) scatter from 0.06 to 0.13
  below Mach 0.8, against the test model's 0.136 and the released model's 0.20 at Mach 0.8. Its chart of total drag
  against boattail size (figure 5-120, from the Navy's NSWC TR 81-156, itself a prediction) reads 0.23, 0.195, 0.17,
  0.13 and 0.11 at Mach 0.8 for bases 1.0, 0.9, 0.8, 0.6 and 0.4 of the diameter; the test model gives 0.239, 0.201,
  0.171, 0.130 and 0.108, the released model 0.305 to 0.162.
- *Friction.* The formula coded as Van Driest II was Van Driest's earlier one (1951), which has a larger
  wall-temperature term: the same on a cold skin, 7% more friction at Mach 3 and 17% more at Mach 4.6 on a fully
  heated one. The Arcas model at Mach 3 to 4.63 (a heated wall) came out 9–20% high, nearly all of it friction, and
  the handbook's friction chart (figure 5-134) puts Mach 5 at about 0.38 of the low-speed value where the old form
  gave 0.5. Now Van Driest II proper (0.43; the released factor gives 0.37).
- *Boattail wave drag above Mach 2.* TR R-100's equation 1 rests on flight data up to about Mach 2. Wind-tunnel
  pressure measurements on four conical boattails at Mach 2.5 and 3.5 (Rubin, Brazzel and Henderson, in the
  handbook's figure 5-144) run two to five times it. They follow linear theory, 2·tan θ/β on the area the boattail
  removes, times (1.15 − 0.058·θ°): 0.90 at 4.3°, 0.60 at 9.5°, within 0.004 of all eight points. Used from Mach
  2.5, blended with equation 1 from Mach 2. The base half of the same figure agrees with the test model's
  base-radius rule within 0.01.
- *Transonic fin peak.* The peak near Mach 1 was a fixed 5.7·(t/c)^(5/3), from two fin sets of nearly the same
  slenderness. Transonic similarity (the handbook's figure 5-130) makes it depend on aspect ratio × (t/c)^(1/3); the
  chart's trend is now applied about the measured point, so a stubby fin (aspect ratio 0.8, 3% thick) gets 0.4 of
  the peak and a long one (3, 5% thick) 1.7. The chart's own level is several times under the measurements and was
  not used.
- *Finish labels.* Missile DATCOM's roughness table puts carefully applied smooth paint at 6 µm, average paint at
  10 µm and production spray paint at 30 µm. OpenRocket's names for 20 and 60 µm ("smooth paint", "regular paint")
  suggest something smoother than they are, so the builder's list now says what each height corresponds to.

| Case (mean absolute error) | Released | Test before | Test now |
|---|---|---|---|
| Arcas, Mach 1.5–4.63, total drag, wind tunnel (new) | 2.5% | 9.4%, high | 4.1% |
| Arcas, Mach 1.5–4.63, without fins (new) | 4.3% | 11.4%, high | 4.9% |
| Arcas, Mach 1.5–4.63, what the fins add (new) | 0.004 Cd | 0.019 Cd, low | 0.019 Cd, low |
| Boattail pressure drag, Mach 2.5 and 3.5, four boattails (new; tuned) | none in the model | 0.018 Cd, low | 0.002 Cd |
| Arcas, Mach 0.6–1.2 | 25.4% | 7.2% | 7.8% |
| TR R-100 configuration 11 | 16.7% | 6.9% | 6.2% |
| TR R-100 configuration 36 | 24.0% | 13.8% | 12.6% |
| Aerobee coasting | 4.9% | 9.3% | 4.8% |
| Aerobee thrusting | 6.9% | 7.9% | 5.9% |
| RM A53D02 (free flight) | 14.4% | 6.2% | 7.7% (5.0% with a cold skin) |
| RM L55G28a (free flight) | 8.4% | 2.7% | 5.2% (12.3% with a cold skin) |
| 23 flights, as the altimeter reads | 8.3% (+3.9%) | 5.8% (+1.7%) | 6.0% (+2.2%) |

The wind-tunnel cases improve and the two free-flight cases lose a little. Those are scored with the skin fully
heated, like every drag case; a model boosted to speed in seconds is somewhere between that and a cold skin, and
`validation/accuracy.js --skin cold` gives the other bound. The two cases pull opposite ways (one wants the cold
skin, the other more heat than there is), so the skin's temperature does not explain what is left of either.

Left open by this round: the Arcas fins add 0.065 more drag at Mach 1.5 and 0.03 more at Mach 1.8 than the test model
gives (the released model's bump matches them). Those fins sit on a 15° boattail and carry grit strips on both faces,
so the increment is not the fins' wave drag alone, and the two fin sets the term was built on have neither; it was
left as it is. The handbook's chart of base pressure with the motor burning (figure 5-150) has lost its thrust scale
in the copy to hand, and its section on protuberances gives no numbers.

**RASAero II on the same drag cases.** Each body was written as a RASAero II design file, opened in RASAero II
on Windows, and its drag table exported (Aero Plots, Export to CSV). Mean error against the same measured points:

| Case | Released | Test | RASAero II | RASAero II settings |
|---|---|---|---|---|
| RM A53D02 | 14.4% | 6.2% | 7.0% | all turbulent flow, as the app assumes (16.6% low with its default transition) |
| RM L55G28a | 8.4% | 2.7% | 9.4% to 15.1%, low | Rough Camouflage Paint to Camouflage Paint, which bracket the app's 20 µm (20.1% with zero roughness) |
| Arcas short model | 25.4% | 7.2% | 19.1% | zero roughness; low by 21–41% from Mach 0.9 to 1.1 |
| TR R-100 configuration 11 | 16.7% | 6.9% | 6.5% | zero roughness |
| TR R-100 configuration 36 | 24.0% | 13.8% | 11.7% | zero roughness, tangent ogive nose |
| Aerobee coasting | 4.9% | 9.3% | 4.2% to 7.4% | Rough Camouflage Paint to Camouflage Paint |
| Aerobee thrusting | 6.9% | 7.9% | 6.3% to 6.4% | the same, with the nozzle exit entered |
| Aerobee, what the exhaust removes | 0.002 Cd | 0.002 Cd | 0.003 Cd | |

Limits: the Arcas case was used to size two of the test model's terms, so its 7.2% is not an independent score.
RASAero II has no power-series nose and no fin anchors were entered for the Arcas (Rogers adds them as rail
guides). Its fin sections were the nearest it offers (Biconvex for the app's airfoil, Hexagonal with the same
bevel lengths). A Mach-altitude table was entered to match each case's Reynolds numbers; RASAero II's exported
Reynolds numbers follow it within 10% on the TR R-100 cases, partly on the Arcas and A53D02, and not at all on
L55G28a, which ran at sea-level Reynolds numbers (1.8 times the flight's: a few percent of drag).

**The missing coast drag is not spread evenly.** Scaling each flight's drag until its apogee matches gives the factor
that rocket needs. Eleven of the 23 need 0.97–1.12 (1.04 on average): the university and research rockets with
beveled fins, and Blister. The other twelve need 1.13–1.63: nine are rockets whose fins are entered as rounded
(seven of them sport rockets measured at LDRS-26, and Rabia and Torrent), one has 1/8 in bevels on 1/4 in fins (gap
9), and two have boattails (Proteus 6 and Qu8k, 1.17 and 1.13). What was tried, with the test model:

- Rail buttons are worth 2.5% of apogee and are already counted; buttons half as large again each way would take
  off another 3%.
- Roughness matters little until it is large: 2 µm to 20 µm lowers the apogees 1.7%; 60 µm closes the sport rockets'
  gap only by giving the eleven good flights 4–21% too much drag.
- Flying the rounded fins as square ones brings Cancer Descending, the EZI-65, Gibb and the short Rabia to 0.95–1.07
  and Rabia and Torrent to 1.17 and 1.12, but puts Blister at 0.86 and leaves Raven (1.50) and Thunder and Lightning
  (1.37) far off. The model gives a rounded leading edge no drag below Mach 1 and a rounded trailing edge 0.7 of a
  square one's; hand-rounded plywood and fiberglass edges are likely blunter than that, but these flights can't say
  by how much, and RASAero II is also 6–12% high on four of the seven LDRS-26 rockets.
- A fin–body interference term of the size Box, Bishop and Hunt take from Mandell (the fin's friction on the root
  chord times half the body diameter) would add 0.03–0.06 to every rocket: about what the eleven good flights and
  the polished NACA models don't need.

So there is no one missing term. The fins are where the evidence points: blunt and rounded edges below Mach 1, and
the wave drag of thin swept fins above it.

**Fins.** The fifth column. A sharp-edged fin's wave drag is now thin-airfoil theory on the free stream,
K·(t/c)²/β on the fin's area, held at K·(t/c)²·cot Λ while the leading edge is swept behind the Mach line, rising from
the section's drag-divergence Mach number to Mach 1.05 (where Missile DATCOM also puts the full value); the peak near
Mach 1 is described below. On the 45° fins of TR R-100 figure 5 it gives 0.0046 against 0.0037 measured up to Mach
1.4, and falls below the measurement past Mach 2 (the report draws one level line to Mach 3 and says it did not try
for accuracy). The 72° fins of RM A53D02 improve too, and the supersonic flights, whose short bevels now cost what
theory says: 11.2% to 7.5%. The Aerobee coasting gets worse (7.8% to 9.3% high).

**The Aerobee coasting case cannot tell the models apart.** The whole difference between them on it is friction
(Van Driest II gives 0.014 more Cd at Mach 2 and 0.027 more at Mach 5 than the released power law), and how the
case scores depends on a finish and Reynolds number its source does not give. Flown at sea-level density, the test
model is 7–11% high at every speed with a 20 µm finish and 2–12% low with 5 µm; the released model is 9% high at
Mach 2 falling to 9% low at Mach 5 with 20 µm (its 4.9% mean is the two ends cancelling) and 2–23% low with 5 µm.
The test model holds the measured slope with Mach in either case; its level is set by the assumed finish.

The RM-10 case had its fins twice too thick. RM E50D28 gives their thickness ratio as 0.10; NACA Report 1160 says
that is measured normal to the 60° leading edge, so it is 5% along the flow. The released model's sweep factor
(the fifth power of cos Λ / cos 30°) was fitted to the thicker fin, which is how it came to cut too little at 45°
and need a transonic bump. With the thickness corrected the released model is 0.027 low on that case and the test
model 0.013 high. Square and rounded edges are unchanged: nothing public says how blunt hand-finished edges are.

## Drag at zero angle of attack (`cdParts`)

Every drag coefficient is on the reference area, the frontal area of the widest body section.

### Skin friction

| | All speeds |
|---|---|
| Smooth surface | Prandtl–Schlichting turbulent flat plate, 0.455/(log Re)^2.58, boundary layer turbulent from the nose tip (Schlichting, *Boundary-Layer Theory*). "Natural transition": laminar Blasius flow below Re 5×10⁵, then the mixed laminar–turbulent law. |
| Rough surface | White's fully rough plate law (*Viscous Fluid Flow*), blended in by roughness Reynolds number between Nikuradse's smooth (k⁺ ≈ 5) and fully rough (k⁺ ≈ 70) limits. Each surface's roughness is measured against its own length (Raymer). |
| Compressibility | (1 + 0.144 M²)^−0.65, adiabatic wall. |
| Form factors | Hoerner, *Fluid-Dynamic Drag*: body 1 + 1.5(d/l)^1.5 + 7(d/l)³; fins 1 + 2(t/c) + 60(t/c)⁴. |

### Nose

| Mach | Source |
|---|---|
| below the drag rise | Hoerner's shoulder-angle rule, 0.8·sin²(angle where the nose meets the body): nearly zero for tangent noses. |
| 0.8 – 3.6 | Measured: NASA TR R-100 (Stoney, 1961), fig. 12, curves for cones, ogives, parabolic, power-series, Haack and elliptical noses of fineness 3, interpolated between shapes; other fineness ratios scaled by fig. 11. Where the drag rise starts follows the Oswatitsch transonic similarity rule: slender bodies rise later. |
| past the last measured point | Cones by Bonney's correlation, other shapes by the trend of the nearest measured shape. |
| 4 – 6 | Blended into modified Newtonian theory, Cp,max·sin²θ over the nose (Lees). |
| Rounded tip | DATCOM's blunted-cone build-up: the sharp nose's drag over the rest of its area plus a hemisphere cap (0 below Mach 0.8, rising to Cp,max/2 by Mach 1.3). |

### Shoulders, flares and steps (sections that grow)

| Mach | Source |
|---|---|
| below 0.8 | Hoerner's shoulder-angle rule, 0.8·sin²(angle). |
| 0.8 – 1 | Blended toward the Mach 1 wave drag (Oswatitsch similarity sets where). |
| above 1 | Bonney's cone correlation (Fleeman, *Tactical Missile Design*); blunt shapes by modified Newtonian. |
| A flat step | 0.8 × stagnation pressure on the step's area. |

### Boattails (sections that shrink)

Hoerner's separation rule: attached flow (no pressure drag) below about 8° half-angle, fully separated above about 20°,
where the step counts as base area; in between, blended.

### Base

| Mach | Source |
|---|---|
| below 0.95 | Fleeman: −Cp,base = 0.12 + 0.13 M², on the base area. |
| 0.95 – 1.2 | Blended from Fleeman to NACA TN 3819 (Love, 1957). |
| above 1.2 | NACA TN 3819 (Love, 1957), measured base pressure: the body curve (fig. 18) on the rocket base with boattail and fin-set corrections (pressure ratio across the boattail's turn, fin term from fig. 35); the two-dimensional curve (fig. 5) on fin trailing edges. Pods, lugs and tube fins use the body curve. The boattail correction counts only the attached share of a tail cone (none past about 20°, where Hoerner's rule has the flow separated) and fades in from Mach 1.5 to 2.0: below that it would remove nearly all base drag, against the RM-10's measured base pressure in flight (NACA TN 3320). |
| Motor burning | The nozzle exit area is taken off the base (entered, or estimated from the motor's average thrust). The exhaust plume's effect on base pressure isn't modeled. |

### Fins

| Term | Mach | Source |
|---|---|---|
| Square edges | all | 0.8 × stagnation pressure on the leading edge, swept by the independence principle (cos²Λ), plus base drag on the trailing edge. |
| Rounded edges | all | Modified Newtonian (⅔ × stagnation pressure) on the leading edge from the drag-divergence Mach number, half the base on the trailing edge. |
| Sharp edges (airfoil, beveled, double wedge) | above 1 | Ackeret thin-airfoil wave drag K(t/c)²/β (double wedge 4, airfoil 16/3), weakened while the leading edge is still subsonic (M·cos Λ < 1). Beveled fins: K = 1/e₁ + 1/e₃ from the bevel lengths as shares of the mean chord (20% bevels, the default, give 10), each bevel held to at most what a square leading edge or a blunt trailing edge of the same thickness would cost. |
| Sharp edges | 0.85 – 3 | The transonic drag rise, calibrated to the Arcas fins (NASA TN D-4013/4014, fins on minus fins off), scaled to other thicknesses by transonic similarity, (t/c)^(5/3), and to sweep by (cos Λ / cos 30°)⁵, fitted to the RM-10's 60° fins (NACA RM E50D28). |
| Drag divergence | | M_dd = 0.96 − 1.5(t/c) (NACA 0006 ≈ 0.87, 0012 ≈ 0.78). |

### Protuberances, pods and tube fins

| Term | Source |
|---|---|
| Rail buttons | Hoerner's cylinder in crossflow (1.2 × stagnation pressure) subsonic, modified Newtonian plus base above Mach 1.3, reduced by how deep they sit in a 1/7-power turbulent boundary layer. |
| Protuberances (a camera, a switch box, an antenna, a shroud: the Protuberance part) | Hoerner, chapter V, figure 13: on the frontal area, 1.20 for a blunt box about as long as tall, 0.74 for one over twice as long, 0.78 for an upright cylinder or bolt, 0.07 for a streamlined blister; 0.39 for a long box with a sloped front and a square back (built from the 0.74 box and his steps on a wall, figure 10: a square forward-facing step 0.40, the same beveled at about 30° to the surface 0.11, a square rear-facing step 0.22, so the sloped front keeps 0.11/0.40 of the front's share); reduced by the boundary layer as the buttons are (Hoerner's 0.75·∛(h/δ) is the same within a few percent). Above Mach 1 there is no data: blunt shapes rise as the rail button does, a streamlined one takes the Newtonian pressure on its front slope if larger; the sloped-front box stays a share of the long blunt box, 0.53 below Mach 1 and above it the share his free-flight steps give (rear-facing 0.45 plus modified Newtonian on a 30° front, against forward-facing 0.75 plus the same rear: 0.70 at Mach 1.5). A bare 1 in cube on a 4 in rocket adds 0.09 to Cd; the same size streamlined, 0.005 below Mach 1 and 0.03 above. A fly-away rail guide (the Protuberance part's last shape) is a blunt box, 1.20, and is on the rocket only while it is on the rail: its drag and its weight count up to the rail's end and not after. |
| Launch lugs | Stagnation pressure on the front face, base on the back, pipe friction through the bore. |
| Pods | Each pod's own body: friction, nose, transitions and base as above, once per copy. |
| Tube fins | OpenRocket's method: friction outside, Darcy–Weisbach pipe flow inside (Swamee–Jain friction factor), stagnation and base pressure on the front face and the gap at the body. |
| Tumbling | Allen–Perkins crossflow drag averaged over all pitch angles. |

## Normal force and center of pressure (`cnaParts`)

| Term | Mach | Source |
|---|---|---|
| Nose, shoulders, boattails | all | Barrowman (1966/67) slender-body theory: CNα = 2(A₂ − A₁)/A_ref at the section's centroid. Doesn't change with Mach. |
| Fins | below 0.9 | Diederich's formula with Prandtl–Glauert compressibility, as Barrowman uses it. Any outline, by spanwise strips. |
| Fins | above 1.5 | Linear supersonic theory (Ackeret) with tip loss, K/β·(1 − 1/(2·AR·β)): K = 4 for sharp and rounded edges (checked against Arcas TN D-4014 and NASA TM X-653), 2.5 for square edges (no data; the cautious value). The fin's CP moves from ¼ of the mean chord toward Barrowman's supersonic location. |
| Fins | 0.9 – 1.5 | Blended between the two. |
| Fin–body interference | all | Barrowman's factor, 1 + r/(s + r). Doesn't change with Mach. |
| Five or more fins | all | Shielding factors as OpenRocket uses (5 fins 0.948 … more than 8, 0.75). |
| Body lift across the flow | all | CN = K·(side area / A_ref)·sin²α, K = 1.1 (Galejs), acting at the middle of the side outline. The static CP includes it at a typical 2°. |
| At larger angles | all | The fins stall from about 18° to 35° (their linear lift fades to 60%) and then act as flat plates across the flow (Hoerner, Cd ≈ 1.17 on 2/π of their area). |

Roll: fin cant forcing with the same interference factor; roll damping by strip theory with the 2-D lift slope
(Prandtl–Glauert below Mach 0.9, Ackeret above 1.5).

## How well each part is checked

| Part | Against | Result |
|---|---|---|
| Center of pressure, Mach 0.6–4.6 | NASA TN D-4013/4014, Arcas sounding rocket, two body lengths, wind tunnel | RMS error 2.3% of body length (17 points). Worst at Mach 0.85–0.9 on the short model: 4–5% too far aft. |
| Total drag, Mach 0.6–4.6 | NACA RM A53D02, fineness-10 body with 72° fins, free flight | Mean error 14.4%: 12–21% high below Mach 1, 8–20% low above. |
| Fin drag, Mach 1.5–2.0 | NACA RM E50D28, RM-10 fins, wind tunnel | Mean error 0.027 in Cd, low (the case had the fins 10% thick along the flow; they are 5%). |
| Aerobee 150A, Mach 0.1–5 (never used for tuning) | Manufacturer's data from Aerojet wind-tunnel tests | Drag 6.9% mean while thrusting, 4.9% coasting (both high; was 5.5% and 3.0% before TN 3819); CP 0.8% of length; CNα 16% low throughout. |
| Fin-stabilized cone-cylinder, Mach 2.5–3.9 (never used for tuning) | NACA RM L55G28a, free flight | Drag 8.4% low (was 12.7%). |
| Boattailed bodies, Mach 0.6–2 (never used for tuning) | NASA TR R-100, configurations 11 and 36, free flight; NASA TN D-4013, Arcas short model, wind tunnel | Drag 17% low on configuration 11, 27% high on configuration 36 (whose fins' measured wave drag, figure 5, the model more than doubles), 25% high on the Arcas. |
| Fineness-16.9 missile with 60° delta fins, Mach 1.7–2.8 (never used for tuning) | NACA RM L56G24, free flight | Drag 12.5% low (the model's instrument fairings, not in the app's design, account for about that); CP 6.0% of length forward. |
| Slender missile with small tail fins, Mach 0.6–3.95 (never used for tuning) | NASA TM-2005-213541, configuration 3, wind tunnel (the report's digital data) | Drag less base 9–14% high outside Mach 0.9–1.2, 37–60% high inside it; CP 3.5–13% of length forward; CNα 4% low at Mach 0.6, 15–28% low above 1. |
| Apogee, 23 measured flights, Mach 0.55–3.6 (never used for tuning) | Altimeters, GPS, accelerometers and optical tracking; RASAero II example files | 8.3% mean, app high (+4%; +10% above Mach 1.2), barometric readings compared as the altimeter reads them; RASAero II 5.2%. As true heights: 9.9% and 5.4%. |
| Nose drag | NASA TR R-100 | These are the source curves, so this isn't an independent check. |
| Apogee, 65 flights | OpenRocket 24.12 | Median +0.9%, typical ±1.5%. Another program, not a measurement. |
| Large angles of attack, rounded tips, pods, tube fins | — | Not checked against measurements. |

## Known gaps, in the order they're worth fixing

1. **Supersonic base drag (partly done).** NACA TN 3819 (Love, 1957) now sets the base pressure above Mach 1.2
   (see Base). RM A53D02 improved from 17% to 14.4% and RM L55G28a from 12.7% to 8.4% low. The Aerobee 150A got
   worse (drag now high by 2.7 and 1.0 points). The app is still low on RM A53D02 from Mach 1 to 3 (8–20%), so
   the base isn't the whole story there. Boattails between Mach 1 and 2 are the weak spot: the RM-10's 4.8° afterbody
   keeps a base pressure coefficient near 0.11 (TN 3320), the app gives the plain body's 0.18 there, so it errs
   toward too much drag; steeper (8–15°) attached boattails above Mach 2 have no flight check yet.
2. **The exhaust plume.** A burning motor's plume raises the base pressure above Mach 1, lowering the base drag
   while it burns. Only the nozzle's area is taken off now.
3. **Transonic center of pressure.** The measured CP moves forward near Mach 0.85–0.9 on short rockets; the model
   doesn't. NASA TM X-653 has more data to check it against.
4. **Fin–body interference with Mach number.** Barrowman's factor is a low-speed one. Pitts, Nielsen and Kaattari
   (NACA Report 1307) give the body–fin lift carryover across subsonic and supersonic speeds in one framework.
5. **Body lift at supersonic speeds and large angles.** Slender-body theory and K = 1.1 hold at low speed; Jorgensen
   (NASA TR R-474) carries a body's normal force to high angles and Mach numbers consistently.
6. **Fins with a sharp leading edge and a blunt trailing edge.** Sounding-rocket fins are often made this way
   (the Aerobee 150A's and RM L55G28a's are). The app's edge types are square, rounded, or sharp at both ends, so
   such fins lose their trailing-edge base drag.
7. **Normal-force slope and CP with small fins on long bodies.** On the Aerobee 150A the app's CNα is about 16% low
   at every speed while its CP agrees. On NASA TM-2005-213541's configuration 3 it is 4% low at Mach 0.6 and 15–25%
   low above Mach 1, with the CP 4–8% of the length forward, and RM L56G24's CP is 6% forward too: the fins seem to
   carry more lift than the app gives them, or the body less (see items 4 and 5).
8. **Real rockets coast lower than the model says** (most of this turned out to be barometric altimeters reading low on warm days: see "Most of the missing coast drag was the altimeters" above). On the 23 measured flights the app is high by 9% on average,
   13% above Mach 1.2, while its top speeds agree with RASAero II's within a few percent: the missing drag is in the
   coast. OpenRocket overshoots the same flights the same way. Where it comes from (protuberances, finish, fin
   misalignment, base drag while coasting at altitude) is the largest open question.
9. **Very short bevels.** Beveled fins take their bevel lengths since build 282. With bevels of about 1% of the chord,
   as on the Kinsel A-601, linear theory would give more drag than a square edge, so each bevel is capped there; the
   Kinsel A-601 moved from +44% to +34%. How a nearly square bevel really behaves between the two is open.
10. **Thick rounded fins below Mach 1.** On the EZI-65 (0.25 in rounded fins, 3.6% of the chord) the app needs 23% more
   drag to match RASAero II and 40% to match the flight.
11. **More test cases.** `validation/accuracy.js` scores every measured rocket in `validation/cases.js` by speed band,
   keeping the cases the model was tuned on apart from those kept back for checking, and `validation/flights.js` the
   measured flights' apogees. The Aerobee 150A, RM L55G28a, RM L56G24, TM-2005-213541 and the 23 flights are the check cases so far; each new
   measured rocket goes there. RM L56G24 and TM-2005-213541 are the newest.
12. **Transonic drag of short noses with a flare behind them.** On TM-2005-213541's configuration 3 (a 2.3-caliber
   ogive on a narrower forebody, then a cone out to the body) the app's drag without base is 37% high at Mach 0.9,
   where the tunnel shows no rise yet, and 60% high at Mach 1.19.

## Further reading for the open gaps

Public documents worth working through next, all freely available (NASA's Technical Reports Server, or DTIC reports
marked approved for public release), with the gap each one bears on.

| Document | What's in it | Gaps |
|---|---|---|
| Box, Bishop and Hunt, *Estimating the dynamic and aerodynamic parameters of passively controlled high power rockets for flight simulation* (Cambridge Rocketry, 2009; [University of Southampton](https://eprints.soton.ac.uk/73938/)) | A complete drag build-up for high-power rockets, protuberances and finish included, checked against flights. The closest published work to this app's job. | 8 |
| Rosema, Doyle and Blake, *Missile DATCOM User Manual, 2014 Revision* (AFRL-RQ-WP-TR-2014-0281; [DTIC AD1000581](https://apps.dtic.mil/sti/pdfs/AD1000581.pdf)) | The methods behind the standard semi-empirical body–fin code: body alone, fins alone and their synthesis, with the sources for each. | 3, 4, 5, 7, 8 |
| Huerta, *Base Drag of Various Boattail Shapes with Simulated Base Rocket Exhaust* (BRL MR 1983, 1969; [DTIC AD0855156](https://apps.dtic.mil/sti/pdfs/AD0855156.pdf)) | Supersonic base pressure of boattails with a jet, against the Brazzel–Henderson correlation (1966) for power-on base drag. | 1, 2 |
| Pitts, Nielsen and Kaattari, *Lift and Center of Pressure of Wing-Body-Tail Combinations at Subsonic, Transonic, and Supersonic Speeds* (NACA Report 1307, 1957; [NTRS](https://ntrs.nasa.gov/citations/19930091008)) | Fin–body lift carryover (K_W(B), K_B(W)) as it changes with Mach number and fin size, in one framework. | 4, 7 |
| Jorgensen, *Prediction of Static Aerodynamic Characteristics for Slender Bodies Alone and with Lifting Surfaces to Very High Angles of Attack* (NASA TR R-474, 1977; [NTRS](https://ntrs.nasa.gov/citations/19770026166)); and NASA TN D-7228 (1973; [NTRS](https://ntrs.nasa.gov/citations/19730012271)) | Body normal force and its center from 0° to 90° and across Mach numbers: slender-body theory plus crossflow drag with a measured crossflow coefficient. | 5 |
| *Aerodynamic Characteristics from Mach 0.22 to 4.65 of a Two-Stage Rocket* (NASA; [NTRS](https://ntrs.nasa.gov/api/citations/19650000798/downloads/19650000798.pdf)) | Wind-tunnel drag, normal force and CP of a sounding rocket across the whole speed range: a further check case, transonic CP included. | 3, 11 |
| Barrowman, *The Practical Calculation of the Aerodynamic Characteristics of Slender Finned Vehicles* (1967; [NTRS](https://ntrs.nasa.gov/citations/20010047838)) | The full thesis behind the Barrowman equations, including the subsonic and supersonic fin methods and the drag build-up that the app's CP follows. | 3, 4 |
| Finck, *USAF Stability and Control DATCOM* (1978) and the Digital DATCOM documentation ([DTIC ADA086557](https://apps.dtic.mil/sti/pdfs/ADA086557.pdf); references at [pdas.com](https://www.pdas.com/datcomrefs.html)) | The aircraft DATCOM: body and wing–body methods, transonic drag rise and lift, the sources behind much of Missile DATCOM. | 3, 4, 5 |

