/**
 * The settings menu (units, appearance, app colors, swipe, disclaimer and About), the Launch warnings (rail, motor fit,
 * mount size), and opening a design file (loadDesignXml).
 */
/* ---------- settings menu (gear, top right): units, appearance, swipe, disclaimer and About ---------- */
(function () {
  const btn = document.getElementById("gearbtn"),
    menu = document.getElementById("setmenu");
  if (!btn || !menu) return;
  /**
   * Opens or closes the settings menu.
   */
  const open = (on) => {
    menu.hidden = !on;
    btn.setAttribute("aria-expanded", on);
    if (on) sync();
  };
  window.prSettingsOpen = () => !menu.hidden;
  window.prSettingsClose = () => open(false);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    open(menu.hidden);
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) open(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      open(false);
      btn.focus();
    }
  });
  document.getElementById("s-imp").onclick = () => setUnits("imp");
  document.getElementById("s-met").onclick = () => setUnits("met");
  /**
   * Follows the phone's light or dark setting, or always uses one.
   *
   * appearance: follow the phone, or always light or dark
   */
  const applyTheme = (t) => {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    window.prColors(store.get("rfs-accent", null) || "", store.get("rfs-accent2", null) || "");
    try {
      renderResults();
      if (typeof BLD !== "undefined" && BLD) bldRender();
      drawChart();
      drawProfile();
      if (typeof drawMC === "function") drawMC();
    } catch (_) {}
  };
  menu.querySelectorAll("[data-theme-set]").forEach(
    (b) =>
      (b.onclick = () => {
        store.set("rfs-theme", b.dataset.themeSet);
        applyTheme(b.dataset.themeSet);
        sync();
      }),
  );
  const sw = document.getElementById("s-swipe");
  sw.onchange = () => {
    store.set("rfs-swipe", sw.checked);
  };
  /**
   * Redraws the canvases after a color change.
   *
   * App Color: the main colour and the accent colour, each a preset swatch or any colour from the picker
   */
  const redraw = () => {
    try {
      renderResults();
      if (typeof BLD !== "undefined" && BLD) bldRender();
      drawChart();
      drawProfile();
      if (typeof drawMC === "function") drawMC();
      if (!document.getElementById("v-motor").hidden) renderMotors();
    } catch (_) {}
  };
  /**
   * Applies the saved main and accent colors.
   */
  const colors = () => window.prColors(store.get("rfs-accent", null) || "", store.get("rfs-accent2", null) || "");
  /**
   * Saves and applies one app color (a preset swatch or any color).
   */
  const setCol = (key, hex) => {
    store.set(key, hex || null);
    colors();
    redraw();
    sync();
  };
  menu.querySelectorAll("[data-main]").forEach((b) => (b.onclick = () => setCol("rfs-accent", b.dataset.main)));
  menu.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = () => setCol("rfs-accent2", b.dataset.acc)));
  const pickM = document.getElementById("s-main"),
    pickA = document.getElementById("s-acc");
  pickM.addEventListener("input", () => setCol("rfs-accent", pickM.value));
  pickA.addEventListener("input", () => setCol("rfs-accent2", pickA.value));
  document.getElementById("s-colreset").onclick = () => {
    store.set("rfs-accent", null);
    store.set("rfs-accent2", null);
    colors();
    redraw();
    sync();
  };
  // profile: the flier's name, club, membership numbers and certification level
  {
    const pb = document.getElementById("s-profbtn"),
      pp = document.getElementById("s-prof"),
      F = { name: "p-name", club: "p-club", nar: "p-nar", tra: "p-tra", cert: "p-cert" };
    const sum = () => {
      document.getElementById("s-profsum").textContent = [
        PROFILE.name,
        PROFILE.cert ? (PROFILE.cert === "none" ? "" : PROFILE.cert) : "",
      ]
        .filter(Boolean)
        .join(" · ");
    };
    for (const [k, id] of Object.entries(F)) {
      const el = document.getElementById(id);
      el.value = PROFILE[k] || "";
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
        PROFILE[k] = el.value.trim();
        store.set("rfs-profile", PROFILE);
        sum();
        if (k === "cert") {
          try {
            renderRSO();
          } catch (e) {}
        }
      });
    }
    sum();
    pb.onclick = () => {
      pp.hidden = !pp.hidden;
      pb.setAttribute("aria-expanded", !pp.hidden);
    };
    // straight to the profile, from the note on the flight report
    window.prOpenProfile = () => {
      open(true);
      pp.hidden = false;
      pb.setAttribute("aria-expanded", true);
      setTimeout(() => {
        const n = document.getElementById("p-name");
        if (n) {
          n.focus();
          n.scrollIntoView({ block: "center" });
        }
      }, 60);
    };
    for (const id of Object.values(F))
      document.getElementById(id).addEventListener("change", () => {
        try {
          profNoteRender();
        } catch (e) {}
      });
  }
  const cb = document.getElementById("s-colorbtn"),
    cp = document.getElementById("s-colors");
  cb.onclick = () => {
    cp.hidden = !cp.hidden;
    cb.setAttribute("aria-expanded", !cp.hidden);
  };
  // the colours are adjusted a little for dark backgrounds, so follow the phone's light/dark switch
  if (window.matchMedia)
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
      colors();
      redraw();
    });
  document.getElementById("s-legal").onclick = () => {
    open(false);
    document.getElementById("showlegal").click();
  };
  document.getElementById("s-about").onclick = () => {
    open(false);
    document.getElementById("showabout").click();
  };
  /**
   * Shows the current settings in the menu.
   */
  function sync() {
    for (const [key, attr, pick, def] of [
      ["rfs-accent", "main", pickM, "#D9501C"],
      ["rfs-accent2", "acc", pickA, "#8FCBEB"],
    ]) {
      const a = (store.get(key, null) || "").toUpperCase();
      let hit = false;
      menu.querySelectorAll(`[data-${attr}]`).forEach((b) => {
        const on = (b.dataset[attr] || "").toUpperCase() === a;
        b.setAttribute("aria-pressed", on);
        hit = hit || on;
      });
      const sc = pick.closest(".swcustom");
      sc.setAttribute("aria-pressed", !hit && !!a);
      sc.style.background = a && !hit ? a : "";
      pick.value = a || def;
    }
    const t = store.get("rfs-theme", "auto");
    menu.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeSet === t));
    document.getElementById("s-imp").setAttribute("aria-pressed", units === "imp");
    document.getElementById("s-met").setAttribute("aria-pressed", units === "met");
    sw.checked = store.get("rfs-swipe", true) !== false;
  }
  applyTheme(store.get("rfs-theme", "auto"));
  sync();
})();
document.getElementById("resetbtn").onclick = () => {
  // reset goes back to the open file as it was opened (or last saved), or a new design to the basic rocket it started from
  if (!isDirty()) {
    prToast("No changes to reset.");
    return;
  }
  document.getElementById("resettxt").textContent =
    SOURCE && SOURCE.base
      ? `Reset ${(SOURCE.resetTo || SOURCE.base).D.name || "the design"} to how it was when you ${SOURCE.resetTo ? "last saved" : "opened"} ${SOURCE.name}? Your edits will be lost.`
      : "Start this new design over from the basic rocket? Your edits to it will be lost.";
  document.getElementById("openconfirm").hidden = true;
  document.getElementById("resetconfirm").hidden = false;
  document.getElementById("resetyes").focus();
};
document.getElementById("resetno").onclick = () => {
  document.getElementById("resetconfirm").hidden = true;
};
/**
 * The warning shown instead of a run when the rail is too short (almost always a units mix-up).
 */
function showRailWarn() {
  document.getElementById("railwarntxt").textContent =
    `The rail is only ${fmt(L.rail, "alt", units === "imp" ? 1 : 2)} ${uname("alt")} long. A launch rail shorter than ${units === "imp" ? "2.5 ft" : "0.76 m"} won't guide the rocket to a safe speed, so the flight wasn't simulated. Check the rail length on the Range tab.`;
  document.getElementById("railwarn").hidden = false;
  document.getElementById("railfix").focus();
}
document.getElementById("railok").onclick = () => {
  document.getElementById("railwarn").hidden = true;
};
/**
 * The warning shown instead of a run when a motor is too big for its mount.
 * @param {object} m motor
 * @param {object} fit from motorFit
 * @param {string} [stage]
 */
function showFitWarn(m, fit, stage) {
  document.getElementById("fitwarntxt").textContent =
    `The ${m.cn || m.name} is a ${fit.motor} mm motor, too big for the ${fit.mount} mm ${stage ? (stage === "first" ? "first-stage" : stage) + " " : ""}motor mount ${fit.src === "chosen" ? "you chose" : "in your design"}, so the flight wasn't simulated. Choose a motor that fits on the Motor tab${fit.src === "file" ? " or pick a larger motor mount in the design tree on the Rocket tab" : ""}.`;
  document.getElementById("fitfix").textContent = "Choose another motor";
  document.getElementById("fitwarn").hidden = false;
  document.getElementById("fitfix").focus();
  document.getElementById("fitfix").onclick = () => {
    document.getElementById("fitwarn").hidden = true;
    if (stage) motorTarget = stage;
    mountFilter();
    showTab("motor");
    renderMotors();
    window.scrollTo({ top: 0 });
  };
}
/**
 * The warning shown when a chosen mount is bigger than its body.
 * @param {{cls:number, body:number}} tb from mountTooBig
 * @param {string} [stage]
 * @param {boolean} booster
 */
function showMountWarn(tb, stage, booster) {
  document.getElementById("fitwarntxt").textContent =
    `A ${tb.cls} mm motor mount doesn't fit inside the ${fmt(booster ? D.bDiameter : D.diameter, "small")} ${uname("small")} ${stage ? stage + " " : ""}body tube, so the flight wasn't simulated. Choose a smaller motor mount in the design tree on the Rocket tab.`;
  const fx = document.getElementById("fitfix");
  fx.textContent = "Change mount size";
  fx.onclick = () => {
    document.getElementById("fitwarn").hidden = true;
    showTab("rocket");
  };
  document.getElementById("fitwarn").hidden = false;
  fx.focus();
}
document.getElementById("fitok").onclick = () => {
  document.getElementById("fitwarn").hidden = true;
};
document.getElementById("railfix").onclick = () => {
  document.getElementById("railwarn").hidden = true;
  showTab("flight");
  const f = document.getElementById("f-rail");
  if (f) {
    f.scrollIntoView({ block: "center" });
    f.focus();
    f.select && f.select();
  }
};
// pop-up dialogs close on a tap outside the box or the Escape key
for (const id of ["resetconfirm", "openconfirm", "railwarn", "fitwarn"]) {
  const m = document.getElementById(id);
  m.addEventListener("click", (e) => {
    if (e.target === m) m.hidden = true;
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    for (const id of ["resetconfirm", "openconfirm", "railwarn", "fitwarn"]) document.getElementById(id).hidden = true;
});
document.getElementById("resetyes").onclick = () => {
  document.getElementById("savemsg").innerHTML = "";
  if (SOURCE && SOURCE.base) {
    const B = SOURCE.resetTo || SOURCE.base;
    D = Object.assign(defaultDesign(), jclone(B.D));
    L = Object.assign(defaultLaunch(), jclone(B.L));
    siteKeep();
    motorId = B.motorId || motorId;
    if (B.boostId) boostId = B.boostId;
    if (B.firstId) firstId = B.firstId;
    if (B.M) BLD = jclone(B.M);
  } else {
    BLD = bldDefault();
  }
  store.set("rfs-motor", motorId);
  if (boostId) store.set("rfs-bmotor", boostId);
  bldSel = BLD_ROOT;
  bldSave();
  try {
    bldDerive();
  } catch (e) {}
  applyCal();
  document.getElementById("resetconfirm").hidden = true;
  renderForms();
  changed();
  markClean();
  bldRender();
  if (typeof renderMotors === "function") renderMotors();
};

/**
 * Escapes text for HTML.
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
document.getElementById("orkfile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const buf = await f.arrayBuffer();
    const xml = await unzipOrk(buf);
    if (await loadDesignXml(xml, f.name, buf)) await recentAdd(buf, f.name);
  } catch (err) {
    document.getElementById("orkreport").innerHTML = `<div class="report err">${esc(err.message || String(err))}</div>`;
  }
  e.target.value = "";
});
/**
 * Opens a design from .ork or .rkt text: reads it, picks the motors, sets the design, conditions and builder
 * parts, and reports what was opened.
 * @param {string} xml
 * @param {string} fileName
 * @param {ArrayBuffer} [buf] the file as opened (kept for saving changes back into it)
 * @param {{cfg:string}} [opts] cfg: a motor configuration chosen on the Motor tab, when reopening for it
 *
 * open a design from .ork / .rkt text: from a file, or from the rocket builder
 */
async function loadDesignXml(xml, fileName, buf, opts = {}) {
  const rep = document.getElementById("orkreport");
  ORK_CFG = opts.cfg || null; // a motor configuration chosen on the Motor tab, when reopening for it
  try {
    const r = /<RockSimDocument/i.test(xml.slice(0, 4000)) ? parseRkt(xml) : parseOrk(xml);
    D = r.design;
    const keptWx = !!(L && L.wxSet);
    {
      const keep = {};
      [...RANGE_KEYS, "elev", "lat", "lon", ...(keptWx ? WX_KEYS : [])].forEach((k) => {
        if (L && L[k] !== undefined) keep[k] = jclone(L[k]);
      });
      L = Object.assign(r.launch, keep);
    }
    const keptSite = siteKeep(); // your range settings stay when you open another rocket
    const mm = matchMotor(r.motor);
    let mnote = "";
    /**
     * Matches a stage's extra motors to the motor list.
     */
    const addExtras = (list, key, label) => {
      const miss = [];
      D[key] = [];
      for (const e of list || []) {
        const x = matchMotor(e);
        if (x) D[key].push({ id: x.id, n: e.count || 1 });
        else miss.push(`${e.mfr} ${e.designation}`.trim());
      }
      return miss.length
        ? ` ${label} also uses ${miss.join(", ")}, which ${miss.length > 1 ? "aren’t" : "isn’t"} in your motor list.`
        : "";
    };
    if (mm) {
      motorId = mm.id;
      store.set("rfs-motor", motorId);
    }
    let xnote = addExtras(r.motorExtras, "extraMotors", D.twoStage ? "The sustainer" : "The rocket");
    if (mm) {
      const c = clusterOf(mm, D.extraMotors);
      mnote = `${D.twoStage ? "Sustainer motor" : "Motor"} set to ${c.cn || c.name}.` + xnote;
    } else if (r.motor && r.motor.designation) {
      const miss = [
        ...new Set(
          [r.motor, ...(r.motorExtras || [])]
            .filter((e) => e && e.designation && !matchMotor(e))
            .map((e) => `${e.mfr} ${e.designation}`.trim()),
        ),
      ];
      mnote = `The file uses ${miss.join(" and ")}, which ${miss.length > 1 ? "aren’t" : "isn’t"} in your motor list. Upload ${miss.length > 1 ? "their .eng files" : "its .eng file"} on the Motor tab.`;
      // the motor left over from before may not fit this rocket: choose one that does, close to the file's impulse class
      const alt = fitStandIn(D, false, r.motor);
      if (alt) {
        motorId = alt.id;
        store.set("rfs-motor", motorId);
        mnote += ` Until then the ${alt.cn || alt.name} (${Math.round(alt.dia * 1000)} mm, fits the motor mount) is selected.`;
      }
    } else if (opts.builder)
      mnote =
        "No motor was chosen in the builder: pick one on the Motor tab, which is filtered to the motor mount size.";
    if (D.twoStage) {
      const bm = matchMotor(r.boosterMotor);
      const bx = addExtras(r.boosterExtras, "bExtraMotors", "The booster");
      if (bm) {
        boostId = bm.id;
        store.set("rfs-bmotor", boostId);
        const c = clusterOf(bm, D.bExtraMotors);
        mnote += ` Booster motor set to ${c.cn || c.name}.` + bx;
      } else if (r.boosterMotor && r.boosterMotor.designation) {
        mnote += ` The booster uses ${r.boosterMotor.mfr} ${r.boosterMotor.designation}, which isn’t in your motor list. Upload its .eng file on the Motor tab.`;
        const alt = fitStandIn(D, true, r.boosterMotor);
        if (alt) {
          boostId = alt.id;
          store.set("rfs-bmotor", boostId);
          mnote += ` Until then the ${alt.cn || alt.name} (${Math.round(alt.dia * 1000)} mm, fits the booster’s motor mount) is selected.`;
        }
      }
    }
    if (isThree(D)) {
      const fm = matchMotor(r.firstMotor);
      const fx = addExtras(r.firstExtras, "s1ExtraMotors", "The first stage");
      if (fm) {
        firstId = fm.id;
        store.set("rfs-b1motor", firstId);
        const c = clusterOf(fm, D.s1ExtraMotors);
        mnote += ` First-stage motor set to ${c.cn || c.name}.` + fx;
      } else if (r.firstMotor && r.firstMotor.designation) {
        mnote += ` The first stage uses ${r.firstMotor.mfr} ${r.firstMotor.designation}, which isn’t in your motor list. Upload its .eng file on the Motor tab.`;
        const alt = fitStandIn(s1View(D), true, r.firstMotor, firstId);
        if (alt) {
          firstId = alt.id;
          store.set("rfs-b1motor", firstId);
          mnote += ` Until then the ${alt.cn || alt.name} (${Math.round(alt.dia * 1000)} mm, fits the first stage’s motor mount) is selected.`;
        }
      }
    }
    if (keptWx)
      mnote +=
        " Your weather (temperature, pressure, humidity, wind and winds aloft) was kept, not the conditions saved in the file.";
    if (keptSite)
      mnote += ` Your launch site, ${keptSite}, was kept (elevation, coordinates, rail and range), not the file’s own launch settings.`;
    const uniq = [...new Set(r.notes)];
    const summary = isThree(D)
      ? `Three-stage rocket. Sustainer: ${fmt(D.dryMass, "mass")} ${uname("mass")} without motor, ${fmt(D.length, "len", 1)} ${uname("len")} long. Booster: ${fmt(D.bDryMass, "mass")} ${uname("mass")}, ${fmt(D.bLength, "len", 1)} ${uname("len")}. First stage: ${fmt(D.s1.bDryMass, "mass")} ${uname("mass")}, ${fmt(D.s1.bLength, "len", 1)} ${uname("len")}. Booster ignition ${(D.midDelay || 0).toFixed(1)} s after first-stage burnout; sustainer ignition ${D.stageDelay.toFixed(1)} s after booster burnout.`
      : D.twoStage
        ? `Two-stage rocket. Sustainer: ${fmt(D.dryMass, "mass")} ${uname("mass")} without motor, CG ${fmt(D.cgEmpty, "len", 1)} ${uname("len")}, ${fmt(D.length, "len", 1)} ${uname("len")} long. Booster: ${fmt(D.bDryMass, "mass")} ${uname("mass")}, ${fmt(D.bLength, "len", 1)} ${uname("len")} long. Sustainer ignition ${D.stageDelay.toFixed(1)} s after booster burnout.`
        : `Weight without motor ${fmt(D.dryMass, "mass")} ${uname("mass")}, CG ${fmt(D.cgEmpty, "len", 1)} ${uname("len")}, length ${fmt(D.length, "len", 1)} ${uname("len")}.`;
    rep.innerHTML = `<div class="report"><b>${opts.builder ? "Built" : "Opened"} ${esc(D.name)}.</b> ${esc(summary)} ${esc(mnote)}
      ${uniq.length ? `<ul>${uniq.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}<div class="note" style="margin-top:6px">Weight, CG and turning inertia are computed from the file’s components and materials. If you have weighed and balanced the real rocket, select the stage in the design tree and enter your numbers there.</div></div>`;
    {
      const isR = /<RockSimDocument/i.test(xml.slice(0, 4000));
      let nm = (fileName || "").trim();
      if (!nm || /^\.[a-z]+$/i.test(nm) || !/\.(ork|rkt)$/i.test(nm))
        nm = ((D.name || "rocket").replace(/[\\/:*?"<>|]+/g, "-").trim() || "rocket") + (isR ? ".rkt" : ".ork");
      BLD = bldFromOrk(isR ? r.orkXml : xml, { ...r, rkt: isR });
      BLD.name = r.design.name || BLD.name;
      BLD.bp = { comps: {}, splits: {} };
      // Pocket Rocket's own files inside the .ork: from the opened file, or (reopening it for another motor configuration)
      // from the copy kept with the design
      const prevX = opts.cfg != null && !buf && SOURCE ? SOURCE.extras || [] : null;
      /**
       * Reads a file kept inside the .ork (ejection charges, fin edges) from the copy kept with the design.
       */
      const side = async (nm) => {
        try {
          if (buf) {
            const e = zipEntries(buf).find((e) => e.name === nm);
            return e ? new TextDecoder().decode(await zipData(buf, e)) : null;
          }
          const x = prevX && prevX.find((x) => x.name === nm);
          return x ? new TextDecoder().decode(b64ToU8(x.b64)) : null;
        } catch (e) {
          return null;
        }
      };
      if (!isR)
        try {
          const t = await side(FIN_ORK);
          if (t) {
            const fe = JSON.parse(t).finEdges || {};
            for (const st of BLD.stages)
              for (const pp of st.parts || [])
                for (const k of pp.kids || [])
                  if (k.type === "fins" && fe[k.id] && FIN_EDGES.some((x) => x[0] === fe[k.id])) k.edge = fe[k.id];
          }
        } catch (e) {}
      if (!isR)
        try {
          const t = await side(BP_ORK);
          if (t) {
            const j = JSON.parse(t);
            BLD.bp = { comps: j.comps || {}, splits: j.splits || {} };
          }
        } catch (e) {}
      if (isR) BLD.mountHint = [r.design.mountDia || null, r.design.bMountDia || null];
      // a RockSim stage with different motors: the main mount flies the one that fits it
      if (isR) {
        const pm = bldMounts(BLD.stages[0])[0];
        if (pm && pm.motor && pm.motor.id && pm.motor.id !== motorId && findMotor(pm.motor.id)) {
          motorId = pm.motor.id;
          store.set("rfs-motor", motorId);
        }
      }
      // a motor the file names but your list doesn't have stays in the file until you choose another one
      BLD.hold = [
        r.motor && r.motor.designation && !mm ? motorId : null,
        D.twoStage && r.boosterMotor && r.boosterMotor.designation && !matchMotor(r.boosterMotor) ? boostId : null,
        isThree(D) && r.firstMotor && r.firstMotor.designation && !matchMotor(r.firstMotor) ? firstId : null,
      ];
      bldSel = BLD_ROOT;
      bldSave();
      try {
        bldDerive();
      } catch (e) {}
      setSource({
        name: nm,
        format: isR ? "rkt" : "ork",
        text: xml,
        src: r.src,
        extras: isR ? [] : prevX ? prevX : !buf ? [] : await zipOthers(buf),
        recentId: prevX && SOURCE ? SOURCE.recentId : undefined,
        base: { D: jclone(D), L: jclone(L), motorId, boostId, firstId, M: jclone(BLD) },
      });
      document.getElementById("savemsg").innerHTML = "";
    }
    applyCal();
    if (D.dragScale !== 1)
      rep
        .querySelector(".report")
        ?.insertAdjacentHTML(
          "beforeend",
          `<div class="note" style="margin-top:6px">Drag is calibrated to your flight of this rocket (×${D.dragScale.toFixed(2)}). See Results to change it.</div>`,
        );
    motorTarget = "sustainer";
    mountFilter();
    renderMotors();
    setActive(true);
    renderForms();
    changed();
    markClean();
    bldRender();
    // the Android app overwrites the opened file on save; a built design has no file yet
    try {
      const A = window.PocketRocketApp;
      if (A) {
        if (opts.recent) {
          if (opts.recent.live && opts.recent.uri && A.useSource) A.useSource(opts.recent.uri);
          else if (A.clearSource) A.clearSource();
        } else if (opts.example) {
          if (A.clearSource) A.clearSource();
        } // an example has no file on the phone: Save changes asks where to save
        else if (!opts.builder && A.markSource) A.markSource();
        else if (opts.builder && A.clearSource) A.clearSource();
      }
    } catch (_) {}
    renderRecent();
    return true;
  } catch (err) {
    rep.innerHTML = `<div class="report err">${esc(err.message || String(err))}</div>`;
    return false;
  }
}
document.getElementById("engfile").addEventListener("change", async (e) => {
  const rep = document.getElementById("engreport");
  const added = [],
    bad = [],
    dup = [];
  // a .zip is opened and every .eng / .rse file inside it (in any folder) is read, as if each had been picked
  const files = [];
  for (const f of e.target.files) {
    const buf = await f.arrayBuffer(),
      u8 = new Uint8Array(buf);
    if (/\.zip$/i.test(f.name) || (u8[0] === 0x50 && u8[1] === 0x4b)) {
      try {
        const ents = (await unzipEntries(buf)).filter(
          (x) => !/(^|\/)(__MACOSX\/|\.)/.test(x.name) && /\.(eng|rse)$/i.test(x.name),
        );
        if (!ents.length) bad.push(`${f.name} (no .eng or .rse files inside)`);
        for (const x of ents)
          files.push({ name: x.name.split("/").pop(), text: async () => new TextDecoder().decode(await x.data()) });
      } catch (err) {
        bad.push(f.name);
      }
    } else files.push({ name: f.name, text: async () => new TextDecoder().decode(u8) });
  }
  for (const f of files) {
    try {
      const txt = await f.text();
      const ms = /\.rse$/i.test(f.name) || txt.trim().startsWith("<") ? parseRse(txt) : parseEng(txt);
      if (!ms.length) {
        bad.push(f.name);
        continue;
      }
      ms.forEach((m) => {
        classifyUser(m);
        if (!isFinite(m.totalMass) || !isFinite(m.propMass)) throw new Error("missing weights");
        if (dupMotor(m, allMotors())) {
          dup.push(m.name);
          return;
        }
        USER_MOTORS = USER_MOTORS.filter((x) => x.id !== m.id);
        USER_MOTORS.push(m);
        added.push(m.name);
      });
    } catch (err) {
      bad.push(f.name);
    }
  }
  store.set("rfs-motors", USER_MOTORS);
  if (added.length) {
    motorId = USER_MOTORS.find((m) => m.name === added[added.length - 1]).id;
    store.set("rfs-motor", motorId);
  }
  rep.innerHTML = `<div class="report${bad.length && !added.length ? " err" : ""}">${added.length ? `Added ${added.length > 8 ? `${added.length} motors (${added.slice(0, 6).map(esc).join(", ")} and ${added.length - 6} more)` : added.map(esc).join(", ")} to your user-uploaded motors${added.length === 1 ? " and selected it" : ""}.` : ""} ${dup.length ? `Skipped ${dup.length} duplicate${dup.length > 1 ? "s" : ""} (same name, impulse, diameter and maker as a motor already in the list): ${dup.length > 8 ? `${dup.slice(0, 6).map(esc).join(", ")} and ${dup.length - 6} more` : dup.map(esc).join(", ")}.` : ""} ${bad.length ? `Couldn’t read ${bad.map(esc).join(", ")}. Check that it is a RASP .eng or RockSim .rse file.` : ""}</div>`;
  renderMotors();
  if (added.length) markStale();
  e.target.value = "";
});
let rt = null;
window.addEventListener("resize", () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    drawChart();
    drawProfile();
  }, 100);
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  drawChart();
  drawProfile();
});
new MutationObserver(() => {
  drawChart();
  drawProfile();
}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
