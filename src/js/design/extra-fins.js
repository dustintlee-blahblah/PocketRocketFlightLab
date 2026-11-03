/* ---------- extra fin sets ---------- */
const XFIN_FIELDS = [
  ["n", "Number of fins", "int"],
  ["root", "Root chord", "len"],
  ["tip", "Tip chord", "len"],
  ["span", "Span (height)", "len"],
  ["sweep", "Leading-edge sweep", "len"],
  ["t", "Thickness", "small"],
  ["pos", "POS", "len"],
  [
    "edge",
    "Edge profile",
    "sel",
    [
      ["square", "Square"],
      ["rounded", "Rounded"],
      ["airfoil", "Airfoiled"],
    ],
  ],
];
function xfinCtx(booster) {
  return booster
    ? {
        key: "bExtraFins",
        box: "bxfins",
        add: "baddfin",
        posLabel: "Root leading edge from booster front",
        stageLen: () => D.bLength,
        main: {
          n: D.bFinCount,
          root: D.bFinRoot,
          tip: D.bFinTip,
          span: D.bFinSpan,
          sweep: D.bFinSweep,
          t: D.bFinThick,
          edge: D.bFinEdge,
          aft: D.bFinAft,
        },
        front: 0,
      }
    : {
        key: "extraFins",
        box: "xfins",
        add: "addfin",
        posLabel: "Root leading edge from nose tip",
        stageLen: () => D.length,
        main: {
          n: D.finCount,
          root: D.finRoot,
          tip: D.finTip,
          span: D.finSpan,
          sweep: D.finSweep,
          t: D.finThick,
          edge: D.finEdge,
          aft: D.finAft,
        },
        front: D.noseLen || 0,
      };
}
function newFinSet(ctx) {
  const M = ctx.main,
    L0 = ctx.stageLen(),
    list = D[ctx.key] || [];
  const root = M.root * 0.6,
    span = M.span * 0.5;
  // place it ahead of the main fins, roughly mid-body, clear of the nose
  const mainLead = L0 - M.aft - M.root;
  let pos = Math.max(ctx.front + 0.02, Math.min(mainLead - root - 0.05, 0.45 * L0));
  if (list.length) pos = Math.max(ctx.front + 0.02, Math.min(...list.map((f) => f.pos)) - root - 0.05);
  return { n: M.n, root, tip: M.tip * 0.6, span, sweep: M.sweep * 0.6, t: M.t, pos: Math.max(0, pos), edge: M.edge };
}
function xfinWarn(ctx, f) {
  const L0 = ctx.stageLen(),
    M = ctx.main,
    mLead = L0 - M.aft - M.root;
  if (f.pos < 0 || f.pos + f.root > L0 + 1e-6) return "This fin set runs past the end of the body. Check its position.";
  if (f.pos < ctx.front - 1e-6 && !ctx.key.startsWith("b"))
    return "The root starts on the nose cone. Drag and stability use the body radius there, but check the position.";
  if (f.pos < mLead + M.root - 1e-6 && f.pos + f.root > mLead + 1e-6 && f.n === M.n)
    return "This set overlaps the main fins along the body. If they are really one fin, enter it as the main set instead.";
  return "";
}
function renderExtraFins() {
  for (const booster of [false, true]) {
    const ctx = xfinCtx(booster),
      box = document.getElementById(ctx.box);
    if (!box) continue;
    const list = D[ctx.key] || (D[ctx.key] = []);
    box.innerHTML = "";
    list.forEach((f, i) => {
      const card = document.createElement("div");
      card.className = "xfin";
      card.innerHTML = `<div class="xh"><b>Fin set ${i + 2}</b><button type="button" aria-label="Remove fin set ${i + 2}">Remove</button></div><div class="grid"></div><canvas aria-label="Fin set ${i + 2} shape drawn to scale"></canvas><p class="note"></p>`;
      const g = card.querySelector(".grid");
      for (const [k, label, dim, opts] of XFIN_FIELDS) {
        const id = `x${booster ? "b" : ""}${i}-${k}`,
          wrap = document.createElement("div");
        wrap.className = "fld";
        let html = `<label for="${id}">${k === "pos" ? ctx.posLabel : label}</label><div class="in">`;
        if (dim === "sel")
          html +=
            `<select id="${id}">` +
            opts.map(([v, t]) => `<option value="${v}"${f[k] === v ? " selected" : ""}>${t}</option>`).join("") +
            `</select>`;
        else {
          const val =
            dim === "int"
              ? f[k]
              : +toDisp(f[k], dim).toFixed(
                  Math.max(DIMS[units][dim]?.[2] ?? 2, dim === "len" && units === "imp" ? 2 : 0),
                );
          html +=
            `<input id="${id}" type="number" inputmode="decimal" step="any" value="${val}">` +
            (dim !== "int" && uname(dim) ? `<span class="u">${uname(dim)}</span>` : "");
        }
        wrap.innerHTML = html + "</div>";
        g.appendChild(wrap);
        const el = wrap.querySelector("input,select");
        if (dim === "sel")
          el.addEventListener("change", () => {
            f[k] = el.value;
            changed();
          });
        else
          el.addEventListener("input", () => {
            const v = parseFloat(el.value);
            if (!isFinite(v)) return;
            f[k] = dim === "int" ? Math.max(1, Math.round(v)) : Math.max(0, fromDisp(v, dim));
            if (["root", "tip", "span", "sweep"].includes(k)) delete f.pts;
            changed();
          });
      }
      card.querySelector(".xh button").onclick = () => {
        list.splice(i, 1);
        renderExtraFins();
        changed();
      };
      box.appendChild(card);
    });
    const add = document.getElementById(ctx.add);
    if (add)
      add.onclick = () => {
        list.push(newFinSet(ctx));
        renderExtraFins();
        changed();
        const cards = box.querySelectorAll(".xfin");
        const last = cards[cards.length - 1];
        if (last && last.scrollIntoView) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
  }
  drawExtraFins();
}
function drawExtraFins() {
  for (const booster of [false, true]) {
    const ctx = xfinCtx(booster),
      box = document.getElementById(ctx.box);
    if (!box) continue;
    const cards = box.querySelectorAll(".xfin");
    (D[ctx.key] || []).forEach((f, i) => {
      const card = cards[i];
      if (!card) return;
      const cv = card.querySelector("canvas"),
        note = card.querySelector(".note");
      cv.id = cv.id || `xfcv${booster ? "b" : ""}${i}`;
      note.id = note.id || `xfnote${booster ? "b" : ""}${i}`;
      drawFinsInto(cv.id, note.id, {
        n: f.n,
        a: f.root,
        b: f.tip,
        s: f.span,
        sw: f.sweep,
        t: f.t,
        aft: 0,
        edge: f.edge,
        noTail: true,
        pts: f.pts,
      });
      const L0 = ctx.stageLen(),
        w = xfinWarn(ctx, f);
      note.textContent +=
        ` Leading edge ${fmt(f.pos, "len")} ${uname("len")} from the ${booster ? "booster’s front" : "nose tip"}, trailing edge ${fmt(Math.max(L0 - f.pos - f.root, 0), "len")} ${uname("len")} ahead of the ${booster ? "booster " : ""}tail.` +
        (w ? " " + w : "");
    });
  }
}
let stale = false;
function changed() {
  store.set("rfs-design", D);
  store.set("rfs-launch", L);
  markStale();
  siteRender();
  windProfNote();
  drawProfile();
  renderDragTable();
  renderInertiaNote();
  renderRecNote();
  renderSavePanel();
}
function renderRecNote() {
  const rn = document.getElementById("recnote");
  if (rn) {
    const first = D.recovery === "single" ? "The parachute" : "The drogue",
      dm = D.deployMode || "apogee",
      dl = Math.max(0, D.deployDelay || 0);
    const when =
      dm === "motor"
        ? D.ejDelay != null
          ? `opens when the motor’s ejection charge fires, ${(+D.ejDelay).toFixed(1)} s after ${D.twoStage ? "sustainer " : ""}burnout (Motor tab, Motor Delay)`
          : "is set to open at the motor ejection charge, but the motor is plugged (Motor tab, Motor Delay)"
        : dm === "timer"
          ? `opens ${dl.toFixed(1)} s after liftoff`
          : dl > 0
            ? `opens ${dl.toFixed(1)} s after apogee`
            : "opens at apogee";
    let txt =
      `${first} ${when}.` +
      (D.recovery === "single"
        ? " Drogue settings are turned off."
        : " The main opens at the set altitude. Set the drogue diameter to 0 to free-fall until the main opens.");
    if (dm === "motor") {
      const mm = curMotor(),
        dly = (mm.delays || "").replace(/,?P$/i, "");
      txt +=
        dly && dly !== "0"
          ? ` The ${mm.cn || mm.name} is sold with ${dly} s delays${/RMS|DMS|ProX|Loki/.test(mm.sys || "") ? "; reload delays can be shortened with a drilling tool" : ""}. The Results tab shows the ideal motor delay for apogee.`
          : ` The ${mm.cn || mm.name} has no ejection delay; use an altimeter instead.`;
    }
    rn.textContent = txt;
  }
}
/* airframe turning inertia (pitch moment of inertia about its own CG, without motors): from the design file or typed in,
   scaled with the weight if that changes later; otherwise the weight spread evenly along the airframe */
function airInertia(I0, m0, m, len) {
  return I0 > 0 ? I0 * (m0 > 0 ? m / m0 : 1) : (m * len * len) / 12;
}
function renderInertiaNote() {
  const el = document.getElementById("inote");
  if (!el) return;
  const u = uname("moi"),
    part = (lab, I0, m0, m, len, src) =>
      I0 > 0
        ? `${lab}turning inertia ${fmt(airInertia(I0, m0, m, len), "moi")} ${u}${src === "file" ? ", from the design file’s parts" : ""}${m0 > 0 && Math.abs(m / m0 - 1) > 0.005 ? ", scaled to the weight above" : ""}.`
        : `${lab}turning inertia estimated as ${fmt(airInertia(0, 0, m, len), "moi")} ${u}, with the weight spread evenly along the airframe. Enter a measured or calculated value to replace it.`;
  el.textContent =
    part(D.twoStage ? "Sustainer " : "Airframe ", D.dryInertia, D.inertiaMass, D.dryMass, D.length, D.inertiaSource) +
    (D.twoStage ? " " + part("Booster ", D.bDryInertia, D.bInertiaMass, D.bDryMass, D.bLength, D.bInertiaSource) : "") +
    " It only affects how fast the rocket turns into the wind.";
}
function renderDragTable() {
  const el = document.getElementById("dragtable");
  if (!el) return;
  const A = aero(D),
    a0 = atmosphere(L, 0);
  const AS = D.twoStage ? aero(stackDesign(D)) : null;
  const rows = [0.1, 0.3, 0.5, 0.7, 0.9, 1.1, 1.5]
    .map((M) => {
      const p = cdParts(A, M * a0.a, a0);
      return `<tr><td>${M.toFixed(1)}</td><td><b>${p.cd.toFixed(3)}</b></td><td>${p.override ? "—" : p.friction.toFixed(3)}</td><td>${p.override ? "—" : p.pressure.toFixed(3)}</td><td>${p.override ? "—" : p.base.toFixed(3)}</td>${AS ? `<td>${cdParts(AS, M * a0.a, a0).cd.toFixed(3)}</td>` : ""}</tr>`;
    })
    .join("");
  const nCdo =
    (D.segments || []).filter((x) => x.cdo > 0).length +
    (D.finCdOverride > 0 ? 1 : 0) +
    (D.extraFins || []).filter((x) => x.cdo > 0).length +
    (D.railPreset === "custom" ? [...(D.buttons || []), ...(D.lugs || [])].filter((x) => x.cdo > 0).length : 0);
  const cdoNote = nCdo
    ? `<p class="note">${nCdo} part${nCdo > 1 ? "s use" : " uses"} a Cd override from the design file in place of the calculated drag.</p>`
    : "";
  el.innerHTML =
    cdoNote +
    `<table><thead><tr><th>Mach</th><th>${AS ? "Sustainer Cd" : "Cd"}</th><th>Friction</th><th>Pressure</th><th>Base</th>${AS ? "<th>Stack Cd</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>`;
}
// what changed since the last run, named for the tab it was changed on
let everRun = false,
  staleWhy = "";
function staleReason() {
  const v = (n) => !document.getElementById("v-" + n).hidden;
  return v("rocket")
    ? "The rocket changed"
    : v("motor")
      ? "The motor changed"
      : v("flight")
        ? "The launch conditions changed"
        : "Settings changed";
}
function markStale() {
  stale = true;
  renderTitle();
  document.getElementById("runbar").classList.add("stale");
  const had = !!lastSim || everRun;
  if (lastSim || !staleWhy) staleWhy = staleReason();
  lastSim = null;
  renderResults();
  {
    const em = document.getElementById("exportmsg");
    if (em) em.textContent = "";
  }
  document.querySelector("#runstat b").textContent = had ? staleWhy : "Not run yet";
  document.getElementById("runtime").textContent = had
    ? "Tap Launch to update the results"
    : "Set up your rocket, then tap Launch";
  document.getElementById("t-results").classList.toggle("dot", had);
  document.getElementById("flightemptytxt").textContent = had
    ? `${staleWhy} since the last run, so its results were cleared. Launch again to see the new results.`
    : "No results yet. Set up the rocket, motor and conditions, then tap Launch.";
  document.getElementById("emptylaunch").hidden = !had;
}
function markFresh() {
  stale = false;
  everRun = true;
  staleWhy = "";
  document.getElementById("runbar").classList.remove("stale");
  document.getElementById("t-results").classList.remove("dot");
  document.querySelector("#runstat b").textContent = "Results up to date";
  const m = flightMotor();
  document.getElementById("runtime").textContent =
    `${D.name} on ${m.cn || m.name}, run at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
  document.querySelectorAll(".is-stale").forEach((p) => p.classList.remove("is-stale"));
  {
    const em = document.getElementById("exportmsg");
    if (em) em.textContent = "";
  }
}
function readFields() {
  for (const list of Object.values(FIELDS))
    for (const [k, , dim, obj] of list) {
      if (obj !== "L") continue; // the rocket itself is edited in the parts builder
      const O = L,
        el = document.getElementById("f-" + k);
      if (!el || el.disabled) continue;
      // a field left as shown keeps its exact value (the box only shows a rounded copy)
      if (el.dataset.shown != null && el.value === el.dataset.shown) continue;
      if (dim === "sel") {
        O[k] =
          k === "twoStage" || k === "clusterFail"
            ? el.value === "true"
            : isNaN(+el.value) || k === "railPreset"
              ? el.value
              : +el.value;
        continue;
      }
      const v = parseFloat(el.value);
      if (!isFinite(v)) continue;
      O[k] = dim === "int" ? Math.max(1, Math.round(v)) : fromDisp(v, dim);
    }
  store.set("rfs-design", D);
  store.set("rfs-launch", L);
}
function runNow() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (document.documentElement.classList.contains("nodesign")) {
    showTab("rocket");
    prToast("Open a rocket file first.");
    return;
  }
  readFields();
  // a rail this short is almost always a units mix-up; don't fly it
  if (!(L.rail >= 2.5 * FT)) {
    showRailWarn();
    return;
  }
  // a stage whose motor mounts are all set never to light can't fly
  {
    const none = [
      [D.mainOff && !(D.extraMotors || []).length, D.twoStage ? "sustainer" : "rocket"],
      [D.twoStage && D.bMainOff && !(D.bExtraMotors || []).length, "booster"],
      [isThree(D) && D.s1MainOff && !(D.s1ExtraMotors || []).length, "first stage"],
    ].find((x) => x[0]);
    if (none) {
      document.getElementById("fitwarntxt").textContent =
        `Every motor mount in the ${none[1]} is set never to light, so it has no motor to fly. In the builder, set a motor mount's Lights to At liftoff.`;
      const fx = document.getElementById("fitfix");
      fx.textContent = "Open the builder";
      fx.onclick = () => {
        document.getElementById("fitwarn").hidden = true;
        showTab("rocket");
      };
      document.getElementById("fitwarn").hidden = false;
      fx.focus();
      return;
    }
  }
  // a motor that can't physically go in the mount isn't flown
  for (const [b, stg] of [[false, "sustainer"], ...(D.twoStage ? [[true, "booster"]] : [])]) {
    const tb = mountTooBig(D, b);
    if (tb) {
      showMountWarn(tb, D.twoStage ? stg : null, b);
      return;
    }
  }
  for (const [mm, b, stg, Dx] of [
    [curMotor(), false, "sustainer", D],
    ...(D.twoStage ? [[curBoost(), true, "booster", D]] : []),
    ...(isThree(D) ? [[curFirst(), true, "first", s1View(D)]] : []),
  ]) {
    const fit = motorFit(mm, Dx, b);
    if (fit && fit.status === "big") {
      showFitWarn(mm, fit, D.twoStage ? stg : null);
      return;
    }
  }
  runAll();
  markFresh();
  if (typeof supNote === "function") supNote("run");
  if (document.getElementById("v-results").hidden) showTab("results");
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
