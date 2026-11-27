# Changelog

What changed in each build of Pocket Rocket Flight Lab, newest first. Each build is a
[release on GitHub](https://github.com/dustintlee-blahblah/PocketRocketFlightLab/releases) with its Android app and web
version.

## Build 348 (2026-11-27)

**Drag**

- **Import a drag profile.** Under Whole Rocket in the builder, below the drag coefficients, Import drag profile
  brings in the whole rocket's Cd
  against Mach number from RASAero II (Aero Plots, File, Export, To CSV File: its coasting and motor-burning curves),
  from OpenRocket (a simulation's exported data with the Mach number and Drag coefficient columns: the drag over that
  flight's ascent), or from a CFD run or spreadsheet (a table of Mach number and Cd, with an optional column for the
  motor burning and an optional reference diameter). With Fly with this profile ticked, flights use it in place of the
  app's own drag model, and the Results tab and the PDF report say so; the Wind Tunnel's Drag coefficient chart shows
  both curves either way. The profile is saved with the design file (in the app's own element, which OpenRocket passes over).
  Not used for staged rockets. It is the other program's answer at one condition, so it does not follow altitude as the
  app's own model does, and the accuracy range beside the apogee does not describe it.

**Builder**

- **Fin fillet radius is with the fins.** The field moved from Whole Rocket to each fin set's editor. It is still one
  value for every fin set on the rocket.

**Export CAD**

- **The CAD library is a third of its size.** `step-kernel.js` goes from 31 MB to 10 MB (the Android app from about
  11.7 MB to about 9 MB): the library is now stored compressed inside the same file and unpacked on the device the
  first time Export CAD is used. Nothing is downloaded, the library itself is unchanged, and the STEP and STL files
  come out the same. It needs a browser that can unpack it (Chrome or Android WebView 80, Safari 16.4, Firefox 113, or
  later), which opening a design file already needed; an older one is told so.

**Checks**

- New `tests/drag-profile.js` (45 checks, in Check): the three kinds of file and files to refuse; a flat profile flies
  exactly as the same fixed Cd; the reference diameter, the switch, staged rockets; saved and read back; the Whole
  Rocket block, the Wind Tunnel chart and the Results line; the fin fillet radius field's new place.
- `tests/cad-busy.js` (now 9 checks) also covers a browser that can't unpack the library.

## Build 347 (2026-11-26)

**Results**

- **Flight loads.** A new panel under Flight Performance (folded to start, with the peak bending beside its title)
  shows how hard the air bends the rocket: the side forces on the nose, body and fins, the shear force and the bending
  moment along the rocket, where the bending peaks, and the axial compression where the motor pushes on the airframe.
  Choose the moment of the flight (peak dynamic pressure, burnout or top speed) and the angle of attack: a side gust
  of 10, 20 or 30 ft/s (3, 6 or 9 m/s), an angle you set, or the angle it flew at. The motor and any couplers are
  marked on the figure. The Wind Tunnel shows the same figure for the speed and angle on its sliders. These are loads,
  not strength; staged rockets, clustered motors and side boosters aren't covered yet. The method is a free-body
  balance of the app's own normal forces against the parts' weights (`src/js/physics/loads.js`).

**Physics**

- **Sharp-edged fins near Mach 1 no longer get too much wave drag.** On airfoil, double-wedge and beveled fins thicker
  than about 3% of their chord, linear theory's wave drag was held only at its Mach 1.08 value, which put it above the
  sonic plateau that transonic theory (MIL-HDBK-762 figure 5-132) and NACA's measured wings (Report 1253) both give.
  It is now held at that plateau. The 6% diamond and circular-arc wings of NACA RM L50E19a go from 0.150 and 0.298 too
  much drag at Mach 1.05 to 0.055 and 0.172; the transonic fin-drag check cases from 0.073 to 0.054 in Cd on average.
  None of the 23 measured flights or the examples' results changes (their sharp fins are thin or swept). Found by a
  sweep of the drag model in 0.002 Mach steps across 13 rockets and every fin edge type, which also showed no term
  jumps anywhere from Mach 0.3 to 4.

**Checks**

- New `tests/flight-loads.js` (34 checks, in Check): the shear and bending method against closed forms (a free rod
  pushed at its end bends 4·F·L/27 at two thirds of its length), the balance closing on a real design, the side forces
  adding up to the flight's normal force, and the panel's choices and units.
- New check case from NACA RM L51A15 (Schult, 1951): the drag an unswept 4.5% hexagonal wing adds on a large
  rocket-boosted model, Mach 0.9–1.55. The app's drag rises later than measured and peaks about 25% higher, and is
  still 15% too high from Mach 1.3 (partly the case's single fin thickness); written up in AERODYNAMICS.md, gap 19.
- The fins' linear-theory wave drag (the supersonic area rule) checked against exact linear theory worked out
  independently: within 1% on rectangular wings and on RM L51A15's tapered wing.

## Build 346 (2026-11-24)

**Rocket**

- **The Open Recent list closes like a menu.** It stayed open until a file had opened. It now closes as soon as a recent
  file or an example is picked, on a tap anywhere outside it and its button (the tap still does what it does: Open
  design file, Save, another tab), on leaving the Rocket tab, and on Escape or the Android Back button. The × that takes
  a file off the list leaves it open, and a second tap on Open Recent still closes it.
- **Export CAD says it's working.** Choosing STEP (or another CAD format) now shows an "Exporting STEP file…" box with a
  spinner straight away: building the solid shape can take a minute or two, longer on an older phone, and the app may
  not respond until it's done. The box goes away when the file is saved.

**Range**

- **Winds aloft and Landing dispersion settings start folded**, like Imperfections on the Rocket tab: a Show button opens
  each. Folded, each says what it holds beside its title: how many wind levels and how high they go (or "none"), and
  how many dispersion flights. Nothing they hold changes, and Get weather still fills the Winds aloft table while it's
  folded.

**Results**

- The Landing dispersion panel's help sent you to "the L.pad tab" for its settings; it now says the Range tab.

**Checks**

- New `tests/recent-menu.js` (19 checks, in Check): each way the list closes, tapped as on a phone.
- New `tests/cad-busy.js` (7 checks, in Check, which now builds the STEP library for it): the progress box shows at once,
  names the format, and is gone when the STEP file is saved.

## Build 345 (2026-11-23)

**Rocket**

- **The Wind Tunnel draws free-form fins as they are.** It drew every fin as its equivalent trapezoid, so a free-form
  fin (the LOC IV X2's, with its notch at the back of the root) showed with a trailing edge swept the wrong way and
  didn't match the builder. It now draws each fin's own outline. Only the picture changes: drag, CP and stability
  already used the real outline.

**Checks**

- VALIDATION.md's three shared flights brought up to date, rerun from the files as the flyers last sent them: CT
  Concept 98 −0.6% (it listed −4.3%, from an older build and file), Partizon +1.1% (−3.5%), Ascender 866 ft/s top speed.
- `tests/inputs.js` sets the Motor tab's filters back to All before searching for a motor.

## Build 344 (2026-11-23)

**Results**

- **A booster's parachute shows.** A booster (or a three-stage rocket's first stage) given its own parachute already
  flew under it, but nothing showed it: the flight animation now draws the dropped stage hanging under its canopy, in
  2D and 3D, with "Booster chute opens" and "Booster lands" notices; the Staging timeline lists the opening (at the
  booster's own height) and its landing. A booster parachute set to open at its motor's ejection charge, on a plugged
  motor, never opens: the checklist now says so ("Booster chute: never opens") and how to fix it, and the timeline
  marks the landing.
- **Tables and tiles fit a narrow phone.** On a phone narrower than about 380 px, or with large text, the Recovery
  Plan's tables ran past the panel's edge. Their cells now wrap between values (a number keeps its unit), the column
  headings wrap, and a table that still can't fit scrolls sideways inside its panel instead. The same for the Flight vs
  prediction table. The apogee comes down a size on such a phone so the motor beside it fits, the result tiles wrap a
  long value instead of running out of the tile, and the animation's buttons wrap under its title.

**Checks**

- The walkthrough test also flags anything running past the edge of the panel, dialog or banner it sits in (not only
  past the screen), and was run at 320 and 360 px as well as 412 and 1,600.
- `tests/recovery.js`: a booster's parachute opens at its apogee and at an altitude, shows in the timeline and the
  animation's notices, and one waiting on a plugged motor is flagged.
- Golden snapshot re-recorded: the page text has non-breaking spaces in the Recovery Plan and the stages' landings in
  the Staging timeline; no flight result changed.

## Build 343 (2026-11-22)

No change to how the app flies a rocket. This build carries new check cases, findings and documents.

**Checks and documents**

- **Rounded fin edges near Mach 1** (AERODYNAMICS.md, gap 19). New check cases from NACA's standard test body with
  rounded-edge flat fins (TN 3697 with RM L50I08a, `tn3697-body`; within 2–4% to Mach 0.93, 7–13% too little drag at
  Mach 0.95–1.05, 12–21% too much at Mach 1.4–1.8), and from NACA RM L50E19a (Morrow and Katz), the same body with
  6% slab, diamond and circular-arc wings (`l50e19a-body`, `-slab`, `-diamond`, `-circular-arc`). Findings: the
  rounded leading edge's drag steps on too late and too hard; a square trailing edge has about half the measured base
  drag below Mach 1.1; linear theory gives sharp fins thicker than about 3% too much drag just above Mach 1. TN 3697's
  tail-fin geometry corrected from its figure 1.
- **Tried and left alone:** a stronger square-trailing-edge base below Mach 1 (fast rounded-fin flights better, slower
  flights worse; the 23 flights 6.3% to 6.1%), and NACA Report 1253's transonic chart in place of linear theory near
  Mach 1 (fixes the diamond and circular-arc wings at Mach 1.0–1.05, but worse on the slab wing and the Arcas, and no
  change to any flight). Neither has a sourced basis that holds across the cases yet.
- **Validation data audit** (VALIDATION.md). Raven, Torrent and Rabia match their design files part for part. The
  app's AeroTech J570W thrust curve adds up to 6% more impulse than ThrustCurve.org lists for the motor; at the listed
  impulse Raven's error would be +15.6% instead of +22.0%. The guessed inputs on most flights (finish, wind, weight)
  are noted.
- **References:** RM L50I08a, RM L50E19a, ARC R&M 3465 (Graham), ARC CP 921 (Wilby) added; 31 more public NACA and
  NASA reports added to the reference library, and REFERENCES.md links the 19 it cites.

## Build 342 (2026-11-22)

**The flight**

- **A sharp-edged fin's drag above Mach 1 is worked out from the fin's own shape.** For fins with an airfoil, beveled or double-wedge section the app used thin-airfoil theory, and for a swept fin held that drag flat from just above Mach 1 until the Mach line reached the leading edge. Wings measured in flight (NACA TN 3697: six swept wings, Mach 1.1 to 1.7) don't do that: their wave drag starts low and rises two to tenfold over that range. The app now works out linear theory for the fin's actual outline and section by the supersonic area rule (NACA Report 1284). It needs no fitted number. A swept fin gets less drag just above Mach 1 and more from about Mach 1.4 up; an unswept edge, such as a straight trailing-edge bevel behind a swept leading edge, is no longer treated as swept. The first flight after a fin is changed takes a moment longer above Mach 0.9 while the fin's drag is worked out (it is then kept); slower flights are untouched. Square and rounded fins don't change.
- **What it did to the accuracy figures.** The six wings of TN 3697: within 0.001 to 0.003 on the wing area for five (up to 0.008 off before), up to 0.007 too little on the tapered wings of aspect ratio 4. The RM-10's fins in a wind tunnel (NACA RM E50D28): 0.021 too much drag (the check case had these fins a quarter too small on the wrong body, which showed 0.011; corrected). NACA RM A53D02: 6.6% (7.7%). NACA RM L56G24: 3.8% (6.1%). The 23 measured flights: 6.3% as before, the bias from +3.0% to +2.4%; above Mach 1.2, 8.6% with a bias of +3.9% (8.8%, +5.5%). Seven flights move: Qu8k +16.5% to +13.4%, Kinsel A-601 +5.5% to +2.9%, Full Metal Jacket +1.8% and +3.1% to +1.2% and +2.4%, Proteus 6 +16.8% to +16.1%, Don't Debate This −12.8% to −14.2% and the L500 −2.3% to −7.1%. Went the other way: the full-scale RM-10 in flight (NACA RM L55H02, new), where the theory has a broad peak around the Mach number that puts the Mach line on the leading edge that the flight does not show: 13% to 15% too much drag at Mach 2 to 2.2, within 7% elsewhere from Mach 1.2 to 2.8 (the old rule: within 9% throughout). NASA TR R-100's configuration 11, from 14.6% to 20.3% too much drag (its fins have steep unswept trailing-edge bevels, which the old rule had treated as swept), and the Aerobee 150A, 5.9% and 4.8% to 7.2% and 5.3%. The apogee range shown above Mach 1.2 is a little wider (the flights' scatter there went from 9.2% to 10.0%).

**Checks and documents**

- **New check cases** (`validation/cases.js`): the six wings of NACA TN 3697; the full-scale RM-10 in flight (NACA RM L55H02: total drag, base drag, the body's pressure drag and what the motor's exhaust removes from the base, the first check of that below Mach 2: the app removes about 0.014 too little); seven noses 3 diameters long measured alone (NACA Report 1386: the app's nose pressure drag is within 0.007 in drag coefficient on average, a little high); six small flight models of NACA RM L53I01, scored with natural transition. `tests/drag-benchmarks.js` checks the fin calculation against thin-airfoil theory and NACA TN 1449's chart.
- **Swept fins make less lift just above Mach 1.** Above Mach 1.5 every fin had thin-airfoil theory's lift. That is right for an unswept fin and for any fin once the Mach line has passed its leading edge, and too much for a fin swept behind it. A fin's lift now comes from linear theory's charts for its taper and sweep (MIL-HDBK-762 figure 5-35). On the RM-10 (60° fins) the app had 42% to 61% too much normal force from Mach 1.5 to 2 and the center of pressure 5.4% to 6.6% of the length too far aft (NACA RM L54I03, new check cases); now 27% to 40% and 4.5% to 5.3%. What is left is the fins' effect on a tapering afterbody, which no report here covers: for a rocket with strongly swept fins on a boattail the stability margin between Mach 1 and 2 is still overstated, by about half a diameter on this one (AERODYNAMICS.md, gap 17). Unswept fins don't change; the other rockets' lift and center-of-pressure checks moved by under a point.
- **Tried and left alone** (AERODYNAMICS.md, gap 18): base drag behind a boattail by Love's method (ten times the error of the rule in use on 29 measured points); a boattail's pressure drag below Mach 0.9 (gentle boattails already agree in pressure and base together; steep ones, over about 10°, have too little drag below Mach 1 and no complete measurement to build on); the exhaust's effect on the base; friction.
- **Friction on small polished models.** NASA TR R-100's bodies with no base show that the app's default (a turbulent boundary layer from every leading edge) gives small polished models with fins near a chord Reynolds number of a million about a quarter too much drag below Mach 1; the natural-transition setting is within 6%. The default is unchanged: painted rockets in flight below Mach 0.8 are at 3.7% as it is. AERODYNAMICS.md, gap 15.

## Build 341 (2026-11-22)

**The flight**

- **A dropped booster's parachute opens when it is set to, and its flight ends at the touchdown.** The booster's descent took its events at the end of whichever time step came next (0.05 s): a chute set for an altitude opened up to a few metres below it, one set for a delay opened up to 0.05 s late, and the landing was put at the end of the step that passed ground level. The step is now cut to end at each event, and the landing is worked back to the moment of touchdown, as the sustainer's already were. A booster's landing time, drift and plotted path change slightly (a few hundredths of a second, under a metre); nothing about the rest of the flight does. `tests/descent.js` checks it.

**Drag: boattails above Mach 1**

- **A boattail's wave drag was two to four times too small from Mach 0.9 to 2; corrected.** The app takes it from an equation in NASA TR R-100 (Stoney, 1961), printed there as (0.0010·θ + 0.00071·θ²)/M. The 0.0010 is a misprint for 0.010. The report's own figure 13(a) plots the equation, and its curves are only reproduced with 0.010; the report says the equation approximates the theory of NACA TN 2972 (Jack), which is true with 0.010 and two to four times too small as printed; and four sets of measurements of boattails alone, and finned flight models differing only in afterbody, agree with 0.010 (below).
- **What changes.** A rocket with an attached boattail (a slope up to 15°, fading out by 25°) that passes about Mach 0.9 has more drag there, so a lower apogee. For a boattail of 8° to 0.7 of the diameter it is 0.04 to 0.05 more in drag coefficient at Mach 1.1 to 1.3 (about 0.08 instead of 0.035). Rockets that stay below Mach 0.88, rockets without a boattail, and tail cones steeper than 25° (counted as separated) are not affected: none of the 23 measured flights changes, and the apogee ± on the Results tab is the same. Above Mach 2.5, where the app uses wind-tunnel data, nothing changes.
- **What it did to the accuracy figures.** Boattails measured alone, 3° to 15°: from 0.02 to 0.11 too little drag in drag coefficient to within 0.01 at 15° and 0.006 to 0.024 too little at 3° to 10°. The Arcas wind-tunnel model through Mach 1: 14.3% to 9.2% (it had 14–27% too little drag from Mach 0.9 to 1.05 and is within 3% from Mach 1 to 1.1). Whole flight models above Mach 1 went the other way and now show too much drag: TR R-100's two boattailed models (6.2% and 12.5% to 14.6% and 17.9%). The excess is not the boattail's: NACA RM L53I01's flight models with no boattail at all show the same 7% to 15% too much, and what its boattails change agrees with the corrected value. The old, too-small boattail drag had been cancelling it. What has been found of it so far (base drag behind 7° to 9° boattails, thin fins near Mach 1.2, very slender noses) is in AERODYNAMICS.md, gap 15; none of it is changed in this build. The Arcas model without fins at Mach 1.5 and 1.8 also shows too much (11% and 5% to 32% and 23%); its report puts an unusually low base force there down to the reflexed lip on its base, which the app has no part for. Across all check cases, drag error from Mach 0.8 to 1.2 goes from 12.6% to 10.4% and from Mach 1.2 to 3 from 5.9% to 9.4%.
- **One shared flight moved.** A flyer's rocket with a 16° tail cone that reached Mach 1.5 went from 0.3% above its measured apogee to 4.3% below (VALIDATION.md, "shared by flyers").
- The Learn page's accuracy table has the new figures and a row for boattails measured alone.

**Protuberances**

- **A streamlined protuberance can have a straight middle.** New field, shown for the Streamlined shape: "Length of each tapered end". Above Mach 1 a streamlined item's drag depends on how steeply its front climbs, and the app took that climb to spread over half the item's length whatever its shape, which gave a long fairing with short pointed ends far too little drag. With the end's length entered, the antenna fairings NASA measured on a Cajun sounding rocket (TM X-1771, Mach 2.3 to 4.63) come out 0.019 off in drag coefficient on average (0.06 to 0.12 measured); before, as a streamlined shape, they got six to ten times too little. Left at 0 the shape is as before, and below Mach 1 the field changes nothing. It is kept in the app's design files; OpenRocket ignores it.
- The Protuberance shape help no longer says to enter such a fairing as a sloped-front box (build 340's advice).

**Accuracy figures**

- **New check: fins above Mach 2.** NASA TM X-1684 tested a quarter-scale Tomahawk sounding rocket at Mach 2.3 to 4.63 with no fins and with two fin sets (a wedge leading edge with a rounded nose, a blunt trailing edge). What the fins add, 0.19 to 0.32 in drag coefficient, the app gives within 0.02 at every Mach number (0.009 and 0.011 on average). The body alone comes out high: 7% at Mach 2.3 and 15 to 18% from Mach 3 up. That is recorded as an open gap (AERODYNAMICS.md, gap 14), with nothing changed on one model.
- **New checks: boattails measured alone.** Four sources that measure a boattail's own drag, where every earlier check was a whole rocket: NACA RM A57I09 (a body ten diameters long with and without a boattail, Mach 0.6 to 1.4), NACA RM L56K22 (cones of 3°, 5.6°, 8° and 16° cut off at three lengths, Mach 0.6 to 1.3), NASA TM X-1960 (13 short boattails of 3° to 15°, Mach 1.22 and 1.32) and the free-flight afterbodies in NASA TR R-100's figure 13(a). They are what found the misprint above. With it corrected the app is within 0.01 at 15°, 0.006 to 0.024 too low on slopes of 3° to 10°, and within 0.012 of the flight points. Still off: short gentle boattails that leave most of the base, and boattail drag below Mach 0.9, which the app does not have (AERODYNAMICS.md, gap 16).
- The validation builder can give a fin a trailing edge of its own, and a streamlined protuberance its end length; `validation/accuracy.js` scores a boattail's pressure drag with the base drag behind it.

**3D export**

- `tests/step-export.js` now checks rounded edges on free-form fins: the fins hold what their cross-sections add up to (within 0.02%) and take a fillet. Nothing in the export changed; a trial that cut the rounded edges another way gave the same shape with a slower, heavier fillet and was dropped.

## Build 340 (2026-11-22)

**Accuracy figures**

- **Two of the 23 measured flights now fly with the launch shoes their files list.** Rabia and Gibb each carry two launch shoes in RASAero II's files, and the validation set had left them off (it had no way to enter one). With them, as the app reads such a file (two blunt boxes of the shoe's frontal area), Rabia goes from +7.9% to +6.0% and Gibb from +1.5% to +0.7%; the mean error over all 23 flights from 6.4% to 6.3%, and above Mach 1.2 from 9.0% to 8.8%. The range beside the predicted apogee on the Results tab, which comes from these flights, moves by a hair with it. Nothing in the drag model changed.
- **Protuberances get their first check above Mach 1.** NASA TM X-1771 measured what antennas add to a Cajun sounding rocket's drag at Mach 2.3 to 4.63. Entered as the app's sloped-front boxes, its four long antenna fairings come out 0.020 off in drag coefficient on average (0.06 to 0.12 measured) and its two raked boxes 0.006 high (about 0.01 measured). Both are now check cases (`validation/accuracy.js`).
- **Builder help, Protuberance shape:** a long fairing with a straight middle and short pointed ends should be entered as "Long box, sloped front" on a rocket that passes Mach 1. As "Streamlined" the same test's fairings would get six to ten times too little drag, because that shape is taken to rise gently over half its length.
- AERODYNAMICS.md records what a comparison with RASAero II's own drag tables showed (run for Raven, Torrent and Rabia with one thing changed at a time): it charges rail guides and blunt fin edges several times what the app does, the slower flights say that is too much, a NASA measurement leaves no room for more guide drag above Mach 1, and the app's shortfall on those three rockets sits between Mach 1 and 1.2 on blunt flat fins. The table of the drag each flight would need is rerun.

## Build 339 (2026-11-21)

**The descent**

- **The same flight gives the same landing on every browser and phone.** Browsers differ in the last decimal place of their maths functions (sine, cosine, powers and the rest), and newer versions of Chrome differ from older ones. One comparison in the descent sat exactly on a tie, so that last place decided whether the simulation took one more short time step after a parachute opened, and every later step under the parachute fell about a tenth of a second earlier or later. Landing speed could come out up to 1.5% different between two devices, landing time 0.5% and drift 0.15%. The tie is gone. Apogee and top speed were never affected.
- **Landing speed is the speed at touchdown.** It was read at the end of the time step that passed ground level, up to 0.2 s later and a metre or two lower, in the wind the model gives there. It is now worked back to the moment of touchdown, as landing time and drift already were. Reported landing speeds change by up to 4% in wind (more often a fraction of a percent); the vertical part by under 0.5%.
- **A main set to open at an altitude opens at that altitude.** It opened at the end of the first time step below it, up to about 4 m low on a fast drogue descent. The step is now cut to end at the altitude. Landing time changes by up to about 1% on those flights, and drift with it. A parachute set to open at an altitude in the design file gets the same.
- `tests/descent.js` checks both: where the main opens, and that results hold when the maths functions are nudged the way another browser's would be.

**Behind the scenes**

- The tools that check and format the code are brought up to date (Prettier 3.10, ESLint 10, Babel 8, globals 17). Nothing in the app changes: the built page differs from build 338's only by a line break in one style rule.
- Building and checking now need Node.js 22.18 or later (Babel 8 asks for it), and the workflows on GitHub run on Node 22. The page Node 22 builds is the same, byte for byte, as the one Node 20 built for build 338.
- The Android app is built with Android Gradle plugin 9.5 and Gradle 9.9 (from 8.7 and 8.9). The app is the same: the signed APK holds the same 34 files, 31 of them identical byte for byte to build 338's (the manifest among them), the other three being the page itself, the compiled Java (48 bytes longer from the newer compiler) and a line naming the plugin's version. Plugin 9 turns Kotlin on for every project, which would have added 0.6 MB of unused code to this Java-only app; that is turned off. Check now lists what is in the signed APK, so the next change to the build tools can be compared the same way.

## Build 338 (2026-11-21)

**Export CAD**

- **Bevelled edges on free-form fins come out the right shape.** The bevel is carried up the whole of each edge and round its corners, measured along the airflow, and where the fin is narrower than two bevels they meet in a ridge. Each piece of the outline used to be bevelled on its own, which left a slab of full thickness with stepped walls under the tip (as airfoil fins had before build 337). A tapered trailing edge on a free-form fin is made the same way. The tip is left square, as before.
- **Fins on a boattail get their fillets.** The fillet follows the body down the taper (up to 30 degrees, where the body's parts meet without a step); it was left out there, with a note. Fins whose root runs from the tube onto a boattail get them too.
- **Fins on a boattail sit on the body all the way along.** With bevelled, airfoil or double-wedge edges, the back of a fin on a boattail was cut off level a few millimetres under the front of its root, and stood clear of the body behind that.
- The tests check bevelled fins' shape on pointed, flat-topped, tapered and zero-tip outlines: each fin must hold what its sections add up to, height by height.
- The tests check that no underside of a fin is left in the open on a boattail, with and without fillets.
- `tools/fin-sections.js` (npm run cad:fin) measures a fin as the export makes it, from a design file, a builder model or an example: its thickness seen from the side and its cross-sections at five heights, as a table and a picture. It is how each of these was found.

**Behind the scenes**

- The GitHub Actions the checks, the release and the device test run on are brought up to date.

## Build 337 (2026-11-21)

**Export CAD**

- **Fins with an airfoil or double-wedge section come out the right shape**, on trapezoid and free-form fins alike. They are built from true cross-sections along the airflow, one at the root and one at the height of each corner of the outline, each scaled to the chord there, so the fin is full thickness at mid-chord at every height (as a fin shaped from flat stock is, and as the app weighs it). Before, a free-form fin was left with a slab of full thickness and stepped walls under its tip (the odd facets on fins like the Punisher 3's), and a tapered trapezoid fin had a flat plateau across its root and a thinned tip. A fin that comes to a point closes to a point.
- **The fillet that follows a fin's section no longer leaves a ridge.** Its arc ran on past where it meets the fin and came back out through the skin, a ridge about 0.06 mm high along the fillet's whole top edge, in every such fillet since build 332. It ends where it meets the fin now. Files with these fillets have about a quarter of the faces and build in about half the time.
- **Rail buttons drawn as short solid launch lugs** (as older OpenRocket designs draw them) **are round**, with a base, a neck and a flange. They came out as small blocks. A long solid lug is still a block: a rail guide.
- **STL: hairline cracks closed.** Where slivers of faces meet, the mesh could be left with cracks a few thousandths of a millimetre wide, and the export was refused. Points closer than 0.01 mm are now one point.
- The tests check the fins' shape as well as that the solid is closed: airfoil and double-wedge fins must keep the share of the flat slab their section says (70% and 55%) on pointed, flat-topped, tapered and zero-tip outlines, and nothing may stand off the fin above a fillet.

## Build 336 (2026-11-21)

**On a computer or a tablet on its side**

- **A wide layout.** On a window at least 1,100 pixels wide the app uses the room: the Rocket tab puts the design file beside the drawing, with the Design Tree, the part editor and the tools side by side (three columns on a large screen); Results has the numbers on the left and the checklist, animation and charts on the right; the Motor tab lists motors two or three across beside the chosen motor and the filters; the Range tab's panels flow down two or three columns. On a phone nothing changes.
- **The flight animation, Learn and Flight vs prediction open larger there too.** The animation fills the window; Learn is wider, lists its chapters in two columns and shows larger drawings; Flight vs prediction is wider with a taller chart.

**Wind Tunnel**

- **The flow picture agrees with the drag model about boattails.** It showed the flow leaving a boattail from 8°, where the drag has it attached up to 15° and gone by 25°; both now use the same rule.
- **A note above the picture** says it follows the app's drag model and is not a CFD simulation, and the angle of attack starts at 0°.

**Wording and credits**

- The Wind Tunnel's help and the About list name the right source for the body's base drag (NASA TR R-100 up to Mach 2, NACA TN 3819 above).
- Learn's Motors chapter says that a few F and G motors (over 80 N of average thrust) need Level 1 too.
- The third-party notices credit the Emscripten runtime inside the CAD kernel.

**Tests**

- The walkthrough of every screen also runs at computer size on each push, and the recovery test covers a streamer beside a chute release and a booster's own parachute.

## Build 335 (2026-11-20)

**Builder: recovery fields**

- **A parachute's Role now swaps cleanly.** Making the drogue the main turns the old main into the drogue (it used to leave two mains and no drogue). Making the main a drogue hands the main to the other parachute (the choice used to snap back without a word).
- **A main charge height or chute release height of zero or below is refused**, and the old height stays. It used to be stored as 0, a main that never opens.
- **A design file edited outside the app keeps its own parachute settings.** When a file's parachute heights or delays no longer match the recovery settings saved with it (it was changed in OpenRocket, or another motor configuration deploys differently), the file's values are flown and the Recovery row is worked out again from them. The saved settings used to overwrite the file.

## Build 334 (2026-11-20)

**Builder**

- **Recovery has its own row in the Design Tree**, first under Whole Rocket, showing the configuration at a glance ("Two altimeters · release" with a chute release). Select it for the deployment choice, the altimeters, the chute release and the recovery hardware; Whole Rocket keeps the name, finish, weight and drag.
- **The Design Tree is set in under Whole Rocket**, with a line down its side, so it reads that every stage and part belongs to the rocket at the top.

**Flight animation**

- **The 3D view shows each charge firing**: the same short flash inside the body as the 2D view (the motor's charge near the tail, the apogee charge aft of the middle, the main charge forward of it), and the same notices across the top (Burnout, Apogee, each charge firing, each chute opening, Landed).

## Build 333 (2026-11-20)

**Recovery**

- **How the rocket is recovered is set in one place**: the builder, Whole Rocket, **Recovery** (it replaces Recovery electronics). Choose **Motor ejection**, **One altimeter** or **Two altimeters**. Each altimeter has its own apogee charge delay and main charge height, and optionally its model; with two, whichever fires first does the work. A **chute release** can be added to any of them, with its opening height. With one parachute and an altimeter you choose whether it opens at the apogee charge or at the main charge (no drogue).
- **A parachute has a role, not its own opening setting**: Drogue or Main when there are two or more, with a line saying when it opens. **Custom** keeps each parachute's own setting, for timers and for design files that don't fit.
- **Opening a design changes nothing**: the configuration is worked out from the file's parachutes and kept only if it gives exactly their settings back; otherwise the design opens as Custom. An earlier build's backup altimeter becomes Altimeter 2.
- **Altimeter model list**: the 20 altimeters that can fire charges (the recorders are left out). The Recovery Plan says when an altimeter that fires at apogee only is asked for a main charge, and when a flight is past a model's accelerometer range or the highest it reads.
- **Recovery Plan** names each charge (Altimeter 1, Altimeter 2, Motor, Chute release) and flies the flight again as if each failed: either altimeter, both, the motor's charge, and a chute release that stays shut.

**Builder**

- **Export CAD** (was Export STEP) asks for the format: **STEP**, or **STL** with a **fine** (within 0.02 mm) or **coarse** (within 0.2 mm) mesh. The STL is the same solid as the STEP (fin edges, fillets, lugs and rail buttons), binary, in millimetres, and is checked to be a closed surface holding the solid's volume before it is saved.

**Results**

- **Flight Log & Calibration starts folded**, with the number of flights and the drag calibration beside its title. It opens by itself when a saved flight asks about calibrating.

**Testing**

- `tests/recovery.js`: every recovery configuration, with and without a chute release, saved and reopened. The STEP test also meshes every rocket as STL and reads the files back as closed surfaces.

## Build 332 (2026-11-20)

**Builder**

- **STEP fin fillets follow the fin's section**: on fins with a bevelled, airfoil, double-wedge or tapered edge (and on rounded fins with a large fillet), the fillet is built from cross-sections along the root, each a round fillet touching the tube and the fin's own surface there. It is full size where the fin is full thickness and narrows with the fin to its leading and trailing edges, as a real fillet does, instead of standing out past the edge or burying a bevel. Works on trapezoid, elliptical and free-form fins, swept edges included. Square fins, and rounded ones with a small fillet, keep the fillet that runs round the fin's ends. Bladed edges end in the 0.3 mm flat again. These exports take longer (tens of seconds).

## Build 331 (2026-11-20)

**Builder**

- **STEP fin fillets blend smoothly**: OpenCascade now makes the fillet round the whole fin root, so it wraps the leading and trailing edges and runs tangent onto the body tube, for every fin shape (trapezoid, elliptical, free-form) and edge (square, rounded, bevelled, double wedge, airfoil). With a fillet on, a bladed edge's 0.3 mm flat becomes a 0.3 mm round nose and the bevel's crease into full thickness is rounded off, which the fillet needs; elliptical fins are a true ellipse, and airfoil or double-wedge elliptical fins are built from chordwise sections. Odd shapes it can't do still get the trimmed fillets.
- **Rail buttons and launch lugs in the STEP file sit halfway between two fins**, never inside one.

## Build 330 (2026-11-19)

**Builder**

- **STEP fin fillets are trimmed to the fin**: they end flush with a swept leading or trailing edge and follow a rounded or bevelled edge, instead of standing out past it.

## Build 329 (2026-11-19)

**Builder**

- **STEP fin edges follow the fin's section**: bevel, double wedge, airfoil, rounded and tapered trailing edges are in the STEP file (trapezoid, elliptical and free-form fins; curved edges are cut in short straight pieces). Sharp (bladed) edges end in a 0.3 mm flat instead of a knife edge, which a CFD mesher cannot fill with good cells.
- **Launch lugs, rail buttons and protuberances are in the STEP file** (rod and rail lugs, every button, and each protuberance shape including the fly-away guide), joined to the body as one solid. The button now reads **Export STEP**.

## Build 328 (2026-11-19)

**Builder**

- **Fin fillet radius** in the Whole rocket block, like OpenRocket's: the glue fillet along every fin root, kept in .ork files and counted in the rocket's weight. Leave it blank to keep each fin set's value from the file.
- **STEP** button, top right of the Design Tree: exports the rocket full size (millimetres) as one closed solid for CFD, outer surfaces only, with the base closed flat and the fin fillets. Fillets are made on straight body tubes only. It needs step-kernel.js (30 MB, bundled in the Android app) beside the web page.

## Build 327 (2026-11-19)

**Flight Log**

- **Compare with a real flight** replaces + Log a flight and the separate import button. It offers two ways in: **Import altimeter file** (as before: which rocket flew it, then the real curve) or **Enter by hand** (pick your altimeter for the readings it gives, or Another altimeter for just the apogee; the Log file, Display readings and Apogee only tabs are gone). Both open Flight vs prediction, flown with the flight's own motor, delay, weight and weather, where you save the flight and calibrate the drag to it. Editing a saved flight still saves straight away; a flight with files still takes a second altimeter's file.

**Learn**

- **Speed bands are tappable** in the drag model chapter: subsonic, transonic, supersonic and the hypersonic edge each say what drives the drag there, the methods and sources used, and how well it is checked, with links to Flying through Mach 1 and Validation.
- **Back closes Learn** in the Android app instead of closing the app, and a close **X** sits in the window's top right corner.

## Build 326 (2026-11-19)

**Range tab**

- **Get Current Location**, beside Get directions, fills the site's latitude and longitude from the device's location (GPS), with how close the fix is. Location is asked for only when the button is tapped, and the position goes only into the field. The Android app asks for location permission the first time.

**Results**

- **Recovery Plan starts folded**: tap Show to open it. It is still worked out after each Launch, and the PDF report still has it.

**Rocket builder**

- The top row of the parts list reads **Whole Rocket** (was ROCKET).

**Android app**

- If the page's process ends (Android short of memory, or a graphics driver crash), the app starts the page again with a short message instead of closing; designs and settings are kept. Links still open in the phone's browser, mail and map apps.

**Testing**

- The Android emulator test now drives the debug app end to end (a simulation, a design file opened through Android's file picker, an altimeter log shared to the app): it talks to the page over plain DevTools, reconnects if the connection drops, can't pass by stopping early, and runs on the plain Android image (4 GB) because Google Play services kept crashing on the Google image and taking the app with it.

## Build 325 (2026-11-19)

**Results**

- **The apogee range leaves out flights that tumbled.** Build 324 folded the landing-dispersion run's spread into the ±, and a rocket with a small stability margin and an estimated weight had some dispersion flights go unstable and top out near the pad: they swamped the range (−10,000 ft on a 17,000 ft flight). The ± now takes the spread of the flights that flew normally, about their median, and a line under the apogee says how many dispersion flights went unstable.
- **Stability leaving the rail comes first**, on the Results tab and in the RSO checklist: it is judged at the real speed and angle as the rocket leaves the rail, the slowest, most vulnerable moment of free flight. The static number on the pad (the usual 1-caliber rule) follows it; under 1 caliber there with at least 1 caliber leaving the rail is a caution rather than a stop. Leaving the rail below 0 caliber is now a stop.
- **Chance of tumbling** sits with the stability checks and says how much the balance is varied, and, when the weight is estimated, that weighing the rocket and marking its CG narrows it.

**Testing**

- The emulator test runs on Ubuntu 24.04 (the browser library it drives has none for GitHub's newer image), and the inputs test checks that tumbling dispersion flights stay out of the apogee range.

## Build 324 (2026-11-19)

**Results**

- **Apogee range**: a small ± beside the predicted apogee, from how far real apogees have landed from the app's predictions (23 measured flights, by top speed: the typical 1σ spread shown, the 90% range used by the waiver and cloud checks). Tap it for both. Estimated weights and calibrated drag widen or narrow it.
- **Recovery Plan**: every charge in order (primary altimeter, backup altimeter, motor) with its time after apogee, height and speed, a charge that fires while still climbing called out; the flight flown again as if the primary altimeter failed and as if every altimeter failed, each graded on its landing; a warning when one altimeter and a plugged motor leave no backup; time and drift under the drogue and the main, and with the main at 500, 750 and 1,000 ft; the main's opening load against the harness's rating; static port sizes (PerfectFlite's rule).

**Rocket builder**

- **Recovery electronics** (Whole rocket): a backup altimeter with its own apogee delay and main height, the altimeter bay's size, and the chute and harness's rated load. Saved in the .ork.
- **Fin weight follows the fin's section**: rounded, beveled, double-wedge and airfoil fins weigh what their shape holds, not a full flat slab (an airfoil two thirds of it, a double wedge half; rounded edges about 1%). A weight you enter still wins.
- **Parts library**: the parachutes of Fruity Chutes, Rocketman, Spherachutes and b2 Rocketry (SkyAngle) are rebuilt from each maker's published sizes, weights, drag coefficients and ratings. FlisKits and Front Range Rocket Recovery parts are gone (no published sizes or ratings). Older Fruity Chutes part numbers still match.
- **Top Flight X-Type** chutes take Cd 0.53 from measured cross-parachute drag (Knacke, Parachute Recovery Systems Design Manual) in place of Top Flight's chart.

**Flight Log**

- **Altimeter logs**: import a log from 25 altimeters (Featherweight, Missile Works, PerfectFlite, Jolly Logic, Eggtimer, Altus Metrum and others) by Open design file, the Flight Log or sharing it to the app. The log screen shows which rocket flew it and the flight's details; the charge is found from the curve.
- **Display readings**: log what an altimeter's display or beeps gave you.
- **Flight vs prediction**: the logged curve against the design flown the same way, with burnout, charge and apogee marked, each event compared, warnings when the charge fired before apogee or the accelerometer was at its limit, and what the differences point at. Save or calibrate drag from it.

**Range tab**

- Each number takes a physical range (wind up to 100 mph, field elevation up to 6,000 m, rail angle up to 45° and so on): a value past it is held at the end of the range and the field says so. Absurd values used to give absurd flights.

**Flight report (PDF)**

- The Recovery Plan is in the report.

**Learn**

- **Three levels**: Getting started, Mid & high power, Technical. Ten new chapters with drawings: certification, waivers and predicting apogee, dual deploy, fin flutter, flying through Mach 1, staging, reading your altimeter, the stability model, the equations of motion and the atmosphere, and validation.

**Fixes**

- Opening a stored run from a file this app saved flies that run's motor (it flew the design's saved motor).
- Flight vs prediction's chart opened blank on some screens.

**Testing**

- New automated tests run on every push: a walkthrough of every screen at phone size in light and dark; inputs moving the results the way physics says, and odd values breaking nothing; the PDF report, flight data CSV, Flight Log backup and Save a copy read back. An Android emulator test runs after each release.

**Validation**

- Three flights flyers shared (CT Concept 98, Partizon, Ascender) are in VALIDATION.md.

## Build 323 (2026-11-17)

**Learn**

- The Settings entry reads **Learn: Rockets & how the sim works**, and the Learn page's subtitle **How rockets fly, and how this sim works**.

**Validation**

- `validation/flights.js --zero-finish smooth|normal` flies the rockets whose files say "Smooth (Zero Roughness)" with smooth or regular paint; VALIDATION.md's table of finishes is rerun with it (smooth paint 6.2% mean error, regular paint 8.7%).

## Build 322 (2026-11-17)

**Learn**

- **A Learn page**, opened from Settings: eight short chapters for beginners (the four forces, a flight from pad to landing, stability, motors, drag, weather and the launch site, recovery, and how the simulator works and how far to trust it), each with a drawing and a "Try it in the app" note; a deeper chapter on the drag model, with its methods, sources and how well it is checked; and further reading. It works offline.
- **Learn more** links at the end of seven help boxes (CG, Cd, Surface finish, parachute diameter, Wind with altitude, Motor Delay, Wind Tunnel) open the chapter that explains them.

**Rocket builder**

- **Leading-edge radius** for beveled and double-wedge fins: the small round where the faces meet. Above the transonic drag rise it adds what the round costs over the sharp edge it replaces (modified Newtonian theory, swept as the other edges), checked against cylinder drag measurements (NACA TN 2960) and a blunted-wing test (NASA TM X-27). RASAero files fill it from their LE radius, and it is saved in the .ork. The three measured flights that give a radius come out 0.2 to 1.5% lower.

**Look and feel**

- The disclaimer's tick box turns the theme's orange when ticked, and so does the box around it (it was grey).

**Documentation**

- AERODYNAMICS.md describes the leading-edge radius; the measured flights' figures in it and VALIDATION.md are rerun (6.4% mean error, 9.0% above Mach 1.2).

## Build 321 (2026-11-17)

**Opening files**

- **RASAero II design files (.CDX1)** open like OpenRocket and RockSim files: the Open design file button takes them, and a file's simulations are offered as stored runs. The rocket's shape is read (nose with its blunt tip, tubes, transitions, boattails, fin cans, a booster, fins with their airfoil section and bevels, rail guides, launch lugs, launch shoes and protuberances), with the chosen simulation's motors, staging delays, nozzle exit diameters, recovery events and launch site. RASAero keeps a rocket's weight and CG with each simulation, motor loaded: the motor is taken out and the rest put on each stage as a weight and CG override. RASAero's apogee is shown as the reference beside each run. The .CDX1 is only read: changes are saved as an .ork.
- **A RASAero motor that isn't in your motor list**: the file's weight and CG include it, so the motor flown in its place is taken out until you upload the file's own motor and pick it; from then on the weight and CG without motor stay.
- **RASAero runs fly as RASAero does**: the wind is set the same at every height (RASAero has one wind speed), and the file's All Turbulent Flow setting sets the boundary layer (off: natural transition, RASAero's laminar flow turning turbulent at a Reynolds number of 500,000).

**Rocket builder**

- **Custom roughness** under Surface finish: type the surface roughness in µm, for a finish the list doesn't have. A saved .ork names the nearest finish OpenRocket knows and keeps your number for this app. RASAero files keep RASAero's own roughness for their surface finish.

**Flight**

- **Nozzle exit diameter** given by a design file now stays with its motor in the builder and in saved files, and a booster's is used too (it sets the base drag while the motor burns). On a large motor this matters: it moves Proteus 6 from about 90,100 ft to 100,000 ft.
- **Motor mount sizes** include every motor diameter in the motor list (111, 150, 203 and 216 mm were missing, so motors that size were always shown as too big for their mount).

## Build 320 (2026-11-16)

**Parts library**

- **Top Flight Recovery X-Type parachutes**: 28 chutes OpenRocket's parts files leave out (it models only round chutes): X-Type 10 to 90 in., thin mill X-Type 10 to 30 in., and Ultra X-Type HD 18 to 90 in. Each is listed at its own size as an equivalent round chute, with the drag coefficient that gives the drag area Top Flight's descent-rate chart implies (the chart's range of rocket weights read at 17 to 22 ft/s, in sea-level air). That chart, read the same way, makes Top Flight's round chutes draggier than flat round chutes usually measure, so these are likely optimistic: the real chute may come down faster.

**Under the hood**

- **The OpenRocket file reader is split up**: the one 1,800-line function that read a design is now a short one that calls each step in order, with a reader for each kind of part and the weight, CG and Cd overrides applied in one place (`files/ork-*.js`; see ARCHITECTURE.md). Nothing it reads has changed: 3,922 readings of 710 designs are identical before and after.

## Build 319 (2026-11-16)

**Builder**

- **Surface finish: Smooth paint: glossy (40 µm)**: a new choice between the 20 µm and 60 µm ones, for a clean glossy paint job that hasn't been sanded afterward. OpenRocket has no 40 µm finish, so a design saved with it opens there as Regular paint (60 µm); this app reads its own marker in the file and brings back 40 µm.
- **The 20 µm finish is named Smooth paint: wet-sanded**, so the two smooth-paint choices read apart.

## Build 318 (2026-11-16)

**Flight**: read from the design the way OpenRocket flies it, each checked against OpenRocket 24.12

- **A CG override that covers the parts on it**: the part and everything on it now balance at that point. It moved only the part itself, which changed the stability margin.
- **A Cd override that covers the parts on it**: it now replaces the drag of those parts too. The setting was ignored.
- **A Cd override on the last body part**: it now replaces the base drag behind that part as well, as in OpenRocket. Base drag used to be added on top. The note shown when the file opens says so.
- **Fin fillets and fin tabs are weighed**: fillets as OpenRocket sizes them, and through-the-wall tabs in the fin's own material. The builder keeps both as the file wrote them and saves them back.
- **Engine blocks**: weighed as a ring of their own thickness, not a solid disc.
- **Stage weights**: parts on a part whose typed-in weight covers them no longer add to their stage's own weight.

## Build 317 (2026-11-16)

**Flight**

- **Rail buttons and launch lugs on a part with a typed-in weight are flown**: when a part's weight was typed in to cover the parts on it, only its fins, parachutes and inner tubes were read for the flight. Rail buttons, launch lugs and anything else on it were dropped, so their drag was missing and the results said the design had none. Every part on it is now read; only its weight is left out, since the typed-in weight covers it. Designs set up that way fly a little lower than before (an Estes Partizon on an I205: 3,784 ft, was 3,967 ft).

## Build 316 (2026-11-16)

**Settings**

- **Units is Imperial or Metric, with a Length and Weight choice under it**: Length and Weight replaces Rocket weight in. With Imperial it offers In/Lb and In/Oz; with Metric, m/kg and mm/g. Every length and weight field follows it, and the choice is remembered for each system.
- **Part weights follow the choice too**: a part's weight was always in ounces or grams. It is now in the unit chosen (pounds with In/Lb, kilograms with m/kg), and so is the nose-weight advice in the results. Black powder charges stay in grams and motor diameters in millimetres.
- **Ejection charge calculator**: its lengths follow the Length and Weight choice.

**Results**

- **A booster stage with no motor**: the results say it flew as dead weight.
- **A launch site with no field elevation of its own**: the Range tab and the results say the elevation shown is left from before, until one is entered.

**Builder**

- **Swapping for a library part**: says when a weight you typed in was cleared or replaced.
- **Importing a fin's DXF**: asks before replacing the fin's shape.
- **Add a part**: the add button reads Add a part.

**Launch sites**

- **Importing sites**: asks before replacing sites of the same name: replace them, keep them, or cancel.

**Flight animation**

- **Flight line camera**: says the camera follows the rocket by itself.
- **Export video from the 3D view**: the button stays, as Export 2D video, and switches to the 2D view to make it.

## Build 315 (2026-11-16)

**Parts library**

- **Streamers and parachute cloth weigh what they should**: a library streamer of crepe paper added 2 kg to the rocket (the source lists paper as 90 where it means 90 g/m²); it now adds about 2 g. Some parachute cloth was a thousandth of its weight, which mattered for parachutes without a listed weight. Both are read in the right unit.
- **Slips in listed weights are not passed on**: a few parts' listed weights are plainly wrong in the source (paper rings that weighed nothing, a paper motor tube denser than steel). A weight that makes a tube, ring or bulkhead less than a quarter or more than six times its material's density is not believed, and the material's density is used; a material with no believable density is left out and the part keeps the builder's own.
- **A new motor mount fits the motor**: adding a motor mount from the library lists the tubes that hold the chosen motor (it listed every tube that goes inside the body).

**Flight animation**

- **Scrubbing the 3D view while paused**: the picture goes straight to the scrubbed time. It eased toward it one step at a time, so the camera trailed behind and could miss the rocket.
- **Site photo box only where it does something**: it shows when the run has coordinates.

**Results**

- **Safety cone and Landing dispersion**: the Flight Performance graphs named Cone and Landing are now Safety cone and Landing dispersion.

**Settings and launch sites**

- **The Units button names the weight unit**: it reads ft · oz when the rocket's weight is shown in ounces.
- **Saved sites on a narrow screen**: a site's Rename and Delete buttons go under its name, so the name isn't cut short.
- **A new site whose elevation can't be looked up**: the message now says the elevation under Range is still the one from before, and what it is.

## Build 314 (2026-11-16)

**Launch sites**

- **Four more built-in fields**: Clio, MI (Alkay Airport), Frank Hunt Field, UT, Manchester, MI (JMRC) and Mojave Desert, CA (FAR) join the saved sites the app starts with, each with its coordinates and field elevation.
- **New built-in fields reach an app already in use**: the app used to add its built-in fields once, on first run. It now adds each newly listed field once after an update. A name you already use, or a field within about a mile of a site you've saved, is skipped, and a built-in field you deleted doesn't come back.

## Build 313 (2026-11-16)

**Launch sites**

- **Add site, in Manage**: new sites are added from Manage (Add site: a name and, if wanted, coordinates). The field-name box under Range is gone. The new site becomes the one in use, with the waiver, recovery area and rail as they are set now; with coordinates other than today's, its field elevation is looked up. Save Changes stays, appears when the chosen site's settings have changed, and saves them to that site. Manage is always there, with or without saved sites.
- **Export sites and Import sites**: Export sites saves every saved site as a file (pocket-rocket-launch-sites.json), to back them up or take them to another device. Import sites adds the sites in such a file; one with the name of a site already saved replaces it. Photos and terrain aren't in the file: each device fetches its own.

**Flight animation**

- **Opens paused**: the animation opens standing on the pad; Play starts the countdown. Meanwhile the site's photo and terrain have time to arrive.
- **Site photo and terrain tried again**: a photo or terrain that couldn't be fetched is tried again each time the site is chosen or the 3D view opens (it waited for the site to change or the app to restart), and the Range tab and the 3D view say what happened: fetching, photo not fetched, or photo on flat ground until the terrain arrives. A request that gets no answer gives up after 90 seconds.
- **Every site's photo and terrain are kept**: there is no limit on the number of sites (it was four, dropped in coordinate order). A site's photo and terrain go when its saved site is deleted, unless another site is at the same place.

**About**

- **Parts library credits**: the About text and third-party notices name H. Craig Miller as the copyright holder of the parachute makers' files (b2 Rocketry, Front Range Rocket Recovery, Fruity Chutes, Rocketman, Spherachutes), give Dave Cook's years as his files do, and say the makers are not affiliated with the app.

## Build 312 (2026-11-15)

**Flight animation**

- **The flight in 3D**: Watch the flight now opens in 3D. The rocket is a solid model built from the design's own shape and fins, flying its simulated path with its simulated tilt and roll, with the pad and rail, the flame, a smoke trail that drifts with the wind, the path flown, a shadow, the drogue and main parachutes and dropped stages. Three cameras: Chase (the one it opens in), Flight line (a spectator near the pad who follows the rocket and zooms in) and Whole flight. In Chase and Whole flight, drag to look around and pinch or scroll to zoom. The play, speed and scrub controls and the readout, with the distance upwind or downwind of the pad, work as in 2D. The 2D view button brings back the side view, and the choice is remembered. Far off, the rocket is drawn larger than life so it can be seen, and the readout says by how much. Video export is for the 2D view.
- **The launch site's photo and terrain**: with the launch site's coordinates set, the ground is an aerial photo of the site laid on the real shape of the land, with the hills and the skyline out to 40 km (U.S. Geological Survey imagery and elevation; United States only). Choosing a saved site or typing coordinates on the Range tab fetches them, once, and they are kept on the device for use at the field without a connection (up to four sites). Untick Site photo in the 3D view to do without. Without them the ground is plain, with a 100 m grid.
- **Level-ground flight, drawn on the land**: the flight is still flown over level ground at the pad's height, so every figure is unchanged; in the 3D picture the last 150 m are eased onto the land's own height, so the rocket lands on it.

## Build 311 (2026-11-15)

**Rocket builder**

- **Add a body part opens a window**: the add button now opens a window with the parts in it, as Add a part from Library does: the body parts, the parts that go on the selected body part, and adding or removing a stage. Picking one adds it and closes the window; Cancel, Escape or a tap outside closes it without adding anything.

## Build 310 (2026-11-15)

**Rocket builder**

- **Export a fin as a DXF**: Export DXF, under the fin drawing, saves one fin's outline at full size (trapezoid, elliptical or free-form) for a laser cutter, a CNC router or a printed template. The drawing is in millimetres, one closed outline on a layer named FIN.
- **Import a fin from a DXF**: Import DXF, beside it, reads a full-size drawing's outline (polylines with their arcs, lines and arcs that join up, ellipses, splines) and makes the fin that shape as a free-form fin. The number of fins, their thickness, edges, cant, position and material stay as they are. The root is the edge along the bottom of the drawing (or along its top or a side, or its longest straight edge); the unit is the file's, millimetres if it doesn't say, or the one chosen beside the button. The result is reported under the buttons with the root and span it read.
- **Flip front to back**: a free-form fin can be turned around, for a drawing that came in with its trailing edge forward.
- **Curved free-form fins draw cleanly**: an outline with more than 16 points is drawn without its corner numbers.

## Build 309 (2026-11-15)

**Rocket builder**

- **Add a part from Library**: the add button is now half the width, with Add a part from Library beside it. The library window opens with the kind of part to choose (body tube, nose cone, transition, motor mount, inner tube, coupler, centering ring, bulkhead, launch lug, parachute, streamer), then the search, the maker filter and the fit box. Picking a part adds it where the add button would, filled in from the library.
- **Swap for a library part**: the link in a part's editor (it was Choose from the parts catalog) replaces the selected part's sizes with a library part's. A swapped tube keeps its length when the stock is long enough; a newly added one takes the library's length.
- **Library, not catalog**: the app's wording is the same throughout.

## Build 308 (2026-11-15)

**Rocket builder**

- **Parts catalog**: about 3,800 makers' parts (LOC Precision, Madcow, Public Missiles, Estes, Giant Leap, Fruity Chutes and 15 more): body tubes, nose cones, transitions, couplers, centering rings, bulkheads, launch lugs, parachutes and streamers. Select a part and tap Choose from the parts catalog: the list is searchable, filters by maker, and starts narrowed to what fits (a nose cone that matches the body, a ring that fits the tube's inside, a mount tube for the motor). Picking one fills in the part's sizes, material and listed weight; the part stays editable and keeps its maker and part number, saved in the design file. A tube keeps its length when it can be cut from the stock length. The data comes from the component files distributed with OpenRocket (Dave Cook's openrocket-database, Apache License 2.0).

**Ejection charges**

- **A parachute in the nose cone gets its own bay**: for head-end deployment (a main packed in a hollow nose cone with its own charge), the calculator now measures the nose cone's inside from its shape and wall thickness, adds the tube between its base and the first bulkhead, and sizes the charge and shear pins on the nose joint. It was counting only the tube space behind the nose cone.

**Settings**

- **Rocket weight in ounces**: with imperial units, the rocket's weight can be shown in pounds or ounces (Settings, Rocket weight in).

**Results**

- **Flight data file**: Download flight data saves the last run as a CSV, one row for each recorded moment: altitude, speeds, Mach number, acceleration, thrust, drag and drag coefficient, weight, CG, CP and stability margin, angle of attack, tilt, roll rate, drift, and the air's temperature, pressure and density, in the units the app is showing.

**Validation**

- **Each check is graded by what its source records** (VALIDATION.md, How much weight each check can bear): wind-tunnel and flight cases are marked 1 to 3 by how much of the rocket, motor and day their source gives, and the accuracy figures are reported by grade.

## Build 307 (2026-11-15)

**Drag**

- **A step up in diameter no longer costs far too much**: a wider section behind a narrower one (a fin can's sleeve, a coupler band, a payload bay) was charged most of stagnation pressure on its face whatever its height, two to seven times what steps measure. It now takes the measured drag of a step against its height beside the boundary layer (NASA TN D-8040 above Mach 1.6, Hoerner below Mach 0.9). Designs with such a step fly higher than before; designs without one are unchanged.
- **A short, steep flare can't cost more than a flat step**: the cone formula could give a short flare more than stagnation pressure.
- **Fins through Mach 1**: the fins' pressure drag near Mach 1 now follows NACA Report 1253's chart of 22 wings, in which a stubby fin's drag rises later and stops far lower than a long one's. It was sized from one wind-tunnel model whose fins sit on a boattail. This touches sharp-edged fins only (beveled, double wedge, airfoil), and mostly ones thick for their chord.

**Atmosphere**

- **A hot or cold day at the pad no longer reaches the stratosphere**: the pad's temperature offset is carried up through the troposphere and fades out between 11 and 15 km above sea level (U.S. Standard Atmosphere Supplements, 1966). Only flights above about 36,000 ft above sea level change, by a percent or so. A loaded forecast is still used as it is.

**Validation**

- **Three new checks from flight recorders**: Qu8k's accelerometer in the coast (Mach 2.0–2.8), Proto's through its coast and fall (Mach 2.1–0.6; the app within about 8%), and how drag rises with height in four tracked two-stage flights to 70,000 ft (the app's rise matches within a few percent, so the boundary layer is turbulent up there as the app assumes).
- **VALIDATION.md's measured-flights section is redone for the current model**: 6.5% mean apogee error on the 23 flights, with what is behind each of the large misses (Qu8k's is its predicted thrust curve and an uncorrected accelerometer; its drag is not too low).

## Build 306 (2026-11-15)

**Rocket builder**

- **Chute release setting**: a parachute set to open at an altitude has a new switch, Held by a chute release (a Jolly Logic Chute Release, for one). Tick it when the motor's ejection charge puts the bundled chute out near apogee and the release opens it at the opening altitude. The setting is saved with the design.

**Results and the RSO checklist**

- **No caution for a chute release flying as intended**: with the switch ticked, the motor charge firing while the main is still closed is expected and isn't flagged. A caution remains only when the charge fires more than 1.5 s before apogee or with the rocket moving faster than about 100 ft/s (30 m/s), since coming apart then is hard on the rocket whatever holds the chute.
- **The caution without the switch reads better**: when the charge fires after apogee and the main is set for a lower altitude, it says when the charge fires and when the main opens, that this is right with a chute release, and how to tick the switch or change the timing otherwise.

## Build 305 (2026-11-15)

**Rocket builder**

- **The finish names say which one a painted rocket is**: Regular paint (60 µm) is now "a typical painted rocket", where it read as a rough or brushed coat and steered people away from the choice that fits. Smooth paint (20 µm) is a glossy, wet-sanded finish, and Optimum paint (5 µm) one sanded and polished. The roughness stands for the whole surface as it flies (tube spirals, seams, decals, fillets and the paint's texture), not the paint film alone; the weighed, logged flights matched with regular paint and their rail buttons counted. The finish field's help says so, and that the values are estimates.

**Results**

- **The finish note offers regular paint first**, as the usual choice for a painted rocket.

**Under the hood**

- The regression test's results text is re-recorded for the note's wording; every flight is identical.

## Build 304 (2026-11-15)

**Results**

- **Notes on what usually makes the predicted drag too low**: when a design has a polished (or smoother) finish, or no rail buttons or launch lug, a note under the results says what each is worth on that flight, with a button to switch to smooth or regular paint, or to add a pair of 1010 rail buttons (a launch lug on small rockets). "Keep polished" or "It has none" hides the note for that design. Weighed, logged flights of ordinary kit rockets came out 4–23% below the apogee predicted for their design files set up that way, and within a few percent with regular paint and rail buttons; a pair of 1010 buttons adds about a fifth to the drag of a 1.6 in rocket.

**Flight Log & Calibration**

- **Drag measured by the altimeter's accelerometer**: importing a file with an acceleration column (Altus Metrum and Featherweight files have one) keeps the coast, between burnout and apogee, where an accelerometer reads the drag directly whatever the motor did. The log shows that drag as a multiple of the design's estimate, and a calibration uses it in place of the apogee when every ticked flight has it. It is used only when the boost agrees with the rocket's weight and motor (within 12%) and the accelerometer's climb agrees with the barometer's (within 8%); otherwise the log says why not. The column check has the acceleration column and its unit.
- **Featherweight Interface Program exports open** (the classic Raven's CSV, with a time column for every channel).

**Stability**

- **Above Mach 1, the nose and the body behind it take their lift and center of pressure from measured charts** (MIL-HDBK-762 figures 5-4 to 5-7: ogive-cylinders, and cone-cylinders for conical noses), and **the lift the fins put on the body is added** (NACA Report 1307), faded in from Mach 0.9 to 1.5. On the measured rockets the supersonic lift error is roughly halved and a delta-fin missile's center of pressure goes from 6% of its length forward to within 1%; the Arcas's is 4–5% forward above Mach 3 (was 2–3%), the cautious direction. Nothing changes below Mach 0.9, so subsonic flights fly exactly as before. No measured rocket here has a conical nose, so the cone chart is unchecked.

**Under the hood**

- **Validation: seven weighed, logged flights** of three kit rockets (Harvey Mudd College's published data), apogee and coast drag: `npm run validate:logged`. As their design files are set up the app is 13.8% high in apogee and 15.7% low in drag; with regular paint and rail buttons 3.5% and 6.3%. VALIDATION.md has the table.
- **Validation: the Arcas's normal-force slope**, with and without fins (NASA TN D-4013 and D-4014), is in the accuracy check.
- **New test in the Check workflow** (`tests/coast.js`): a flight of known drag, written out as an altimeter file, must calibrate back to that drag from the coast; a file whose accelerometer reads low must be refused; the drag notes show and act.
- AERODYNAMICS.md lists the two supersonic stability terms, their scores and what is still open (lift below Mach 1, boattail lift above it, the unchecked cone chart).
- The regression test's results text is re-recorded for the notes (three of the shipped examples have a polished finish or no rail buttons) and its supersonic stability figures for the new terms; flights below Mach 0.9 are identical.

## Build 303 (2026-11-14)

**Rocket builder**

- **A fin's trailing edge can be set apart from its leading edge**: a new Trailing edge field on fin sets (Same as the leading edge, Square, Rounded, Tapered to a sharp edge), for a fin rounded or sharpened at the front and left square at the back, or the other way round. A blunt back adds base drag behind the fin at every speed and keeps only the front's share of the wave drag above Mach 1; a tapered back removes the base drag. Checked on NACA RM L55G28a, whose report gives wedge leading edges and square trailing edges: drag within 1.2% of the flight, against 5.2% low before. Saved in the app's own data inside the .ork (OpenRocket sees the leading edge's type). Designs that don't set it fly exactly as before.

**Settings**

- **The Drag model switch is gone**: the app always flies the current drag model (the app's since build 288). Anyone who had Previous chosen is moved to it. A drag calibration fitted with the previous model shows as not in use, with Refit and Remove, as it did when switching.

**Under the hood**

- **The previous drag model's code is removed.** The current model computes exactly what it did: 1,119,046 drag numbers over 286 designs, 286 flights, the regression cases, the drag benchmarks and the validation scripts are all identical before and after. The Wind Tunnel's previous-against-current comparison went with it.
- **AERODYNAMICS.md describes only the current model**, with today's accuracy figures: 5.8% on the 23 measured flights as the altimeters read (RASAero II 5.2%).
- **Where the remaining apogee error sits** (`validation/drag-factors.js`): the drag factor each measured flight needs. The fourteen rockets with beveled or square fins need 1.00 on average; the nine with rounded fins 1.09, with too much scatter between them to correct for.
- **Validation**: the EZI-65 is flown at 100 °F like the other six LDRS-26 flights (its file said 70 °F).
- The regression test flies the current drag model (it flew the previous one) and has two cases for the new trailing edges: 55 in all.

## Build 302 (2026-11-13)

No change to the app itself: it flies, opens and saves exactly as Build 301 does.

**Under the hood**

- **Save-and-reopen test runs on GitHub**: it ticks checkboxes with the input's own click. A pointer click needed the box on screen, and on GitHub's machine (other fonts) one landed outside the window, which failed the checks for Build 301.

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
