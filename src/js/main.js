/**
 * The app's entry module. build.js bundles this file and everything it imports into the page (esbuild).
 *
 * Loading a module only defines things (functions, classes, constants), so the order modules load in doesn't matter.
 * What a module does when the app opens (wiring up buttons, reading saved settings, the first drawing) is in its
 * start(), and those run below in a fixed order: the order the app's start-up depends on.
 *
 * window.__pr is a live view of every module's exports, for the tests and for poking at the app from the browser
 * console: reading a name gives its current value; assigning one that has a setter calls it. A page opened with
 * window.PR_EXPOSE set (the tests do this) also gets each of them as a global, as the app's names were before it was
 * split into modules.
 */
import * as m0 from "./core/start.js";
import * as m1 from "./core/storage.js";
import * as m2 from "./core/helpers.js";
import * as m3 from "./core/units-and-fin-edges.js";
import * as m4 from "../data/motor-catalog.js";
import * as m5 from "./motors/catalog.js";
import * as m6 from "../data/old-motor-ids.js";
import * as m7 from "./motors/catalog-lookup.js";
import * as m8 from "./motors/motor-files.js";
import * as m9 from "./design/defaults.js";
import * as m10 from "./motors/clusters.js";
import * as m11 from "./ui/units.js";
import * as m12 from "./ui/forms.js";
import * as m13 from "./ui/field-help.js";
import * as m14 from "./recovery/ejection-charge.js";
import * as m15 from "./ui/state.js";
import * as m16 from "./physics/atmosphere.js";
import * as m17 from "./physics/geometry.js";
import * as m18 from "./physics/aerodynamics.js";
import * as m19 from "./physics/simulate.js";
import * as m20 from "./files/openrocket-import.js";
import * as m21 from "./files/rocksim-import.js";
import * as m22 from "./builder/model.js";
import * as m23 from "./builder/ork-export.js";
import * as m24 from "./builder/ork-read.js";
import * as m25 from "./builder/ork-merge.js";
import * as m26 from "./ui/results.js";
import * as m27 from "./ui/rso-checklist.js";
import * as m28 from "./animation/animation.js";
import * as m29 from "./animation/scenery.js";
import * as m30 from "./animation/video-export.js";
import * as m31 from "./ui/charts.js";
import * as m32 from "./ui/motor-tab.js";
import * as m33 from "./ui/motor-delay.js";
import * as m34 from "./ui/launch-sites.js";
import * as m35 from "./ui/compare-motors.js";
import * as m36 from "./ui/events.js";
import * as m37 from "./ui/settings.js";
import * as m38 from "./ui/launch-warnings.js";
import * as m39 from "./files/open-file.js";
import * as m40 from "./flightlog/drag-calibration.js";
import * as m41 from "./flightlog/altimeter-files.js";
import * as m42 from "./flightlog/flight-log.js";
import * as m43 from "./flightlog/xlsx.js";
import * as m44 from "./builder/builder-ui.js";
import * as m45 from "./files/save.js";
import * as m46 from "./files/recent.js";
import * as m47 from "../data/examples.js";
import * as m48 from "./files/examples.js";
import * as m49 from "./ui/touch.js";
import * as m50 from "./files/zip.js";
import * as m51 from "./files/saved-simulation.js";
import * as m52 from "./files/unsaved-changes.js";
import * as m53 from "./report/pdf-report.js";
import * as m54 from "./ui/donate.js";
import * as m55 from "./ui/disclaimer.js";
import * as m56 from "./physics/monte-carlo.js";
import * as m57 from "./weather/winds-aloft.js";
import * as m58 from "./weather/forecast.js";

const modules = [
  m0,
  m1,
  m2,
  m3,
  m4,
  m5,
  m6,
  m7,
  m8,
  m9,
  m10,
  m11,
  m12,
  m13,
  m14,
  m15,
  m16,
  m17,
  m18,
  m19,
  m20,
  m21,
  m22,
  m23,
  m24,
  m25,
  m26,
  m27,
  m28,
  m29,
  m30,
  m31,
  m32,
  m33,
  m34,
  m35,
  m36,
  m37,
  m38,
  m39,
  m40,
  m41,
  m42,
  m43,
  m44,
  m45,
  m46,
  m47,
  m48,
  m49,
  m50,
  m51,
  m52,
  m53,
  m54,
  m55,
  m56,
  m57,
  m58,
];
for (const m of modules) if (typeof m.start === "function") m.start();

const api = {};
for (const m of modules)
  for (const k of Object.keys(m)) {
    if (k === "start" || Object.prototype.hasOwnProperty.call(api, k)) continue;
    const S = "set" + k[0].toUpperCase() + k.slice(1);
    // a variable's setter is setName, or setNameValue where setName was taken by an existing function
    const set = typeof m[S + "Value"] === "function" ? m[S + "Value"] : m[S];
    Object.defineProperty(api, k, {
      enumerable: true,
      get: () => m[k],
      set: typeof set === "function" ? (v) => set(v) : undefined,
    });
  }
window.__pr = api;
if (window.PR_EXPOSE)
  for (const k of Object.keys(api))
    Object.defineProperty(window, k, { ...Object.getOwnPropertyDescriptor(api, k), configurable: true });
