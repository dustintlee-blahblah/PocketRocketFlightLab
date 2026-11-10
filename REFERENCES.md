# Reference library

The reports and papers kept as reference material for the app's physics. Report numbers are the citations used in
the code and in [AERODYNAMICS.md](AERODYNAMICS.md) and [VALIDATION.md](VALIDATION.md). The U.S. government reports are
public domain and are on the NASA Technical Reports Server (NTRS) or DTIC. The papers and the book are copyrighted, so
only their citations are kept here.

## Used by the app now

| Report | Title | Used for |
| --- | --- | --- |
| NACA TN 3819 (Love, 1957; [NTRS 19930084517](https://ntrs.nasa.gov/citations/19930084517)) | Base pressure at supersonic speeds on two-dimensional airfoils and on bodies of revolution with and without fins having turbulent boundary layers | Supersonic base drag of the body and the fin trailing edges, boattail relief |
| NACA Report 1307 (Pitts, Nielsen and Kaattari, 1959; [NTRS 19930091008](https://ntrs.nasa.gov/citations/19930091008)) | Lift and center of pressure of wing-body-tail combinations at subsonic, transonic, and supersonic speeds | Body–fin lift carryover (a listed gap in AERODYNAMICS.md) |
| NASA TN D-4013 (Ferris, 1967) | Static stability investigation of a single-stage sounding rocket at Mach numbers from 0.60 to 1.20 | Arcas CP check and the transonic fin drag rise (`validation/arcas.js`) |
| NASA TN D-4014 (Babb and Fuller, 1967; [NTRS 19670020031](https://ntrs.nasa.gov/citations/19670020031)) | Static stability investigation of a sounding-rocket vehicle at Mach numbers from 1.50 to 4.63 | Arcas CP check and the supersonic fin drag |
| NASA TM X-653 (Jorgensen, Spahr and Hill, 1962; [NTRS 19720065133](https://ntrs.nasa.gov/citations/19720065133)) | Comparison of the effectiveness of flares with that of fins for stabilizing low-fineness-ratio bodies at Mach numbers from 0.6 to 5.8 | Supersonic fin lift check |
| NACA TN 4197 (Martin, 1958; [NTRS 19930085030](https://ntrs.nasa.gov/citations/19930085030)) | Summary of flutter experiences as a guide to the preliminary design of lifting surfaces on missiles | Fin flutter speed (`src/js/physics/flutter.js`) |
| NASA TR R-100 (Stoney, 1961) | Collection of zero-lift drag data on bodies of revolution from free-flight investigations | Nose drag curves from Mach 0.8 to 3.6 |
| NACA RM A53D02 (James and Carros, 1953) | Experimental investigation of the zero-lift drag of a fin-stabilized body of fineness ratio 10 at Mach numbers between 0.6 and 10 | Total drag check (`tests/drag-benchmarks.js`) |
| NACA RM E50D28 (Esenwein, Obery and Schueller, 1950; [NTRS 19930086134](https://ntrs.nasa.gov/citations/19930086134)) | Aerodynamic characteristics of NACA RM-10 missile in 8- by 6-foot supersonic wind tunnel at Mach numbers from 1.49 to 1.98, II | RM-10 fin drag check |
| Vought Astronautics AST/E1R-13319 (1961) | Performance summary for the Aerobee 150A sounding rocket vehicle | Aerobee 150A drag check (never used for tuning) |
| Hoerner, *Fluid-Dynamic Drag* (1965; copyrighted) | — | Form factor, subsonic base and fin trailing-edge drag, boattail separation, junction and joint drag estimates |
| Box, Bishop and Hunt (2009; copyrighted preprint) | Estimating the dynamic and aerodynamic parameters of passively controlled high power rockets for flight simulation | Cross-check of the drag build-up |
| Box, Bishop and Hunt, *J. Aerospace Eng.* 24(1), 31–45 (2011; copyrighted) | A stochastic six-degree-of-freedom flight simulator for passively controlled high power rockets | Monte Carlo approach, cross-check |

## Not used yet

| Report | Title | Could be used for |
| --- | --- | --- |
| AFWAL-TR-86-3091 (Vukelich et al., 1988; [DTIC ADA211086](https://apps.dtic.mil/sti/citations/ADA211086)) | Missile DATCOM, Volume I – Final report | Why DATCOM chose each method; the app already cites the 2014 user manual |
| NACA RM L53K17 (Stoney, 1954; [NTRS 19930087953](https://ntrs.nasa.gov/citations/19930087953)) | Transonic drag measurements of eight body-nose shapes | Transonic nose drag check (fineness-3 noses; may overlap TR R-100) |
| NACA RM L56G24 (Gillespie, 1956; [NTRS 19690093428](https://ntrs.nasa.gov/citations/19690093428)) | Supersonic investigation of the lift, drag, static stability, and hinge-moment characteristics of a rocket-powered model of a ballistic-missile configuration | Drag and CP check, Mach 1.6–2.8, fineness 16.9 body with 60° delta fins |
| NASA TM-2005-213541 (Allen, 2005; [NTRS 20050160470](https://ntrs.nasa.gov/citations/20050160470)) | Aerodynamics of an axisymmetric missile concept having cruciform strakes and in-line tail fins from Mach 0.60 to 4.63 | Normal force and CP check with and without the tail fins |
| NASA TM X-677 (Pierpont, 1962; [NTRS 19660024055](https://ntrs.nasa.gov/citations/19660024055)) | Preliminary investigation of interference effects of multicoplanar fins on a two-stage rocket launch vehicle with winged spacecraft at transonic speeds | Booster fin interference and two-stage stability, Mach 0.6–1.2 |
| NASA TM-84599 (Spearman, 1983; [NTRS 19830009240](https://ntrs.nasa.gov/citations/19830009240)) | The role of wind tunnels in predicting sounding rocket aerodynamics | Where estimation methods fail: mismatched sections, long bodies, protuberances |
| Iyer (2026; copyrighted) | Nose cone geometry's effect on rocket aerodynamic and thermal performance | Literature review; secondary source |
