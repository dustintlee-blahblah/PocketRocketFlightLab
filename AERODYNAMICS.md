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
| A flat face with nothing ahead of it (a flat nose) | 0.8 × stagnation pressure on its area. |
| A step up behind a narrower section | The flow leaves the wall ahead of a step and rides over a pocket of slow air, so the face feels far less than stagnation pressure, and less again when the step is short beside the boundary layer. Above Mach 1.6: NASA TN D-8040 (Patel and Czarnecki, 1975), figure 15, the face's drag coefficient against the step's height over the boundary layer's thickness, measured at Mach 1.61 and 2.20 (0.58 and 0.44 for a tall step, 0.32 and 0.23 at a tenth of the boundary layer), with the report's tall-step theory to Mach 6. Below Mach 0.9: Hoerner, chapter V, figure 10, 0.40 on the mean dynamic pressure the boundary layer leaves the step. Blended between. Where the narrower section is under half the wider one's radius it is blended toward the flat face (a guess: nothing here measures a slim body ahead of a blunt face). |
| A flare behind a narrower section | As above for shoulders, but never more than a flat step of the same height: Bonney's cone correlation runs past stagnation pressure on short, steep flares. |

### Boattails (sections that shrink)

| Term | Mach | Source |
|---|---|---|
| Whether the flow follows it | all | Attached up to a 15° half-angle, fully separated past 25°, blended between. The separated share of the step counts as base area. TR R-100 checked its afterbody equation against flight data for slopes up to 15°, and the Arcas model's 15° boattail (NASA TN D-4013) keeps its base at or above free-stream pressure below Mach 0.95, which a separated tail cone could not. |
| Wave drag of a boattail ending at the base | 0.88 – 2 | NASA TR R-100's equation 1 for conical afterbodies: (0.010·θ + 0.00071·θ²)/M · [1 − (base radius / maximum radius)ⁿ] on the maximum cross-section, θ the slope in degrees (at most 15), n = 4 below Mach 3.5 and 3 above. The report prints the first coefficient as 0.0010, a misprint the app carried until build 341 (see Boattails under "What the comparisons show"). It approximates the second-order theory of NACA TN 2972 (Jack). The report warns against using it below Mach 1, so it fades in from Mach 0.88 to 1 (measured boattail drag rises from Mach 0.9 to 1.05: NACA RM L56K22). Only the attached share counts. |
| The same | above 2.5 | Linear theory's 2·tan θ/β on the area the boattail takes away, 1 − (base radius / maximum radius)², times (1.15 − 0.058·θ°): 0.90 at 4.3°, 0.60 at 9.5°. Fitted to wind-tunnel pressure measurements on four conical boattails at Mach 2.5 and 3.5 (Rubin, Brazzel and Henderson, in MIL-HDBK-762 figure 5-144), within 0.004 of all eight points (equation 1 is within 0.008 of them at Mach 2.5). Blended with equation 1 from Mach 2 to 2.5. |
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
| Leading-edge radius on a sharp section (beveled, double wedge; the builder's Leading-edge radius, RASAero's LE radius) | from the drag rise | A round of radius r tangent to the section's faces, which meet at half-angle δ (atan of half the thickness over the bevel length, or t/c for a double wedge). Modified Newtonian on the arc that shows is k·Cp,max on its height 2r, k = cos δ − cos³δ/3; the sharp wedge it replaces had sin²δ·cos δ of that, so the round adds (⅔)·cos³δ·Cp,max on 2r: nothing at r = 0, the rounded edge's ⅔ for a thin wedge. The section's thin-airfoil wave drag is left as it is (taking out the wedge's share by linear theory, held to the square edge's cap, made a steep bevel lose drag when rounded). Swept as the other edges (cos²Λ on span × 2r, normal Mach number). Checked: ⅔·Cp,max is within 1% of Barrowman's cylinder formula from Mach 1.1 to 6.9 and about 3% under Gowen and Perkins' cylinder at Mach 2.9 (NACA TN 2960, front only); on NASA TM X-27's 45° wing (radius raised from about 0.17% to 0.36% of the chord over the outer 40% of the span) it gives 0.0006 at Mach 2–2.2, where the report measured under 0.001–0.0015. Moves the three measured flights that give a radius 0.2–1.5% lower. |
| Square and rounded trailing edges | all | The base drag above on the edge's area; a rounded edge takes 0.7 of a square one's (NASA TN D-6637: round against square trailing edges on turbine blades, 0.64–0.78). |
| A trailing edge unlike the leading edge (the builder's Trailing edge field) | all | Each end of the section takes its own term. A sharp leading edge with a square or rounded back: the base drag above on the trailing edge, and of the wave drag only the front's share (thin-airfoil wave drag is the chordwise sum of the surface slope squared, so the tapering front and the tapering back each add their own part and a flat part between adds none): half of a double wedge's or an airfoil's K, or the leading bevel's 1/e₁. The peak near Mach 1 is left whole. A square or rounded front tapered to a sharp edge at the back: no base drag, the leading edge's own term, and the trailing bevel's 1/e₃ of wave drag. Checked on RM L55G28a's fins (wedge leading edges, square trailing edges). |
| Sharp edges (airfoil, beveled, double wedge) | above the drag rise | Linear (thin-wing) theory for the fin's own outline and section, worked out numerically by the supersonic area rule (NACA Report 1284): the average, over every angle a Mach plane can take, of the slender-body drag of the areas that plane cuts from the fin and its mirror image in the root. For a wide unswept fin it is thin-airfoil theory, K·(t/c)²/β (double wedge 4, airfoil 16/3, a beveled plate 1/e₁ + 1/e₃ from its bevels as shares of the chord: 10 with the default 20% bevels); a swept fin has less than that while its edges are behind the Mach line, and a peak as the Mach line passes each edge and ridge. A double wedge and an airfoil keep their thickness ratio along the span; a beveled plate keeps its thickness and its bevels' lengths (they meet, slopes unchanged, where the chord is shorter than both together). β is never taken under 0.4, and the drag rises to that value from the section's drag-divergence Mach number to Mach 1.05, where Missile DATCOM's fin method also puts the full value. Each bevel is still held to at most what a square leading edge or a blunt trailing edge of the same thickness would cost, as a share of the whole section's drag. Worked out once per fin shape and Mach number and kept. Until build 341: thin-airfoil theory, held while the leading edge was swept behind the Mach line at its value where the Mach line reaches the edge. |
| Sharp edges, through Mach 1 | about 0.85 – 1.5 | NACA Report 1253 (McDevitt, 1955), figure 8: the pressure drag of 22 rectangular wings (NACA 63A sections 2–10% thick, aspect ratios 0.5–6) correlated by the transonic similarity rules, drag over (t/c)^(5/3) against (M² − 1)/(t/c)^(2/3) for each value of aspect ratio × (t/c)^(1/3). A stubby fin's drag rises later and stops far lower than a long one's: at Mach 1 a fin of aspect ratio 1 and 3% thickness has a third of a long fin's. Swept fins take the chart at M·√r with r⁵ of its drag, r = cos Λ / cos 30° (fitted to the RM-10's 60° fins, NACA RM E50D28). It eases back past the chart's end; the larger of this and the linear term is used. Until build 307 the level came from what the Arcas model's fins add (several times the chart; those fins sit on a boattail and carry grit strips). |
| Drag divergence | | M_dd = 0.96 − 1.5(t/c) (NACA 0006 ≈ 0.87, 0012 ≈ 0.78). |

### Protuberances, pods and tube fins

| Term | Source |
|---|---|
| Rail buttons | Hoerner's cylinder in crossflow (1.2 × stagnation pressure) subsonic, modified Newtonian plus base above Mach 1.3, reduced by how deep they sit in a 1/7-power turbulent boundary layer. |
| Protuberances (a camera, a switch box, an antenna, a shroud: the Protuberance part) | Hoerner, chapter V, figure 13: on the frontal area, 1.20 for a blunt box about as long as tall, 0.74 for one over twice as long, 0.78 for an upright cylinder or bolt, 0.07 for a streamlined blister; 0.39 for a long box with a sloped front and a square back (built from the 0.74 box and his steps on a wall, figure 10: a square forward-facing step 0.40, the same beveled at about 30° to the surface 0.11, a square rear-facing step 0.22, so the sloped front keeps 0.11/0.40 of the front's share); reduced by the boundary layer as the buttons are (Hoerner's 0.75·∛(h/δ) is the same within a few percent). Above Mach 1 there is no data: blunt shapes rise as the rail button does, a streamlined one takes the Newtonian pressure on its front slope if larger (the slope is its height over half its length, or over the length of one tapered end where the item has a straight middle and that length is given); the sloped-front box stays a share of the long blunt box, 0.53 below Mach 1 and above it the share his free-flight steps give (rear-facing 0.45 plus modified Newtonian on a 30° front, against forward-facing 0.75 plus the same rear: 0.70 at Mach 1.5). A bare 1 in cube on a 4 in rocket adds 0.09 to Cd; the same size streamlined, 0.005 below Mach 1 and 0.03 above. An item sits on one side of the body, so it also turns the rocket: taken as a uniform block centered at body radius + half its height, its weight puts the CG off the centerline by Σm·r/M, giving the moment e·(thrust − drag) of two centerline forces passing beside the CG, and its own drag acts at that radius, giving q·CdA·r. Both turn with the rocket's roll; items set evenly around the body (the Angle around the body field) cancel. A fly-away rail guide (the Protuberance part's last shape) is a blunt box, 1.20, and is on the rocket only while it is on the rail: its drag and its weight count up to the rail's end and not after. |
| Launch lugs | Stagnation pressure on the front face, base on the back, pipe friction through the bore. |
| Pods | Each pod's own body, once per copy: friction as above; its nose from the TR R-100 curves, blended into modified Newtonian theory from Mach 4 to 6 (no shock-expansion); a boattail on it separates between 8° and 20° (Hoerner) and has no wave drag term; its base takes the body curve. |
| Tube fins | Ribner's ring airfoil for lift (J. Aeronautical Sciences, 1947); friction outside, Darcy–Weisbach pipe flow inside (Swamee–Jain friction factor), stagnation and base pressure on the front face and the gap at the body (worked out by plane geometry; the same breakdown as OpenRocket's). |
| Tumbling | Allen–Perkins crossflow drag averaged over all pitch angles. |

## Normal force and center of pressure (`cnaParts`)

| Term | Mach | Source |
|---|---|---|
| Nose, shoulders, boattails | all | Barrowman (1966/67) slender-body theory: CNα = 2(A₂ − A₁)/A_ref at the section's centroid. Doesn't change with Mach, except for the nose above Mach 1 (next row). |
| Nose with the cylinder behind it | above 1 | MIL-HDBK-762 figures 5-4 and 5-5 (tangent ogive-cylinders, used for every nose shape but a cone) and 5-6 and 5-7 (cone-cylinders): the slope and center of pressure of the nose and the body behind it, as far as the body keeps the nose's diameter, against d·β/(nose length) and (cylinder length)/(d·β), β = √(M² − 1). From measurements; the handbook gives ±10% in the slope and half a caliber in the CP. Read off the printed charts (to about ±0.05), faded in from Mach 1 to 1.2. Replaces the nose's slender-body 2. |
| Fins | below 0.9 | Diederich's formula with Prandtl–Glauert compressibility, as Barrowman uses it. Any outline, by spanwise strips. |
| Fins | above 1.5 | Linear supersonic theory for the fin's taper and sweep: the generalized charts of MIL-HDBK-762 figure 5-35 (the same as USAF DATCOM's), for the two panels joined at the root. While the leading edge is swept behind the Mach line the lift is below thin-airfoil theory's 4/β, down to the slender-wing value at Mach 1; past it, it tends to 4/β. An unswept fin has 4/β with a rectangular wing's tip loss, (1 − 1/(2·AR·β)), as every fin had until build 341. Sharp and rounded edges take the full value (checked against Arcas TN D-4014 and NASA TM X-653), square edges 2.5/4 of it (no data; the cautious value). The fin's CP moves from ¼ of the mean chord toward Barrowman's supersonic location. |
| Fins | 0.9 – 1.5 | Blended between the two. |
| Fin–body interference | all | Barrowman's factor, 1 + r/(s + r): the fins' lift with the body between them. Doesn't change with Mach. |
| The fins' lift carried onto the body | above 0.9 | Pitts, Nielsen and Kaattari, NACA Report 1307: by slender-body theory, (1 + τ)² − K_W(B) with τ = r/(s + r) (its equations 14 and 21), or, when βA(1 + λ)(1/(βm) + 1) > 4, each fin's pressure field carried onto the body between the Mach lines from the root chord (its equations 23 and 25, integrated numerically, over the body behind the fins as far as it goes). Faded in from Mach 0.9 to 1.5. Not used below Mach 0.9, where it made the lift 4–29% too high on the three measured rockets and moved the Arcas CP 5–9% of length aft. |
| Five or more fins | all | MIL-HDBK-762, p. 5-24: six fins 1.37 and eight 1.62 times the normal force of four, so 0.913 and 0.81 of each fin's share; five and seven interpolated (0.948, 0.854), more than eight held at 0.75. OpenRocket uses the same factors. |
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
| Center of pressure, Mach 0.6–4.6 (tuned) | NASA TN D-4013/4014, Arcas sounding rocket, two body lengths, wind tunnel | RMS error 3.1% of body length (17 points). Worst on the short model: 5% too far aft at Mach 0.85–0.9, and 4–5% too far forward above Mach 3 (2–3% before the supersonic body terms went in). |
| Normal-force slope of the same short model, Mach 0.6–4.63 (check) | NASA TN D-4013 figure 7(b), TN D-4014 figure 5, with and without fins | With fins 13.6%: 8–20% low to Mach 1.2, 17–28% high at Mach 1.5–1.8, within 7% at Mach 2.3–4, 13% low at 4.63. Body alone 24%: 15–52% low to Mach 1.2 (no sourced term there), within 10% at Mach 1.5–3, 22% low at 4.63. |
| Total drag, Mach 0.6–4.6 (tuned) | NACA RM A53D02, fineness-10 body with 72° fins, free flight | 6.6%: 4% high at Mach 0.6, 1–14% low from Mach 1 to 3.3 (7.7% before build 342). |
| Fin drag, Mach 1.5–2.0 (tuned) | NACA RM E50D28, RM-10 fins (half scale), wind tunnel | 0.021 in Cd, high (0.098–0.106 measured): 0.014 at Mach 1.5 rising to 0.036 at Mach 2, the fins' wave drag near the Mach number that puts the Mach line on their leading edge (gap 10). Until build 341 the case had the fins a quarter too small (5.24 in of span for 6.82) on a plain cylinder, and showed 0.011. |
| The full-scale RM-10 in flight, Mach 1.2–2.8 (check) | NACA RM L55H02, Reynolds number 60–220 million; afterbody entered as a cone | Total drag 7.5%: 5–7% low at Mach 1.2–1.6, 13–15% high at Mach 2–2.2, 3% high at Mach 2.8. Base drag 0.007 in Cd (0.023 high at Mach 1.2, within 0.006 from Mach 1.6). The body's pressure drag 0.010 low. What the exhaust removes from the base (0.028–0.053 measured) 0.014 low. |
| Boattail pressure drag, Mach 2.5 and 3.5 (tuned) | MIL-HDBK-762 figure 5-144, four conical boattails, wind tunnel | Within 0.002 in Cd. |
| Fin-stabilized cone-cylinder, Mach 2.5–3.9 (check) | NACA RM L55G28a, free flight | Drag 1.2%, with its fins' square trailing edges entered (5.2% low with the fins sharp at both ends, as they were entered before the trailing edge could be set). With a cold skin, 16.7% high. |
| Boattailed body with fins, Mach 0.6–1.2 (check; one term was sized on it) | NASA TN D-4013, Arcas short model, 15° boattail, wind tunnel | Drag 9.2%: 15% high at Mach 0.6–0.7, 15–20% low at Mach 0.9–0.95, within 3% from Mach 1 to 1.1, 8% high at Mach 1.2 (14.3% before build 341's boattail correction: 14–27% low from Mach 0.9 to 1.05). |
| The same model, Mach 1.5–4.63 (check) | NASA TN D-4014, wind tunnel | Drag 5.5% with fins (9% high at Mach 1.5 and 1.8), 11.8% without (32% high at Mach 1.5, 23% at 1.8, where its report says the reflexed lip on its base lowers the base force: gap 15; within 4% from Mach 2.3 to 4). What the four fins add: 0.019 in Cd, low (0.065 low at Mach 1.5, 0.03 at 1.8). |
| Drag antennas add, Mach 2.3–4.63 (check) | NASA TM X-1771, 0.410-scale Cajun, wind tunnel | Four long fairings with short pointed ends (0.06–0.12 measured): 0.019 in Cd. Two raked boxes (about 0.01 measured): 0.006 in Cd, high. |
| Slender body and its fins, Mach 2.3–4.63 (check) | NASA TM X-1684, 0.25-scale Tomahawk, wind tunnel | What four fins add (0.19–0.32 measured, two fin sets): 0.010 and 0.013 in Cd. The body alone, without its base: 7% high at Mach 2.3, 15–18% high from Mach 3 (gap 14). |
| Body with and without a boattail, Mach 0.6–1.4 (check) | NACA RM A57I09, fineness-10 body with a Kármán nose, wind tunnel | The boattail's pressure drag (0.07–0.14 measured from Mach 1 to 1.4): 0.024 in Cd, low (0.052 before build 341). Drag without the base: 13–17% low on the plain body, whose measurement includes a transition ring. |
| Conical boattails alone, Mach 0.8–1.3 (check) | NACA RM L56K22, cones of 3°, 5.6°, 8° and 16° to 0.55, 0.70 and 0.85 of the diameter, wind tunnel | Pressure drag: 0.012–0.024 in Cd low on the 3° to 8° cones (0.024–0.061 before build 341). Pressure and base drag together: within 0.025 on those, from 0.011 low to 0.016 high. The 16° cones: 0.03–0.05 off either way. |
| Conical afterbodies in flight, Mach 1.2 (check) | NASA TR R-100 figure 13(a), four afterbodies | Pressure and base drag within 0.012 in Cd (0.015–0.071 low before build 341). |
| Short conical boattails, Mach 1.22 and 1.32 (check) | NASA TM X-1960, 13 boattails of 3° to 15°, 0.6 to 1.0 diameters long, wind tunnel, jet off | Pressure drag: 15° within 0.01 in Cd; 3° to 10°, 0.006–0.022 too little. All 13: 0.013 on average (0.052 before build 341). |
| Boattailed bodies in flight, Mach 0.8–2 (check) | NASA TR R-100, configurations 11 (8° boattail) and 36 (4°), free flight | Drag 20.3% high on configuration 11 (15% at Mach 1.1 rising to 24% at Mach 2); 16.8% high on configuration 36 (14.6% and 17.9% before build 342's fin wave drag; 6.2% and 12.5% before build 341's boattail correction: gap 15). |
| Noses 3 diameters long, alone, Mach 1.24–3.67 (check) | NACA Report 1386: cone, tangent ogive, Von Kármán, ¾, ½ and ¼ power, ellipsoid; wind tunnel, laminar friction taken off | Pressure drag 0.007 in Cd on average (0.07–0.24 measured), the app a little high: Von Kármán within 0.005, cone within 0.007, the blunt shapes 0.006–0.012 high; at Mach 1.24 the ogive is 0.019 high and the paraboloid 0.025. For other lengths the report's second-order theory (figures 13 and 14, noses 2 to 7 diameters long) is within 10% of the app at Mach 2.5 and 3. |
| Six small flight models, Mach 0.9–1.25 (check) | NACA RM L53I01, parabolic nose, three 45° fins, afterbody square or tapered; free flight | Drag 4.1% with natural transition, 6% too much with the default (turbulent fins): gap 15. |
| The RM-10 in wind tunnels, Mach 1.49–6.9 (check) | NACA RM L54I03 (Mach 6.9, and its collection of the lower Mach numbers); afterbody entered as a cone | With fins, Mach 1.49–1.98: the normal-force slope 27–40% high and the CP 4.5–5.3% of the length too far aft (42–61% and 5.4–6.6% before build 342's fin lift: gap 17). At Mach 6.9: slope 6% high, CP 1.1% of the length aft, the body's pressure drag within 0.001 (also at Mach 2.41). |
| Pressure drag of 45° fins 2.8% thick (check) | NASA TR R-100 figure 5, free flight | 0.011 in Cd (on the body's cross-section, 0.046 measured): 0.014 under at Mach 1.1, 0.017 over at Mach 1.5 where the Mach line crosses the leading edge, 0.02 under past Mach 2.5. The report draws one level line from Mach 1.05 to 3 and says it did not try for accuracy. |
| Six swept wings on a body, Mach 1.1–1.7 (check) | NACA TN 3697: 6% double wedges swept 50°, aspect ratio 2 and 4, taper 0, 1/3 and 2/3; free flight | What the wing adds, in Cd on the body's cross-section (0.07–0.26 measured): 0.006, 0.007 and 0.017 at aspect ratio 2; 0.023, 0.033 and 0.031 at aspect ratio 4, where linear theory itself is low from Mach 1.2 to 1.5 on the tapered wings. Before build 342: 0.035, 0.030, 0.039, 0.046, 0.062 and 0.068. |
| Aerobee 150A, Mach 0.1–5 (check) | Manufacturer's data from Aerojet wind-tunnel tests | Drag 7.2% while thrusting, 5.3% coasting (both high); what the exhaust removes, Mach 2–5, within 0.002 in Cd; CP 0.7% of length; CNα 10% on average: 11–19% low below Mach 1, within 4% at Mach 1.2–1.45, 7–16% high at Mach 1.6–3, within 4% at Mach 4–5. |
| Fineness-16.9 missile with 60° delta fins, Mach 1.7–2.8 (check) | NACA RM L56G24, free flight | Drag 3.8% low (the model's instrument fairings, not in the app's design, are part of that); CP within 1% of length (6% forward before the supersonic body terms). |
| Slender missile with small tail fins, Mach 0.6–3.95 (check) | NASA TM-2005-213541, configuration 3, wind tunnel (the report's digital data) | Drag less base 6–17% high outside Mach 0.9–1.2; 20% high at Mach 0.9 and 30% at 1.19 (gap 12); CP 4–9% of length forward; CNα within 4% to Mach 1.19, 17% high at Mach 1.7, within 10% above. |
| Apogee, 23 measured flights, Mach 0.55–3.5 (check) | Altimeters, GPS, accelerometers and optical tracking; RASAero II example files | 6.3% (bias +2.4%), barometric readings compared as the altimeter reads them; RASAero II 5.2% (−3.4%). Below Mach 0.8, 3.7%; Mach 0.8–1.2, 6.1%; above 1.2, 8.6%. As true heights: 9.2% and 5.4%. |
| Drag coasting at Mach 2.0–2.8, 27,000–54,000 ft (check) | Qu8k's flight recorder: its accelerometer in the coast, with the rocket weighed after the flight | App 23% high with the air aloft as the app takes it from the pad's temperature, 12% with standard air all the way up (the day's upper air isn't known). Not a clean check: the motor bled tracking smoke into the base through the coast, which lowers base drag. Nothing was changed on it. |
| Drag coasting from Mach 2.1 to 0.5 and falling at Mach 0.6–0.95 (check) | Proto's flight recorder (98 mm minimum diameter, N4036): its accelerometer, the burnout mass worked out from the burn, the shape measured from a photograph | App 1–8% high above Mach 1.2 and 4–7% high below, depending on the finish and the upper air: inside what the mass and the shape allow. |
| How the drag coefficient changes with height in a coast, Mach 3.3–1.6, 28,000–70,000 ft (check) | Four two-stage flights tracked by Multitronix's Kate system: the sustainers' accelerometers, read from the flight summaries' plots; weights and shapes unknown, so only the change along each coast is compared, against a stand-in sustainer | The app's rise over the coasts is 4% more than the flights' with the air aloft as the app takes it, the same with standard air: no sign of a laminar boundary layer up to 60,000–70,000 ft. |
| Nose drag to Mach 2 | NASA TR R-100 | These are the source curves, so this isn't an independent check. |
| Apogee, 65 flights | OpenRocket 24.12 | Median +0.9%, typical ±1.5%, worked out before build 288 and not redone. Another program, not a measurement. |
| Large angles of attack, rounded tips, pods, tube fins, drag above Mach 5 | — | Not checked against measurements. The app says so on any flight that passes Mach 5. |

All check cases together, by speed band (mean absolute error, mean signed error in brackets):

| Quantity | Below Mach 0.8 | 0.8–1.2 | 1.2–3 | 3–5 |
|---|---|---|---|---|
| Drag | 10.1% (+7.6) | 7.4% (−0.3) | 9.3% (+6.9) | 3.9% (+3.5) |
| What fins or wings add, in Cd | | 0.020 (+0.016) | 0.020 (−0.011) | 0.007 (0.000) |
| A nose's pressure drag, in Cd | | | 0.008 (+0.007) | 0.005 (+0.005) |
| A boattail's pressure drag, in Cd | | 0.025 (−0.017) | 0.015 (−0.011) | |
| CP, share of length | 2.4% (−2.4) | 2.7% (−2.6) | 2.4% (+0.8) | 1.3% (−1.3) |
| CNα | 17.7% (−17.7) | 18.8% (−18.5) | 15.9% (+9.1) | 10.0% (−4.3) |

## Notes on the evidence

**Barometric altimeters read low on warm days.** Seventeen of the 23 apogees were read by barometric altimeters,
which turn pressure into height with the standard atmosphere whatever the day's temperature. In air warmer than
standard the same pressure change spans more height, so the altimeter reads low: about 1% for every 3 °C, 9% at
LDRS-26's 100 °F (Featherweight's Raven manual says 10% or more; Nakka's flights with GPS and a barometric altimeter
side by side show the same). `validation/flights.js` compares those 17 with what the altimeter would have read at
the simulated apogee, for both the app's and RASAero II's predictions; `--geometric` compares true heights instead.
The cases differ in how much their sources record, and so in how much weight they can bear: VALIDATION.md, "How
much weight each check can bear", grades each one and gives these figures by grade.

As the altimeter reads, the app is 6.3% off with a +2.4% bias and RASAero II 5.2% with −3.4%; as true heights the
app would be 9.2% (+7.9%). Limits: it assumes no altimeter's reading was corrected for temperature afterwards, and
that the air is as much warmer than standard as the air at the pad all through the troposphere and standard above
it (the U.S. Standard Atmosphere Supplements, 1966: a season's offset lasts to the tropopause and not beyond),
which is still only a guess at the day for Don't Debate This (56,000 ft; 12.8% low on this reading). A well-mixed layer to 3 km above the pad with the standard tropopause, in
place of a uniform shift, moves the 23 flights by a few tenths of a percent: the result does not hang on the
profile; that one flight does. What is left below Mach 0.8 is the EZI-65 (+9%; its file says 70 °F, and it is flown at the
100 °F of the other six LDRS-26 flights) and Thunder and Lightning (+6%); above it, Raven
(+22%), Proteus 6 (+17%, measured by accelerometer) and Qu8k (+18%: its recorder shows the motor delivered less
than the file's thrust curve and that the reported apogee is the accelerometer integrated without a zero correction;
VALIDATION.md, "Drag above Mach 2 measured in a flight").

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

*The misprint (build 341).* Those three are whole rockets. Build 341 added the first measurements of a boattail by
itself, and they came out three to five times what the app gave: pressures along a 6° boattail (NACA RM A57I09:
0.07 to 0.14 from Mach 1 to 1.4, the app 0.02 to 0.03) and along cones of 3° to 16° (NACA RM L56K22). The cause is
in the source. TR R-100 prints its equation 1 as (0.0010·θ + 0.00071·θ²)/M, and the app used it as printed. The
report's own figure 13(a) draws the equation at Mach 1.2 for afterbodies 1.78, 3.5 and 5 diameters long, and the
drawn curves are (0.010·θ + 0.00071·θ²)/M: a cone 1.78 diameters long to a point reads 0.29 on the figure, where
the equation gives 0.288 with 0.010 and 0.159 with 0.0010; the other two curves fit the same way. The report says
the term "approximates the second-order theoretical values calculated by Jack" (NACA TN 2972), which is true with
0.010 and not as printed:

| Jack's theory, Mach 1.5, base area 0.6 of the maximum | 3° | 5° | 7° | 9° | 11° |
|---|---|---|---|---|---|
| NACA TN 2972, figure 3 | 0.018 | 0.037 | 0.057 | 0.075 | 0.094 |
| Equation 1 with 0.010 | 0.016 | 0.029 | 0.045 | 0.063 | 0.084 |
| Equation 1 as printed (0.0010) | 0.004 | 0.010 | 0.018 | 0.028 | 0.041 |

So the coefficient is 0.010 from build 341. Against the measurements, in drag coefficient on the body's
cross-section (mean error; `validation/accuracy.js`):

| Measured | With 0.010 | As printed |
|---|---|---|
| RM L56K22, pressure drag of 3°, 5.6° and 8° cones, Mach 0.9–1.3 | 0.012–0.024 low | 0.024–0.061 low |
| The same, pressure and base drag together | 0.011 low to 0.016 high | 0.001–0.044 low |
| RM A57I09, pressure drag of a 6° boattail, Mach 0.6–1.4 | 0.022 low | 0.052 low |
| TM X-1960, pressure drag of 15° cones 0.6 to 1.0 diameters long, Mach 1.22 and 1.32 | within 0.01 | 0.08–0.11 low |
| The same, 3° to 10° | 0.006–0.022 low | 0.012–0.087 low |
| TR R-100 figure 13(a), four conical afterbodies in flight, Mach 1.2, pressure and base drag | 0.005–0.012 low | 0.015–0.071 low |
| Arcas short model with fins, Mach 0.6–1.2, total drag | 9.2% | 14.3% |

In flight with fins on, too: NACA RM L53I01 flew finned models differing only in afterbody. What each of its four
conical boattails changes (its model's drag less the square-based model's, Mach 1.15) is −0.085, −0.064, −0.100 and
−0.143 measured; −0.090, −0.063, −0.127 and −0.165 with 0.010; −0.119, −0.131, −0.137 and −0.190 as printed.

Whole rockets above Mach 1 went the other way, and now show too much drag (TR R-100's configurations 11 and 36):
the too-small boattail drag had been cancelling an excess that models without a boattail show as well. Gap 15
lists what has been found of it.

**Fins.** RM L55G28a's fins have wedge leading edges and square trailing edges, as its report says. Entered that
way the app's drag is within 1.2% of the flight from Mach 2.5 to 3.9; entered as sharp at both ends, the only
choice before the trailing edge could be set apart, it was 5.2% low. That was the one independent check of a blunt
trailing edge behind a sharp front; the Tomahawk model's fins (NASA TM X-1684: a 3.5° wedge with a rounded nose at
the front, a slab left blunt at the back, two planforms) are a second, within 0.02 of the 0.19 to 0.32 they add
from Mach 2.3 to 4.63. Both are supersonic only. On the 45° fins of TR R-100 figure 5 (0.0037 on the fin area, drawn as one level line from Mach 1.05 to 3; the
report says it did not try for accuracy) linear theory for the fins' own shape gives 0.0026 at Mach 1.1, 0.0050 at
Mach 1.5, where the Mach line crosses the leading edge, 0.0031 at Mach 2 and 0.0017 at Mach 3; the peak near Mach 1
gives 0.0057 against 0.0055. Six swept wings measured in flight (NACA TN 3697) follow the theory from Mach 1.1 to
1.7: gap 10. The RM-10's fins (RM E50D28) are 5% thick along the
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
box there (about 1.3). One wind-tunnel test checks the rest: NASA TM X-1771 (Jernell, 1969), a 0.410-scale Cajun
sounding rocket with and without its antennas at Mach 2.3 to 4.63, turbulent, each antenna about as tall as the
boundary layer. Two boxes with fronts raked back 45° add about 0.01 to the axial-force coefficient and the app's
sloped-front box gives 0.016. Four fairings 15.6 in long with a half-round top and pointed ends 0.82 in long add
0.12 at Mach 2.3 falling to 0.06–0.07 above Mach 4. A streamlined shape's drag above Mach 1 is the Newtonian
pressure on its front slope, and until build 341 that slope was always taken over half the item's length, which
gave these fairings 0.011, six to ten times too little. The streamlined shape now has a field for the length of
each tapered end; with 0.82 in the app gives 0.083 (0.019 off on average, flat where the measurement falls). Left
at 0 the slope is over half the length as before, and below Mach 1 the field changes nothing. The same report's four rod
antennas, swept 45°, add 0.11 to 0.165, less than a swept cylinder's Newtonian estimate (0.20); the app has no such
shape. RASAero II's rail guide, at about five times the app's, has no support here (see below). A streamlined shroud
shaped along its whole length is still an estimate above Mach 1, and a round stub is checked only against a laminar
boundary layer (NASA TN D-7369).

**Finish labels.** Missile DATCOM's roughness table puts carefully applied smooth paint at 6 µm, average paint at
10 µm and production spray paint at 30 µm. OpenRocket's names for 20 and 60 µm ("smooth paint", "regular paint")
suggest something smoother than they are, so the builder's list says what each height corresponds to. Roughness
matters little until it is large. The Aerobee coasting case's score depends on a finish and Reynolds number its
source does not give.

**Where the remaining apogee error sits.** Scaling each flight's whole drag until its apogee matches gives the
factor that rocket needs (`validation/drag-factors.js`, as the altimeter reads). The fourteen rockets with beveled or
square fins need 1.01 on average (0.86 to 1.20), and the seven of them above Mach 1.2 need 1.05: there is no
general shortfall of drag, at any speed. The nine whose fins are entered as rounded (five sport rockets measured at
LDRS-26, Blister, Rabia twice and Torrent) need 1.10 on average, from 0.87 to 1.40. The largest single factors:

| Flight | Factor | Note |
|---|---|---|
| Raven, LDRS-26 (Mach 1.15) | 1.40 | rounded fins |
| Torrent (Mach 1.29) | 1.28 | rounded fins |
| LOC/Precision EZI-65, LDRS-26 | 1.22 | rounded fins |
| Proteus 6 (Mach 2.95) | 1.20 | boattail; measured by integrated accelerometers |
| Qu8k (Mach 3.6) | 1.16 | boattail; measured by integrated accelerometer |
| Thunder and Lightning, Rabia (Mach 1.21) | 1.15, 1.12 | rounded fins |
| Cancer Descending, Blister, Ion Drive, Don't Debate This (Mach 3.0) | 0.86–0.87 | the first two have rounded fins; Don't Debate This reached 56,000 ft, where the altimeter correction is doubtful |

What was tried:

- Flying the rounded fins as square ones brings their average to 1.00, but not their scatter (0.78 to 1.32): it
  fixes the EZI-65 (0.96) and overshoots Cancer Descending and Blister (0.78, 0.79), and Raven still needs 1.32.
  Hand-rounded plywood and fiberglass edges are likely blunter than the model's rounded edge, but these flights
  can't say by how much, and RASAero II is also 6–12% high on four of the LDRS-26 rockets.
- A 3 mm aluminium wall in place of the placeholder (a skin that stays cooler, so more friction) moves the factors
  by 0.01 on average and 0.02 to 0.04 on the fastest flights. The wall is not what Proteus 6 and Qu8k are missing.
- Rail buttons are worth 2.5% of apogee and are already counted. RASAero II gives a rail guide about five times
  the app's drag, and a launch shoe more (its drag tables, exported with and without them on Raven, Torrent and
  Rabia: 0.07 to 0.5 of drag coefficient against the app's 0.015 to 0.08); its author describes that as a rule of
  thumb ("typically a rail guide will have 5 times the drag of a typical rocket body"). The flights don't support
  it: with the app's guide drag times five, the twelve flights below Mach 0.95 that carry guides go from a bias of
  −0.3% (mean error 3.6%) to −8.2% (8.3%), and RASAero II itself is −6.1% on them. Above Mach 1 there is no room
  for more either: NASA TN D-7369 measured cylinders as tall as they are wide on a plate at Mach 2.3 to 4.6
  (laminar boundary layer) at a drag coefficient of 0.45 to 0.5 when as tall as the boundary layer and 0.77 at
  nearly twice that, where the app's button has about 0.9 and 1.1.
- RASAero II's blunt fin edges cost three to five times the app's (square in place of rounded edges adds 0.21 to
  0.31 on Raven against the app's 0.045 to 0.07). On the six rounded-fin flights below Mach 0.95 the app is +1.2%
  and RASAero II −5.8%: its fit to Raven, Rabia and Torrent comes with too much drag on the slower flights. With
  the guides taken off in both programs they agree within 10% below Mach 0.9, and from Mach 1 to 1.2 the app has
  0.66 to 0.84 of RASAero II's drag on those three rockets: that band, on blunt flat fins, is where the app is
  short, and no measurement of it has been found.
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
| RM A53D02 | 6.6% | 7.0% | all turbulent flow, as the app assumes (16.6% low with its default transition) |
| RM L55G28a | 1.2% | 9.4% to 15.1%, low | Rough Camouflage Paint to Camouflage Paint, which bracket the app's 20 µm (20.1% with zero roughness) |
| Arcas short model, Mach 0.6–1.2 | 7.8% | 19.1% | zero roughness; low by 21–41% from Mach 0.9 to 1.1 |
| TR R-100 configuration 11 | 20.3% (14.6% before build 342, 6.2% before build 341) | 6.5% | zero roughness |
| TR R-100 configuration 36 | 16.8% (17.9% before build 342, 12.5% before build 341) | 11.7% | zero roughness, tangent ogive nose |
| Aerobee coasting | 5.3% | 4.2% to 7.4% | Rough Camouflage Paint to Camouflage Paint |
| Aerobee thrusting | 7.2% | 6.3% to 6.4% | the same, with the nozzle exit entered |
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
   nozzle's area is taken off now. The Aerobee data check that from Mach 2 to 5 (within 0.002). Below Mach 2 the
   one check is the full-scale RM-10 in flight (NACA RM L55H02: a boattailed base three quarters filled by the
   nozzle), where the jet took away all the base drag and more, 0.03 to 0.05 from Mach 1.2 to 2.8, and the app
   takes away 0.014 less. It goes the other way on a square-ended body with a small nozzle: in a tunnel from
   Mach 0.6 to 1.4 (NACA RM L58A27: a cylinder with one sonic nozzle 0.625 of the base across, or two Mach 2.5
   nozzles) the jet lowered the pressure on the rest of the base, to a pressure coefficient of −0.4 to −0.5 near
   Mach 1.1, where the app leaves that pressure as it is with the motor off. So the app has too much base drag
   under thrust behind a boattail with a large nozzle and too little on a blunt base with a small one; which way
   and how much depends on the nozzle's size, the jet's pressure and the afterbody (also NACA RM E54D02 on
   parabolic afterbodies and RM E54L14 on a multi-jet base at Mach 1.9, both read in summary only). No method was taken from these.
3. **Transonic center of pressure.** The measured CP moves forward near Mach 0.85–0.9 on short rockets; the model
   doesn't. NASA TM X-653 has more data to check it against.
4. **Lift below Mach 1.** The normal-force slope is 8–20% low on the Arcas and the Aerobee 150A below Mach 1, and
   the Arcas body alone 15–52% low. Report 1307's carryover of the fins' lift onto the body would close it but
   overshoots (4–29% high) and moves the Arcas CP 5–9% of length aft, the unsafe direction, so it is used only
   above Mach 0.9. No sourced correction for the subsonic range has been found.
5. **Body lift above Mach 1.** The nose-cylinder charts stop at the first change of diameter, so a boattail keeps
   its slender-body value at every speed: MIL-HDBK-762's supersonic boattail chart (figure 5-18) is cut off in the
   public copy. The charts are for ogives and cones; other nose shapes use the ogive chart. With both supersonic
   terms the lift is 15–28% high around Mach 1.5–2 on the Arcas, the Aerobee and TM-2005-213541, and the Arcas CP
   is 4–5% of length forward above Mach 3 (the app understates stability there). Nothing measured checks the cone
   chart: no rocket with a measured CP or slope here has a conical nose. At large angles Jorgensen (NASA TR R-474)
   carries a body's normal force further than K = 1.1 does.
6. **Single-wedge fins.** A fin with a sharp leading edge and a blunt trailing edge can be entered (the Trailing
   edge field), and RM L55G28a's fins check it. The Aerobee 150A's fins are "a modified single wedge" (NTRS
   19660005621), a section that thickens all the way to the trailing edge, which the app has no shape for, and
   their thickness at the trailing edge isn't published: entered as beveled with a full-thickness square back the
   app is 19% high thrusting and 11% coasting, against 6% and 5% entered as beveled at both ends, as they are.
7. **CP with small fins on a long body.** On NASA TM-2005-213541's configuration 3 the CP is 4–9% of length
   forward at every speed, 6–8% below Mach 1 where items 4 and 5 don't reach.
8. **Rounded and hand-finished fin edges.** The rockets with rounded fins need about 9% more drag than the
   model gives them on average, with wide scatter (see "Where the remaining apogee error sits"). The EZI-65 (0.25 in
   rounded fins, 3.6% of the chord) is 9% high.
9. **Very short bevels.** With bevels of about 1% of the chord, as on the Kinsel A-601, linear theory would give
   more drag than a square edge, so each bevel is capped there. How a nearly square bevel really behaves between
   the two is open (the Kinsel A-601 is 4% high).
10. **Fins from Mach 1 to 2.** From build 342 a sharp-edged fin's wave drag is linear theory for its own outline
    and section (the area rule), which six wings measured in flight follow (NACA TN 3697). What is still off: the
    two tapered wings of aspect ratio 4 there have 0.003 to 0.007 more drag (on the wing area) than the theory
    from Mach 1.2 to 1.5, as their report also finds; TR R-100 figure 5's 45° fins stay level from Mach 1.05 to 3
    where the theory peaks at Mach 1.4 and falls away (0.014 under at Mach 1.1, 0.017 over at Mach 1.5, 0.02 under
    past Mach 2.5, on the body's cross-section; the report says it did not try for accuracy); the Arcas fins (on
    a 15° boattail, with grit strips) add 0.06 more at Mach 1.5 and 0.03 more at Mach 1.8 than the app gives.
    **The RM-10's fins (60°, constant chord, circular-arc sections 5% thick along the flow) do not show the
    theory's peak.** Linear theory puts a broad rise in their wave drag from Mach 1.8 to 2.6, centred on Mach 2
    where the Mach line lies along both edges (0.058, 0.083, 0.063 at Mach 1.8, 2 and 2.6, on the body's
    cross-section). The full-scale vehicle's total drag in flight (RM L55H02) falls smoothly through there, and
    the app goes from 5–7% too little at Mach 1.2–1.6 to 13–15% too much at Mach 2–2.2; the report's own
    breakdown leaves the fins about 0.03 to 0.045 of wave drag at every Mach number from 1.2 to 3, and the
    half-scale model in a tunnel (RM E50D28) has 0.014 to 0.036 less than the app from Mach 1.5 to 2. Averaging
    the theory over the band of Mach numbers where the flow normal to the edge is transonic (tried, not kept)
    takes only 0.008 off the peak: it is the level past the peak that is high, not a narrow spike. TR R-100
    figure 5's thinner 45° fins say the opposite past their peak (measured above the theory at Mach 2.5 and 3),
    and TN 3697's wings, measured up to Mach 1.7, do show the peak the theory gives where the Mach line reaches
    their thickest line. So nothing was changed; a fin whose leading edge the Mach line has just passed is where
    the fin drag is least certain.
    Whole rockets: the app is 1–14% low on RM A53D02 (72° fins) and 3% low on RM L56G24, and 2–9% high on the
    Aerobee and 0–9% high on Proto's flight. A plate fin with a pointed tip and bevels of constant length is
    thick for its chord near the tip, and the theory gives it more drag there than the mean-chord rule did
    (TR R-100's configuration 11, the L500 flight): right for the shape as entered, but it leans on how the
    bevels were really cut.
11. **More test cases.** Each new measured rocket goes in `validation/cases.js`, kept apart from the cases the
    model was tuned on. The Aerobee 150A, RM L55G28a, RM L56G24, TM-2005-213541, the TR R-100 and Arcas drag cases
    and the 23 flights are the check cases so far.
12. **Transonic drag: two models pull opposite ways.** On TM-2005-213541's configuration 3 (stubby 7%-thick fins on
    a straight body) the app's drag without base is 20% high at Mach 0.9 and 30% at Mach 1.19; before build 307, with
    the fins' transonic drag sized from the Arcas model, it was twice the measured value at Mach 0.9. On the Arcas
    short model (fins on a 15° boattail) the app was then 14–27% low from Mach 0.9 to 1.05, where it had been 4–9%
    low; ten of the sixteen transonic check points are that one model, and the band's figure rose from 8.6% to
    12.6%. Build 341's boattail correction (a misprinted coefficient: see Boattails above) accounts for most of
    that: the Arcas is now within 3% from Mach 1 to 1.1 and 15–20% low only at Mach 0.9 and 0.95, where its drag
    rise starts earlier than the app's, and the band is at 10.4%.
13. **Above Mach 5** nothing checks the whole drag. One model does check parts of it at Mach 6.9 (the RM-10, NACA
    RM L54I03): the body's pressure drag is within 0.001 (0.022 measured), and with the fins on the CP is within
    0.3% of the length and the normal-force slope within 3%. Its total drag there is a laminar boundary layer's,
    which the app does not assume, so it is not compared. Above Mach 1 protuberances have one check (NASA TM X-1771: box-like
    antennas and long fairings, Mach 2.3 to 4.63); nothing checks them from Mach 1 to 2.3, a fully streamlined one, or
    a round stub in a turbulent boundary layer.
14. **A long body's drag above Mach 3.** On the Tomahawk model without fins (NASA TM X-1684: fineness ratio 27,
    transition fixed) the app's drag without the base is 0.02 high at Mach 2.3 and 0.035 high at Mach 3 to 4.6 (7%
    and 15–18%). Nearly all of that drag is friction. The same report's fins come out within 0.02 at every Mach
    number, and the Arcas body alone (TN D-4014, fineness 16) is within 4% from Mach 2.3 to 4, so this is one model
    so far and nothing was changed. The tunnel's grit strips are not the reason: by NACA TN 4363's method they
    tripped the boundary layer with room to spare up to Mach 3 and adequately near Mach 4 on both models; only
    Mach 4.63 is borderline.
15. **Whole flight models from Mach 1 to 2: too much drag, and not from the boattail.** Build 341 corrected the
    boattail's pressure drag (a coefficient misprinted in TR R-100: see Boattails above). With it the app has too
    much drag on whole flight models in this range: TR R-100's configuration 11 (8° boattail, delta fins: 5% too
    much at Mach 1.1 rising to 20% from Mach 1.6; it was 9% too little to 9% too much), configuration 36 (4°:
    13–20% too much above Mach 1, 7–14% before), and, worked through but not yet entered as cases, the six models
    of NACA RM L53I01 (5–15% too much) and the model of NACA RM L55F09a (8–19% too much). The excess is not the
    boattail's: RM L53I01's two models with a square base and no boattail have the same 7–15% too much, and what
    its boattails change (a boattailed model's drag less the square-based model's) comes out within 0.001 to 0.027
    with the corrected coefficient against 0.034 to 0.067 as printed. The old, too-small boattail drag had been
    cancelling it. What has been found of it:
    - *Base drag behind a boattail of 7° to 9°:* up to 0.02 too much above Mach 1.1, and near 0.035 too much from
      Mach 0.9 to 1 on RM L55F09a's model, whose measured base pressure is above free-stream there (24 points:
      RM L53C02, RM L55F09a, RM L56K22, with RM L51F29 in support). Measured base pressure rises with the
      boattail's angle; the rule used (the plain body's base pressure times base over body diameter: TR R-100,
      also Hoerner's and Missile DATCOM's) has no angle in it. Love's method in RM L53C02 has, but needs the Mach
      number and pressure on the boattail just ahead of the base, and covers supersonic speeds only. Not done.
    - *Friction on small polished fins (found).* The app takes every boundary layer as turbulent from its leading
      edge unless the design is set to natural transition. TR R-100's small models carry three fins of 1.8 in chord
      at a chord Reynolds number near a million, and its data sheets put their measured drag on its "turbulent
      body, laminar fins" line. Eight of its bodies that close to a point (no base: configurations 9, 17, 26, 35,
      39, 48, 51 and 53), where the drag below Mach 1 is nearly all friction, have 3% to 42% too much drag with
      turbulent fins (26% on average over seven; configuration 48 closes at 29° and is left out), 14% too little to
      21% too much with natural transition (6% too much on average) and 21% too little to 12% too much with fully
      laminar fins. The body's friction shows no steady offset. RM L53I01's six models go from 8% too much drag to
      2% with natural transition on the fins, and are entered as check cases that way. This is a property of
      polished models, not of the default: the measured flights below Mach 0.8 (painted rockets) average 3.7% with
      a little too little drag as it is.
    - *The large models are not explained by it.* Configurations 11 and 36 have fins of 7 and 9 in chord, at 5 to
      9 million: natural transition takes 1 to 3 points off their 13% to 19% too much drag from Mach 1.3 to 2.
    - *Noses 3 diameters long (checked, not the cause).* NACA Report 1386's seven noses alone, Mach 1.24 to 3.67:
      the app is 0.007 high on average and within 0.012 except at Mach 1.24 on the ogive (0.019) and the paraboloid
      (0.025). Its second-order theory for noses 2 to 7 diameters long agrees with the app within 10% at Mach 2.5
      and 3.
    - *Slender noses below Mach 2:* for RM L53I01's parabolic nose 7.13 diameters long the app has 0.030 at Mach
      1.2 and the report's method-of-characteristics value is 0.015. The app scales every nose shape's drag with
      slenderness by one curve (TR R-100 figure 11); Report 1386 does not reach this corner (Mach number over
      fineness ratio below 0.4). One model.
    - *Fin pressure drag (changed in build 342, and not the cause).* The app held a swept fin's wave drag flat
      at its sonic-leading-edge value; it is now linear theory for the fin's own shape (gap 10). On configuration
      36's 45° fins that takes 0.02 off near Mach 1.1 and adds 0.012 at Mach 1.5 to 1.7 (16.8% too much drag over
      the run, from 17.9%). On configuration 11 it adds: its fins are plates with a nearly pointed tip and a
      trailing-edge bevel 0.375 in long, unswept and steep (9.7° a side), which thin-airfoil theory alone gives
      0.028 at Mach 2; the old rule had cut that down with the leading edge's sweep. The fins' pressure drag there
      goes from 0.031 to 0.043 at Mach 2 and from 0.031 to 0.07 at Mach 1.1 (the report's own estimate, scaled
      from a 6% delta wing: 0.036 falling to 0.020), and the model from 14.6% to 20.3% too much drag.
    - *Configuration 11 at Mach 2,* piece by piece: the app has 0.330 against 0.265. Friction 0.103 (the report's
      curve: 0.097), fin pressure 0.043 (the report's estimate 0.020), nose 0.083, boattail 0.052, base 0.046. So
      about 0.03 is in the nose, boattail and base together (0.181 against about 0.148), in the range where
      nothing measures a boattail or the base behind it alone, and 0.02 rests on the fins' bevels as sketched.
    The Arcas model without fins at Mach 1.5 and 1.8 (32% and 23% too much drag; 11% and 5% before) is a separate
    matter: its boattail ends in a reflexed lip the app has no part for, and its report (TN D-4014) says the base
    force is unusually low at exactly those two Mach numbers, "particularly for the fin-off condition", because of
    the lip. None of the 23 measured flights has an attached boattail above Mach 0.88, so the apogee figures did
    not move; one flight shared by a flyer has (16° to 0.72 of the diameter, Mach 1.5), and went from 0.3% above
    its measured apogee to 4.3% below.
16. **Boattails: what is still off.** (a) Short boattails of 3° to 10° that leave most of the base (0.65 to 0.94
    of the diameter): 0.01 to 0.02 too little pressure drag at Mach 1.2 to 1.3 (NASA TM X-1960, 10 boattails; the
    15° ones are within 0.01). The equation's factor for the base's size, 1 − (base radius / maximum radius)⁴,
    falls off faster than these show as the base nears full size. (b) Below Mach 0.9 the app gives a boattail no
    pressure drag. RM L56K22's cones have 0.02 to 0.04, with about that much less base drag than the app gives,
    so the two together agree within 0.03 up to 8°; TM X-1960's 15° boattails have 0.06 at Mach 0.5 rising to
    0.15 at Mach 0.9, which the app does not have. (c) Nothing measures a boattail alone between Mach 1.4 and
    2.5, where the app goes from the equation to the Mach 2.5 wind-tunnel fit; NACA TN 2972's theory covers it
    (the equation is within 0.02 of it at Mach 1.5). David Taylor Model Basin Aero Report 857 (Patterson, 1954:
    conical afterbodies, Mach 0.40 to 2.47) would.
17. **Lift of swept fins on a tapering afterbody: still too much, and the CP too far aft.** Until build 341 every
    fin had thin-airfoil theory's lift slope above Mach 1, 4/β with a rectangular wing's tip loss. That is right
    for an unswept fin and for any fin well past its Mach line, and too much for a swept fin whose leading edge is
    still behind it. On the RM-10 (60° fins of constant chord, the Mach line ahead of the leading edge until Mach
    2) the normal-force slope with fins was 42–61% high from Mach 1.49 to 1.98 and the CP 5.4–6.6% of the length
    too far aft (NACA RM E50D28's tunnel data as RM L54I03 collects them). From build 342 the fin's own lift comes
    from linear theory's charts for its taper and sweep (Lift above): 27–40% high and 4.5–5.3% too far aft; at
    Mach 6.9, 6% and 1.1%. The other rockets' checks moved by under a point.
    What is left is not the fin's own lift (the chart's 1.93 per radian on the fin area at Mach 1.5 against about
    1.8 implied by the measurement) but what the app adds for the body beside the fins: 1.48 times the fin alone
    (NACA Report 1307's K_W(B) + K_B(W) for a body of constant diameter), where the measurement implies about
    1.13. These fins sit on an afterbody that tapers from 0.81 to 0.61 of the diameter along their root, with a
    boundary layer the reports put at an inch or more on the 12 in vehicle; Report 1307 has no case for either.
    One model, so nothing was fitted to it. It is the unsafe direction: this rocket's stability margin is
    overstated by about half a body diameter from Mach 1.5 to 2. The chart values were read by eye, to about ±0.1
    in 4.
18. **What was tried in build 342 and left alone, and why.**
    - *Base drag behind a boattail by Love's method* (the boattail's end pressure and local Mach number, then the
      cylinder's base-pressure ratio there: NACA TN 3819). Worked through on 29 measured points with the app's own
      shock-expansion pressures: 0.114 in Cd off on average, against 0.010 for the rule in use. The method needs
      the pressure at the end of the boattail, which nothing here gives reliably below about Mach 2. The rule in
      use is up to 0.02 too much behind 7–9° boattails near Mach 1.2 and otherwise close.
    - *What fins do to the base* (gap 1). On the RM-10's own base the app has 0.006 where the tunnel measured
      0.004–0.007. The 0.02 once quoted here came from a check case with a plain cylinder for a body.
    - *A boattail's pressure drag below Mach 0.9.* On 3–8° cones the app has none but too much base drag, and the
      two together are within 0.025 of RM L56K22. On 16° cones the two together are 0.024 too little at Mach 0.8
      and 0.059 at Mach 0.9. NASA TM X-1960 gives the pressure part for boattails 0.6 diameters long (15°: 0.068
      at Mach 0.5, 0.112 at 0.8, 0.153 at 0.9; 10°: 0.048, 0.062, 0.10; 5°: 0.023, 0.027, 0.035) but not the base
      behind them, so a rule for steep boattails would rest on a guessed base. A tail cone steeper than about 10°
      has too little drag below Mach 1 in the app.
    - *Friction in flight.* With the skin taken as cold the full-scale RM-10 goes from 5–7% too little drag to
      within 4% at Mach 1.2–1.6, and from 13–15% to 21–24% too much at Mach 2–2.2: friction is not what is off at
      Mach 2. The Tomahawk body says too much friction above Mach 3 (gap 14), the RM-10 report's own friction
      says too little. No change.

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

