// Whole-app walkthrough at phone size: every tab with its panels opened, each part of the builder, the add-a-part and
// parts-library windows, the Motor tab, Results with the recovery plan, Monte Carlo and the flight animation, the
// Flight Log and its forms, an altimeter log and Flight vs prediction, the settings menu, the Learn page's levels, About
// and the legal text. Each screen is shown in light and dark, screenshotted, and checked:
//   - no page error and no console error;
//   - no chart left blank (a visible canvas never sized or drawn);
//   - nothing wider than the screen (the page can't scroll sideways, and no visible element sticks out past either
//     edge unless it sits in something that scrolls sideways on purpose).
// Screenshots go to test-results/walkthrough/<light|dark>/, with index.html to look through them side by side.
// usage: node tests/walkthrough.js [page.html] [--out dir] [--width 412] [--only light|dark]
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const file =
  args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ||
  path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html");
const OUT = path.resolve(opt("--out", path.join(__dirname, "..", "test-results", "walkthrough")));
const W = +opt("--width", 412);
const ONLY = opt("--only", null);

// a few seconds of an altimeter log from the open design's own flight, in the AltimeterThree's layout
function logFromSim() {
  const o = lastSim.out,
    FT = 0.3048,
    rows = [];
  for (let i = 0; i < o.t.length; i++) {
    if (o.t[i] > (lastSim.st.tLand || 60)) break;
    if (!rows.length || o.t[i] - rows[rows.length - 1][0] >= 0.05) rows.push([o.t[i], o.alt[i] / FT]);
  }
  return (
    "Jolly Logic AltimeterThree\nTime (s),Altitude (ft)\n" +
    rows.map(([t, a]) => `${t.toFixed(2)},${Math.round(a)}`).join("\n")
  );
}

/** what's wider than the screen: the page itself, and visible elements past either edge (not inside a sideways scroller) */
function layoutProblems() {
  const BOXES = ".panel, .mbox, .cmpban, .bldcol, .setmenu, .flrow, .wx, .report, .rsolist, .sitemgr, .bpcard";
  const vw = document.documentElement.clientWidth,
    out = [];
  if (document.documentElement.scrollWidth > vw + 1)
    out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
  const scrolls = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/auto|scroll/.test(s.overflowX)) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll("body *")) {
    if (out.length > 8) break;
    if (el.closest("[hidden]") || el.tagName === "OPTION" || el.tagName === "SCRIPT") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || (s.position === "fixed" && r.right <= 0)) continue;
    // past the edge of the box it sits in (a panel, a dialog, a banner): text running out of its frame
    const box = el.parentElement && el.parentElement.closest(BOXES);
    if (box && !scrolls(el) && !(el.matches(BOXES) && el === box)) {
      const br = box.getBoundingClientRect();
      const pr = el.parentElement.getBoundingClientRect(),
        parentOut = el.parentElement !== box && (pr.right > br.right + 1 || pr.left < br.left - 1);
      if (!parentOut && (r.right > br.right + 1 || r.left < br.left - 1)) {
        const id = el.id
          ? "#" + el.id
          : el.className && typeof el.className === "string"
            ? "." + el.className.split(" ")[0]
            : "";
        const bid = box.id ? "#" + box.id : "." + String(box.className).split(" ")[0];
        out.push(
          `${el.tagName.toLowerCase()}${id} spans ${Math.round(r.left)}..${Math.round(r.right)} past its ${bid} (${Math.round(br.left)}..${Math.round(br.right)}): "${(el.textContent || "").trim().slice(0, 40)}"`,
        );
        continue;
      }
    }
    if ((r.right > vw + 1 || r.left < -1) && !scrolls(el)) {
      const id = el.id
        ? "#" + el.id
        : el.className && typeof el.className === "string"
          ? "." + el.className.split(" ")[0]
          : "";
      out.push(
        `${el.tagName.toLowerCase()}${id} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}: "${(el.textContent || "").trim().slice(0, 40)}"`,
      );
    }
  }
  // a chart left blank: a visible canvas that was never sized or drawn
  for (const c of document.querySelectorAll("canvas")) {
    const r = c.getBoundingClientRect();
    if (c.closest("[hidden]") || r.width < 60 || r.height < 60 || r.bottom < 0 || r.top > innerHeight * 6) continue;
    if (!c.width || !c.height) {
      out.push(
        `canvas${c.id ? "#" + c.id : ""} shown ${Math.round(r.width)}×${Math.round(r.height)} but never sized (blank)`,
      );
      continue;
    }
    let ctx = null;
    try {
      ctx = c.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) continue; // a 3D view
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i]) ink++;
    if (ink < 20) out.push(`canvas${c.id ? "#" + c.id : ""} is blank`);
  }
  return out;
}

/** opens everything collapsed on the current screen: buttons marked aria-expanded="false" and <details> */
function expandAll() {
  let n = 0;
  for (let pass = 0; pass < 3; pass++) {
    const shut = [...document.querySelectorAll('[aria-expanded="false"]')].filter(
      (b) =>
        !b.closest("[hidden]") &&
        b.offsetParent &&
        !b.closest("#setmenu") &&
        !b.closest(".modal") &&
        b.id !== "gearbtn",
    );
    for (const b of shut) {
      b.click();
      n++;
    }
    for (const d of document.querySelectorAll("details:not([open])")) {
      d.open = true;
      n++;
    }
    if (!shut.length) break;
  }
  return n;
}

/** closes whatever window or menu is open */
function closeAll() {
  for (let i = 0; i < 6; i++) if (!(window.prBack && window.prBack())) break;
  for (const m of document.querySelectorAll(".modal:not([hidden]), #learn:not([hidden]), #about:not([hidden])"))
    m.hidden = true;
  const sm = document.getElementById("setmenu");
  if (sm) sm.hidden = true;
  document.body.style.overflow = "";
}

// the screens: [name, what to do on the page (a function run in the page, or an async function given the page)]
const SCREENS = [
  [
    "flight",
    () => {
      showTab("flight");
    },
  ],
  [
    "flight-open",
    () => {
      showTab("flight");
      expandAll();
    },
  ],
  [
    "rocket",
    () => {
      showTab("rocket");
    },
  ],
  ["rocket-parts", "parts"], // each part of the builder's tree in turn
  [
    "rocket-whole-open",
    () => {
      showTab("rocket");
      document.querySelector("#bldtree .bldrow")?.click();
      expandAll();
    },
  ],
  [
    "add-part",
    () => {
      showTab("rocket");
      document.querySelector(".bldaddtoggle").click();
    },
  ],
  [
    "parts-library",
    () => {
      showTab("rocket");
      [...document.querySelectorAll("#bldtree .bldrow")].find((r) => /body|tube/i.test(r.textContent))?.click();
      document.querySelector("[data-lib]").click();
    },
  ],
  [
    "motor",
    () => {
      showTab("motor");
    },
  ],
  [
    "motor-maker",
    () => {
      showTab("motor");
      document.querySelectorAll("#fbrand button")[1]?.click();
    },
  ],
  [
    "motor-open",
    () => {
      showTab("motor");
      document.querySelectorAll("#fbrand button")[0]?.click();
      expandAll();
    },
  ],
  [
    "results",
    () => {
      showTab("results");
    },
  ],
  [
    "results-open",
    () => {
      showTab("results");
      expandAll();
    },
  ],
  [
    "recovery-backup",
    () => {
      Object.assign(BLD.settings, { recCfg: "two", a2Apo: 2, a1Model: "mw-rrc3s", bayLen: 0.3, mainRating: 500 });
      bldApply();
      runNow();
      showTab("results");
      const f = document.querySelector('[data-fold="recbody"]');
      if (f.getAttribute("aria-expanded") !== "true") f.click();
      document.getElementById("recpanel").scrollIntoView();
    },
  ],
  [
    "monte-carlo",
    async (p) => {
      await p.evaluate(() => {
        showTab("results");
        const t = document.getElementById("mctog");
        if (t && t.getAttribute("aria-expanded") !== "true") t.click();
        document.getElementById("mcpanel").scrollIntoView();
      });
      await p.waitForTimeout(4000);
    },
  ],
  [
    "animation",
    () => {
      showTab("results");
      document.getElementById("animbtn").click();
    },
  ],
  [
    "flight-log",
    () => {
      showTab("results");
      document.getElementById("flpanel").scrollIntoView();
    },
  ],
  [
    "compare-real-flight",
    () => {
      showTab("results");
      document.getElementById("flcmp").click();
    },
  ],
  [
    "enter-by-hand",
    () => {
      showTab("results");
      flOpen(null);
    },
  ],
  [
    "enter-by-hand-readings",
    () => {
      showTab("results");
      flOpen(null);
      const s = document.getElementById("fl-alti");
      s.value = "jl-two";
      s.dispatchEvent(new Event("change"));
    },
  ],
  ["altimeter-log", "altlog"],
  ["flight-vs-prediction", "compare"],
  [
    "settings",
    () => {
      document.getElementById("gearbtn").click();
    },
  ],
  [
    "settings-open",
    () => {
      document.getElementById("gearbtn").click();
      for (const id of ["s-profbtn", "s-colorbtn", "s-supbtn"]) document.getElementById(id)?.click();
    },
  ],
  ["learn", "learn"],
  [
    "about",
    () => {
      document.getElementById("gearbtn").click();
      document.getElementById("s-about").click();
    },
  ],
  [
    "legal",
    () => {
      document.getElementById("gearbtn").click();
      document.getElementById("s-legal").click();
    },
  ],
];

(async () => {
  const b = await chromium.launch();
  const problems = [],
    shots = { light: [], dark: [] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-walk-"));
  for (const scheme of ["light", "dark"]) {
    if (ONLY && ONLY !== scheme) continue;
    fs.mkdirSync(path.join(OUT, scheme), { recursive: true });
    const p = await b.newPage({ viewport: { width: W, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
    let errs = [];
    p.on("pageerror", (e) => errs.push("page error: " + e.message));
    p.on(
      "console",
      (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push("console: " + m.text()),
    );
    await p.route(/^https?:/, (r) => r.abort());
    await p.addInitScript(`window.expandAll = ${expandAll.toString()}; window.closeAll = ${closeAll.toString()};`);
    await p.addInitScript(() => {
      window.PR_EXPOSE = true;
      window.PR_NO_ASK = true;
      localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
      sessionStorage.setItem("rfs-splash", "1");
    });
    await p.goto("file://" + path.resolve(file));
    await p.waitForTimeout(1500);
    // a dual-deploy example: the most panels have something to show
    await p.evaluate(() => {
      const d = document.getElementById("legal");
      if (d) d.hidden = true;
      return openExample(EXAMPLES.length - 1);
    });
    await p.waitForTimeout(1200);
    await p.evaluate(() => runNow());
    await p.waitForTimeout(1500);
    let k = 0;
    const shoot = async (name, full) => {
      k++;
      const f = `${String(k).padStart(2, "0")}-${name}.png`;
      await p.waitForTimeout(500);
      const bad = await p.evaluate(layoutProblems);
      for (const x of bad) problems.push(`${scheme} ${name}: ${x}`);
      for (const x of errs) problems.push(`${scheme} ${name}: ${x}`);
      errs = [];
      await p.screenshot({ path: path.join(OUT, scheme, f), fullPage: full });
      shots[scheme].push([name, f]);
    };
    for (const [name, how] of SCREENS) {
      try {
        await p.evaluate(closeAll);
        await p.evaluate(() => window.scrollTo(0, 0));
        if (how === "parts") {
          const n = await p.evaluate(() => {
            showTab("rocket");
            return document.querySelectorAll("#bldtree .bldrow").length;
          });
          for (let i = 0; i < n; i++) {
            const label = await p.evaluate((i) => {
              const r = document.querySelectorAll("#bldtree .bldrow")[i];
              r.click();
              return (r.textContent || "part")
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .slice(0, 24);
            }, i);
            await shoot(`${name}-${i + 1}-${label}`, true);
          }
          continue;
        }
        if (how === "learn") {
          const lvs = await p.evaluate(() => {
            document.getElementById("gearbtn").click();
            document.getElementById("s-learn").click();
            return [...document.querySelectorAll("#learn [data-lv]")].map((x) => x.dataset.lv);
          });
          for (const lv of lvs) {
            await p.evaluate((lv) => document.querySelector(`#learn [data-lv="${lv}"]`).click(), lv);
            await shoot(`learn-${lv}`, false);
            await p.evaluate(() => document.querySelector("#learn .ch")?.click());
            await shoot(`learn-${lv}-chapter`, false);
            await p.evaluate(() => document.querySelector("#learn .crumb")?.click());
          }
          continue;
        }
        if (how === "altlog" || how === "compare") {
          const log = path.join(dir, "flight.csv");
          fs.writeFileSync(log, await p.evaluate(logFromSim));
          await p.evaluate(() => showTab("results"));
          await p.setInputFiles("#flaltfile", log);
          await p.waitForTimeout(1500);
          if (how === "compare") {
            await p.evaluate(() => document.getElementById("altok").click());
            await p.waitForTimeout(2000);
          }
          await shoot(name, false);
          continue;
        }
        if (typeof how === "function" && how.length === 1) await how(p);
        else await p.evaluate(how);
        await p.waitForTimeout(700);
        const modal = await p.evaluate(
          () =>
            !!document.querySelector(
              ".modal:not([hidden]), #learn:not([hidden]), #about:not([hidden]), #setmenu:not([hidden])",
            ),
        );
        await shoot(name, !modal);
      } catch (e) {
        problems.push(`${scheme} ${name}: ${e.message.split("\n")[0]}`);
      }
    }
    await p.close();
  }
  await b.close();

  // a page to look through them: light and dark side by side
  const names = (shots.light.length ? shots.light : shots.dark).map((s) => s[0]);
  const img = (sc, i) => (shots[sc][i] ? `<img loading="lazy" src="${sc}/${shots[sc][i][1]}">` : "<div></div>");
  fs.writeFileSync(
    path.join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Walkthrough</title>
<style>body{font:14px system-ui;margin:16px;background:#888}h2{margin:24px 0 6px;color:#fff}div.r{display:flex;gap:12px;align-items:flex-start}img{width:${W}px;max-width:48vw;border:1px solid #444;background:#fff}</style>
<h1>Walkthrough at ${W} px</h1>${problems.length ? `<pre style="background:#fee;padding:8px">${problems.join("\n").replace(/</g, "&lt;")}</pre>` : "<p>No problems found.</p>"}
${names.map((n, i) => `<h2>${n}</h2><div class="r">${img("light", i)}${img("dark", i)}</div>`).join("\n")}`,
  );
  const total = shots.light.length + shots.dark.length;
  console.log(`${total} screenshots in ${path.relative(process.cwd(), OUT)} (index.html)`);
  if (problems.length) {
    console.log(`${problems.length} problem(s):\n  ` + problems.join("\n  "));
    process.exit(1);
  }
  console.log("no problems");
})();
