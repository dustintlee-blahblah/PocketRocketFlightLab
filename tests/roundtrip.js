// Save-and-reopen test for the rocket builder. A part is defined in three places (the builder's file writer, its file
// reader and the flight importer); when they disagree, a design changes when it is saved. For every kind of part and
// every field its editor shows, this changes the field through the real input and checks that:
//   1. the value reached the part (the field is wired up);
//   2. the part comes back the same from a save and a reopen (nothing is lost or altered);
//   3. the reopened design flies the same (weight, balance, drag and the flight itself).
// The save and the reopen are the app's own (Save changes, then opening the file it wrote), so what the app keeps
// beside the OpenRocket XML (rounded nose tips, rocket-wide settings, overrides switched off) is covered too. Each
// kind of part as first added is also saved a second time, which must write the same design.
// usage: node tests/roundtrip.js [page.html] [type,type...]     (default page: web/pocket-rocket-flight-lab.html)
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

// each kind of part: [name, where it goes ("stage part" or a kid of the body tube), what to set on a new one]
const TYPES = [
  ["nose", "part"],
  ["tube", "part"],
  ["transition", "part"],
  ["fins", "kid"],
  ["mount", "kid"],
  ["inner", "kid"],
  ["ring", "kid"],
  ["bulkhead", "kid"],
  ["coupler", "kid"],
  ["lug", "kid"],
  ["rail lug", "kid", { type: "lug", set: { kind: "r1010", od: 0.0097, id_: 0, w: 0.0102, mat: "Delrin" } }],
  ["buttons", "kid"],
  ["fly-away guide", "kid", { type: "bump", set: { shape: "flyaway", h: 0.02, len: 0.06, mass: 0.1 } }],
  ["chute", "kid"],
  ["streamer", "kid"],
  ["cord", "kid"],
  ["mass", "kid"],
  ["bump", "kid"],
  ["stage", "stage"],
  ["rocket", "root"],
];

/* Differences that are not losses, each for a stated reason. A field named here is still checked by the flight
   (check 3). */
const SAME = [
  // where the model came from (a new design, or a file), not part of the design
  (k) => k === "src",
  // a trapezoid's tip chord and sweep mean nothing to a fin of another shape, and aren't saved for one
  (k, part) => (k === "tip" || k === "sweep") && part.type === "fins" && part.shape !== "trapezoid",
  // a position can be written from either end of the parent; the reader keeps the file's choice
  (k) => k === "pos" || k === "ref",
  // an Override switch with no value entered has nothing to save
  (k, part) => /On$/.test(k) && !(+part[k.slice(0, -2)] > 0),
  // a switch that is on is saved as its value alone: a value from a file has no switch, and counts as on
  (k, part, back) => /On$/.test(k) && part[k] === true && back[k] === undefined,
  // the lug's width is filled in from its type when it isn't stored
  (k, part) => k === "w" && part.type === "lug",
];

(async () => {
  const [fileArg, only] = process.argv.slice(2);
  const file =
    fileArg && !/,/.test(fileArg) && /\.html$/.test(fileArg)
      ? fileArg
      : path.join(__dirname, "..", "web", "pocket-rocket-flight-lab.html");
  const pick = only || (fileArg && !/\.html$/.test(fileArg) ? fileArg : "");
  const browser = await chromium.launch();
  const fails = [];
  let checks = 0,
    refused = 0;
  for (const [label, where, spec] of TYPES) {
    if (pick && !pick.split(",").includes(label)) continue;
    const p = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    p.on("pageerror", (e) => fails.push(`${label}: page error: ${e.message}`));
    await p.route(/^https?:/, (r) => r.abort());
    await p.addInitScript(() => {
      window.PR_EXPOSE = true;
      window.PR_NO_ASK = true;
      localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    });
    await p.goto("file://" + path.resolve(file));
    await p.waitForFunction(() => typeof bldApply === "function");
    await p.evaluate(() => {
      document.getElementById("splash")?.remove();
      document.querySelectorAll(".legal").forEach((e) => (e.hidden = true));
      bldNewDesign();
    });
    await p.waitForTimeout(300);
    // helpers in the page
    const ok = await p.evaluate(
      ([label, where, spec]) => {
        const T = (window.T = { where });
        const each = (model, f) => {
          for (const st of model.stages)
            for (const q of st.parts)
              (function w(n) {
                f(n);
                (n.kids || []).forEach(w);
              })(q);
        };
        const type = (spec && spec.type) || label;
        T.all = (model, t) => {
          const a = [];
          each(model, (n) => n.type === t && a.push(n));
          return a;
        };
        T.target = () =>
          where === "root" ? BLD : where === "stage" ? BLD.stages[0] : T.all(BLD, type).find((n) => n.id === T.id);
        // a part's own fields. Left out: its children, its id, and a mount's motor type (the file names it; a motor
        // just chosen doesn't carry it). For the rocket and a stage, the rocket-wide settings go with it.
        T.strip = (o) =>
          JSON.stringify(where === "root" || where === "stage" ? { ...o, settings: BLD.settings } : o, (k, v) =>
            k === "kids" ||
            k === "parts" ||
            k === "stages" ||
            k === "id" ||
            (k === "type" && /^(single|reload|hybrid)$/.test(v))
              ? undefined
              : v,
          );
        // what the design flies like: weight, balance, drag at two speeds and the flight's main figures
        T.sig = () => {
          bldApply();
          const m = curMotor(),
            A = aero(D),
            atm = atmosphere(L, 0),
            st = simulate(D, L, m, null, { noRef: true }).st,
            r = (x) => (typeof x === "number" && isFinite(x) ? +x.toPrecision(9) : x);
          return {
            dryMass: r(D.dryMass),
            dryCg: r(D.dryCg),
            length: r(D.length),
            cd03: r(cdParts(A, 0.3 * atm.a, atm, 0).cd),
            cd2: r(cdParts(A, 2 * atm.a, atm, 0).cd),
            cp: r(stability(D, m).cp),
            apogee: r(st.maxAlt),
            maxV: r(st.maxV),
            offRail: r(st.offRail),
            tApo: r(st.tApo),
            // steady descent rates, not the touchdown speed: that is one instant of a gusty wind, and moves with the
            // last digit of anything
            drogueRate: r(st.drogueRate ?? 0),
            mainRate: r(st.mainRate ?? 0),
          };
        };
        // which one of its kind the part is, so it can be found again in the reopened design
        T.index = () => T.all(BLD, type).findIndex((n) => n.id === T.id);
        T.at = (i) => (where === "root" ? BLD : where === "stage" ? BLD.stages[0] : T.all(BLD, type)[i]);
        if (where === "part" || where === "kid") {
          const tube = T.all(BLD, "tube")[0],
            R = tube.od / 2;
          let t = spec ? null : T.all(BLD, type)[0];
          if (!t) {
            t = { ...bldNew(type, R), ...((spec && spec.set) || {}) };
            if (where === "part") BLD.stages[0].parts.push(t);
            else tube.kids.push(t);
          }
          T.id = t.id;
          setBldSel(t.id);
        } else setBldSel(where === "root" ? BLD_ROOT : BLD.stages[0].id);
        bldChanged(true);
        bldRender();
        return document.querySelectorAll("[id^=bf-]").length;
      },
      [label, where, spec || null],
    );
    if (!ok) {
      fails.push(`${label}: the editor shows no fields`);
      await p.close();
      continue;
    }
    /* The app's own save and reopen. Save changes writes the file (a download here); the file is opened again as the
       file picker would open it. Returns the flight before and after, and the part as reopened. */
    const save = async () => {
      const [dl] = await Promise.all([
        p.waitForEvent("download", { timeout: 20000 }),
        p.evaluate(
          (nm) => void saveDesignFile(false, SOURCE ? {} : { name: nm }),
          "roundtrip-" + label.replace(/\W+/g, "-"),
        ),
      ]);
      return fs.readFileSync(await dl.path()).toString("base64");
    };
    const reopen = async (twice) => {
      const pre = await p.evaluate(() => ({ before: T.sig(), i: T.index() }));
      let b64;
      try {
        b64 = await save();
      } catch (e) {
        const why = await p.evaluate(() => document.getElementById("savemsg").textContent);
        // the app refuses to save a design it has found a problem in (a mount wider than its tube), and says so
        if (/Fix these before saving/.test(why)) return { refused: why };
        return { err: "it can't be saved: " + (why || e.message.split("\n")[0]) };
      }
      const open = (b64, i) =>
        p.evaluate(
          async ([b64, i]) => {
            const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
              xml = await unzipOrk(u.buffer);
            await openDesignAsk(xml, SOURCE ? SOURCE.name : "roundtrip.ork", u.buffer);
            const t = T.at(i);
            let after = null,
              err = "";
            try {
              after = T.sig();
            } catch (e) {
              err = e.message;
            }
            return { after, err, twin: t ? T.strip(t) : null, xml };
          },
          [b64, i],
        );
      const r = { ...pre, ...(await open(b64, pre.i)) };
      if (twice && !r.err) {
        // a second save of the reopened design: the same parts and the same flight again
        const r2 = await open(await save(), pre.i);
        r.again =
          r2.err ||
          (r2.twin !== r.twin
            ? "the part differs"
            : JSON.stringify(r2.after) !== JSON.stringify(r.after)
              ? "it flies differently"
              : "");
      }
      return r;
    };
    // back to a design as it was (still open as the file just saved), with the part under test selected again:
    // opening a file selects the rocket
    const back = (snap) =>
      p.evaluate((snap) => {
        setBLD(JSON.parse(snap));
        bldChanged(true);
        setBldSel(T.where === "root" ? BLD_ROOT : T.where === "stage" ? BLD.stages[0].id : T.id);
        bldRender();
      }, snap);
    const snap0 = await p.evaluate(() => JSON.stringify(BLD));
    // the part as built, before any field is touched
    const basePart = await p.evaluate(() => T.strip(T.target()));
    const base = { ...(await reopen(true)), part: basePart };
    const cmp = (name, r, part) => {
      checks++;
      if (r.refused) return refused++;
      if (r.err) return fails.push(`${label} ${name}: after save and reopen, ${r.err}`);
      const d = Object.keys(r.before).filter(
        (k) =>
          r.before[k] !== r.after[k] &&
          !(Math.abs(r.before[k] - r.after[k]) <= 1e-6 * Math.max(1, Math.abs(r.before[k]))),
      );
      if (d.length)
        fails.push(
          `${label} ${name}: flies differently after save and reopen: ${d.map((k) => `${k} ${r.before[k]} → ${r.after[k]}`).join(", ")}`,
        );
      if (r.again) fails.push(`${label} ${name}: a second save and reopen changes the design: ${r.again}`);
      if (part) {
        if (!r.twin) return fails.push(`${label} ${name}: the part is missing after save and reopen`);
        const a = JSON.parse(part),
          b = JSON.parse(r.twin);
        // the same value: empty either way, numbers to a part in a million, and a group of settings field by field
        const empty = (v) => v === false || v == null || v === "" || v === 0;
        const same = (k, x, y, A, B) => {
          if (SAME.some((f) => f(k, A, B))) return true;
          if (empty(x) && empty(y)) return true;
          if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x));
          if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x))
            return Object.keys({ ...x, ...y }).every((kk) => same(kk, x[kk], y[kk], x, y));
          return JSON.stringify(x) === JSON.stringify(y);
        };
        const lost = Object.keys(a).filter((k) => !same(k, a[k], b[k], a, b));
        if (lost.length)
          fails.push(
            `${label} ${name}: not kept by save and reopen: ${lost.map((k) => `${k} ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`).join(", ")}`,
          );
      }
    };
    cmp("(as added)", base, base.part);
    await back(snap0);
    await p.waitForTimeout(100);
    // the editor must be showing the part under test
    const showing = await p.evaluate(
      () =>
        (T.where === "root"
          ? bldSel === BLD_ROOT
          : T.where === "stage"
            ? bldSel === BLD.stages[0].id
            : bldSel === T.id) && !!T.target(),
    );
    if (!showing) {
      fails.push(`${label}: the part under test couldn't be selected again after the reopen`);
      await p.close();
      continue;
    }
    // every field, and every option of every choice (fields appear and disappear with them)
    const queue = await p.evaluate(() => [...document.querySelectorAll("[id^=bf-],[id^=bfo-]")].map((e) => e.id));
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      const info = await p.evaluate((id) => {
        const e = document.getElementById(id);
        if (!e) return null;
        return {
          tag: e.tagName,
          type: e.type,
          val: e.type === "checkbox" ? e.checked : e.value,
          dis: e.disabled,
          step: e.step,
          opts: e.tagName === "SELECT" ? [...e.options].map((o) => o.value) : null,
        };
      }, id);
      const key = id + "|" + (info && info.opts ? info.opts.join(",") : "");
      if (!info || info.dis || seen.has(key)) continue;
      seen.add(key);
      // every option of a choice, except materials: two of them show the field works
      const opts =
        info.tag === "SELECT" ? info.opts.filter((o) => o !== info.val).slice(0, /^bf-mat$/.test(id) ? 2 : 99) : [null];
      for (const v of opts) {
        const snap = await p.evaluate(() => JSON.stringify(BLD));
        const name = id.replace(/^bfo-/, "override switch ").replace(/^bf-/, "") + (v != null ? `=${v}` : "");
        try {
          if (info.tag === "SELECT") await p.selectOption("#" + id, v);
          else if (info.type === "checkbox") {
            if (id.startsWith("bfo-")) await p.locator(`label.ovsw:has(#${id})`).click();
            // the input's own click, in the page: a pointer click needs the box on screen, and where it lands
            // depends on the fonts of the machine running the test
            else await p.locator("#" + id).evaluate((e) => e.click());
          } else if (info.type === "number") {
            const cur = parseFloat(info.val);
            // a new value that is still a possible one: an inside diameter shrinks (it can't pass the outside one)
            // (and a shape parameter is already at its top)
            const f = /^bf-(id_|idAft|idFore|param)$/.test(id) ? 0.9 : 1.2;
            const nv =
              info.step === "1"
                ? isFinite(cur)
                  ? cur + 1
                  : 2
                : isFinite(cur) && cur !== 0
                  ? +(cur * f).toPrecision(4)
                  : 0.6;
            await p.fill("#" + id, String(nv));
            await p.press("#" + id, "Tab");
          } else if (info.tag === "TEXTAREA") continue;
          else {
            await p.fill("#" + id, (info.val || "") + "X");
            await p.press("#" + id, "Tab");
          }
        } catch (e) {
          fails.push(`${label} ${name}: couldn't be changed: ${e.message.split("\n")[0]}`);
          continue;
        }
        await p.waitForTimeout(120);
        const now = await p.evaluate(() => {
          const t = T.target();
          return t
            ? {
                model: JSON.stringify(BLD),
                part: T.strip(t),
                ids: [...document.querySelectorAll("[id^=bf-],[id^=bfo-]")].map((e) => e.id),
              }
            : null;
        });
        if (!now) fails.push(`${label} ${name}: the part vanished`);
        else {
          checks++;
          if (now.model === snap) fails.push(`${label} ${name}: the change didn't reach the design`);
          cmp(name, await reopen(false), now.part);
          for (const nid of now.ids) if (!queue.includes(nid)) queue.push(nid);
        }
        // the design as it was, for the next field
        await back(snap);
        await p.waitForTimeout(40);
      }
    }
    await p.close();
  }
  await browser.close();
  console.log(fails.length ? fails.join("\n") : "");
  console.log(`${checks} checks (${refused} where the app rightly refused to save), ${fails.length} failed`);
  process.exitCode = fails.length ? 1 : 0;
})();
