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

## Where the drag model comes from

The drag model was built term by term from public sources: mainly the method choices recorded in the Missile DATCOM
final report (Vukelich et al., AFWAL-TR-86-3091 Volume I, 1988, approved for public release) and the NACA and NASA
reports it relies on, with Hoerner's *Fluid-Dynamic Drag* and the US Army handbook *Design of Aerodynamically
Stabilized Free Rockets* (MIL-HDBK-762, 1990) for the terms those leave open. Each constant fitted to a measurement
is named below with the measurement it came from, and the cases a constant was fitted on are kept apart from the
cases held back for checking.

It has been the app's drag model since build 288. The model before it could be chosen in Settings until build 302
and was removed in build 303; the `v1.0-build302` tag is the last that can run both. A drag calibration saved by a
build before 288 belongs to that earlier model and is not applied: refit it from the logged flights.

## Drag at zero angle of attack (`cdParts`)

Every drag coefficient is on the reference area, the frontal area of the widest body section.

### Skin friction

| | All speeds |
|---|---|
| Smooth surface | Prandtl–Schlichting turbulent flat plate, 0.455/(log Re)^2.58, boundary layer turbulent from the nose tip (Schlichting, *Boundary-Layer Theory*). "Natural transition": laminar Blasius flow below Re 5×10⁵, then the mixed laminar–turbulent law. |
| Rough surface | White's fully rough plate law (*Viscous Fluid Flow*), blended in by roughness Reynolds number between Nikuradse's smooth (k⁺ ≈ 5) and fully rough (k⁺ ≈ 70) limits. Each surface's roughness is measured against its own length (Raymer). |
| Compressibility | Van Driest II (Van Driest, Aeronautical Engineering Review, October 1956, as Hopkins and Inouye give it, AIAA Journal, 1971) at the skin's own temperature, as a ratio to the incompressible value: recovery factor 0.89, viscosity exponent 0.76. Missile DATCOM's choice for turbulent boundary layers at all speeds. At Mach 5 on a fully heated skin it is about 0.43 of the low-speed friction (MIL-HDBK-762, figure 5-134, reads about 0.38). |
| Skin temperature | In a flight, followed from the pad's air temperature as the boundary layer heats the skin (below). With no flight history (the Wind Tunnel, the drag cases) the skin is fully heated (the adiabatic wall), as on a wind tunnel model. |
| Form factors | Hoerner, *Fluid-Dynamic Drag*: body 1 + 1.5(d/l)^1.5 + 7(d/l)³; fins 1 + 2(t/c) + 60(t/c)⁴. |

**The skin's temperature in flight.** One temperature for the whole skin. The boundary layer heats it at
h·(Taw − Tw), with h from the body's own friction coefficient by the Reynolds–Colburn analogy (St = Cf/2·Pr^−2/3) and
Taw the adiabatic wall temperature (recovery factor 0.89). The heat goes into the wall down to the depth a steadily
heated thick solid would have warmed, √(π·α·t)/2 (Carslaw and Jaeger), up to the wall's thickness: all of a thin
metal skin, only the outer part of a composite or paper one. The wall's thickness and density come from the design
file (a body average); its heat capacity and diffusivity are typical values for the density's class (steel and
titanium, aluminium, laminates, paper and plastics). Left out: the motor's heat, radiation, the fins' thinner
sections, and the much hotter nose tip and fin leading edges, so it is the temperature the friction sees, not a check
on what the airframe survives. A cooler skin has more friction, so a rocket's drag is highest early in a fast flight.
The code is in `src/js/physics/drag-model.js`.

### Nose

| Mach | Source |
|---|---|
| below the drag rise | Hoerner's shoulder-angle rule, 0.8·sin²(angle where the nose meets the body): nearly zero for tangent noses. |
| 0.8 – 2 | Measured: NASA TR R-100 (Stoney, 1961), fig. 12, curves for cones, ogives, parabolic, power-series, Haack and elliptical noses of fineness 3, interpolated between shapes; other fineness ratios scaled by fig. 11. Where the drag rise starts follows the Oswatitsch transonic similarity rule: slender bodies rise later. |
| above 2, noses that come to a point | Second-order shock-expansion (Syvertson and Dennis, NACA Report 1328) from the exact Taylor–Maccoll cone solution at the tip, summed over the nose (the routine behind the Wind Tunnel's flow picture). It takes over from the TR R-100 curves between Mach 2 and 2.5. Missile DATCOM's choice; its report found the method about 20% high below Mach 2, which is why the measured curves are kept to there. |
| above 2, blunt noses (and where shock-expansion has no answer) | The TR R-100 curves to their last measured point (about Mach 3.6), then Bonney's correlation for cones or the trend of the nearest measured shape, blended from Mach 4 to 6 into modified Newtonian theory, Cp,max·sin²θ over the nose (Lees). |
| Rounded tip | DATCOM's blunted-cone build-up: the sharp nose's drag over the rest of its area plus a hemisphere cap (0 below Mach 0.8, rising to Cp,max/2 by Mach 1.3). |

### Shoulders, flares and steps (sections that grow)

| Mach | Source |
|---|---|
| below 0.8 | Hoerner's shoulder-angle rule, 0.8·sin²(angle). |
| 0.8 – 1 | Blended toward the Mach 1 wave drag (Oswatitsch similarity sets where). |
| above 1 | Bonney's cone correlation (Fleeman, *Tactical Missile Design*); blunt shapes by modified Newtonian. |
| A flat step | 0.8 × stagnation pressure on the step's area. |

### Boattails (sections that shrink)

| Term | Mach | Source |
|---|---|---|
| Whether the flow follows it | all | Attached up to a 15° half-angle, fully separated past 25°, blended between. The separated share of the step counts as base area. TR R-100 checked its afterbody equation against flight data for slopes up to 15°, and the Arcas model's 15° boattail (NASA TN D-4013) keeps its base at or above free-stream pressure below Mach 0.95, which a separated tail cone could not. |
| Wave drag of a boattail ending at the base | 0.88 – 2 | NASA TR R-100's equation 1 for conical afterbodies: (0.0010·θ + 0.00071·θ²)/M · [1 − (base radius / maximum radius)ⁿ] on the maximum cross-section, θ in degrees (at most 15), n = 4 below Mach 3.5 and 3 above. It approximates the second-order theory of NACA TN 2972 (Jack). The report warns against using it below Mach 1, so it fades in from Mach 0.88 to 1: with its fins off the Arcas model gains about 0.15 of pressure drag over that range, and this gives 0.14 at Mach 1. Only the attached share counts. |
| The same | above 2.5 | Linear theory's 2·tan θ/β on the area the boattail takes away, 1 − (base radius / maximum radius)², times (1.15 − 0.058·θ°): 0.90 at 4.3°, 0.60 at 9.5°. Fitted to wind-tunnel pressure measurements on four conical boattails at Mach 2.5 and 3.5 (Rubin, Brazzel and Henderson, in MIL-HDBK-762 figure 5-144), within 0.004 of all eight points; they run two to five times equation 1 there. Blended with equation 1 from Mach 2 to 2.5. |
| Below Mach 0.88 | | An attached boattail has no pressure drag of its own; it lowers the base drag (below). |

A boattail that ends before the base (more body behind it) has only the separation rule. Pods keep an older rule
(see Protuberances, pods and tube fins).

### Base

| Term | Mach | Source |
|---|---|---|
| Body base pressure | 0.5 – 2 | NASA TR R-100 (Stoney, 1961), fig. 3: the flight-measured curve for a cylindrical afterbody with a turbulent boundary layer (the middle of its band: −Cp,base 0.136 below Mach 0.9, a peak of 0.214 at Mach 1.05, meeting TN 3819 at Mach 2). Missile DATCOM takes cylinder base drag from this report. Below Mach 0.5 the Mach 0.5 value is held. The band is about ±0.013 wide below Mach 1 and ±0.025 at the peak. |
| Body base pressure | above 2 | NACA TN 3819 (Love, 1957), fig. 18, limited to 95% of a vacuum. |
| Behind a boattail | all | The body curve's pressure times base radius / maximum radius, for the attached share of the boattail: TR R-100's rule (the cylinder's base drag times the cube of that ratio, on the maximum cross-section). On the RM-10 (base 0.6 of the maximum) it gives 0.12 at Mach 1.2, where NACA TN 3320 measured about 0.11 in flight. Below Mach 1 it is also the form of Hoerner's base drag rule. |
| Fins near the base | above 0.95 | TN 3819's fin term (fig. 35): added suction that grows with the fins' thickness, number and span and fades as their trailing edges sit further ahead of the base. Blended in from Mach 0.95 to 1.2. |
| Fin trailing edges (square and rounded) | below 0.95 | The larger of Hoerner's two-dimensional base rule, 0.135/∛(the friction ahead of the edge on the edge's area), and 0.12 + 0.13 M². Checked against NACA TN 2074 (cut-off NACA 0012 sections). |
| Fin trailing edges | above 1.2 | TN 3819's two-dimensional curve (fig. 5), to Mach 4; past it, the body curve or 0.73 of a vacuum if less. Blended from the subsonic value between Mach 0.95 and 1.2. |
| Pods, lugs and tube fins | all | The body curve. |
| Motor burning | all | The nozzle exit area is taken off the base (entered, or estimated from the motor's average thrust). The exhaust plume's effect on the pressure around it isn't modeled. |

### Fins

| Term | Mach | Source |
|---|---|---|
| Square leading edge | all | 0.4 × stagnation pressure on the edge's face below the drag rise, rising to 0.8 through it, swept by the independence principle (cos²Λ). Hoerner (ch. III, figure 22): a blunt leading edge adds 0.4 over a rounded one on sections between walls; 0.8 is a flat face in three-dimensional flow. |
| Rounded leading edge | from the drag rise | Modified Newtonian, ⅔ × stagnation pressure on the edge, rising through the drag rise. Nothing below it: Hoerner's figure 23 shows a corner radius of 0.2 of the thickness is enough to lose the blunt edge's penalty. |
| Square and rounded trailing edges | all | The base drag above on the edge's area; a rounded edge takes 0.7 of a square one's (NASA TN D-6637: round against square trailing edges on turbine blades, 0.64–0.78). |
| A trailing edge unlike the leading edge (the builder's Trailing edge field) | all | Each end of the section takes its own term. A sharp leading edge with a square or rounded back: the base drag above on the trailing edge, and of the wave drag only the front's share (thin-airfoil wave drag is the chordwise sum of the surface slope squared, so the tapering front and the tapering back each add their own part and a flat part between adds none): half of a double wedge's or an airfoil's K, or the leading bevel's 1/e₁. The peak near Mach 1 is left whole. A square or rounded front tapered to a sharp edge at the back: no base drag, the leading edge's own term, and the trailing bevel's 1/e₃ of wave drag. Checked on RM L55G28a's fins (wedge leading edges, square trailing edges). |
| Sharp edges (airfoil, beveled, double wedge) | above the drag rise | Thin-airfoil wave drag on the free stream, K·(t/c)²/β on the fin's area (double wedge 4, airfoil 16/3). While the leading edge is swept behind the Mach line the drag is held at the value it has when the Mach line reaches the edge, K·(t/c)²·cot Λ, and β is never taken under 0.4. It rises from the section's drag-divergence Mach number to Mach 1.05, where Missile DATCOM's fin method also puts the full value. Beveled fins: K = 1/e₁ + 1/e₃ from the bevel lengths as shares of the mean chord (20% bevels, the default, give 10), each bevel held to at most what a square leading edge or a blunt trailing edge of the same thickness would cost. |
| Sharp edges, the peak near Mach 1 | about 0.85 – 1.5 | 5.7·(t/c)^(5/3) on the fin's area, from the drag the Arcas model's 30° fins add (NASA TN D-4013, fins on minus fins off, less friction: 0.03 from Mach 0.95 to 1.05, back on the linear value by Mach 1.2). Scaled for sweep by (cos Λ / cos 30°)⁵, fitted to the RM-10's 60° fins (NACA RM E50D28), with the rise delayed for sweep past 30°; and for slenderness by the trend of transonic similarity theory (MIL-HDBK-762 figure 5-130) about the measured point: a stubby fin (aspect ratio 0.8, 3% thick) gets 0.4 of the peak, a long one (3, 5% thick) 1.7. It fades past Mach 1.05. The larger of this and the linear term is used. |
| Drag divergence | | M_dd = 0.96 − 1.5(t/c) (NACA 0006 ≈ 0.87, 0012 ≈ 0.78). |

### Protuberances, pods and tube fins

| Term | Source |
|---|---|
| Rail buttons | Hoerner's cylinder in crossflow (1.2 × stagnation pressure) subsonic, modified Newtonian plus base above Mach 1.3, reduced by how deep they sit in a 1/7-power turbulent boundary layer. |
| Protuberances (a camera, a switch box, an antenna, a shroud: the Protuberance part) | Hoerner, chapter V, figure 13: on the frontal area, 1.20 for a blunt box about as long as tall, 0.74 for one over twice as long, 0.78 for an upright cylinder or bolt, 0.07 for a streamlined blister; 0.39 for a long box with a sloped front and a square back (built from the 0.74 box and his steps on a wall, figure 10: a square forward-facing step 0.40, the same beveled at about 30° to the surface 0.11, a square rear-facing step 0.22, so the sloped front keeps 0.11/0.40 of the front's share); reduced by the boundary layer as the buttons are (Hoerner's 0.75·∛(h/δ) is the same within a few percent). Above Mach 1 there is no data: blunt shapes rise as the rail button does, a streamlined one takes the Newtonian pressure on its front slope if larger; the sloped-front box stays a share of the long blunt box, 0.53 below Mach 1 and above it the share his free-flight steps give (rear-facing 0.45 plus modified Newtonian on a 30° front, against forward-facing 0.75 plus the same rear: 0.70 at Mach 1.5). A bare 1 in cube on a 4 in rocket adds 0.09 to Cd; the same size streamlined, 0.005 below Mach 1 and 0.03 above. An item sits on one side of the body, so it also turns the rocket: taken as a uniform block centered at body radius + half its height, its weight puts the CG off the centerline by Σm·r/M, giving the moment e·(thrust − drag) of two centerline forces passing beside the CG, and its own drag acts at that radius, giving q·CdA·r. Both turn with the rocket's roll; items set evenly around the body (the Angle around the body field) cancel. A fly-away rail guide (the Protuberance part's last shape) is a blunt box, 1.20, and is on the rocket only while it is on the rail: its drag and its weight count up to the rail's end and not after. |
| Launch lugs | Stagnation pressure on the front face, base on the back, pipe friction through the bore. |
| Pods | Each pod's own body, once per copy: friction as above; its nose from the TR R-100 curves, blended into modified Newtonian theory from Mach 4 to 6 (no shock-expansion); a boattail on it separates between 8° and 20° (Hoerner) and has no wave drag term; its base takes the body curve. |
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

`validation/accuracy.js` scores every measured rocket in `validation/cases.js`, `validation/flights.js` the measured
flights, and `validation/arcas.js` the center of pressure. "Tuned" means a constant in the model was set or checked
while looking at that case, so its score is not independent; "check" cases were never used that way. Drag cases
have no flight history, so they are scored with the skin fully heated (right for a wind tunnel model;
`--skin cold` gives the other limit, which matters for the two free-flight models).

| Part | Against | Result (mean absolute error) |
|---|---|---|
| Center of pressure, Mach 0.6–4.6 (tuned) | NASA TN D-4013/4014, Arcas sounding rocket, two body lengths, wind tunnel | RMS error 2.3% of body length (17 points). Worst at Mach 0.85–0.9 on the short model: 5% too far aft. |
| Total drag, Mach 0.6–4.6 (tuned) | NACA RM A53D02, fineness-10 body with 72° fins, free flight | 7.7%: 4% high at Mach 0.6, 3–15% low from Mach 1 to 3.3. With a cold skin, 5.0%. |
| Fin drag, Mach 1.5–2.0 (tuned) | NACA RM E50D28, RM-10 fins, wind tunnel | 0.011 in Cd, high. |
| Boattail pressure drag, Mach 2.5 and 3.5 (tuned) | MIL-HDBK-762 figure 5-144, four conical boattails, wind tunnel | Within 0.002 in Cd. |
| Fin-stabilized cone-cylinder, Mach 2.5–3.9 (check) | NACA RM L55G28a, free flight | Drag 1.2%, with its fins' square trailing edges entered (5.2% low with the fins sharp at both ends, as they were entered before the trailing edge could be set). With a cold skin, 16.7% high. |
| Boattailed body with fins, Mach 0.6–1.2 (check; two terms were sized on it) | NASA TN D-4013, Arcas short model, 15° boattail, wind tunnel | Drag 7.8%: 15% high at Mach 0.6–0.7, 4–9% low from Mach 0.85 to 1.2. |
| The same model, Mach 1.5–4.63 (check) | NASA TN D-4014, wind tunnel | Drag 4.1% with fins, 4.9% without. What the four fins add: 0.019 in Cd, low (0.065 low at Mach 1.5, 0.03 at 1.8). |
| Boattailed bodies in flight, Mach 0.8–2 (check) | NASA TR R-100, configurations 11 (8° boattail) and 36 (4°), free flight | Drag 6.2% on configuration 11; 12.6% high on configuration 36. |
| Pressure drag of 45° fins 2.8% thick (check) | NASA TR R-100 figure 5, free flight | 0.012 in Cd on the fin area. |
| Aerobee 150A, Mach 0.1–5 (check) | Manufacturer's data from Aerojet wind-tunnel tests | Drag 5.9% while thrusting, 4.8% coasting (both high); what the exhaust removes, Mach 2–5, within 0.002 in Cd; CP 0.8% of length; CNα 16% low on average (10–22% at every Mach number). |
| Fineness-16.9 missile with 60° delta fins, Mach 1.7–2.8 (check) | NACA RM L56G24, free flight | Drag 7.4% low (the model's instrument fairings, not in the app's design, are part of that); CP 6.0% of length forward. |
| Slender missile with small tail fins, Mach 0.6–3.95 (check) | NASA TM-2005-213541, configuration 3, wind tunnel (the report's digital data) | Drag less base 6–17% high outside Mach 0.9–1.2; 100% high at Mach 0.9 and 35% at 1.19 (gap 12); CP 3.5–13% of length forward; CNα 4% low at Mach 0.6, 15–28% low above 1. |
| Apogee, 23 measured flights, Mach 0.55–3.5 (check) | Altimeters, GPS, accelerometers and optical tracking; RASAero II example files | 5.8% (bias +2.1%), barometric readings compared as the altimeter reads them; RASAero II 5.2% (−3.5%). Below Mach 0.8, 3.8%; Mach 0.8–1.2, 6.1%; above 1.2, 7.3%. As true heights: 8.6% and 5.4%. |
| Nose drag to Mach 2 | NASA TR R-100 | These are the source curves, so this isn't an independent check. |
| Apogee, 65 flights | OpenRocket 24.12 | Median +0.9%, typical ±1.5%, worked out before build 288 and not redone. Another program, not a measurement. |
| Large angles of attack, rounded tips, pods, tube fins, drag above Mach 5 | — | Not checked against measurements. The app says so on any flight that passes Mach 5. |

All check cases together, by speed band (mean absolute error, mean signed error in brackets):

| Quantity | Below Mach 0.8 | 0.8–1.2 | 1.2–3 | 3–5 |
|---|---|---|---|---|
| Drag | 10.1% (+7.6) | 8.6% (+0.2) | 5.9% (+1.5) | 3.8% (+3.3) |
| CP, share of length | 2.4% (−2.4) | 3.5% (−3.4) | 3.8% (−3.8) | 1.0% (−0.3) |
| CNα | 13.0% (−13.0) | 13.3% (−13.3) | 16.7% (−16.7) | 18.3% (−18.3) |

## Notes on the evidence

**Barometric altimeters read low on warm days.** Seventeen of the 23 apogees were read by barometric altimeters,
which turn pressure into height with the standard atmosphere whatever the day's temperature. In air warmer than
standard the same pressure change spans more height, so the altimeter reads low: about 1% for every 3 °C, 9% at
LDRS-26's 100 °F (Featherweight's Raven manual says 10% or more; Nakka's flights with GPS and a barometric altimeter
side by side show the same). `validation/flights.js` compares those 17 with what the altimeter would have read at
the simulated apogee, for both the app's and RASAero II's predictions; `--geometric` compares true heights instead.
As the altimeter reads, the app is 5.8% off with a +2.1% bias and RASAero II 5.2% with −3.5%; as true heights the
app would be 8.6% (+7.7%). Limits: it assumes no altimeter's reading was corrected for temperature afterwards, and
that the air aloft is as much warmer than standard as the air at the pad, which is doubtful for Don't Debate This
(56,000 ft; 14% low on this reading). A well-mixed layer to 3 km above the pad with the standard tropopause, in
place of a uniform shift, moves the 23 flights by a few tenths of a percent: the result does not hang on the
profile; that one flight does. What is left below Mach 0.8 is the EZI-65 (+9%; its file says 70 °F, and it is flown at the
100 °F of the other six LDRS-26 flights) and Thunder and Lightning (+6%); above it, Raven
(+22%) and Proteus 6 (+17%, measured by accelerometer).

The Results tab says what a barometric altimeter would read for the predicted apogee when the day's air puts it 2%
or more from the true height.

**The skin's temperature and the free-flight drag cases.** A model boosted to speed in seconds is somewhere between
a cold skin and a fully heated one. The two free-flight cases pull opposite ways: RM A53D02 scores 7.7% heated and
5.0% cold, RM L55G28a 1.2% heated and 16.7% cold. So the skin's temperature does not explain what is left of
either. The measured flights are flown with the skin followed in time, but `validation/cases.js` gives every one of
them the same placeholder wall (2 mm, density 1000), which heats within a few seconds; published build details give
only the Qu8k's material (aluminium), so each rocket's real wall is a missing input there.

**The base.** TR R-100's flight-measured base pressure (0.136 below Mach 0.9) is lower than the correlations often
used at subsonic speeds (Fleeman's 0.12 + 0.13 M² gives 0.17–0.24). Two other sources agree with the lower level:
MIL-HDBK-762's base-pressure data (figure 5-140) scatter from 0.06 to 0.13 below Mach 0.8, and its chart of total
drag against boattail size (figure 5-120, from NSWC TR 81-156, itself a prediction) reads 0.23, 0.195, 0.17, 0.13 and
0.11 at Mach 0.8 for bases 1.0, 0.9, 0.8, 0.6 and 0.4 of the diameter, where the app gives 0.239, 0.201, 0.171, 0.130
and 0.108. Hoerner's rule for bodies (0.029/√ of the forebody's drag on the base area, ch. III, equations 34 and 35)
has the same base-diameter-cubed form but a level a third to a half of TR R-100's on a long rocket; tried, it fixed
the Arcas and configuration 36 below Mach 1 and put the eight slowest flights about 11% high, so the level stays.
The fin correction above Mach 1 is TN 3819's increment over its own body curve; on R-100's higher curve from Mach 1
to 2 it may count some of the fins' effect twice.

**Boattails.** Three flight and tunnel cases check them: two rocket-boosted models from TR R-100's appendix
(configuration 11, an 8° boattail to 0.67 of the diameter with delta fins; configuration 36, 4° to 0.72 with 45°
untapered fins) and the Arcas short model (NASA TN D-4013 and D-4014: 15° to 0.65, with the base's own force given
separately below Mach 1.2). The measured flights' boattails are all steeper than 25° and count as separated. The
NACA models were polished metal and are flown with a 2 µm finish; with 20 µm their friction would be a third
higher, because at those Reynolds numbers 20 µm is rough. What is left: on the Arcas the app is 15% high below Mach
0.8, where the tunnel's base force is negative (−0.04; a sting was in the wake) and the app's is +0.04;
configuration 36 is high throughout, about half of it below Mach 1 where the report suspects laminar flow on the
fins, and its nose (a curved tip faired into a cone, entered as a power-series shape of exponent 0.45) is only
roughly what the app can describe. The Arcas case was used to size the 15° attachment limit and the Mach 0.88 start
of the wave drag, so its score is not fully independent.

**Fins.** RM L55G28a's fins have wedge leading edges and square trailing edges, as its report says. Entered that
way the app's drag is within 1.2% of the flight from Mach 2.5 to 3.9; entered as sharp at both ends, the only
choice before the trailing edge could be set apart, it was 5.2% low. That is the one independent check of a blunt
trailing edge behind a sharp front, and it is supersonic only. On the 45° fins of TR R-100 figure 5 the linear term gives 0.0046 against 0.0037 measured up to Mach 1.4
and falls below the measurement past Mach 2 (the report draws one level line to Mach 3 and says it did not try for
accuracy); the peak near Mach 1 gives 0.0057 against 0.0055. The RM-10's fins (RM E50D28) are 5% thick along the
flow: the report's 0.10 is measured normal to the 60° leading edge (NACA Report 1160). Left open: the Arcas fins add
0.065 more drag at Mach 1.5 and 0.03 more at Mach 1.8 than the app gives. Those fins sit on a 15° boattail and
carry grit strips on both faces, so the increment is not the fins' wave drag alone, and the two fin sets the peak
was built on have neither. Square and rounded edges rest on Hoerner's sections between walls; nothing public says
how blunt hand-finished edges are.

**The motor's exhaust.** While the motor burns the app takes the base drag off the nozzle's exit area and leaves it
on the rest. The Aerobee's two curves, thrusting and coasting, overlap from Mach 2 to 5, and their difference is that
term measured: 0.034 at Mach 2 falling to 0.011 at Mach 5. The app gives it within 0.005. Hoerner (p. 16-10) reports
the pressure on the ring around a nozzle falling to about −0.2 at Mach 2 with the jet running, twice the coasting
value, which would add drag; the Aerobee curves show no such thing. Below Mach 2 nothing here checks it.

**Protuberances above Mach 1.** Hoerner's free-flight values at Mach 1 to 2 (p. 20-14: 0.75 for a forward-facing
step, 0.45 for a rear-facing one, 0.8 for blunt rings, 2.0 for round rivet heads) bracket what the app gives a blunt
box there (about 1.3). A streamlined shroud above Mach 1 is still an estimate.

**Finish labels.** Missile DATCOM's roughness table puts carefully applied smooth paint at 6 µm, average paint at
10 µm and production spray paint at 30 µm. OpenRocket's names for 20 and 60 µm ("smooth paint", "regular paint")
suggest something smoother than they are, so the builder's list says what each height corresponds to. Roughness
matters little until it is large. The Aerobee coasting case's score depends on a finish and Reynolds number its
source does not give.

**Where the remaining apogee error sits.** Scaling each flight's whole drag until its apogee matches gives the
factor that rocket needs (`validation/drag-factors.js`, as the altimeter reads). The fourteen rockets with beveled or
square fins need 1.00 on average (0.83 to 1.20), and the seven of them above Mach 1.2 need 1.02: there is no
general shortfall of drag, at any speed. The nine whose fins are entered as rounded (five sport rockets measured at
LDRS-26, Blister, Rabia twice and Torrent) need 1.09 on average, from 0.87 to 1.40. The largest single factors:

| Flight | Factor | Note |
|---|---|---|
| Raven, LDRS-26 (Mach 1.15) | 1.40 | rounded fins |
| LOC/Precision EZI-65, LDRS-26 | 1.22 | rounded fins |
| Proteus 6 (Mach 2.95) | 1.20 | boattail; measured by integrated accelerometers |
| Rabia, Thunder and Lightning, Torrent | 1.14–1.16 | rounded fins |
| Qu8k (Mach 3.5) | 1.10 | boattail; measured by integrated accelerometer |
| Cancer Descending, Blister, Ion Drive | 0.86–0.87 | the first two have rounded fins |
| Don't Debate This (Mach 3.0) | 0.83 | 56,000 ft; the altimeter correction is doubtful that high |

What was tried:

- Flying the rounded fins as square ones brings their average to 1.00, but not their scatter (0.78 to 1.32): it
  fixes the EZI-65 (0.96) and overshoots Cancer Descending and Blister (0.78, 0.79), and Raven still needs 1.32.
  Hand-rounded plywood and fiberglass edges are likely blunter than the model's rounded edge, but these flights
  can't say by how much, and RASAero II is also 6–12% high on four of the LDRS-26 rockets.
- A 3 mm aluminium wall in place of the placeholder (a skin that stays cooler, so more friction) moves the factors
  by 0.01 on average and 0.02 to 0.04 on the fastest flights. The wall is not what Proteus 6 and Qu8k are missing.
- Rail buttons are worth 2.5% of apogee and are already counted.
- A rougher finish closes the sport rockets' gap only by giving the good flights far too much drag.
- A fin–body interference term of the size Box, Bishop and Hunt take from Mandell (the fin's friction on the root
  chord times half the body diameter) would add 0.03–0.06 to every rocket: about what the good flights and the
  polished NACA models don't need.

So there is no one missing term. Rounded edges are where the evidence points, with too much scatter between
rockets to fit a number to; the two boattailed rockets above Mach 2.9 are the other group, and both were measured
by accelerometer, not altimeter.

**RASAero II on the same drag cases.** Each body was written as a RASAero II design file, opened in RASAero II on
Windows, and its drag table exported (Aero Plots, Export to CSV). Mean error against the same measured points:

| Case | App | RASAero II | RASAero II settings |
|---|---|---|---|
| RM A53D02 | 7.7% | 7.0% | all turbulent flow, as the app assumes (16.6% low with its default transition) |
| RM L55G28a | 1.2% | 9.4% to 15.1%, low | Rough Camouflage Paint to Camouflage Paint, which bracket the app's 20 µm (20.1% with zero roughness) |
| Arcas short model, Mach 0.6–1.2 | 7.8% | 19.1% | zero roughness; low by 21–41% from Mach 0.9 to 1.1 |
| TR R-100 configuration 11 | 6.2% | 6.5% | zero roughness |
| TR R-100 configuration 36 | 12.6% | 11.7% | zero roughness, tangent ogive nose |
| Aerobee coasting | 4.8% | 4.2% to 7.4% | Rough Camouflage Paint to Camouflage Paint |
| Aerobee thrusting | 5.9% | 6.3% to 6.4% | the same, with the nozzle exit entered |
| Aerobee, what the exhaust removes | 0.002 Cd | 0.003 Cd | |

Limits: RASAero II has no power-series nose and no fin anchors were entered for the Arcas (Rogers adds them as rail
guides). Its fin sections were the nearest it offers (Biconvex for the app's airfoil, Hexagonal with the same bevel
lengths). A Mach-altitude table was entered to match each case's Reynolds numbers; RASAero II's exported Reynolds
numbers follow it within 10% on the TR R-100 cases, partly on the Arcas and A53D02, and not at all on L55G28a, which
ran at sea-level Reynolds numbers (1.8 times the flight's: a few percent of drag).

## Known gaps, in the order they're worth fixing

1. **Base drag with fins between Mach 1 and 2.** The fin term is TN 3819's increment over its own body curve,
   added to TR R-100's higher curve, so it may count some of the fins' effect twice there. The app is still 3–15%
   low on RM A53D02 from Mach 1 to 3.3, so the base isn't the whole story on that body.
2. **The exhaust plume.** A burning motor's plume changes the pressure on the base around the nozzle. Only the
   nozzle's area is taken off now; the Aerobee data check that from Mach 2 to 5 and nothing checks it below.
3. **Transonic center of pressure.** The measured CP moves forward near Mach 0.85–0.9 on short rockets; the model
   doesn't. NASA TM X-653 has more data to check it against.
4. **Fin–body interference with Mach number.** Barrowman's factor is a low-speed one. Pitts, Nielsen and Kaattari
   (NACA Report 1307) give the body–fin lift carryover across subsonic and supersonic speeds in one framework.
5. **Body lift at supersonic speeds and large angles.** Slender-body theory and K = 1.1 hold at low speed; Jorgensen
   (NASA TR R-474) carries a body's normal force to high angles and Mach numbers consistently.
6. **Single-wedge fins.** A fin with a sharp leading edge and a blunt trailing edge can be entered (the Trailing
   edge field), and RM L55G28a's fins check it. The Aerobee 150A's fins are "a modified single wedge" (NTRS
   19660005621), a section that thickens all the way to the trailing edge, which the app has no shape for, and
   their thickness at the trailing edge isn't published: entered as beveled with a full-thickness square back the
   app is 19% high thrusting and 11% coasting, against 6% and 5% entered as beveled at both ends, as they are.
7. **Normal-force slope and CP with small fins on long bodies.** On the Aerobee 150A the app's CNα is 10–22% low
   at every speed while its CP agrees. On NASA TM-2005-213541's configuration 3 it is 4% low at Mach 0.6 and 15–28%
   low above Mach 1, with the CP forward, and RM L56G24's CP is 6% forward too: the fins seem to carry more lift
   than the app gives them, or the body less (see items 4 and 5).
8. **Rounded and hand-finished fin edges.** The rockets with rounded fins need about 9% more drag than the
   model gives them on average, with wide scatter (see "Where the remaining apogee error sits"). The EZI-65 (0.25 in
   rounded fins, 3.6% of the chord) is 9% high.
9. **Very short bevels.** With bevels of about 1% of the chord, as on the Kinsel A-601, linear theory would give
   more drag than a square edge, so each bevel is capped there. How a nearly square bevel really behaves between
   the two is open (the Kinsel A-601 is 4% high).
10. **Sharp fins from Mach 1.2 to 2 on a boattail.** The Arcas fins add 0.065 more drag at Mach 1.5 and 0.03 more
    at Mach 1.8 than the app gives (see Fins, under Notes on the evidence).
11. **More test cases.** Each new measured rocket goes in `validation/cases.js`, kept apart from the cases the
    model was tuned on. The Aerobee 150A, RM L55G28a, RM L56G24, TM-2005-213541, the TR R-100 and Arcas drag cases
    and the 23 flights are the check cases so far.
12. **Transonic drag of short noses with a flare behind them.** On TM-2005-213541's configuration 3 (a 2.3-caliber
    ogive on a narrower forebody, then a cone out to the body) the app's drag without base is twice the measured
    value at Mach 0.9, where the tunnel shows no rise yet, and 35% high at Mach 1.19.
13. **Above Mach 5** nothing checks the drag, and above Mach 1 nothing checks protuberances.

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

