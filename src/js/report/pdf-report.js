/**
 * File downloads (Android app, the claude.ai page's downloads, or an ordinary browser download) and the PDF flight
 * report (jsPDF): the design, motors, conditions, results, RSO checklist, every graph and the flyer's profile.
 * Coordinates in the PDF are points (1/72 in) from the top left.
 */
/* ---------- PDF flight report ---------- */
/**
 * How files are saved here: an object with save({filename, data}) that resolves with {status}.
 */
let downloadsNS = null;
/**
 * Saving through an ordinary browser download.
 * @returns {{browser:boolean, save:function}}
 */
function browserDownloads() {
  const types = {
    pdf: "application/pdf",
    ork: "application/octet-stream",
    zip: "application/zip",
    mp4: "video/mp4",
    webm: "video/webm",
    csv: "text/csv",
    json: "application/json",
    png: "image/png",
    eng: "text/plain",
    txt: "text/plain",
    html: "text/html",
  };
  return {
    browser: true,
    save: async ({ filename, data }) => {
      const ext = (String(filename).split(".").pop() || "").toLowerCase();
      const url = URL.createObjectURL(new Blob([data], { type: types[ext] || "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { status: "saved" };
    },
  };
}
/**
 * Bytes as base64 (in chunks, so large files don't overflow the call stack).
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns {string}
 */
function bufToB64(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
(async () => {
  try {
    if (window.PocketRocketApp && window.PocketRocketApp.saveFile) {
      downloadsNS = {
        save: async ({ filename, data }) => {
          window.PocketRocketApp.saveFile(filename, bufToB64(data));
          return { status: "delivered" };
        },
      };
    } else if (window.claude && window.claude.use) {
      downloadsNS = await window.claude.use("downloads");
    }
  } catch (e) {
    downloadsNS = null;
  }
  // opened straight in a browser (from a file or a web site): an ordinary download
  if (!downloadsNS) downloadsNS = browserDownloads();
  const b = document.getElementById("exportwrap");
  if (b) b.hidden = !downloadsNS || !lastSim;
})();
/**
 * Text with the characters the PDF's built-in fonts lack replaced (≥, ≤, arrows, subscripts...).
 * @param {string} s
 * @returns {string}
 */
function pdfSafe(s) {
  return String(s ?? "")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/×/g, "x")
    .replace(/µ/g, "u")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u00B7]/g, "");
}
/**
 * Surface finish names for the report: [roughness, label].
 */
const PDF_FINISHES = [
  ["0.5e-6", "Smooth molded composite (0.5 µm)"],
  ["1.5e-6", "Polished metal (1.5 µm)"],
  ["6e-6", "Smooth paint, sanded (6 µm)"],
  ["10e-6", "Matte or camouflage paint (10 µm)"],
  ["30e-6", "Hobby spray paint (30 µm, est.)"],
  ["100e-6", "Bare paper or phenolic tube (100 µm, est.)"],
  ["300e-6", "Raw fiberglass weave or balsa (300 µm, est.)"],
];
/**
 * Rail guide names for the report: [preset, label].
 */
const PDF_RAIL_GUIDES = [
  ["none", "None"],
  ["1010", "1010 buttons ×2"],
  ["1515", "1515 buttons ×2"],
  ["custom", "From design file"],
];
/**
 * Builds the flight report for the last run.
 * @returns {jsPDF} the document
 */
function buildReportPdf() {
  const { out, st, m, S } = lastSim,
    RD = lastSim.D,
    RL = lastSim.L,
    mb = lastSim.mb,
    SL = lastSim.SS || S;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const PW = 612,
    PH = 792,
    MX = 40,
    CW = PW - 2 * MX;
  const C = {
    gulf: window.PR_GULF ? window.PR_GULF.rgb : [143, 203, 235],
    gulfInk: window.PR_GULF ? window.PR_GULF.rgb.map((v) => Math.round(v * 0.45)) : [33, 112, 159],
    ink: [21, 32, 42],
    muted: [91, 104, 117],
    line: [211, 217, 223],
    field: [246, 248, 249],
    accent: window.PR_ACCENT ? window.PR_ACCENT.rgb : [217, 80, 28],
    cg: [43, 108, 176],
    cp: [197, 48, 48],
    good: [47, 133, 90],
    warn: [168, 105, 15],
    bad: [197, 48, 48],
  };
  /**
   * Sets the text (or fill/draw) color.
   */
  const col = (c, f = "text") => {
    if (f === "text") doc.setTextColor(...c);
    else if (f === "draw") doc.setDrawColor(...c);
    else doc.setFillColor(...c);
  };
  /**
   * Writes text (made PDF-safe).
   */
  const T = (s, x, y, o) => doc.text(pdfSafe(s), x, y, o);
  /**
   * Sets the font weight and size.
   */
  const font = (w, sz) => {
    doc.setFont("helvetica", w);
    doc.setFontSize(sz);
  };
  const when = new Date();
  const motorName = m.cn && m.cn !== m.name ? m.cn + " (" + m.name + ")" : m.name;
  const fileName = SOURCE && SOURCE.name ? SOURCE.name : "None (a new design not yet saved to a file)";
  const m1L =
    st.three && lastSim.m1
      ? `${lastSim.m1.mfr || ""} ${lastSim.m1.cn && lastSim.m1.cn !== lastSim.m1.name ? lastSim.m1.cn + " (" + lastSim.m1.name + ")" : lastSim.m1.name} first stage, `
      : "";
  const motorLine = st.staged
    ? m1L +
      `${mb.mfr || ""} ${mb.cn && mb.cn !== mb.name ? mb.cn + " (" + mb.name + ")" : mb.name} booster, ${m.mfr || ""} ${motorName} sustainer`
    : `${m.mfr || ""} ${motorName}`;
  /**
   * Writes a section heading; returns the y below it.
   */
  const sectionHead = (title, yy) => {
    font("bold", 15);
    col(C.ink);
    T(title, MX, yy);
    col(C.gulf, "fill");
    doc.rect(MX, yy + 6, CW, 2, "F");
    return yy + 26;
  };
  // ---- page 1: title block and the rocket's configuration
  font("bold", 24);
  col(C.ink);
  T("Flight Report", MX, 46);
  const info = [
    ["Rocket name", RD.name || "Rocket"],
    ["Design file", fileName],
    ["Motor", motorLine.trim()],
    ["Generated", when.toLocaleString([], { dateStyle: "long", timeStyle: "short" })],
  ];
  const infoW = CW - 72 - (PROFILE.name || PROFILE.club || PROFILE.nar || PROFILE.tra || PROFILE.cert ? 180 : 0);
  info.forEach(([k, v], i) => {
    const yy = 68 + i * 13;
    font("normal", 9.5);
    col(C.muted);
    T(k, MX, yy);
    col(C.ink);
    doc.text(doc.splitTextToSize(pdfSafe(v), infoW)[0], MX + 72, yy);
  });
  {
    const P = PROFILE,
      mem = [P.nar ? `NAR ${P.nar}` : "", P.tra ? `Tripoli ${P.tra}` : ""].filter(Boolean).join(" · "),
      lines = [
        P.name,
        P.club,
        mem,
        P.cert ? CERT_NAME[P.cert] + (P.cert === "none" ? "" : " certification") : "",
      ].filter(Boolean);
    if (lines.length) {
      font("bold", 8.5);
      col(C.muted);
      T("FLIER", PW - MX, 32, { align: "right" });
      lines.forEach((v, i) => {
        font(i === 0 && P.name ? "bold" : "normal", 9.5);
        col(C.ink);
        T(doc.splitTextToSize(pdfSafe(v), 170)[0], PW - MX, 46 + i * 12, { align: "right" });
      });
    }
  }
  font("normal", 8.5);
  col(C.muted);
  const verTxt = (document.querySelector(".vnum")?.textContent || "v1.0").trim(),
    bld = APP_BUILD;
  T(`Pocket Rocket Flight Lab ${verTxt}${bld ? " · build " + bld : ""}`, PW - MX, 110, { align: "right" });
  col(C.gulf, "fill");
  doc.rect(0, 118, PW, 4, "F");
  let y = sectionHead("Rocket configuration", 156);
  pdfProfile(doc, C, MX, y, CW, 120, RD, m, SL, mb);
  y += 136;
  font("normal", 8.5);
  col(C.cg, "fill");
  doc.circle(MX + 3, y - 3, 3, "F");
  col(C.cg);
  T(st.staged ? "CG of stack" : "CG with motor", MX + 10, y);
  col(C.cp, "fill");
  doc.circle(MX + 93, y - 3, 3, "F");
  col(C.cp);
  T("CP (Barrowman)", MX + 100, y);
  col(C.muted);
  T(
    st.staged
      ? `Stack ${SL.marginL.toFixed(2)} cal at liftoff · sustainer ${S.marginL.toFixed(2)} cal alone`
      : `Margin ${S.marginL.toFixed(2)} cal at liftoff, ${S.marginB.toFixed(2)} at burnout`,
    MX + 190,
    y,
  );
  y += 18;
  const A = aero(RD),
    ns = noseSpec(RD);
  const noseLabel = (NOSE_PRESETS.find((p) => p[0] === String(RD.noseShape)) || [0, `${ns.shape} ${ns.param}`])[1];
  const finishLabel = (PDF_FINISHES.find((o) => Math.abs(+o[0] - RD.finish) < 1e-12) || [
    0,
    (RD.finish * 1e6).toFixed(0) + " um",
  ])[1];
  const railLabel =
    RD.railPreset === "custom"
      ? "From design file"
      : (PDF_RAIL_GUIDES.find((o) => o[0] === RD.railPreset) || [0, RD.railPreset])[1];
  const left = [
    [st.staged ? "Sustainer length" : "Total length", `${fmt(RD.length, "len")} ${uname("len")}`],
    ["Body diameter", `${fmt(2 * A.R, "small")} ${uname("small")}`],
    [
      "Body sections",
      RD.segments && RD.segments.length
        ? `${RD.segments.length} (from file)`
        : "Nose, tube" + (RD.tailLen > 0 ? ", boat tail" : ""),
    ],
    ["Nose", `${noseLabel}, ${fmt(A.Ln, "len")} ${uname("len")}`],
    [
      "Fins",
      `${RD.finCount} × ${fmt(RD.finRoot, "len")} root, ${fmt(RD.finTip, "len")} tip, ${fmt(RD.finSpan, "len")} span`,
    ],
    [
      "Fin sweep / thickness",
      `${fmt(RD.finSweep, "len")} / ${fmt(RD.finThick, "small")} ${uname("small")}, ${RD.finEdge}`,
    ],
    ...(RD.extraFins || []).map((f, i) => [
      `Fin set ${i + 2} @ ${fmt(f.pos, "len")} ${uname("len")}`,
      `${f.n} × ${fmt(f.root, "len")} root, ${fmt(f.tip, "len")} tip, ${fmt(f.span, "len")} span`,
    ]),
    ["Weight without motor", `${fmt(RD.dryMass, "mass")} ${uname("mass")}`],
    ["CG without motor", `${fmt(RD.cgEmpty, "len")} ${uname("len")} from tip`],
    [
      "Turning inertia",
      `${fmt(airInertia(RD.dryInertia, RD.inertiaMass, RD.dryMass, RD.length), "moi")} ${uname("moi")}${RD.dryInertia > 0 ? (RD.inertiaSource === "file" ? ", from file" : "") : ", estimated"}`,
    ],
    [st.staged ? "CP (sustainer alone)" : "CP", `${fmt(S.cp, "len")} ${uname("len")} from tip`],
    ["Surface finish", finishLabel],
    ["Rail guides", railLabel],
    [
      "Cd at Mach 0.3",
      RD.cdOverride > 0
        ? RD.dragScale > 0 && RD.dragScale !== 1
          ? `${(RD.cdOverride * RD.dragScale).toFixed(3)} (the file's fixed ${RD.cdOverride.toFixed(3)}, calibrated to a real flight, ×${RD.dragScale.toFixed(2)})`
          : `${RD.cdOverride.toFixed(3)} (override)`
        : RD.dragScale > 0 && RD.dragScale !== 1
          ? `${st.cdLow.toFixed(3)} (calibrated to a real flight, ×${RD.dragScale.toFixed(2)})`
          : st.cdLow.toFixed(3),
    ],
  ];
  const ms = mstats(m);
  const right = [
    [st.staged ? "Sustainer motor" : "Motor", `${m.mfr || ""} ${motorName}`],
    ["System / case", [SYS_LABEL[m.sys] || "", m.case].filter(Boolean).join(", ") || "—"],
    ["Propellant", m.prop || "—"],
    ["Total impulse", `${ms.I.toFixed(1)} N·s (${ms.cls} class)`],
    ["Average / peak thrust", `${fmt(ms.avg, "force", 1)} / ${fmt(ms.Fmax, "force", 1)} ${uname("force")}`],
    ["Burn time", `${ms.tb.toFixed(2)} s`],
    ["Loaded / propellant weight", `${fmt(m.totalMass, "mass")} / ${fmt(m.propMass, "mass")} ${uname("mass")}`],
    ["Field elevation", `${fmt(RL.elev, "alt")} ${uname("alt")}`],
    ["Temperature", `${fmt(RL.tempC, "temp", 0)} ${uname("temp")}`],
    ...(RL.pressure > 0 || RL.humidity > 0
      ? [
          [
            "Pad air",
            `${RL.pressure > 0 ? fmt(RL.pressure, "press") + " " + uname("press") : "standard pressure"}${RL.humidity > 0 ? `, ${Math.round(RL.humidity * 100)}% humidity` : ""}`,
          ],
        ]
      : []),
    ...(RL.ceiling > 0 ||
    RL.cloudLow > 0 ||
    RL.cloudMid > 0 ||
    RL.cloudHigh > 0 ||
    RL.vis > 0 ||
    RL.precip > 0 ||
    RL.dewC != null
      ? [
          [
            "Clouds and rain",
            [
              RL.ceiling > 0 ? `cloud base ${fmt(RL.ceiling, "alt")} ${uname("alt")} above the pad` : "clear",
              RL.cloudLow || RL.cloudMid || RL.cloudHigh
                ? `cloud cover ${Math.round((RL.cloudLow || 0) * 100)}% low, ${Math.round((RL.cloudMid || 0) * 100)}% mid, ${Math.round((RL.cloudHigh || 0) * 100)}% high`
                : "",
              RL.vis > 0 ? `visibility ${fmt(RL.vis, "vis")} ${uname("vis")}` : "",
              RL.precip > 0 ? `${Math.round(RL.precip * 100)}% chance of precipitation` : "",
              RL.dewC != null ? `dew point ${Math.round(toDisp(RL.dewC, "temp"))} ${uname("temp")}` : "",
            ]
              .filter(Boolean)
              .join(", "),
          ],
        ]
      : []),
    ...(RL.motorDT
      ? [
          [
            "Motor temperature",
            `${RL.motorDT > 0 ? "+" : ""}${fmt(RL.motorDT, "dtemp")} ${uname("dtemp")} from the air`,
          ],
        ]
      : []),
    ...((RL.aloft || []).length
      ? [
          [
            "Winds aloft",
            `${RL.aloft.length} levels to ${fmt(Math.max(...RL.aloft.map((r) => r.alt)), "alt")} ${uname("alt")}, up to ${fmt(Math.max(...RL.aloft.map((r) => r.speed)), "wind")} ${uname("wind")}${RL.aloftSrc ? ` (${RL.aloftSrc})` : ""}`,
          ],
        ]
      : []),
    ...(RL.thrustMis || RL.finMis || RL.cgOff || RL.clusterFail
      ? [
          [
            "Imperfections",
            [
              RL.thrustMis ? `thrust ${RL.thrustMis}°` : "",
              RL.finMis ? `fin ${RL.finMis}°` : "",
              RL.cgOff ? `CG offset ${fmt(RL.cgOff, "small")} ${uname("small")}` : "",
              RL.clusterFail ? "one cluster motor out" : "",
            ]
              .filter(Boolean)
              .join(", "),
          ],
        ]
      : []),
    ...(RL.lat != null ? [["Site", `Latitude ${Math.abs(RL.lat).toFixed(2)}° ${RL.lat >= 0 ? "N" : "S"}`]] : []),
    [
      "Wind",
      `${fmt(RL.wind, "wind")} ${uname("wind")} from ${compass(RL.windDir ?? 270)}${RL.turb > 0 ? `, ${(RL.turb * 100).toFixed(0)}% gusts` : ""}`,
    ],
    [
      "Rail",
      `${fmt(RL.rail, "alt", 1)} ${uname("alt")} at ${RL.angle.toFixed(1)}°, ${RL.railMode === "fixed" ? "toward " + compass(RL.railDir || 0) : "into the wind"}`,
    ],
    [
      "Recovery",
      !(RD.mainDia > 0) && !(RD.recovery === "dual" && RD.drogueDia > 0)
        ? "None in the design (tumbles down)"
        : RD.recovery === "single"
          ? `${fmt(RD.mainDia, "len", 0)} ${uname("len")} chute ${{ motor: RD.ejDelay != null ? `at ejection, ${(+RD.ejDelay).toFixed(1)} s delay` : "at ejection (motor plugged)", timer: `${(RD.deployDelay || 0).toFixed(1)} s after liftoff` }[RD.deployMode] || ((RD.deployDelay || 0) > 0 ? `${RD.deployDelay.toFixed(1)} s after apogee` : "at apogee")}`
          : `${RD.drogueDia > 0 ? fmt(RD.drogueDia, "len", 0) + " " + uname("len") + " drogue, " : "No drogue, "}${fmt(RD.mainDia, "len", 0)} ${uname("len")} main at ${fmt(RD.mainAlt, "alt")} ${uname("alt")}`,
    ],
  ];
  /**
   * Writes a titled table of label/value rows; returns the y below it.
   */
  const kv = (rows, x, w, title) => {
    let yy = y;
    font("bold", 11);
    col(C.ink);
    T(title, x, yy);
    yy += 6;
    rows.forEach(([k, v]) => {
      yy += 15;
      col(C.line, "draw");
      doc.setLineWidth(0.5);
      doc.line(x, yy + 4, x + w, yy + 4);
      font("normal", 8.5);
      col(C.muted);
      T(k, x, yy);
      font("bold", 8.5);
      col(C.ink);
      const vl = doc.splitTextToSize(pdfSafe(v), w - 104);
      doc.text(vl[0], x + w, yy, { align: "right" });
    });
    return yy;
  };
  const half = (CW - 24) / 2;
  const y1 = kv(left, MX, half, st.staged ? "Sustainer" : "Airframe"),
    y2 = kv(right, MX + half + 24, half, "Motor, launch & recovery");
  y = Math.max(y1, y2) + 30;
  if (st.staged) {
    const b = st.booster || {},
      bms = mstats(mb);
    const sL = [
      ["Ignition delay", `${(RD.stageDelay || 0).toFixed(1)} s after booster burnout`],
      [
        "Separation",
        st.sep
          ? `${fmt(st.sep.alt, "alt")} ${uname("alt")}, ${fmt(st.sep.v, "speed")} ${uname("speed")}, ${st.sep.t.toFixed(2)} s`
          : "—",
      ],
      [
        "Sustainer ignition",
        st.ign
          ? `${fmt(st.ign.alt, "alt")} ${uname("alt")}, ${fmt(st.ign.v, "speed")} ${uname("speed")}`
          : "After apogee",
      ],
      ["Tilt at ignition", st.ign ? `${st.ign.tilt.toFixed(1)}° from vertical` : "—"],
      ["Stack stability", `${SL.marginL.toFixed(2)} cal at liftoff, ${SL.marginB.toFixed(2)} at booster burnout`],
      ["Sustainer stability alone", `${S.marginL.toFixed(2)} cal`],
      ["Stack Cd at Mach 0.3", st.cdStack != null ? st.cdStack.toFixed(3) : "—"],
    ];
    const bR = [
      ["Booster motor", `${mb.mfr || ""} ${mb.cn && mb.cn !== mb.name ? mb.cn + " (" + mb.name + ")" : mb.name}`],
      ["Booster impulse / burn", `${bms.I.toFixed(1)} N·s (${bms.cls}), ${bms.tb.toFixed(2)} s`],
      ["Booster size", `${fmt(RD.bLength, "len")} × ${fmt(RD.bDiameter, "small")} ${uname("small")}`],
      [
        "Booster weight / CG",
        `${fmt(RD.bDryMass, "mass")} ${uname("mass")}, ${fmt(RD.bCg, "len")} ${uname("len")} from front`,
      ],
      [
        "Booster fins",
        `${RD.bFinCount} × ${fmt(RD.bFinRoot, "len")} root, ${fmt(RD.bFinTip, "len")} tip, ${fmt(RD.bFinSpan, "len")} span`,
      ],
      ...(RD.bExtraFins || []).map((f, i) => [
        `Booster fin set ${i + 2} @ ${fmt(f.pos, "len")} ${uname("len")}`,
        `${f.n} × ${fmt(f.root, "len")} root, ${fmt(f.tip, "len")} tip, ${fmt(f.span, "len")} span`,
      ]),
      [
        "Booster apogee / landing",
        b.apogee != null
          ? `${fmt(b.apogee, "alt")} ${uname("alt")}, lands ${fmt(Math.hypot(b.drift, b.driftY || 0), "alt")} ${uname("alt")} ${driftDir(b.drift, b.driftY)}`
          : "—",
      ],
      [
        "Booster recovery",
        `${b.chute ? fmt(RD.bChuteDia, "len", 0) + " " + uname("len") + " chute" : "Free fall"}, ${b.rate ? fmt(b.rate, "speed") + " " + uname("speed") : ""}`,
      ],
    ];
    if (st.three) {
      const f = st.first || {};
      sL.unshift(
        [
          "Booster ignition",
          st.midAfterApogee
            ? "Not lit (after apogee)"
            : `${(RD.midDelay || 0).toFixed(1)} s after first-stage burnout${st.ignMid ? `, ${fmt(st.ignMid.alt, "alt")} ${uname("alt")}` : ""}`,
        ],
        [
          "First-stage separation",
          st.sep1
            ? `${fmt(st.sep1.alt, "alt")} ${uname("alt")}, ${fmt(st.sep1.v, "speed")} ${uname("speed")}, ${st.sep1.t.toFixed(2)} s`
            : "—",
        ],
      );
      const m1 = lastSim.m1,
        c = RD.s1;
      if (m1 && c) {
        const s1s = mstats(m1);
        bR.push(
          [
            "First-stage motor",
            `${m1.mfr || ""} ${m1.cn && m1.cn !== m1.name ? m1.cn + " (" + m1.name + ")" : m1.name}, ${s1s.I.toFixed(1)} N·s (${s1s.cls})`,
          ],
          [
            "First-stage size / weight",
            `${fmt(c.bLength, "len")} × ${fmt(c.bDiameter, "small")} ${uname("small")}, ${fmt(c.bDryMass, "mass")} ${uname("mass")}`,
          ],
          [
            "First-stage apogee / landing",
            f.apogee != null
              ? `${fmt(f.apogee, "alt")} ${uname("alt")}, lands ${fmt(Math.hypot(f.drift, f.driftY || 0), "alt")} ${uname("alt")} ${driftDir(f.drift, f.driftY)}`
              : "—",
          ],
          [
            "First-stage recovery",
            `${f.chute ? fmt(c.bChuteDia, "len", 0) + " " + uname("len") + " chute" : "Free fall"}, ${f.rate ? fmt(f.rate, "speed") + " " + uname("speed") : ""}`,
          ],
        );
      }
      sL.forEach((r) => {
        if (r[0] === "Ignition delay") r[0] = "Sustainer ignition delay";
        if (r[0] === "Separation") r[0] = "Booster separation";
      });
      sL.forEach((r) => {
        if (r[0] === "Stack stability")
          r[1] = `${SL.marginL.toFixed(2)} cal at liftoff, ${SL.marginB.toFixed(2)} at burnout`;
      });
    }
    const y3 = kv(sL, MX, half, "Staging"),
      y4 = kv(bR, MX + half + 24, half, st.three ? "Booster & first stage" : "Booster");
    y = Math.max(y3, y4) + 30;
  }
  const tw = half;
  // ---- page 2: flight results
  doc.addPage();
  y = sectionHead("Flight results", 50);
  // ---- apogee hero
  font("normal", 9);
  col(C.muted);
  T("PREDICTED APOGEE, ABOVE GROUND", MX, y);
  font("bold", 34);
  col(C.ink);
  const ap = st.error ? "—" : `${fmt(st.maxAlt, "alt")} ${uname("alt")}`;
  T(ap, MX, y + 34);
  {
    const R = apoRange(st, RD);
    if (R) {
      font("normal", 9.5);
      col(C.muted);
      const r = apoRound;
      T(
        `Likely ${r(R.lo)}–${r(R.hi)} ${uname("alt")} (flight-to-flight variation${R.mc ? "" : " not yet run"} plus model uncertainty)`,
        MX,
        y + 50,
      );
    }
  }
  font("normal", 10);
  col(C.muted);
  const rightLines = [
    `Liftoff weight ${fmt(st.liftMass, "mass")} ${uname("mass")}`,
    `${st.staged ? "Stack stability" : "Stability"} ${SL.marginL.toFixed(2)} cal at liftoff`,
    `${st.staged ? "Two stage, " : ""}${RD.recovery === "single" ? "Single" : "Dual"} deployment`,
  ];
  rightLines.forEach((s, i) => T(s, PW - MX, y + 6 + i * 14, { align: "right" }));
  y += 66;
  if (RD.orkApogee) {
    font("normal", 9.5);
    col(C.muted);
    const diff = st.maxAlt ? ((st.maxAlt - RD.orkApogee) / RD.orkApogee) * 100 : 0;
    T(
      `${RD.refSource || "OpenRocket"} file reports ${fmt(RD.orkApogee, "alt")} ${uname("alt")}${RD.orkMotor ? " on " + RD.orkMotor : ""}; this run is ${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%.`,
      MX,
      y,
    );
    y += 16;
  }
  // ---- stats grid
  const tiles = resultTiles(st, SL);
  const cols = 3,
    cw = CW / cols,
    rh = 34,
    rows = Math.ceil(tiles.length / cols);
  col(C.line, "draw");
  doc.setLineWidth(0.6);
  tiles.forEach(([k, v, u], i) => {
    const cx = MX + (i % cols) * cw,
      cy = y + Math.floor(i / cols) * rh;
    col(C.field, "fill");
    doc.rect(cx, cy, cw, rh, "FD");
    font("normal", 8);
    col(C.muted);
    T(k, cx + 8, cy + 12);
    font("bold", 12);
    col(C.ink);
    T(`${v}${u ? " " + u.trim() : ""}`, cx + 8, cy + 27);
  });
  y += rows * rh + 18;
  // ---- flags
  const flags = resultFlags(st, SL, m, RD);
  if (flags.length) {
    font("bold", 10);
    col(C.ink);
    T("Checks", MX, y);
    y += 14;
    flags.forEach(([c, t]) => {
      col(C[c] || C.ink, "fill");
      doc.circle(MX + 4, y - 3.5, 3, "F");
      font("normal", 9.5);
      col(C.ink);
      const lines = doc.splitTextToSize(pdfSafe(t), CW - 16);
      doc.text(lines, MX + 14, y);
      y += lines.length * 12 + 2;
    });
    y += 8;
  }
  /**
   * Starts a new page if there isn't room for a block of height h.
   *
   * ---- graphs: every graph the app shows, two per row, continuing on the next page as needed
   */
  const room = (h) => {
    if (y + h > PH - 50) {
      doc.addPage();
      y = 50;
      return true;
    }
    return false;
  };
  const gw = (CW - 18) / 2,
    gh = 136;
  const burnEnd = Math.max(st.tb * 1.3, (st.tApo || st.tb) * 0.25),
    pitchEnd = st.tDeploy ?? st.tLand ?? null;
  const charts = [
    ["Altitude", "alt", out.alt, null],
    ["Velocity", "speed", out.vel, null],
    ["Acceleration", "acc", out.acc, burnEnd],
    ["Thrust", "force", out.thrust, burnEnd],
    ["Drift downwind", "alt", out.drift.map((v) => -v), null],
    ["Pitch from vertical", "deg", out.pitch, pitchEnd],
    [
      "Angle of attack",
      "deg",
      (out.aoa || []).map((v, i) => (isFinite(v) && out.t[i] >= (st.offRailT ?? 0) ? v : 0)),
      st.tDeploy ?? st.tApo ?? pitchEnd,
    ],
    ["cone"],
  ];
  font("bold", 11);
  col(C.ink);
  room(gh + 40);
  T("Graphs", MX, y);
  y += 10;
  for (let i = 0; i < charts.length; i += 2) {
    room(gh + 22);
    charts.slice(i, i + 2).forEach((ch, k) => {
      const cx = MX + k * (gw + 18);
      if (ch[0] === "cone") {
        pdfCone(doc, C, cx, y, gw, gh);
        return;
      }
      const [title, dim, ys, tmax] = ch;
      pdfChart(
        doc,
        C,
        cx,
        y,
        gw,
        gh,
        out.t,
        ys.map((v) => toDisp(v, dim)),
        `${title} (${uname(dim)}) vs time (s)`,
        tmax,
        chartEvents(st),
        i === 0 && k === 0 && out.balt ? { ts: out.bt, ys: out.balt.map((v) => toDisp(v, "alt")) } : null,
      );
    });
    y += gh + 22;
  }
  // with an odd number of graphs, the drift table fills the empty spot beside the last one
  const besideLast = charts.length % 2 === 1,
    lastRowY = y - (gh + 22);
  // ---- drift by wind speed and method notes: on page 2 if they fit, else a new page
  if (!besideLast) {
    if (y > PH - 200) {
      doc.addPage();
      y = 50;
    } else y += 10;
  }
  let y3 = besideLast ? lastRowY + 8 : y;
  const wx = besideLast ? MX + gw + 18 : MX,
    yd = y;
  font("bold", 11);
  col(C.ink);
  T("Drift by wind speed", wx, y3);
  y3 += 8;
  const wh = ["Wind", "Apogee", "Landing", "Direction"],
    wc = [0.13, 0.19, 0.36, 0.32];
  y3 += 14;
  font("bold", 7.5);
  col(C.muted);
  let acx = wx;
  wh.forEach((h, i) => {
    acx += wc[i] * tw;
    T(h.toUpperCase(), i === 0 ? wx : acx - 4, y3, { align: i === 0 ? "left" : "right" });
  });
  windRows().forEach((r) => {
    y3 += 14;
    col(C.line, "draw");
    doc.line(wx, y3 + 4, wx + tw, y3 + 4);
    font(r.current ? "bold" : "normal", 8.5);
    col(r.over ? C.bad : C.ink);
    let cx = wx;
    [r.wind, r.apo, r.landBig ? `${r.land} / ${r.landBig}` : r.land, r.dir].forEach((v, i) => {
      cx += wc[i] * tw;
      T(v, i === 0 ? wx : cx - 4, y3, { align: i === 0 ? "left" : "right" });
    });
  });
  y = Math.max(y3 + 24, yd + (besideLast ? 6 : 24));
  // ---- landing dispersion, when it has been run for this flight
  if (lastMC && lastMC.when === lastSim.when) {
    const MC = lastMC;
    room(260);
    font("bold", 11);
    col(C.ink);
    T("Landing dispersion (Monte Carlo)", MX, y);
    y += 16;
    const dist = Math.hypot(MC.me, MC.mn),
      brg = ((Math.atan2(MC.me, MC.mn) * 180) / Math.PI + 360) % 360,
      half = (CW - 24) / 2;
    const rows = [
      ["Flights", String(MC.n)],
      ["Apogee, average", `${fmt(MC.am, "alt")} ± ${fmt(MC.as, "alt")} ${uname("alt")}`],
      ["Apogee, 90% range", `${fmt(MC.p05, "alt")}–${fmt(MC.p95, "alt")} ${uname("alt")}`],
      ["Average landing spot", `${fmt(dist, "alt")} ${uname("alt")} toward ${compass(brg)}`],
      [
        "Landing ellipse (95%)",
        `${fmt(2 * MC_K95 * MC.a1, "alt")} × ${fmt(2 * MC_K95 * MC.b1, "alt")} ${uname("alt")}`,
      ],
      ["Long axis", `${compass(mcBearing(MC.ang))}–${compass(mcBearing(MC.ang) + 180)}`],
      ["Farthest landing", `${fmt(MC.far, "alt")} ${uname("alt")}`],
      ...(MC.tumbles ? [["Flights that tumbled", String(MC.tumbles)]] : []),
    ];
    let yy = y;
    rows.forEach(([k, v]) => {
      font("normal", 8.5);
      col(C.muted);
      T(k, MX, yy);
      font("bold", 8.5);
      col(C.ink);
      T(v, MX + half, yy, { align: "right" });
      col(C.line, "draw");
      doc.setLineWidth(0.5);
      doc.line(MX, yy + 4, MX + half, yy + 4);
      yy += 15;
    });
    font("normal", 7.5);
    col(C.muted);
    const nt = doc.splitTextToSize(
      pdfSafe(
        `Varied (1σ): wind speed ${Math.round((RL.mcWind || 0) * 100)}%, direction ${RL.mcDir || 0}°, impulse ${+((RL.mcImp || 0) * 100).toFixed(1)}%, weight ${+((RL.mcMass || 0) * 100).toFixed(1)}%, drag ${Math.round((RL.mcCd || 0) * 100)}%, rail angle ${RL.mcAngle || 0}°, thrust misalignment ${RL.mcMis || 0}°, ejection delay ${Math.round((RL.mcDelay || 0) * 100)}%, parachute drag ${Math.round((RL.mcChute || 0) * 100)}%${RL.mcThermal ? `, drafts ${fmt(RL.mcThermal, "wind", 1)} ${uname("wind")}` : ""}. Ellipses hold about 68% and 95% of landings.`,
      ),
      half,
    );
    doc.text(nt, MX, yy + 4);
    // plot: north up, pad at center
    const S = 200,
      cx = MX + half + 24 + half / 2,
      cy = y + S / 2 - 6,
      ext =
        Math.max(...MC.pts.map((p) => Math.max(Math.abs(p.e), Math.abs(p.n))), 1.08 * MC_K95 * MC.a1 + dist, 50) * 1.12,
      kk = S / 2 / ext;
    col(C.line, "draw");
    doc.setLineWidth(0.5);
    doc.rect(cx - S / 2, cy - S / 2, S, S);
    doc.line(cx - S / 2, cy, cx + S / 2, cy);
    doc.line(cx, cy - S / 2, cx, cy + S / 2);
    font("bold", 8);
    col(C.ink);
    T("N", cx, cy - S / 2 - 3, { align: "center" });
    col(C.accent, "fill");
    for (const p of MC.pts) {
      const px = cx + p.e * kk,
        py = cy - p.n * kk;
      if (Math.abs(px - cx) < S / 2 && Math.abs(py - cy) < S / 2) doc.circle(px, py, 1.1, "F");
    }
    for (const [sg, cc] of [
      [MC_K68, C.ink],
      [MC_K95, C.muted],
    ]) {
      col(cc, "draw");
      doc.setLineWidth(0.9);
      let prev = null;
      for (let i = 0; i <= 72; i++) {
        const th = (i / 72) * 2 * Math.PI,
          ex = sg * MC.a1 * Math.cos(th),
          ny = sg * MC.b1 * Math.sin(th),
          e = MC.me + ex * Math.cos(MC.ang) - ny * Math.sin(MC.ang),
          nn = MC.mn + ex * Math.sin(MC.ang) + ny * Math.cos(MC.ang),
          pt = [cx + e * kk, cy - nn * kk];
        if (prev) doc.line(prev[0], prev[1], pt[0], pt[1]);
        prev = pt;
      }
    }
    col(C.ink, "fill");
    doc.circle(cx, cy, 2, "F");
    font("normal", 7);
    col(C.muted);
    const ringV = niceTicks(0, toDisp(ext, "alt"), 2).filter((v) => v > 0)[0];
    if (ringV) {
      const r = fromDisp(ringV, "alt") * kk;
      col(C.line, "draw");
      doc.circle(cx, cy, r, "S");
      T(`${ringV} ${uname("alt")}`, cx + r * 0.71 + 2, cy - r * 0.71 - 2);
    }
    y = Math.max(yy + 30, y + S + 10);
  }
  // ---- the safety and liability terms agreed to when the app is first opened
  const legal = [...document.querySelectorAll("#legal .body h3, #legal .body p:not(.legalver)")].map((e) => [
    e.tagName === "H3",
    e.textContent.replace(/\s+/g, " ").trim(),
  ]);
  const agreed = (document.querySelector('label[for="legalchk"] span') || {}).textContent || "";
  // quiet fine print: light gray, regular weight, one column across the bottom of the last page,
  // each section's title run into its paragraph
  const fine = [130, 140, 150];
  const paras = [
    "These results are computer estimates only. Treat them as estimates and confirm with your Range Safety Officer (RSO) before flight. The person launching the rocket assumes all risk and liability.",
  ];
  for (let i = 0; i < legal.length; i++) {
    const [isHead, txt] = legal[i];
    if (isHead && legal[i + 1] && !legal[i + 1][0]) {
      paras.push(`${txt.replace(/[.:]$/, "")}. ${legal[i + 1][1]}`);
      i++;
    } else paras.push(txt);
  }
  if (agreed)
    paras.push(
      "Agreement. Each user agrees to the following before using the app: " + agreed.replace(/\s+/g, " ").trim(),
    );
  font("normal", 6);
  const blocks = paras.map((t) => doc.splitTextToSize(pdfSafe(t), CW));
  const LH = 7.2,
    GAP = 3,
    fineH = 9 + blocks.reduce((a, b) => a + b.length * LH + GAP, 0) - GAP,
    bottom = PH - 46;
  if (y + 10 + fineH > bottom) {
    doc.addPage();
    y = 50;
  }
  y = Math.max(y + 10, bottom - fineH);
  font("normal", 7);
  col(fine);
  T("Safety and liability disclaimer", MX, y);
  y += 9;
  blocks.forEach((ls) => {
    font("normal", 6);
    col(fine);
    ls.forEach((l) => {
      if (y + LH > bottom + LH) {
        doc.addPage();
        y = 50;
      }
      doc.text(l, MX, y);
      y += LH;
    });
    y += GAP;
  });
  // footers: the design file and a short date and time on the left
  const pad2 = (v) => String(v).padStart(2, "0");
  const fnm = SOURCE && SOURCE.name ? SOURCE.name : "Unsaved design",
    fnShort = fnm.length > 62 ? fnm.slice(0, 59) + "..." : fnm;
  const footLeft = `${fnShort}  ·  ${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())} ${pad2(when.getHours())}:${pad2(when.getMinutes())}`;
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    font("normal", 8);
    col(C.muted);
    T(footLeft, MX, PH - 24);
    T(`Made with Pocket Rocket Flight Lab · build ${APP_BUILD}  ·  Page ${i} of ${n}`, PW - MX, PH - 24, {
      align: "right",
    });
  }
  return doc;
}
/**
 * Draws the safety-cone graph: the path to chute opening (or apogee), true scale, inside the cone from the pad.
 * @param {jsPDF} doc
 * @param {object} C colors
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 *
 * the safety-cone graph: the path to chute opening (or apogee), true scale, inside the cone from the pad
 */
function pdfCone(doc, C, x, y, w, h) {
  const { out, st, L: RL } = lastSim,
    coneDeg = RL.cone ?? 20,
    cone = (coneDeg * Math.PI) / 180;
  const tEnd = st.tDeploy ?? st.tApo ?? st.tLand;
  let n = out.t.findIndex((t) => t > tEnd + 1e-9);
  if (n < 0) n = out.t.length;
  const xs = out.drift.slice(0, n).map((v) => -v),
    zs = out.alt.slice(0, n);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  doc.text(pdfSafe(`Safety cone ±${coneDeg}° (${uname("alt")}, true scale)`).replace("±", "+/-"), x, y + 8);
  const pl = 34,
    pt = 16,
    pb = 18,
    pr = 6,
    gx = x + pl,
    gy = y + pt,
    gw = w - pl - pr,
    gh = h - pt - pb;
  const zMax = Math.max(...zs, 1),
    xAbs = Math.max(...xs.map(Math.abs), zMax * Math.tan(cone), 1e-3);
  const k = Math.max((zMax * 1.1) / gh, (2 * xAbs * 1.12) / gw),
    X0 = gx + gw / 2,
    X = (v) => X0 + v / k,
    Y = (z) => gy + gh - z / k,
    zTop = gh * k,
    xHalf = (gw / 2) * k;
  // cone, clipped to the plot
  const ex = zTop * Math.tan(cone),
    e = Math.min(ex, xHalf),
    ze = e / Math.tan(cone);
  const P =
    ex <= xHalf
      ? [
          [0, 0],
          [-ex, zTop],
          [ex, zTop],
        ]
      : [
          [0, 0],
          [-xHalf, ze],
          [-xHalf, zTop],
          [xHalf, zTop],
          [xHalf, ze],
        ];
  const pts = P.map(([a, b]) => [X(a), Y(b)]),
    dl = [];
  for (let i = 1; i < pts.length; i++) dl.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  doc.setFillColor(223, 240, 230);
  doc.lines(dl, pts[0][0], pts[0][1], [1, 1], "F", true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.setLineWidth(0.4);
  doc.setDrawColor(...C.line);
  niceTicks(0, toDisp(zTop, "alt"), 4).forEach((v) => {
    const z = fromDisp(v, "alt");
    if (z > zTop + 1e-6) return;
    doc.line(gx, Y(z), gx + gw, Y(z));
    doc.text(Math.abs(v) >= 1000 ? v / 1000 + "k" : String(+v.toFixed(1)), gx - 4, Y(z) + 2.5, { align: "right" });
  });
  const xr = toDisp(xHalf, "alt");
  niceTicks(-xr, xr, 4).forEach((v) => {
    const xx = fromDisp(v, "alt");
    if (Math.abs(xx) > xHalf + 1e-6) return;
    doc.text(String(Math.abs(+v.toFixed(1))), X(xx), gy + gh + 10, { align: "center" });
  });
  doc.setDrawColor(...C.good);
  doc.setLineWidth(0.9);
  doc.setLineDashPattern([3, 2], 0);
  doc.line(X0, Y(0), X(-e), Y(ex <= xHalf ? zTop : ze));
  doc.line(X0, Y(0), X(e), Y(ex <= xHalf ? zTop : ze));
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(...C.muted);
  doc.setLineWidth(0.6);
  doc.line(gx, Y(0), gx + gw, Y(0));
  // path: thicker while a motor burns
  const tb = st.tb ?? 0,
    ib = out.t.findIndex((t) => t > tb),
    step = Math.max(1, Math.floor(n / 400));
  doc.setDrawColor(...C.accent);
  for (const [lw, a, b] of [
    [1, 0, n],
    [2.2, 0, ib < 0 ? n : Math.min(ib, n)],
  ]) {
    doc.setLineWidth(lw);
    for (let i = a + step; i < b; i += step) doc.line(X(xs[i - step]), Y(zs[i - step]), X(xs[i]), Y(zs[i]));
  }
  doc.setFillColor(...C.ink);
  doc.circle(X(xs[n - 1]), Y(zs[n - 1]), 2.2, "F");
  doc.setTextColor(...C.muted);
  doc.text("< upwind", gx + 3, Y(0) - 3);
  doc.text("downwind >", gx + gw - 3, Y(0) - 3, { align: "right" });
  const pt2 = st.powerTilt;
  doc.setTextColor(...C.ink);
  doc.setFontSize(7);
  doc.text(
    pdfSafe(
      `Under power: up to ${pt2 != null ? pt2.toFixed(0) : "-"}° from vertical, ${pt2 != null && pt2 <= coneDeg ? "inside" : "outside"} the cone. Dot: ${st.tDeploy != null ? "chute opens" : "apogee"}.`,
    ),
    gx,
    gy + gh + 21,
  );
}
/**
 * Draws one time-history graph with its events and any measured curves over it.
 * @param {jsPDF} doc
 * @param {object} C colors
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number[]} ts times, s
 * @param {number[]} ys values (display units)
 * @param {string} title
 * @param {number} [tmax] end of the time axis
 * @param {Array[]} [events] [time, label]
 * @param {object[]} [over] measured curves
 */
function pdfChart(doc, C, x, y, w, h, ts, ys, title, tmax, events, over) {
  let xs = ts.slice(),
    vs = ys.slice();
  if (tmax) {
    const k = xs.findIndex((t) => t > tmax);
    if (k > 0) {
      xs = xs.slice(0, k);
      vs = vs.slice(0, k);
    }
  }
  const step = Math.max(1, Math.floor(xs.length / 400));
  xs = xs.filter((_, i) => i % step === 0);
  vs = vs.filter((_, i) => i % step === 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  doc.text(pdfSafe(title), x, y + 8);
  const pl = 34,
    pt = 16,
    pb = 18,
    pr = 6,
    gx = x + pl,
    gy = y + pt,
    gw = w - pl - pr,
    gh = h - pt - pb;
  const ymax = Math.max(...vs, 1e-6);
  let ymin = Math.min(0, ...vs);
  if (ymin < 0 && -ymin < 0.03 * ymax) ymin = 0;
  const yt = niceTicks(ymin, ymax, 4),
    xt = niceTicks(0, xs[xs.length - 1] || 1, 5);
  const y0 = yt[0],
    y1 = yt[yt.length - 1],
    x1 = xt[xt.length - 1];
  const X = (t) => gx + (t / x1) * gw,
    Y = (v) => gy + (1 - (Math.max(v, y0) - y0) / (y1 - y0)) * gh;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.setLineWidth(0.4);
  doc.setDrawColor(...C.line);
  yt.forEach((v) => {
    doc.line(gx, Y(v), gx + gw, Y(v));
    doc.text(Math.abs(v) >= 1000 ? v / 1000 + "k" : String(+v.toFixed(2)), gx - 4, Y(v) + 2.5, { align: "right" });
  });
  xt.forEach((t) => doc.text(String(+t.toFixed(2)), X(t), gy + gh + 10, { align: "center" }));
  doc.setLineDashPattern([2, 2], 0);
  doc.setDrawColor(...C.muted);
  let lastLab = -1e9,
    row = 0;
  events.forEach(([t, n]) => {
    if (t == null || t > x1) return;
    doc.line(X(t), gy, X(t), gy + gh);
    const xx = X(t) + 2,
      wTxt = doc.getTextWidth(n);
    if (xx < lastLab + 4) {
      row++;
      if (row > 2) return;
    } else row = 0;
    doc.text(n, xx, gy + 7 + row * 8);
    lastLab = xx + wTxt;
  });
  doc.setLineDashPattern([], 0);
  if (over) {
    doc.setDrawColor(...C.gulfInk);
    doc.setLineWidth(0.9);
    doc.setLineDashPattern([3, 2], 0);
    for (let i = 1; i < over.ts.length; i++) {
      if (over.ts[i] > x1) break;
      doc.line(X(over.ts[i - 1]), Y(over.ys[i - 1]), X(over.ts[i]), Y(over.ys[i]));
    }
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.gulfInk);
    doc.text("Booster (dashed)", gx + gw - 2, gy + gh - 4, { align: "right" });
  }
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(1.2);
  for (let i = 1; i < xs.length; i++) doc.line(X(xs[i - 1]), Y(vs[i - 1]), X(xs[i]), Y(vs[i]));
  let im = 0;
  vs.forEach((v, i) => {
    if (v > vs[im]) im = i;
  });
  doc.setFillColor(...C.accent);
  doc.circle(X(xs[im]), Y(vs[im]), 2.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.ink);
  const lx = X(xs[im]),
    right = lx > gx + gw - 60;
  doc.text(`${vs[im].toFixed(Math.abs(vs[im]) < 20 ? 1 : 0)}`, lx + (right ? -4 : 4), Math.max(Y(vs[im]) - 4, gy + 6), {
    align: right ? "right" : "left",
  });
}
/**
 * Draws the rocket's side view with its CG and CP.
 * @param {jsPDF} doc
 * @param {object} C colors
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {object} RD design
 * @param {object} m motor
 * @param {object} S stability
 * @param {object} [mb] booster motor
 */
function pdfProfile(doc, C, x, y, w, h, RD, m, S, mb) {
  const two = !!(RD.twoStage && mb),
    DD = two ? fullStack(RD) : RD;
  const A = aero(DD),
    Lr = DD.length,
    r = A.R,
    span = r + Math.max(0, ...A.fins.map((f) => f.s));
  // fit fins swept back past the end of the body, or forward past their root
  let xLo = 0,
    xHi = Lr;
  for (const f of A.fins) {
    try {
      const ol = finOutline(f);
      xLo = Math.min(xLo, f.xLead + Math.min(...ol.map((p) => p[0])));
      xHi = Math.max(xHi, f.xLead + Math.max(...ol.map((p) => p[0])));
    } catch (e) {}
  }
  const sc = Math.min((w - 10) / (xHi - xLo + 0.02), (h - 10) / (2 * span)),
    ox = x + 5 - xLo * sc,
    oy = y + h / 2;
  const X = (v) => ox + v * sc,
    Y = (v) => oy - v * sc;
  const pts = [];
  for (const sg of A.segs) {
    const k = sg.kind === "tube" ? 1 : 30;
    for (let i = 0; i <= k; i++) {
      const xx = (i / k) * sg.len;
      pts.push([sg.x + xx, segR(sg, xx)]);
    }
  }
  const poly = [
    ...pts.map(([a, b]) => [X(a), Y(b)]),
    ...pts
      .slice()
      .reverse()
      .map(([a, b]) => [X(a), Y(-b)]),
  ];
  /**
   * Draws a closed outline.
   */
  const drawPoly = (P, style) => {
    const d = [];
    for (let i = 1; i < P.length; i++) d.push([P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]]);
    doc.lines(d, P[0][0], P[0][1], [1, 1], style, true);
  };
  doc.setLineWidth(0.9);
  doc.setDrawColor(...C.ink);
  doc.setFillColor(...C.field);
  /* fins as the rocket builder draws them: every fin where it really sits around the body, seen from the side, with the
     ones on the near side drawn over the body. Each set's rotation comes from the builder's matching fin set, if there is one. */
  const bFins = [];
  try {
    if (typeof BLD !== "undefined" && BLD)
      for (const b of bldLayout(BLD).bodies) for (const kk of b.kids) if (kk.k.type === "fins") bFins.push(kk.k);
  } catch (e) {}
  /**
   * A fin set's drawing rotation.
   */
  const rotOf = (f) => {
    const k = bFins.find((k) => k.n === f.n && Math.abs((k.root || 0) - f.a) < 0.002) || null;
    return (((k && k.rot) || 0) * Math.PI) / 180;
  };
  const front = [],
    sets = [];
  for (const f of A.fins) {
    const xb = f.xLead,
      rf = radiusAt(A, xb + f.a / 2),
      ol = finOutline(f),
      nF = Math.max(1, f.n || 3),
      r0 = rotOf(f);
    sets.push({ n: nF, r0 });
    for (let i = 0; i < nF; i++) {
      const ph = r0 + (2 * Math.PI * i) / nF,
        cs = Math.cos(ph),
        sn = Math.sin(ph);
      const P = ol.map(([px, py]) => [X(xb + px), Y((rf + py) * cs)]);
      if (sn > 0.01) front.push(P);
      else drawPoly(P, "FD");
    }
  }
  drawPoly(poly, "FD");
  if (front.length) {
    const gs = doc.GState ? new doc.GState({ opacity: 0.85 }) : null;
    if (gs) {
      doc.saveGraphicsState();
      doc.setGState(gs);
    }
    doc.setDrawColor(...C.ink);
    doc.setFillColor(...C.field);
    doc.setLineWidth(0.9);
    front.forEach((P) => drawPoly(P, "FD"));
    if (gs) doc.restoreGraphicsState();
  }
  // a small view from behind: how many fins, and where they sit
  if (sets.length) {
    const { n, r0 } = sets[0],
      cx = x + 14,
      cy = y + h - 12,
      rb = 4.5,
      rfn = 11;
    doc.setDrawColor(...C.ink);
    doc.setLineWidth(1.6);
    for (let i = 0; i < n; i++) {
      const ph = r0 + (2 * Math.PI * i) / n;
      doc.line(cx + rb * Math.sin(ph), cy - rb * Math.cos(ph), cx + rfn * Math.sin(ph), cy - rfn * Math.cos(ph));
    }
    doc.setLineWidth(0.9);
    doc.setFillColor(...C.field);
    doc.circle(cx, cy, rb, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(`${n} fin${n === 1 ? "" : "s"} · aft view`.replace("·", "-"), cx + rfn + 5, cy + 2.5);
  }
  doc.setLineDashPattern([3, 2], 0);
  doc.setDrawColor(...C.muted);
  doc.setLineWidth(0.6);
  doc.rect(X((RD.mountAft ?? RD.length) + RD.motorOverhang - m.len), Y(m.dia / 2), m.len * sc, m.dia * sc, "S");
  if (two) {
    const L2 = RD.length + RD.bLength;
    doc.rect(
      X(RD.length + (RD.bMountAft ?? RD.bLength) + (RD.bOverhang || 0) - mb.len),
      Y(mb.dia / 2),
      mb.len * sc,
      mb.dia * sc,
      "S",
    );
    const m1 = isThree(RD) && typeof lastSim !== "undefined" && lastSim ? lastSim.m1 : null;
    if (m1)
      doc.rect(
        X(L2 + (RD.s1.bMountAft ?? RD.s1.bLength) + (RD.s1.bOverhang || 0) - m1.len),
        Y(m1.dia / 2),
        m1.len * sc,
        m1.dia * sc,
        "S",
      );
    doc.setDrawColor(...C.gulfInk);
    doc.line(X(RD.length), Y(r) - 6, X(RD.length), Y(-r) + 6);
    if (isThree(RD)) doc.line(X(L2), Y(r) - 6, X(L2), Y(-r) + 6);
  }
  doc.setLineDashPattern([], 0);
  /**
   * Draws the CG or CP marker.
   */
  const mark = (xx, c, lab, above) => {
    doc.setDrawColor(...c);
    doc.setFillColor(...c);
    doc.setLineWidth(1.2);
    doc.circle(X(xx), oy, 4.5, "S");
    doc.circle(X(xx), oy, 1.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...c);
    doc.text(
      pdfSafe(`${lab} ${fmt(xx, "len", 1)} ${uname("len")}`),
      Math.min(Math.max(X(xx), x + 30), x + w - 30),
      above ? oy - r * sc - 6 : oy + r * sc + 12,
      { align: "center" },
    );
  };
  mark(S.cgL, C.cg, "CG", true);
  mark(S.cp, C.cp, "CP", false);
}
/**
 * Save the flight report: builds the PDF and saves it.
 */
async function exportPdf() {
  const btn = document.getElementById("exportbtn"),
    msg = document.getElementById("exportmsg");
  msg.textContent = "";
  if (!lastSim) {
    msg.textContent = "Run a simulation first.";
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    msg.textContent = "The PDF tools didn’t load. Reconnect to the internet, reload the page, and try again.";
    return;
  }
  if (!downloadsNS) {
    msg.textContent = "Saving files isn’t available in this view.";
    return;
  }
  btn.disabled = true;
  btn.textContent = "Building PDF…";
  try {
    const doc = buildReportPdf();
    const base = SOURCE && SOURCE.name ? SOURCE.name.replace(/\.(ork|rkt)$/i, "") : lastSim.D.name; // named after the design file (the rocket name only for a design not saved yet)
    const name =
      `${base}-${lastSim.m.cn || lastSim.m.name}-flight-report`
        .replace(/[^\w.-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") + ".pdf";
    const res = await downloadsNS.save({ filename: name, data: doc.output("arraybuffer") });
    msg.textContent = res.status === "saved" ? `Saved ${name}.` : "Choose where to save the PDF.";
    if (res.status === "saved") prToast("Report saved.");
    if (res.status === "saved" || res.status === "delivered") supNote("report");
  } catch (e) {
    const c = e && e.code;
    msg.textContent =
      c === "declined"
        ? "Save cancelled."
        : c === "rate_limited"
          ? "A save prompt is already open. Finish it, then try again."
          : c === "unavailable" || c === "not_granted" || c === "capability_disabled" || c === "capability_removed"
            ? "Saving files isn’t available in this view."
            : `Couldn’t build the PDF${e && e.message ? ": " + e.message : "."}`;
    if (c === "unavailable" || c === "not_granted" || c === "capability_disabled" || c === "capability_removed")
      document.getElementById("exportwrap").hidden = true;
  } finally {
    btn.disabled = false;
    btn.textContent = "Export PDF report";
  }
}
