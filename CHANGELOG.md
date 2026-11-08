# Changelog

What changed in each build of Pocket Rocket Flight Lab, newest first. Each build is a
[release on GitHub](https://github.com/dustintlee-blahblah/PocketRocketFlightLab/releases) with its Android app and web
version.

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
