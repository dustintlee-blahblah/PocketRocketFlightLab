// The Android app on a real Android system (an emulator on GitHub: .github/workflows/device.yml), through adb.
//
// 1. The release APK: installs, opens, shows the page, and runs for a while without crashing or a page error
//    (WebView console errors and Java crashes are read from the device log). Screenshot.
// 2. The debug APK (the same page; debug builds open the WebView's DevTools socket, MainActivity.java): the test
//    connects to the page and drives it as a person would:
//    - a simulation: an example rocket, Launch, an apogee on Results;
//    - a design file opened through Open design file and Android's own file picker;
//    - an altimeter log shared to the app from another app (Android's Share), which opens the log screen.
//    A screenshot of each, from the device itself.
// Fails on a crash, a page error, a step that doesn't show what it should, or the app not responding.
//
// usage: node tests/android.js --release app-release.apk --debug app-debug.apk [--out dir]
//   needs adb with one device or emulator running, and the built page (web/pocket-rocket-flight-lab.html, to make the
//   test's design file and altimeter log).
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const REL = opt("--release", null),
  DBG = opt("--debug", null),
  OUT = path.resolve(opt("--out", path.join(__dirname, "..", "test-results", "android"))),
  PKG = "com.dustinlee.pocketrocketpro",
  ACT = PKG + "/com.dustinlee.pocketrocket.MainActivity";
fs.mkdirSync(OUT, { recursive: true });

const adb = (...a) => execFileSync("adb", a, { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const adbQuiet = (...a) => {
  try {
    return adb(...a);
  } catch {
    return "";
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
// a run that stops early (a promise left waiting with nothing else to do) must not pass
let finished = false;
process.on("exit", (code) => {
  if (!finished && code === 0) {
    console.log("FAIL the test stopped before it finished");
    process.exitCode = 1;
  }
});
const fail = (what) => {
  console.log("  FAIL " + what);
  problems.push(what);
};
const pass = (what) => console.log("  ok   " + what);
const shot = (name) => {
  fs.writeFileSync(
    path.join(OUT, name + ".png"),
    execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 }),
  );
};

/** Java crashes and the page's console errors in the device log since it was cleared */
function deviceErrors() {
  const log = adbQuiet("logcat", "-d", "-v", "brief", "AndroidRuntime:E", "chromium:I", "*:S");
  const out = [];
  for (const line of log.split("\n")) {
    if (/FATAL EXCEPTION|Process: com\.dustinlee/.test(line)) out.push(line.trim());
    if (/CONSOLE.*(Uncaught|TypeError|ReferenceError|SyntaxError)/.test(line)) out.push(line.trim());
  }
  return out;
}
const alive = () => adbQuiet("shell", "pidof", PKG).length > 0;

function install(apk) {
  adbQuiet("uninstall", PKG);
  adb("install", "-r", "-g", apk);
}
function launch() {
  adb("logcat", "-c");
  adb("shell", "am", "start", "-W", "-n", ACT);
}

// ---- the files the test hands the app: a design and an altimeter log, made by the built page itself
async function makeFiles() {
  const b = await chromium.launch(),
    p = await b.newPage();
  await p.route(/^https?:/, (r) => r.abort());
  await p.addInitScript(() => {
    window.PR_EXPOSE = true;
    window.PR_NO_ASK = true;
    localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
    sessionStorage.setItem("rfs-splash", "1");
  });
  await p.goto("file://" + path.resolve(__dirname, "..", "web", "pocket-rocket-flight-lab.html"));
  await p.waitForTimeout(1500);
  await p.evaluate(() => openExample(EXAMPLES.length - 1));
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    runNow();
    const o = lastSim.out,
      rows = [];
    for (let i = 0; i < o.t.length && o.t[i] < 60; i++)
      if (!rows.length || o.t[i] - rows[rows.length - 1][0] >= 0.05) rows.push([o.t[i], o.alt[i] / 0.3048]);
    return {
      ork: bldToOrk(BLD, L),
      log:
        "Jolly Logic AltimeterThree\nTime (s),Altitude (ft)\n" +
        rows.map(([t, a]) => `${t.toFixed(2)},${Math.round(a)}`).join("\n"),
      name: BLD.name || "design",
    };
  });
  await b.close();
  const ork = path.join(OUT, "devicetest.ork"),
    log = path.join(OUT, "devicetest-log.csv");
  fs.writeFileSync(ork, r.ork);
  fs.writeFileSync(log, r.log);
  return { ork, log };
}

// ---- Android's file picker: find a file by name on screen (UI Automator's dump) and tap it
function uiNodes() {
  adbQuiet("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = adbQuiet("shell", "cat", "/sdcard/ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const a = (k) => (m[0].match(new RegExp(` ${k}="([^"]*)"`)) || [])[1] || "";
    const b = a("bounds").match(/\d+/g) || [0, 0, 0, 0];
    return { text: a("text"), desc: a("content-desc"), x: (+b[0] + +b[2]) >> 1, y: (+b[1] + +b[3]) >> 1 };
  });
}
async function tapText(re, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const n = uiNodes().find((x) => re.test(x.text) || re.test(x.desc));
    if (n) {
      adb("shell", "input", "tap", String(n.x), String(n.y));
      return true;
    }
    await sleep(1500);
  }
  return false;
}

async function main() {
  console.log(
    "device: " +
      adb("shell", "getprop", "ro.build.version.release") +
      " (API " +
      adb("shell", "getprop", "ro.build.version.sdk") +
      ")",
  );
  const files = DBG ? await makeFiles() : null;

  // ---- 1. the release APK
  if (REL) {
    console.log("release APK");
    install(REL);
    launch();
    await sleep(15000);
    shot("release-start");
    alive() ? pass("release app opens and keeps running") : fail("release app is not running 15 s after opening");
    const e = deviceErrors();
    e.length
      ? fail("release app: " + e.slice(0, 3).join(" | "))
      : pass("release app: no crash or page error in the device log");
  }

  // ---- 2. the debug APK, driven over DevTools
  if (DBG) {
    console.log("debug APK");
    install(DBG);
    launch();
    await sleep(8000);
    const pid = adb("shell", "pidof", PKG);
    const sock = (adbQuiet("shell", "cat", "/proc/net/unix").match(new RegExp("webview_devtools_remote_" + pid)) ||
      [])[0];
    if (!sock) {
      fail("debug app: no WebView DevTools socket (is WebView debugging on in debug builds?)");
    } else {
      adb("forward", "tcp:9333", "localabstract:" + sock);
      console.log("  ..   connecting to the WebView over DevTools (" + sock + ")");
      // Android WebView's DevTools has no browser contexts, which Playwright's connectOverCDP sets up first, so the
      // page is driven over plain DevTools messages instead
      const errs = [];
      const browser = await cdpPage("http://127.0.0.1:9333", (m) => errs.push(m));
      const page = browser;
      // past the first-run screens, as a person who has accepted them, with the page's test hooks on (as in
      // tests/walkthrough.js), then a dual-deploy example
      await page.addInitScript(`window.PR_EXPOSE = true; window.PR_NO_ASK = true;
        localStorage.setItem("rfs-disclaimer-v2", JSON.stringify({ accepted: true, version: "2026-11-02" }));
        sessionStorage.setItem("rfs-splash", "1");`);
      await page.reload();
      await sleep(6000);
      // the hooks are there only if the page loaded after the script was set; once more if not
      if (!(await page.evaluate(() => typeof openExample === "function"))) {
        console.log("  ..   page test hooks missing after the reload: reloading again");
        await page.reload();
        await sleep(6000);
        if (!(await page.evaluate(() => typeof openExample === "function")))
          throw new Error("the page's test hooks aren't there after two reloads");
      }
      console.log("  ..   past the first-run screens");
      const pg = page;

      // a simulation: an example rocket, Launch, the apogee on Results
      await pg.evaluate(() => {
        const d = document.getElementById("legal");
        if (d) d.hidden = true;
        return openExample(EXAMPLES.length - 1);
      });
      await sleep(2000);
      await pg.click("#t-rocket");
      await sleep(800);
      await pg.click("#runbtn");
      await sleep(5000);
      await pg.click("#t-results");
      await sleep(1000);
      const apo = await pg.evaluate(() => document.getElementById("apogee").textContent);
      shot("debug-results");
      /\d/.test(apo)
        ? pass(`a simulation runs (apogee "${apo.replace(/\s+/g, " ").trim()}")`)
        : fail(`no apogee after Launch ("${apo}")`);

      // a design file, through Open design file and Android's file picker
      adb("push", files.ork, "/sdcard/Download/devicetest.ork");
      adbQuiet(
        "shell",
        "am",
        "broadcast",
        "-a",
        "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
        "-d",
        "file:///sdcard/Download/devicetest.ork",
      );
      await pg.click("#t-rocket");
      await sleep(800);
      const before = await pg.evaluate(() => document.getElementById("rname")?.textContent || "");
      await pg.click('label[for="orkfile"]');
      await sleep(3000);
      shot("debug-picker");
      let found = await tapText(/^devicetest\.ork$/, 3);
      if (!found) {
        // not among the recent files: through the picker's menu to Downloads
        (await tapText(/Show roots|Open navigation drawer/i, 2)) && (await sleep(1000));
        await tapText(/^Downloads?$/i, 3);
        await sleep(1500);
        found = await tapText(/^devicetest\.ork$/, 4);
      }
      if (!found) fail("the file picker didn't show devicetest.ork");
      await sleep(5000);
      shot("debug-design-opened");
      const opened = await pg.evaluate(() => ({
        name: document.getElementById("rname")?.textContent || "",
        file: document.body.innerText.includes("devicetest"),
      }));
      found && opened.file
        ? pass(`the design file opened (${opened.name.trim()})`)
        : found && fail(`the design file didn't open (name before "${before}", after "${opened.name}")`);

      // an altimeter log shared from another app (put where the app may read it: its own files, through run-as,
      // which debug builds allow; a real share hands the app a content:// link with permission to read it)
      adb("push", files.log, "/data/local/tmp/devicetest-log.csv");
      adb("shell", "run-as", PKG, "sh", "-c", "'mkdir -p files && cp /data/local/tmp/devicetest-log.csv files/'");
      const own = adb("shell", "run-as", PKG, "pwd");
      adb(
        "shell",
        "am",
        "start",
        "-a",
        "android.intent.action.SEND",
        "-t",
        "text/csv",
        "--eu",
        "android.intent.extra.STREAM",
        `file://${own}/files/devicetest-log.csv`,
        "-n",
        ACT,
      );
      await sleep(5000);
      shot("debug-shared-log");
      const log = await pg.evaluate(() => ({
        open: !document.getElementById("altmodal").hidden,
        title: document.getElementById("alttitle")?.textContent,
      }));
      log.open
        ? pass("a shared altimeter log opens the log screen")
        : fail("a shared altimeter log didn't open the log screen");

      errs.length ? fail("page errors: " + errs.slice(0, 3).join(" | ")) : pass("no page errors");
      await browser.close().catch(() => {});
    }
    alive() ? pass("debug app still running") : fail("debug app stopped");
    const e = deviceErrors();
    e.length ? fail("debug app: " + e.slice(0, 3).join(" | ")) : pass("debug app: no crash in the device log");
  }

  console.log(`screenshots in ${path.relative(process.cwd(), OUT)}`);
  if (problems.length) {
    console.log(`${problems.length} problem(s)`);
    process.exit(1);
  }
  finished = true;
  console.log("no problems");
}

// A page in Android WebView, over DevTools: evaluate(fn) runs fn in the page and returns its value; click(selector)
// clicks the first visible match as a tap would (counted as a user's gesture, so a file picker may open);
// onError gets uncaught page errors. The WebView may close its DevTools connection (on a reload, say): the next
// step then reconnects, sets the connection up again (scripts for new pages too) and is tried once more; each
// close is logged with the step that was waiting and the WebView's reason.
async function cdpPage(base, onError) {
  const within = (pr, ms, what) => {
    let t;
    return Promise.race([
      pr,
      new Promise((_, no) => (t = setTimeout(() => no(new Error(`no answer in ${ms / 1000} s: ${what}`)), ms))),
    ]).finally(() => clearTimeout(t));
  };
  const initScripts = [];
  let ws = null,
    id = 0,
    reconnects = 0;
  const waiting = new Map();
  const CLOSED = "the WebView closed its DevTools connection";

  async function connect() {
    const list = await within(
      fetch(base + "/json").then((r) => r.json()),
      30000,
      "the WebView's DevTools page list",
    );
    const t = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl) || list.find((x) => x.webSocketDebuggerUrl);
    if (!t) throw new Error("no page in the WebView's DevTools list: " + JSON.stringify(list).slice(0, 300));
    const sock = new WebSocket(t.webSocketDebuggerUrl);
    await within(
      new Promise((ok, no) => {
        sock.onopen = ok;
        sock.onerror = () => no(new Error("couldn't open the WebView's DevTools connection"));
      }),
      30000,
      "opening the WebView's DevTools connection",
    );
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      ws = null;
      const steps = [...waiting.values()].map((w) => w.method).join(", ") || "nothing";
      console.log(`  ..   ${CLOSED} (code ${ev.code}${ev.reason ? ", " + ev.reason : ""}; waiting on ${steps})`);
      for (const w of waiting.values()) w.no(new Error(CLOSED));
      waiting.clear();
    };
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && waiting.has(m.id)) {
        const w = waiting.get(m.id);
        waiting.delete(m.id);
        m.error ? w.no(new Error(m.error.message)) : w.ok(m.result);
      } else if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        onError((d.exception && d.exception.description) || d.text);
      }
    };
    ws = sock;
    await raw("Runtime.enable");
    await raw("Page.enable");
    for (const src of initScripts) await raw("Page.addScriptToEvaluateOnNewDocument", { source: src });
  }

  const raw = (method, params = {}) =>
    within(
      new Promise((ok, no) => {
        if (!ws) return no(new Error(CLOSED));
        waiting.set(++id, { ok, no, method });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      60000,
      method,
    );

  // a step, reconnecting first if the connection has gone, and once more if it goes while waiting
  async function send(method, params = {}, again = true) {
    if (!ws) {
      if (++reconnects > 5) throw new Error(CLOSED + " too many times");
      console.log("  ..   reconnecting to the WebView");
      await sleep(2000);
      await connect();
    }
    try {
      return await raw(method, params);
    } catch (e) {
      if (e.message !== CLOSED || !again) throw e;
      return send(method, params, false);
    }
  }

  await connect();
  const run = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  return {
    evaluate: (fn) => run(`(${fn})()`),
    async addInitScript(src) {
      initScripts.push(src);
      await send("Page.addScriptToEvaluateOnNewDocument", { source: src });
    },
    // a reload can take the connection with it: that counts as done
    reload: () =>
      send("Page.reload", {}, false).catch((e) => {
        if (e.message !== CLOSED) throw e;
      }),
    async click(sel) {
      const ok = await run(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.offsetParent !== null);
        if (!el) return false;
        el.click();
        return true;
      })()`);
      if (!ok) throw new Error("nothing visible to click: " + sel);
    },
    dropForTest: () => ws && ws.close(),
    close: async () => {
      const w = ws;
      ws = null;
      w && w.close();
    },
  };
}

module.exports = { makeFiles };
if (require.main === module)
  main().catch((e) => {
    console.log("FAIL " + e.message);
    try {
      shot("error");
    } catch {
      /* no device */
    }
    process.exit(1);
  });
