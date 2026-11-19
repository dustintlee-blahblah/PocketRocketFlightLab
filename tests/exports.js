// What the app writes out, checked by reading it back, through the buttons a person uses:
//   - the PDF flight report, for each built-in example: it opens as a PDF with the expected pages; its text has the
//     rocket, the motor and the apogee the Results tab shows, and no "NaN", "undefined" or "Infinity"; each page is
//     drawn to an image (test-results/exports) to look at;
//   - Download flight data (CSV): a heading for every column, numbers in every cell, time running forward, and the
//     highest altitude in it the apogee the Results tab shows;
//   - the Flight Log: a flight saved from an altimeter log, the log's backup exported, the log emptied, the backup
//     imported: the same flights come back; and its CSV has a row for the flight;
//   - Save a copy: the copy, opened with Open design file, flies to the same apogee.
// Needs pdftotext, pdfinfo and pdftoppm (poppler-utils).
// usage: node tests/exports.js [page.html] [--out dir]
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const file =
  args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ||
  path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html");
const OUT = path.resolve(opt("--out", path.join(__dirname, "..", "test-results", "exports")));
const JSPDF = path.join(__dirname, "..", "android", "app", "src", "main", "assets", "jspdf.umd.min.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pr-exp-"));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let checks = 0;
const fails = [];
const ok = (what, cond, got) => {
  checks++;
  if (!cond) fails.push(`${what}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ""}`);
};
const run = (cmd, ...a) => execFileSync(cmd, a, { encoding: "utf8" });
const num = (s) => parseFloat(String(s).replace(/[^\d.-]/g, ""));

(async () => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log("needs pdftotext (poppler-utils)");
      process.exit(1);
    }
  }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.route(/jspdf\.umd\.min\.js$/, (r) => r.fulfill({ path: JSPDF, contentType: "application/javascript" }));
  await p.route(/^https?:(?!.*jspdf)/, (r) => r.abort());
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + path.resolve(file));
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const d = document.getElementById("legal");
    if (d) d.hidden = true;
  });
  const download = async (click) => {
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), p.evaluate(click)]);
    const f = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(f);
    return f;
  };
  const results = () =>
    p.evaluate(() => ({
      apo: document.getElementById("apogee").textContent,
      name: lastSim.D.name,
      motor: lastSim.m.cn || lastSim.m.name,
      maxAlt: lastSim.st.maxAlt,
      staged: !!lastSim.st.staged,
    }));

  // ---- the PDF report and the flight data, for each example
  const n = await p.evaluate(() => EXAMPLES.length);
  for (let i = 0; i < n; i++) {
    await p.evaluate((i) => openExample(i), i);
    await p.waitForTimeout(1200);
    await p.evaluate(() => {
      runNow();
      showTab("results");
    });
    await p.waitForTimeout(1500);
    const R = await results();
    const w = `example ${i + 1} (${R.name})`;

    // PDF
    let pdf;
    try {
      pdf = await download(() => document.getElementById("exportbtn").click());
    } catch {
      ok(`${w}: PDF report downloads`, false, await p.evaluate(() => document.getElementById("exportmsg").textContent));
      continue;
    }
    ok(`${w}: PDF named after the design`, /flight-report\.pdf$/.test(path.basename(pdf)), path.basename(pdf));
    const info = run("pdfinfo", pdf),
      pages = +(info.match(/Pages:\s+(\d+)/) || [])[1];
    ok(`${w}: PDF has 2 to 12 pages`, pages >= 2 && pages <= 12, pages);
    const text = run("pdftotext", "-layout", pdf, "-");
    ok(
      `${w}: PDF has no NaN, undefined or Infinity`,
      !/\bNaN\b|undefined|Infinity/.test(text),
      (text.match(/.{0,30}(NaN|undefined|Infinity).{0,30}/) || [])[0],
    );
    ok(`${w}: PDF names the rocket`, text.includes(R.name.slice(0, 12)), R.name);
    ok(`${w}: PDF names the motor`, text.replace(/\s+/g, "").includes(String(R.motor).replace(/\s+/g, "")), R.motor);
    const apoDigits = String(R.apo).match(/[\d,]+/)[0];
    ok(`${w}: PDF's apogee is the Results tab's (${apoDigits})`, text.includes(apoDigits), apoDigits);
    const chute = await p.evaluate(() => !lastSim.st.noChute);
    if (chute) {
      ok(
        `${w}: PDF has the recovery plan`,
        /Recovery plan/.test(text) && /THE CHARGES, IN ORDER|IF A CHARGE FAILS/.test(text),
      );
      ok(`${w}: PDF's recovery plan has the time under each chute`, /TIME AND DRIFT UNDER EACH CHUTE/.test(text));
    }
    run("pdftoppm", "-r", "45", "-png", pdf, path.join(OUT, `example-${i + 1}-page`));

    // flight data (CSV)
    const csvF = await download(() => document.getElementById("exportcsvbtn").click());
    // a few "#" lines first say what the file is (the rocket, the motor, the conditions)
    const lines = fs
      .readFileSync(csvF, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter((l) => !l.startsWith("#"));
    const head = lines[0].split(","),
      rows = lines.slice(1).map((l) => l.split(","));
    ok(`${w}: flight data has 10+ columns and 50+ rows`, head.length >= 10 && rows.length >= 50, [
      head.length,
      rows.length,
    ]);
    ok(
      `${w}: flight data, every row as wide as the heading`,
      rows.every((r) => r.length === head.length),
    );
    // numbers everywhere but the Phase column (rail, flight, drogue, main ...)
    const ph = head.findIndex((h) => /^phase/i.test(h)),
      bad = rows.flatMap((r) => r.filter((c, k) => k !== ph)).find((c) => c !== "" && !isFinite(+c));
    ok(`${w}: flight data, numbers in every cell`, bad === undefined, bad);
    if (ph >= 0)
      ok(
        `${w}: flight data, a phase on every row`,
        rows.every((r) => /^[a-z ]+$/i.test(r[ph])),
      );
    const ti = head.findIndex((h) => /^time/i.test(h)),
      ai = head.findIndex((h) => /^altitude/i.test(h));
    ok(`${w}: flight data has time and altitude columns`, ti >= 0 && ai >= 0, head.slice(0, 6));
    if (ti >= 0)
      ok(
        `${w}: flight data, time runs forward`,
        rows.every((r, k) => k === 0 || +r[ti] >= +rows[k - 1][ti]),
      );
    if (ai >= 0) {
      const top = Math.max(...rows.map((r) => +r[ai]).filter(isFinite)),
        shown = num(apoDigits);
      ok(`${w}: flight data's highest altitude is the apogee shown (${shown})`, Math.abs(top / shown - 1) < 0.01, top);
    }
  }

  // ---- the Flight Log: save a flight from an altimeter log, export the backup, empty the log, import it back
  await p.evaluate(() => openExample(EXAMPLES.length - 1));
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    runNow();
    showTab("results");
    flSaveAll({});
    renderFlightLog();
  });
  const logText = await p.evaluate(() => {
    const o = lastSim.out,
      rows = [];
    for (let i = 0; i < o.t.length && o.t[i] < 60; i++)
      if (!rows.length || o.t[i] - rows[rows.length - 1][0] >= 0.05) rows.push([o.t[i], o.alt[i] / 0.3048]);
    return (
      "Jolly Logic AltimeterThree\nTime (s),Altitude (ft)\n" +
      rows.map(([t, a]) => `${t.toFixed(2)},${Math.round(a)}`).join("\n")
    );
  });
  const logF = path.join(tmp, "flight.csv");
  fs.writeFileSync(logF, logText);
  await p.setInputFiles("#flaltfile", logF);
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById("altok").click());
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('#cmpbtns [data-c="save"]').click());
  await p.waitForTimeout(800);
  const before = await p.evaluate(() => JSON.stringify(flList()));
  ok("Flight Log: a flight saved from an altimeter log", JSON.parse(before).length === 1, JSON.parse(before).length);
  const bak = await download(() => document.getElementById("flexp").click());
  const j = JSON.parse(fs.readFileSync(bak, "utf8"));
  ok("Flight Log backup: a flight-log file", j.kind === "flight-log" && j.designs, j.kind);
  const flcsv = await download(() => document.getElementById("flcsv").click());
  const fl = fs.readFileSync(flcsv, "utf8").trim().split(/\r?\n/);
  ok("Flight Log CSV: a heading and the flight", fl.length === 2, fl.length);
  await p.evaluate(() => {
    flSaveAll({});
    renderFlightLog();
  });
  ok("Flight Log: emptied", (await p.evaluate(() => flList().length)) === 0);
  await p.setInputFiles("#flimp", bak);
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => JSON.stringify(flList()));
  ok("Flight Log backup: imported back, the same flights", after === before, after.slice(0, 120));

  // ---- Save a copy, then open it with Open design file: the same flight
  const apo0 = (await results()).maxAlt;
  const copy = await download(async () => {
    document.getElementById("savecopy").click();
    await new Promise((r) => setTimeout(r, 300));
    document.getElementById("savename").value = "exports-copy";
    document.getElementById("nameok").click();
  });
  ok("Save a copy: a .ork file", /\.ork$/i.test(copy), path.basename(copy));
  await p.evaluate(() => showTab("rocket"));
  await p.setInputFiles("#orkfile", copy);
  await p.waitForTimeout(2500);
  await p.evaluate(() => runNow());
  await p.waitForTimeout(1500);
  const R2 = await results();
  ok("Save a copy: opens again", (await p.evaluate(() => (SOURCE && SOURCE.name) || "")).includes("exports-copy"));
  ok("Save a copy: flies to the same apogee", Math.abs(R2.maxAlt / apo0 - 1) < 1e-6, [R2.maxAlt, apo0]);

  ok("no page errors", errs.length === 0, errs.slice(0, 3));
  await b.close();
  console.log(`${checks} checks, ${fails.length} failed; PDF pages drawn in ${path.relative(process.cwd(), OUT)}`);
  if (fails.length) {
    console.log("  " + fails.join("\n  "));
    process.exit(1);
  }
})();
