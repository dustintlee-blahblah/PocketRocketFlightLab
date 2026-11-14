# Changelog

What changed in each build of Pocket Rocket Flight Lab, newest first. Each build is a
[release on GitHub](https://github.com/dustintlee-blahblah/PocketRocketFlightLab/releases) with its Android app and web
version.

## Build 301 (2026-11-13)

**Opening files**
- **A motor name that fits several motors is said out loud**: when a file's motor could be more than one in the list (a name two makers share, or a file that names no maker), the report on opening names the one chosen and the others, for example "The file's "K475" also fits Ellis Mountain K475: the AMW K475 was chosen." Of several with the name, one in the file's diameter is chosen first.
- **A flight on a stand-in motor says so in the results**: when the file's motor isn't in your list and another is flown in its place, the Results checks and the PDF report carry a warning naming the motor the design calls for. Before, this was said once, when the file was opened.

**Rocket builder**
- **Auto-fit centering rings, bulkheads and couplers stay auto-fit** after a save and reopen (they came back as fixed sizes), and a parachute's line length left to follow the canopy stays that way.

**Flight Log**
- **The large-calibration warning stays open until you press OK**, and appears from a 30% drag correction (was 35%).

**Under the hood**
- **Regression test covers the newer features**: 13 more cases flown from designs made in the builder (two and three stages, a cluster, fly-away guide, rod and rail lugs, a protuberance on one side, canted fins, the current drag model, motors missing or ambiguous in a file), plus the motor list itself and where every earlier motor id leads. The 40 example cases' numbers are unchanged.
- **Save-and-reopen test**: every field of every builder part is changed, saved with the app's own save, reopened and compared (490 checks). It found the two builder fixes above.
- **The smoke test fails on an empty screen** (motor makers, the add-a-part list, result tiles, charts), which is how the missing manufacturer filter would have been caught.
- Code comments swept and ARCHITECTURE.md extended with the names, conventions and landmarks used in the code.

## Build 300 (2026-11-13)

**Motors**
- **Every motor in OpenRocket's motor database**: the built-in list is rebuilt from the database OpenRocket downloads and flies (version 20260920070751), replacing the old AeroTech, Cesaroni, Loki and Estes list. 1,127 motors from 27 makers (AeroTech 319, Cesaroni 310, AMW 87, Contrail 67, Loki 63, Gorilla 52, Hypertek 47, Kosdon 30, Estes 25, Ellis Mountain 24, Quest 19, Sky Ripper 17, Apogee 12 and 14 more), up from 1,029 from 4. The RASAero list's repeats of ThrustCurve.org motors under other names are left out, so each motor is listed once. Every motor of the old list is in the new one, so saved designs keep their motor; 108 use a different curve now (the one closest to the certified figures in today's data), 15 of them AeroTech motors that changed total impulse by more than 2% (the most the F62T, −11.5%, and F50T, +11%).
- **The manufacturer filter is back** on the Motor tab, makers with the most motors first. (Since the move to modules it read the brand list before the motors were loaded, so it showed only All.) The motor system filter adds "Reload" for other makers' reloads.
- **OpenRocket's maker codes** in older .ork and RASP files: "E" Estes, "A" AeroTech (it meant Apogee here before; Apogee is "AP"), "Q" Quest, "H" Hypertek, "K" Kosdon, and the rest. A file naming its motor by maker code now finds that maker's motor.

## Build 299 (2026-11-12)

**Rocket builder**
- **Fly-away rail guide is its own part**: it moved from the Protuberance shapes to the add-a-part list, next to Launch lug and Rail buttons. Adding one puts it just above the fins (on the body tube that has them). Its behaviour is unchanged, and designs that already have one open as before.
- **Launch rods 1/4, 5/16, 3/8 and 1/2 in**: new lug types (1/4 Rod … 1/2 Rod) beside 1/8 and 3/16, each with the usual lug size for that rod. A lug from a file that doesn't say its type is taken as made for the largest rod it slides over.

**Range and RSO Checklist**
- **Rail or rod type** offers the same rods (1/8 to 1/2 in), and each rod lug passes only on its own rod.

## Build 298 (2026-11-12)

**Rocket builder**
- **Lug types shortened and the rod split by size**: 1/8 Rod, 3/16 Rod, 1010 Rail and 1515 Rail. A rod lug flies only from its own rod (and its inside diameter must clear it); choosing a rod type gives the lug the usual size for that rod when it is too small for it (or, for 1/8, loose on it). A rail lug's height above the body and width can now be set; they start as the rail's button's.
- **Files that don't say a lug's type** (OpenRocket and RockSim designs, designs saved before lug types, and a rail lug re-saved in OpenRocket, which drops the app's tag): the type is read from the lug's size for the pad checks — a solid lug as a 1010 or 1515 rail guide by its height, any other as a 3/16 Rod lug if it clears that rod, otherwise 1/8 — and the lug keeps the file's shape and drag. Designs open, fly and save exactly as before.

## Build 297 (2026-11-12)

**Rocket builder**
- **Three types of launch lug**: Launch Lug - Rod Type (a tube over a rod, as before and the default), Launch Lug - 1010 Rail and Launch Lug - 1515 Rail (a solid slider that rides in the rail's slot, as tall and wide as that rail's button). A rail lug's drag is a long box's (Hoerner) on its width × height. Saved in the .ork file (OpenRocket sees a solid lug of the same height).

**Launch and RSO Checklist**
- **Each lug flies only from its own rod or rail**: a rod-type lug from a rod its inside diameter clears, a 1010 rail lug from a 1010 rail, a 1515 rail lug from a 1515 rail. Rail buttons are checked against the rail the same way. Launch warns, and the RSO Checklist's rail fit item says what doesn't match.

## Build 296 (2026-11-12)

**Results**
- **Every speed shows its mph (or km/h)** in small grey type under the ft/s or m/s value, in the main results, the staging panel and the Monte Carlo results.
- **New figures: Time to burnout and Coast time to apogee** (Ascent section). **Max roll rate** now always shows (0 rpm for a rocket that doesn't roll); it used to appear only when the rocket rolled.

**PDF report**
- **Every results figure, in the same sections as the Results tab.** Each tile grows to fit its text (long entries such as Stability at liftoff used to run out of their box and lose words), with units and notes in smaller grey type and mph or km/h under each speed. A staged flight's booster and sustainer figures are included too. The Checks list moves to a new page cleanly when it doesn't fit.

## Build 295 (2026-11-12)

**Flight animation**
- **The rocket rolls.** The animation follows the simulated roll (from canted fins or a crooked fin): each fin is drawn at its own angle around the body, widening, narrowing and passing in front of and behind it, and the rail buttons, lugs and protuberances travel around with it. A rocket that doesn't roll looks steady; a three-fin rocket is now drawn as a true three-fin view (one fin toward you, two to the sides). The roll is held after apogee.

## Build 294 (2026-11-12)

**Rocket builder**
- **A fly-away rail guide is now a cage around the body.** It was drawn, and its drag worked out, as a single block on one side. It now wraps the body in the side view and the animation, and choosing the shape puts it just above the fins. It has a thickness around the body in place of a width and an angle, and its drag on the rail is that of the ring between the body and its outside (it was width × height).
- **A streamlined protuberance is drawn as a smooth bump** with a rounded front and a long taper, and an upright cylinder as a round-topped post, in place of plain blocks. The animation draws the streamlined one the same way.

## Build 293 (2026-11-12)

**Rocket builder**
- **Rail buttons, launch lugs and protuberances are drawn solid in the side view.** They were drawn in the same faint grey as the parts inside the body and were hard to see.

**Flight animation**
- **The rocket now shows its rail buttons, launch lugs and protuberances**, each drawn at least a couple of pixels big so it can be seen. A fly-away rail guide is shown on the pad and is gone once the rocket leaves the rail.

## Build 292 (2026-11-12)

**Flight simulation**
- **A protuberance on one side of the body now turns the rocket.** It used to add only weight and straight-back drag, so even a large item on one side flew straight. Now its weight moves the CG off the centerline (so the motor's push and the rocket's drag pass beside it) and its own drag pulls back out at its distance from the centerline. The fins work against both: a small camera gives a slight arc and a landing off to one side, a very large item tumbles the rocket. A spinning rocket averages the push out. Designs without protuberances fly as before; fly-away rail guides are not affected.

**Rocket builder**
- **Protuberance: Angle around the body.** Where around the body the item sits. Two alike on opposite sides (0° and 180°) balance each other; two on the same side add up. Saved in the .ork file.

## Build 291 (2026-11-12)

**Rocket builder**
- **Fly-away rail guide**: a new shape in the Protuberance part's Shape list, for a clamp-on guide that carries the rocket up a rail and falls away as the rocket leaves it. Its weight and its drag (a blunt box's, 1.20 on width × height) count only while the rocket is on the rail; the flight after that carries neither. In the saved file it is written with no weight, so OpenRocket doesn't fly it as part of the rocket.
- **Choosing a nose or transition shape sets that shape's usual parameter** (1 for an ogive or parabola, 0.5 for a power series, 0 for a Haack), instead of carrying over the last shape's.
- **Limits on four fields that could stall a run or give nonsense**: shape parameter 0 to 1, fin cant 15° either way, parachute and streamer drag coefficient up to 10, and a nose cone can't have zero length.

**Launch**
- **Launch warns when the rail guides are missing or don't suit the pad**: no launch lug or rail buttons in the design, buttons on a rod or a lug on a rail, a lug too small for the rod, or buttons of the wrong size for the rail (1010 or 1515). You can open the builder, change the rail type, or launch anyway; it asks once for each problem. A launch tower needs no guides, and neither does a rocket with a fly-away rail guide. The RSO Checklist's rail fit item knows the fly-away guide too.

## Build 290 (2026-11-11)

**Rocket builder**
- **Protuberance: a new shape, "Long box, sloped front"**: a long box whose front face ramps up to its full height and whose back end is square, such as a camera housing with a ramped front. Its drag is about half the long blunt box's below Mach 1 (0.39 on its frontal area), worked out from Hoerner's long box and his measurements of square and beveled steps on a wall; above Mach 1 it stays a share of the long blunt box. Drawn with its ramp in the side view.
- **Rail buttons now have a weight.** They had none: the Weight field showed 0 and they added nothing to the rocket. They now weigh what their shape and material give (about 1.2 g for a pair of 1010 buttons, as OpenRocket works it out), so a design with rail buttons comes out that much heavier.
- **Override can be switched on for a part whose calculated value is 0.** The switch used to turn itself straight back off, leaving the box locked; now the box opens empty for your value.

**Flight animation**
- **The countdown no longer ends with "Liftoff!"**: it runs 3, 2, 1 and the rocket goes.

**Reference library**
- **Every report in the library was checked for public release**: NACA and NASA reports against NASA's report server (distribution Public, no export control), Air Force and Army reports by the release statement on the document. Two whose release could not be confirmed (the Aerobee 150A performance summary and the 1970 Space Handbook) were taken out and are cited only, leaving 20.

## Build 289 (2026-11-11)

**Reference library** (no change to the app)
- **The public reports behind the app's physics are now in their own repository**, [PocketRocketFlightLab-references](https://github.com/dustintlee-blahblah/PocketRocketFlightLab-references): 23 NACA, NASA, Air Force and Army reports cleared for public release, from the Missile DATCOM final report and manuals and MIL-HDBK-762 to the wind-tunnel and free-flight reports the drag model is checked against. REFERENCES.md links each one; copyrighted sources are cited there but not stored.

## Build 288 (2026-11-11)

**A new drag model**
- **Drag is now worked out by a new model**, built term by term from public NACA, NASA, Missile DATCOM and US Army handbook sources and checked against more measurements than the one before. What differs: skin friction follows the skin's temperature as the airflow heats it during a flight (Van Driest II); the base drag of a plain body comes from NASA's free-flight measurements (lower below Mach 1 than before); nose wave drag above Mach 2 is by second-order shock-expansion; boattails get a wave drag of their own and a base drag that shrinks with the base; and sharp-edged fins' wave drag is from thin-airfoil theory with a transonic peak that depends on the fin's aspect ratio.
- **How the two compare with measurements** (mean error): drag of wind-tunnel and free-flight models 10% against 22% below Mach 0.8, 9% against 18% from Mach 0.8 to 1.2, and 7% against 12% from Mach 1.2 to 3; apogee on 23 measured flights 6.0% against 8.3%, and 7.3% against 12.2% on the nine above Mach 1.2. Below Mach 0.8 the flights come out about the same (4.3% against 4.7%), with the new model reading about 2% higher. AERODYNAMICS.md has every case, including the ones where the new model is still behind.
- **Settings → Drag model** switches between Current and Previous, so you can fly the same rocket on both. With Previous chosen, the Wind Tunnel draws the two together.
- **A drag calibration belongs to the model it was fitted with.** One made before this build isn't applied to the new model; the flight log says so and offers Refit.

**Results**
- **What a barometric altimeter would read**: under the predicted apogee, when it differs by 2% or more. A barometric altimeter assumes standard air, so on a warm day it reads low (about 1% for every 3 °C above standard), and the app's apogee is the true height.
- **RSO Checklist**: a flag for flights above Mach 5, past the measurements the drag model is checked against.

**Rocket builder**
- **Protuberance**: a new part for cameras, switch boxes, shrouds and other bumps on the body, as a blunt box, long blunt box, upright cylinder or streamlined shape, with drag from Hoerner's measurements of bodies in a boundary layer. Saved in the design file.
- **Surface finish names** now say what each roughness is: the 5 µm choice is paint sanded smooth, 20 µm is spray paint left as it dried, 60 µm a rough or brushed coat (from Missile DATCOM's roughness table, which puts paint well below the names the list had).
- **Square fin edges** below the transonic drag rise: the blunt leading edge's drag is 0.4 of stagnation pressure instead of 0.8 (Hoerner), in the new model.

## Build 287 (2026-11-09)

**Checks against measured data** (no change to the app's results)
- **Two more rockets the model is checked against, never tuned on**: NACA RM L56G24, a free-flight missile model with small delta fins on a boattail (drag and center of pressure, Mach 1.7–2.8), and NASA TM-2005-213541, a slender missile in NASA's wind tunnels (drag, center of pressure and lift, Mach 0.6–3.95, from the report's own data). VALIDATION.md has the results: with small fins far behind a long body, the app's center of pressure comes out forward and its lift low, and on the second rocket its drag rises too early near Mach 1. Both are listed as open problems in AERODYNAMICS.md.
- **REFERENCES.md** lists the reports behind the app's physics and what each one is used for.

## Build 286 (2026-11-09)

**Wind Tunnel**
- **Lee-side separation moves forward as the angle of attack grows**: the crossflow on the lee side now breaks away where each slice of the body has moved about one and a half radii sideways (the impulsive-flow analogy, NACA Report 1048), so at 10–12° separation starts partway along the body and by about 20° it starts just behind the nose. Before, it stayed near the tail until very large angles. The picture only; no number changes.

**Rocket tab**
- **Surface finish help** no longer quotes a fixed altitude effect: it says the finish matters most on fast rockets and that how much depends on how rough the paint really is.

## Build 285 (2026-11-09)

**Wind Tunnel**
- **Streamlines** replace the drifting streaks in the test section: worked out for your rocket at the chosen speed and angle of attack, with dashes running along them with the flow. Below Mach 1 they bend round the nose and body; above it they kink at the shocks and turn into the wake behind the base.
- **The boundary layer and separated flow**: laminar (a smooth edge) from the tip, turbulent (a ruffled, moving edge) behind; separated air shown as turning eddies, with a cross where the flow leaves the surface, behind the base, behind steps (and a ring where it reattaches), off tail cones steeper than 8°, along the lee side at larger angles of attack, and off the fins as they stall from 18° to 35°; a dot where the flow divides on the nose. A legend and a line under the picture say how far the flow stays laminar and what is separated. The picture uses the drag model's own transition and separation rules and doesn't change any number.

## Build 284 (2026-11-08)

**Drag model** (results change)
- **Tail cones above Mach 1**: the supersonic base drag no longer gives a steep, separated tail cone the relief of smoothly attached flow, and boattail relief now comes in only from Mach 1.5 to 2, where NASA flight data (the RM-10, NACA TN 3320) support it. Build 282's version removed nearly all base drag near Mach 1.2 behind any tail cone, so rockets with tail cones that fly supersonic predicted too high: a CT Concept 98 with a 16° tail cone went from 18,576 ft to 17,417 ft, against a GPS apogee of about 17,400 ft. Rockets without a tail cone, or that stay subsonic, are unchanged.

## Build 283 (2026-11-08)

**Rocket tab**
- **Bevel length fields show as soon as you choose Beveled**: changing a fin set's Edges to Beveled now brings up Leading-edge and Trailing-edge bevel length right away (before, they appeared only after selecting another part and coming back).

## Build 282 (2026-11-08)

**Rocket tab**
- **Wind Tunnel**: a new block after Imperfections (folded at start) puts your design in a test section from a crawl to Mach 6 at any angle of attack: drag coasting and burning, lift slope, CP and stability, charts against Mach and angle, the shocks drawn around the rocket, and a CSV of the sweep. Every number is the flight's own aerodynamics.
- **Nose cone tip radius** (0 is a sharp point): a rounded tip adds drag above about Mach 0.8, is drawn in the side view, and is saved in the app's data inside the .ork.
- **Bevel lengths for beveled fins**: how far the leading- and trailing-edge bevels run along the chord. Short, steep bevels add wave drag above Mach 1; 0 keeps the usual bevels, a fifth of the chord.

**Opening files**
- **Pods, side boosters and tube fins** from OpenRocket and RockSim files now fly: each pod's body, fins and mass, side boosters dropping away at separation with their motors, and tube fins' lift and drag. Reversed nose cones read as tail cones; each flight configuration flies its own motors.
- Extra fin sets keep a beveled or double-wedge section (they were read as square).

**Drag model** (results change)
- **Supersonic base drag** follows NASA's measured base pressures (NACA TN 3819, Love 1957) for the body, boattails and fins near the base, in place of a single correlation.
- **Square and rounded fin trailing edges** below the speed of sound get the base drag of a two-dimensional edge (Hoerner), which is higher than the rocket's round base; rounded edges keep 0.7 of it. Apogees of rockets with square or rounded fins come out up to about 3% lower; subsonic rockets with sharp-edged fins are unchanged.

**Motor tab**
- Compare motors counts the motors it will actually fly, and says "the first 200" when the list is longer.

**How accurate is it?**
- [AERODYNAMICS.md](AERODYNAMICS.md) maps every drag and stability term to its source; [VALIDATION.md](VALIDATION.md) now compares apogee with 23 measured flights (RASAero II's example files, Mach 0.55–3.6, up to 121,000 ft) and drag with two more NACA and Aerobee rockets. The app predicts high on real flights (11% on average, more above Mach 1.2), which is the next thing to work on.

## Build 281 (2026-11-08)

**Results tab**
- **No more empty boxes in the results tables**: the space a group's last row leaves is now plain, with no border around it (also in the staging and landing dispersion tables).

## Build 280 (2026-11-08)

**Motor tab**
- **Upload a Motor starts folded**, with a Show button like the other blocks; messages from an upload still show.
- **Compare motors is a button at the bottom of Filter Motor List** ("Compare 13 motors"), visible even with the filters folded. The comparison table opens under it once it runs.

## Build 279 (2026-11-08)

**Under the hood** (no change to results or how the app works)
- **The code is reorganized for contributors**: the app's source is now ES modules, each importing what it uses by name, bundled into the same single page; the largest files are split into focused ones (the rocket builder into its fields, editor, side view, undo and design steps; staging, fin flutter, wind, parachutes and nose weight out of the flight simulation).
- **Built and signed on GitHub**: this is the first release built by GitHub Actions from the tagged source, signed with the same key as before, so it installs over the app you have.
- **Checks on every change**: formatting, lint, the regression test, a UI smoke test, the drag benchmarks and an Android build run on every push and pull request.

## Build 278 (2026-11-08)

**Rocket tab**
- **The figures under the rocket drawing take less room**: length, diameter, weights, CG and CP always show; the stability lines (at liftoff and tilted into the airflow) fold away behind **Show details**. When the rocket is under 1 caliber, the link reads "Stability under 1 cal" in red.
- The margin's range is now labelled **uncertainty margin**.

## Build 276 (2026-11-08)

**Stability**
- **Nose weight to add**: when a rocket is short of 1 caliber at liftoff, 10% of its length, or 1 caliber leaving the rail in the day's wind, Results shows the weight to put at mid-nose to reach all three, and how it changes the apogee. The checklist cautions quote it too.
- **Uncertainty margin**: the liftoff margin shows its range from the CP estimate's error against NASA's Arcas wind-tunnel data (±2.3% of body length), e.g. "2.83 cal · uncertainty margin 2.4–3.2". The checklist says when the true margin could be under 1 caliber.
- **Margin as a share of length**: shown beside the calibers, with a caution under 10% (long, thin rockets can show plenty of calibers with little real margin).
- **Stability leaving the rail**: the margin at the angle the wind puts on the rocket as it leaves the rail, with a caution when it's low.
- **Damping ratio** at maximum speed, with the checklist flagging a rocket that will wobble (under 0.05) or turn too slowly into the wind (over 0.3).
- **Body lift at small angles**: the static CP includes the body's lift at a typical 2° tilt, as OpenRocket's does; long rockets read up to about 0.4 cal lower, closer to the wind-tunnel data.

**Landing dispersion**
- **Balance is varied** (new setting, "Balance (CG against CP), share of length", default 2.3%), and the results show the **chance of tumbling** and the **lowest stability of the worst 5%** of flights. The checklist grades the chance of tumbling.

## Build 275 (2026-11-08)

**Accuracy**
- **Motor data closest to the certified figures**: where ThrustCurve.org has several data files for a motor, the app now uses the one that best matches its certified total impulse and burn time. 17 motors changed, including the Estes A8 (burn 0.53 s → 0.73 s), Cesaroni 229H255 (316 → 229 N·s) and AeroTech E15W, I195J, I435T and K270W. Small Estes A8 rockets went from 10–18% low against OpenRocket to within 4%.
- **Nose cone and transition weights** are worked out as OpenRocket does (the wall measured square to the surface), and transition shoulders are now weighed. Small, thick-walled noses were about 9% too heavy.

**Opening and saving files**
- **Every rocket-wide setting is saved**: other drag (ΔCd), the boundary layer setting and turning inertia come back when you reopen the file.
- **Deleted flights stay deleted** when you reopen a file that still carries them.
- **Save no longer rewrites the launch conditions of the file's own simulations** (OpenRocket's runs keep theirs); your full launch settings are kept with the app's settings, and Save this run adds a run with them.
- **A file changed in another program** opens with its own motor configuration and motors, not the ones chosen here before.
- **Motors carried in a file are added to yours only if you say so.**
- **Saved .ork files are compressed**, as OpenRocket writes them (about 5× smaller with a saved run).

## Build 274 (2026-11-08)

**Motor tab**
- "Select from database" is now **Filter Motor List**, and "Motor configuration" is now **Motor Config from File**. Both start collapsed with a Show button; the motor count stays visible under the filter heading.

## Build 273 (2026-11-08)

**Stability**
- **Five or more fins**: fins at the same station on the same body now shield each other, as in OpenRocket (5 fins 0.948, 6 0.913, 7 0.854, 8 0.81, more 0.75). Barrowman's formula covers three and four fins; the CP now matches OpenRocket's to 0.5 mm for 3 to 8 fins.
- **Stability when tilted**: the Rocket tab shows the liftoff margin with the rocket tilted 5° and 10° into the airflow. Body lift moves the CP forward on long, skinny rockets as they tilt.
- **Body lift uses Galejs's factor (1.1)**, as OpenRocket does, so the tilted CP matches OpenRocket's.

## Build 272 (2026-11-07)

**Overrides**
- **Each override has its own Override switch** beside its field: weight, CG, turning inertia and Cd for the whole rocket (and each stage), and a part's weight and Cd. Off, the field shows the calculated value and the flight uses it; on, it uses your value, starting from the calculated one. The "enter 0 to calculate" rule is gone.
- **An override switched off keeps its value**: it's left out of a saved .ork (as OpenRocket stores it) and kept with the app's settings in the file, so it comes back when you reopen it.

**Accuracy**
- **Nozzle size from the motor's thrust**: the altitude thrust correction now sizes each motor's nozzle exit from its average thrust instead of its diameter, which overstated it for slow-burning motors. Against OpenRocket, launches from fields above 1 km went from about 4.5% high to 1.5%.
- **Free-form fins are placed by their root chord**, as OpenRocket and RockSim place them. Fins whose tips sweep past the root's trailing edge were placed too far forward, which moved the CP forward (the Performance Rocketry Gizmo XL read unstable; its CP now matches OpenRocket's).
- **A shroud line length of 0 in a file means no lines** (it was read as lines as long as the chute is wide).

## Build 269 (2026-11-06)

**Opening stored runs**
- **The launch site is selected** when you open a saved run or a file's saved settings: by the site's name (now saved with the file and each run), or by one of your saved sites at the same place.
- **OpenRocket runs bring their own weather**: OpenRocket's multi-level wind (ground wind and winds aloft), the run's air pressure and humidity, or OpenRocket's standard air. A run with OpenRocket's average wind clears the winds aloft, so it flies as it did in OpenRocket.

**Code**
- The flight simulation's main loop is split into named steps (no change in results).

## Build 268 (2026-11-06)

**Accuracy**
- **Off-rail velocity is read at the exact end of the rail**, worked out within the simulation step. Before, it was read at the end of the step where the rocket left the rail, a little past the rail's end (usually under 1% high). Nothing else in the flight changes.

## Build 267 (2026-11-06)

**Flight chart**
- **Touch the chart to read its values**: a vertical line appears where you touch, with each line's value where it crosses (the prediction, a logged flight, the booster) and the time. Drag sideways to move it; touch the line again to clear it.

## Build 266 (2026-11-06)

**Results**
- **New readouts**: average acceleration to burnout, drogue descent velocity and landing velocity (over the ground, as OpenRocket's ground hit velocity, with its vertical part). Max velocity is now called Max ascent velocity.
- **The results table is grouped**: speed and acceleration, ascent, stability, recovery, and descent and landing.
- **Drogue descent velocity** is the fastest the rocket falls once the drogue is fully open, until the main deploys. Only the readout changed; the simulated flight is the same.

**Flight animation**
- **A 3, 2, 1 countdown** over the rocket on the pad before liftoff (on opening, Restart, or Play after the end). The readout stays blank during the countdown.

## Build 261 (2026-11-05)

**RockSim files**
- **Parachutes and streamers deploy as the RockSim file sets them**: at the motor's ejection charge, a time after launch or apogee, at apogee, or at an altitude, from the run you open (or the design's own settings). Before, the largest parachute was guessed to be the main and everything else opened at apogee.
- **RockSim's stage mass and CG overrides** are used only when the file has them switched on, as in RockSim; values left over in the file are ignored.

## Build 260 (2026-11-05)

**Choose a stored run when opening a file**
- **Opening an .ork or .rkt now asks how to open it**: the design only (keeping your launch settings), the design with the settings saved with it, or any of its stored runs, in a scrollable list showing each run's motors, apogee, wind and whether it's out of date. Picking a run brings in its motor configuration and launch conditions, and its apogee for comparison.
- Runs saved from the app keep all their launch settings and the time they were saved, shown in the list.

**Rocket tab**
- **Turning inertia** now shows the value calculated from the parts, and flights use it (before, an even-weight estimate was used). Type a measured value to replace it; clear the field to go back.
- **Design notes** has a text box for your own notes, saved in the .ork with each motor configuration.

## Build 258 (2026-11-05)

**Overwrite or save a copy**
- **Save changes and Save this run now ask** whether to write over the open .ork file or save a copy under a new name (or cancel).
- **If the file can't be written over** (for example, it was opened from another app, or moved), a pop-up says why and offers a copy, instead of quietly making a new "(1)" file. To write over the original, open it with Open .ork / .rkt, then save.
- Writing over a file now also works with storage apps that refused it before.

## Build 257 (2026-11-04)

**Everything saved in the design file**
- **Save changes keeps everything for the rocket in the .ork**: every launch and range setting, the Get weather date, winds aloft, the motor configuration and motors chosen, motor temperature and delays, dispersion and imperfection settings, the flight log and the drag calibration. OpenRocket ignores the extra and opens the file as usual.
- **Uploaded motors the design flies are saved with it**, and added to your uploaded motors when the file is opened on another device.
- **Opening a file saved with different settings** shows a pop-up listing what differs (site, weather, winds aloft, rail, drag calibration and so on), and you choose to use the file's settings or keep your own. Logged flights in the file are added to the flight log.
- **Changing any launch or range setting now counts as an unsaved change**, so you're reminded to save it.
- **Save this run** saves the run with its own launch conditions, and each saved run is named with the date and time, so every run is distinct in OpenRocket's list. Runs add up; none are overwritten.
- Save changes also writes the launch site's longitude.

**Results**
- The "Likely … ft" apogee range under the predicted apogee is gone. The RSO Checklist still checks the top of the likely range against the cloud ceiling, and the PDF report still lists it.

**Weather for any date**
- **Get weather** (renamed from Get forecast) now works for any launch date from 1940 to 16 days ahead, and picks the source from the date on its own: NOAA's GFS forecast from two days ago on, archived GFS forecasts back to March 2021, and the ERA5 reanalysis back to 1940.
- **Winds aloft** are filled in from March 2021 on. For older dates (or anywhere the service has none), a pop-up says so and the Winds aloft table is cleared, so the wind above the ground is estimated from the ground wind. You can still type winds aloft in by hand.
- Older records have no visibility, chance of precipitation or cloud base; those fields are left as they were, and the result says which.
- **The result now appears in a pop-up**: what was filled in, one item to a line, or why the weather couldn't be fetched.

**Parachutes**
- **Parachutes open over a distance, not a fixed time**, as measured in parachute tests: a chute opening fast fills quickly, one opening slowly near apogee takes longer. The rocket no longer seems to fall fast under a chute just after apogee.

## Builds 228–256 (2026-11-02 to 2026-11-04)

**Build 251**
**Motor delay and ejection charges**
- **Motor Delay**, a new section on the Motor tab above Motor temperature: one ejection delay setting per stage, chosen from the delays the motor is sold with, **Plugged**, or a custom time. Opening an OpenRocket or RockSim file sets it from the file. Changing motors keeps the delay if the new motor offers it, and otherwise moves to the nearest one.
- **Plugged is separate from 0 s.** A 0 s delay fires at burnout (booster motors use it to separate stages or light the next motor); plugged means no charge. RockSim's negative ejection delays read as plugged, as RockSim simulates them.
- **A chute set to open at the motor ejection charge stays packed when the motor is plugged**, and the rocket comes down ballistically. As in OpenRocket, a motor charge only opens chutes set to ejection; if a live charge fires while a chute set to open another way is still packed, the results warn you.
- **Ballistic descents are more realistic:** the rocket no longer slides down tail-first. It settles nose-down or tumbles as the physics and drag say it should.
- **Separately mounted motors** (outboard or pod motors) each get their own delay charge, listed under Motor Delay and simulated.
- **Motor configurations:** an OpenRocket file with several motor configurations gets a picker on the Motor tab, and the design reopens with the one you choose.
- **Builder:** a chute deployed at ejection has a "Delay after the charge" field.

**Animation**
- A ballistic rocket turns nose-down after apogee.
- A short flash in the rocket body shows each ejection or motor delay charge firing.
- The standing safety cone label is gone; a warning appears only if the rocket leaves the cone under power.

**Accuracy**
- **Swept fins near and above Mach 1:** fins swept well back no longer get a transonic drag bump that tests don't show. Checked against two NACA reports: RM E50D28, the RM-10 missile's 60° fins, and RM A53D02, a fin-stabilized body flown from Mach 0.6 to 10. Fins swept 30° or less are unchanged. Rockets with fins swept between about 40° and 60° will show a little less drag near Mach 1.

**Open-source code**
- The source is split into files by area with a build step, fully commented, formatted and lint-clean, with a regression test that proves a change leaves every result the same, and drag benchmarks against NACA data. Unused code, including the old hidden quick-entry form, is gone. Apart from the changes above, the app works the same.

**Earlier builds**
- **Above Mach 0.8 (build 237):** fin lift from supersonic theory, so stability above Mach 1 is within about 2% of body length of NASA data on a slender rocket; the drag rise of sharp-edged fins through Mach 1; beveled and double-wedge fin edges; and an RSO checklist item for flights reaching Mach 0.9 or more.
- **A stronger safety and liability disclaimer**, which everyone accepts again on first opening the app after updating from build 231 or earlier. It adds: users under 18 need a parent or guardian's acceptance and adult supervision; the app isn't professional advice or endorsed by any rocketry organization, and the RSO always overrides it; ejection charge sizes are estimates; donations are gifts; Utah law governs; and if one part is found unenforceable, the rest still stands.
- **Ejection Charge Calculator:** charge sizes appear only after you acknowledge the black powder warning once.
- **Example rockets:** five real designs to learn with, from a Big Bertha model rocket to dual-deploy high power (LOC Goblin, LOC IV X2 for an L1 certification flight, LOC IV X2 dual deploy, Punisher 3). Find them on the Get started screen, or under **Open Recent**.
- **Donate with PayPal** as well as Venmo, from **Settings → Support the app**.
- **Flight report:** if this copy of the app has no profile yet, the report panel says so, with a link to Settings → Profile.

## Build 227 (2026-11-02)

- **Support the app:** Pocket Rocket Flight Lab is free, with no ads. If it helps your flying, you can now chip in from **Settings → Support the app**, or on Venmo at [@PocketRocketFlightLab](https://venmo.com/u/PocketRocketFlightLab) (US only).

## Build 226 (2026-11-02)

- The web version can now export the PDF flight report and save designs (.ork) and flight videos when opened directly in a browser.

## Build 225 (2026-11-02)

First public release: a 6-DOF rocket flight simulator for phones that opens OpenRocket and RockSim designs, with a rocket
builder, motor selection, landing dispersion, an RSO checklist and a PDF flight report, and works offline (the weather
forecast is optional).
