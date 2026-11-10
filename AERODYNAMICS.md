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

## The test drag model

Settings → Drag model switches between the released model (this page) and a test model being built term by term
from public sources, mainly the method choices in the Missile DATCOM final report (Vukelich et al., AFWAL-TR-86-3091
Volume I, 1988, approved for public release) and the NACA and NASA reports it relies on. A term not yet moved over is
computed exactly as the released model computes it. Flights, the landing dispersion, flight-log calibration and the
Wind Tunnel follow the setting; with the test model chosen, the Wind Tunnel also draws the released model's drag and
the Results tab marks the run "TEST drag model". The code is in `src/js/physics/drag-model.js`.

| Term | Test model | Released model |
|---|---|---|
| Skin friction compressibility | Van Driest II (J. Aero. Sci., March 1951) at the skin's own temperature, as a ratio to the incompressible value | (1 + 0.144 M²)^−0.65, adiabatic wall |
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

| Case | Released | Test: friction only | Test: friction and base | Test: all four terms |
|---|---|---|---|---|
| NACA RM A53D02, total drag, free flight (tuned) | 14.4% | 10.3% | 8.1% | 8.6% |
| NACA RM E50D28, fin drag, wind tunnel (tuned) | 0.025 Cd | 0.027 Cd | 0.027 Cd | 0.027 Cd |
| NACA RM L55G28a, total drag, free flight (check) | 8.4%, low | 2.8% | 2.8% | 2.6% |
| Aerobee 150A, drag coasting, wind tunnel (check) | 4.9% | 9.1%, high | 9.2%, high | 7.8%, high |
| Aerobee 150A, drag thrusting, wind tunnel (check) | 6.9% | 9.1%, high | 10.3% | 9.8% |
| 23 measured flights, apogee | 9.9% (+9.2% bias) | 8.7% (+7.5%) | 9.7% (+9.3%) | 9.7% (+9.5%) |
| the flights below Mach 0.8 | 7.9% | 7.8% | 9.5% | 9.5% |
| the 9 flights above Mach 1.2 | 13.0% | 9.9% | 11.0% | 11.2% |

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
the released model blends into Newtonian theory. The last column's changes from the one before are all the nose's.

**Boattail.** None of the drag cases or measured flights has a boattail ending at its base, so this term changes
none of the numbers above and is unchecked by them. On a test body with a 4.8° boattail to 0.6 of the diameter it
adds 0.015 of wave drag at Mach 1.2 and gives a body-alone base pressure coefficient of 0.12, against about 0.11
measured on the RM-10 in flight (NACA TN 3320). TR R-100's appendix has drag for many bodies with afterbodies; they
are the cases to add.

**Not moved: the fins' transonic drag rise.** Missile DATCOM ramps a fin's wave drag linearly from Mach 0.8 to a
potential-flow value at Mach 1.05 its report doesn't give, and calls the scheme approximate. The released model's rise
is fitted to measured fin drag (the Arcas fins and the RM-10's), which is the better evidence, so the test model keeps it.

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
| Fin drag, Mach 1.5–2.0 | NACA RM E50D28, RM-10 fins, wind tunnel | Mean error 0.022 in Cd. |
| Aerobee 150A, Mach 0.1–5 (never used for tuning) | Manufacturer's data from Aerojet wind-tunnel tests | Drag 6.9% mean while thrusting, 4.9% coasting (both high; was 5.5% and 3.0% before TN 3819); CP 0.8% of length; CNα 16% low throughout. |
| Fin-stabilized cone-cylinder, Mach 2.5–3.9 (never used for tuning) | NACA RM L55G28a, free flight | Drag 8.4% low (was 12.7%). |
| Apogee, 23 measured flights, Mach 0.55–3.6 (never used for tuning) | Altimeters, GPS, accelerometers and optical tracking; RASAero II example files | 9.9% mean, app high (+9%; +13% above Mach 1.2); RASAero II 5.4%. |
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
7. **Normal-force slope.** On the Aerobee 150A the app's CNα is about 16% low at every speed while its CP agrees;
   either the reconstructed fins are too small or the interference factor is (see item 4).
8. **Real rockets coast lower than the model says.** On the 23 measured flights the app is high by 9% on average,
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
   measured flights' apogees. The Aerobee 150A, RM L55G28a and the 23 flights are the check cases so far; each new
   measured rocket goes there.

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

