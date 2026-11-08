#!/usr/bin/env node
/*
 * Compares the app's predictions with OpenRocket's, flight by flight, on the same design files and the same stored
 * simulations (motor, launch site, weather, rail):
 *
 *   node build.js
 *   node validation/openrocket.js --jar OpenRocket-24.12.jar [design folders...] [--csv out.csv]
 *
 * Needs Java 17+ (javac) and OpenRocket's release jar
 * (https://github.com/openrocket/openrocket/releases/download/release-24.12/OpenRocket-24.12.jar).
 * Without design folders it uses the example designs bundled in the jar. ORFlights.java flies each stored simulation
 * with OpenRocket's own engine; the app (the built page, in headless Chromium) flies the same simulation the way it
 * does when you open that file and pick that run. Printed: each flight's apogee and top speed from both, and the median
 * and spread of the differences, for all flights and for those below Mach 0.8. Flights that can't be compared fairly
 * are listed with the reason: simulation extensions, a parachute opening before apogee, or motor data that differs
 * (more than 3% in total impulse) between the app's catalog and OpenRocket's.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const jar = opt("--jar");
const csvOut = opt("--csv");
if (!jar || !fs.existsSync(jar)) {
  console.error("usage: node validation/openrocket.js --jar OpenRocket-24.12.jar [design folders...] [--csv out.csv]");
  process.exit(2);
}
const root = path.join(__dirname, "..");
const page = path.join(root, "web", "pocket-rocket-flight-lab.html");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prfl-or-"));

// the designs: given folders, or OpenRocket's bundled examples
let dirs = args;
if (!dirs.length) {
  const ex = path.join(tmp, "examples");
  fs.mkdirSync(ex);
  execFileSync("unzip", ["-q", "-j", path.resolve(jar), "datafiles/examples/*.ork", "-d", ex]);
  dirs = [ex];
}
const files = dirs.flatMap((d) =>
  fs
    .readdirSync(d)
    .filter((f) => /\.ork$/i.test(f))
    .sort()
    .map((f) => path.join(d, f)),
);

// OpenRocket's flights
const build = path.join(tmp, "build");
execFileSync("javac", ["-cp", jar, "-d", build, path.join(__dirname, "openrocket", "ORFlights.java")]);
const orOut = execFileSync("java", ["-cp", `${jar}${path.delimiter}${build}`, "ORFlights", ...files], {
  maxBuffer: 1 << 26,
  stdio: ["ignore", "pipe", "ignore"],
}).toString();
const orRuns = orOut
  .split("\n")
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => (window.PR_EXPOSE = true));
  await p.goto("file://" + page);
  await p.waitForFunction(() => typeof window.simulate === "function");
  const rows = [];
  for (const r of orRuns) {
    if (r.error) continue;
    const b64 = fs.readFileSync(files.find((f) => path.basename(f) === r.file)).toString("base64");
    const app = await p.evaluate(
      async ([b64, name, simIndex]) => {
        window.PR_NO_ASK = false;
        L = defaultLaunch();
        siteCur = "";
        const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
        const xml = await unzipOrk(buf);
        const run = designRuns(xml, null).find((x) => x.i === simIndex);
        if (!run) return { err: "no such simulation" };
        if (!(await loadDesignXml(xml, name, buf, { pick: { kind: "run", i: run.i, cfg: run.cfg, name: run.name } })))
          return { err: "could not open" };
        const m = flightMotor(),
          mb = D.twoStage ? flightBoost() : null;
        const R = simulate(D, L, m, mb);
        return {
          apogee: R.st.maxAlt,
          maxVelocity: R.st.maxV,
          impulse: mstats(m).I + (mb ? mstats(mb).I : 0),
          error: R.st.error || null,
        };
      },
      [b64, r.file, r.sim - 1],
    );
    // flights the comparison can't be fair on, and why
    let skip = null;
    if (!(r.apogee > 0) || !(r.maxMach >= 0)) skip = "OpenRocket's run has no flight data";
    else if (app.err || app.error) skip = "the app can't fly it: " + (app.err || app.error);
    else if (r.extensions) skip = "uses OpenRocket simulation extensions or scripts";
    else if (r.deployedBeforeApogee) skip = "a parachute opens before apogee, so the apogee depends on the deployment";
    else if (Math.abs(app.impulse / r.impulse - 1) > 0.03)
      skip = `different motor data (total impulse ${app.impulse.toFixed(1)} N·s in the app, ${r.impulse.toFixed(1)} in OpenRocket)`;
    rows.push({
      file: r.file,
      sim: r.name,
      mach: r.maxMach ?? NaN,
      orApogee: r.apogee,
      appApogee: app.apogee,
      dApogee: app.apogee ? (100 * (app.apogee - r.apogee)) / r.apogee : null,
      orMaxV: r.maxVelocity,
      appMaxV: app.maxVelocity,
      dMaxV: app.maxVelocity ? (100 * (app.maxVelocity - r.maxVelocity)) / r.maxVelocity : null,
      skip,
    });
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  const f1 = (x) => (x == null || !isFinite(x) ? "" : x.toFixed(1));
  const sg = (x) => (x == null ? "" : (x >= 0 ? "+" : "") + f1(x) + "%");
  const ok = rows.filter((r) => !r.skip);
  console.log("file | simulation | max Mach | apogee OpenRocket, app (m) | apogee diff | max speed diff");
  for (const r of ok)
    console.log(
      `${r.file} | ${r.sim} | ${r.mach.toFixed(2)} | ${f1(r.orApogee)}, ${f1(r.appApogee)} | ${sg(r.dApogee)} | ${sg(r.dMaxV)}`,
    );
  console.log("\nNot compared:");
  for (const r of rows.filter((r) => r.skip)) console.log(`${r.file} | ${r.sim} | ${r.skip}`);
  const sum = (label, set) => {
    const d = set.map((r) => r.dApogee),
      v = set.map((r) => r.dMaxV);
    console.log(
      `${label}: ${set.length} flights; apogee difference median ${sg(median(d))}, typical (median absolute) ` +
        `${f1(median(d.map(Math.abs)))}%, within ±5%: ${d.filter((x) => Math.abs(x) <= 5).length}; ` +
        `max speed difference median ${sg(median(v))}`,
    );
  };
  console.log("");
  sum("All compared", ok);
  sum(
    "Below Mach 0.8",
    ok.filter((r) => r.mach < 0.8),
  );
  if (csvOut) {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    fs.writeFileSync(
      csvOut,
      "file,simulation,max_mach,openrocket_apogee_m,app_apogee_m,apogee_diff_pct,openrocket_max_v_ms,app_max_v_ms,max_v_diff_pct,not_compared_because\n" +
        rows
          .map((r) =>
            [
              q(r.file),
              q(r.sim),
              r.mach.toFixed(3),
              f1(r.orApogee),
              f1(r.appApogee),
              f1(r.dApogee),
              f1(r.orMaxV),
              f1(r.appMaxV),
              f1(r.dMaxV),
              q(r.skip || ""),
            ].join(","),
          )
          .join("\n") +
        "\n",
    );
    console.log("wrote " + csvOut);
  }
})();
