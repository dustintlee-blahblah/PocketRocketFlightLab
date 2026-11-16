/**
 * The last run as a data file: every recorded moment of the flight as one row of a CSV (time, height, speeds, Mach
 * number, acceleration, thrust, drag, weight, balance, stability, attitude, drift and the air), in the display units.
 */
import { APP_BUILD } from "../core/start.js";
import { SOURCE } from "../files/save.js";
import { downloadsNS } from "./pdf-report.js";
import { lastSim } from "../ui/results.js";
import { toDisp, uname } from "../ui/units.js";
/**
 * The columns: [heading, display dimension (or a unit in words), the value at sample i, decimals].
 * @param {object} out the flight's time series
 * @param {object} X out.more, the rest of each moment's state
 * @param {number} dia the rocket's diameter, m
 * @returns {Array[]}
 */
function columns(out, X, dia) {
  const d = (key, dim, a, dec) => [key, dim, (i) => a[i], dec],
    // under a parachute the rocket's attitude isn't followed
    under = (i) => !["rail", "flight", "tumbling"].includes(X.phase[i]);
  return [
    d("Time", "time", out.t, 3),
    d("Altitude", "alt", out.alt, 1),
    d("Vertical speed", "speed", out.vel, 2),
    d("Total speed", "speed", X.speed, 2),
    d("Horizontal speed", "speed", X.hspeed, 2),
    d("Airspeed", "speed", out.va, 2),
    d("Mach number", "none", X.mach, 4),
    d("Acceleration along the rocket", "acc", out.acc, 3),
    d("Thrust", "force", out.thrust, 2),
    d("Drag", "force", X.drag, 3),
    d("Drag coefficient", "none", X.cd, 4),
    d("Weight", "mass", X.mass, 4),
    d("CG from nose tip", "len", X.cg, 2),
    d("CP from nose tip", "len", X.cp, 2),
    ["Stability margin", "cal", (i) => (X.cp[i] - X.cg[i]) / dia, 3],
    d("Angle of attack", "deg", out.aoa, 2),
    ["Tilt from vertical", "deg", (i) => (under(i) ? NaN : out.pitch[i]), 2],
    ["Roll rate", "rev/s", (i) => (under(i) ? NaN : out.roll[i] / (2 * Math.PI)), 3],
    d("Drift upwind", "alt", out.drift, 1),
    d("Drift crosswind", "alt", out.cross, 1),
    d("Dynamic pressure", "qpress", X.q, 4),
    d("Air temperature", "temp", X.temp, 1),
    d("Air pressure", "press", X.press, 3),
    ["Air density", "kg/m³", (i) => X.rho[i], 5],
  ];
}
/**
 * The last run as CSV text: a few comment lines (rocket, motor, the flight's main times), a heading row, then one row
 * per recorded moment. A value that doesn't apply at a moment (drag under a parachute, say) is left empty.
 * @returns {string}
 */
function flightCsv() {
  const { out, st, m, D } = lastSim,
    X = out.more;
  const cols = columns(out, X, D.diameter || 2 * (D.R || 0)),
    unit = (dim) => (["cal", "rev/s", "kg/m³"].includes(dim) ? dim : uname(dim)),
    conv = (v, dim) => (["cal", "rev/s", "kg/m³"].includes(dim) ? v : toDisp(v, dim)),
    q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const tm = (label, t) => (t != null && isFinite(t) ? `# ${label}: ${t.toFixed(2)} s\n` : "");
  let s =
    `# Pocket Rocket Flight Lab (build ${APP_BUILD}) simulated flight\n` +
    `# Rocket: ${String(D.name || "rocket").replace(/\s+/g, " ")}\n` +
    `# Motor: ${String((m.mfr || m.brand ? (m.mfr || m.brand) + " " : "") + (m.name || "")).replace(/\s+/g, " ")}\n` +
    `# Run: ${new Date(lastSim.when).toISOString()}\n` +
    tm("Off the rail", st.offRailT) +
    tm("Apogee", st.tApo) +
    tm("Main parachute", st.tMain) +
    tm("Landing", st.tLand) +
    `# Acceleration is what an accelerometer on the rocket reads along its length (thrust less drag, without gravity).\n` +
    `# Drift is from the pad: upwind positive, downwind negative.\n` +
    `# A computer estimate, not a measurement. Empty cells: the value doesn't apply at that moment.\n`;
  s += cols.map(([k, dim]) => q(unit(dim) ? `${k} (${unit(dim)})` : k)).join(",") + ",Phase\n";
  for (let i = 0; i < out.t.length; i++)
    s +=
      cols
        .map(([, dim, at, dec]) => {
          const v = conv(at(i), dim);
          return v != null && isFinite(v) ? String(+v.toFixed(dec)) : "";
        })
        .join(",") +
      "," +
      (X.phase[i] || "") +
      "\n";
  return s;
}
/**
 * Saves the last run's data file.
 */
async function exportCsv() {
  const msg = document.getElementById("exportmsg");
  msg.textContent = "";
  if (!lastSim || !lastSim.out.more) {
    msg.textContent = "Run a simulation first.";
    return;
  }
  if (!downloadsNS) {
    msg.textContent = "Saving files isn’t available in this view.";
    return;
  }
  const base = SOURCE && SOURCE.name ? SOURCE.name.replace(/\.(ork|rkt)$/i, "") : lastSim.D.name;
  const name =
    `${base}-${lastSim.m.cn || lastSim.m.name}-flight-data`
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") + ".csv";
  try {
    const res = await downloadsNS.save({ filename: name, data: new TextEncoder().encode(flightCsv()).buffer });
    msg.textContent = res.status === "saved" ? `Saved ${name}.` : "Choose where to save the data file.";
  } catch (e) {
    msg.textContent =
      e && e.code === "declined"
        ? "Save cancelled."
        : `Couldn’t save the data file${e && e.message ? ": " + e.message : "."}`;
  }
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("exportcsvbtn").onclick = exportCsv;
}
