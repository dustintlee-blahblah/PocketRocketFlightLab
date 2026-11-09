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
| below 1 | Fleeman: −Cp,base = 0.12 + 0.13 M², on the base area. |
| above 1 | Fleeman: 0.25 / M. |
| Motor burning | The nozzle exit area is taken off the base (entered, or estimated from the motor's average thrust). The exhaust plume's effect on base pressure isn't modeled. |

### Fins

| Term | Mach | Source |
|---|---|---|
| Square edges | all | 0.8 × stagnation pressure on the leading edge, swept by the independence principle (cos²Λ), plus base drag on the trailing edge. |
| Rounded edges | all | Modified Newtonian (⅔ × stagnation pressure) on the leading edge from the drag-divergence Mach number, half the base on the trailing edge. |
| Sharp edges (airfoil, beveled, double wedge) | above 1 | Ackeret thin-airfoil wave drag K(t/c)²/β (double wedge 4, airfoil 16/3, 20% bevel 10), weakened while the leading edge is still subsonic (M·cos Λ < 1). |
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
| Total drag, Mach 0.6–4.6 | NACA RM A53D02, fineness-10 body with 72° fins, free flight | Mean error 17%: 12–21% high below Mach 1, 7–25% low above. |
| Fin drag, Mach 1.5–2.0 | NACA RM E50D28, RM-10 fins, wind tunnel | Mean error 0.022 in Cd. |
| Aerobee 150A, Mach 0.1–5 (never used for tuning) | Manufacturer's data from Aerojet wind-tunnel tests | Drag 4.8% mean (6% subsonic, 9% transonic, 4% supersonic); CP 0.8% of length; CNα 16% low throughout. |
| Fin-stabilized cone-cylinder, Mach 2.5–3.9 (never used for tuning) | NACA RM L55G28a, free flight | Drag 12.7% low. |
| Nose drag | NASA TR R-100 | These are the source curves, so this isn't an independent check. |
| Apogee, 65 flights | OpenRocket 24.12 | Median +0.9%, typical ±1.5%. Another program, not a measurement. |
| Large angles of attack, rounded tips, pods, tube fins | — | Not checked against measurements. |

## Known gaps, in the order they're worth fixing

1. **Supersonic base drag.** Fleeman's 0.25/M is a single correlation. NACA TN 3819 (Love, 1957) gives the base
   pressure of bodies, boattails and fins above Mach 1 from measurements; the Wind Tunnel tool already uses it and
   comes out at 14.4% on RM A53D02 against the app's 17%. The app is low above Mach 2 on both free-flight rockets
   (RM A53D02 and RM L55G28a, 10–25%).
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
8. **More test cases.** `validation/accuracy.js` scores every measured rocket in `validation/cases.js` by speed band,
   keeping the cases the model was tuned on apart from those kept back for checking. The Aerobee 150A and RM L55G28a are
   the check cases so far; each new measured rocket goes there.
