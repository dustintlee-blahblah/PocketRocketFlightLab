/* ---------- weathercocking cone ---------- */
// the highest wind (from the wind sweep) that keeps the airframe inside the cone while the motor burns
function coneWindNote() {
  const RL = lastSim.L,
    cone = RL.cone ?? 20,
    rows = lastSim.windTable.filter((r) => !r.error && r.powerTilt != null);
  if (!rows.length) return "";
  if (rows.every((r) => r.powerTilt <= cone))
    return `It stays inside the ${cone}° safety cone under power at every wind speed listed.`;
  if (rows[0].powerTilt > cone)
    return `It leaves the ${cone}° safety cone under power even in calm air: check the rail angle and stability.`;
  let wMax = rows[0].w;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1],
      b = rows[i];
    if (b.powerTilt > cone) {
      wMax = a.w + ((b.w - a.w) * (cone - a.powerTilt)) / Math.max(b.powerTilt - a.powerTilt, 1e-6);
      break;
    }
    wMax = b.w;
  }
  return `It stays inside the ${cone}° safety cone under power up to about ${fmt(wMax, "wind", 0)} ${uname("wind")} of wind (tilts outside the cone are in red).`;
}
// side view of the climb, drawn to true scale so the cone's angle is real; wind blows left to right
function drawConeChart(c, W, H) {
  const { out, st, L: RL } = lastSim,
    coneDeg = RL.cone ?? 20,
    cone = (coneDeg * Math.PI) / 180;
  const tEnd = st.tDeploy ?? st.tApo ?? st.tLand;
  let n = out.t.findIndex((t) => t > tEnd + 1e-9);
  if (n < 0) n = out.t.length;
  const xs = out.drift.slice(0, n).map((v) => -v),
    zs = out.alt.slice(0, n);
  c.clearRect(0, 0, W, H);
  const padL = 48,
    padR = 12,
    padT = 12,
    padB = 26,
    PW = W - padL - padR,
    PH = H - padT - padB;
  const zMax = Math.max(...zs, 1),
    xAbs = Math.max(...xs.map(Math.abs), zMax * Math.tan(cone), 1e-3);
  const k = Math.max((zMax * 1.1) / PH, (2 * xAbs * 1.12) / PW); // metres per pixel, the same both ways
  const X0 = padL + PW / 2,
    X = (x) => X0 + x / k,
    Y = (z) => padT + PH - z / k,
    zTop = PH * k,
    xHalf = (PW / 2) * k;
  c.font = "11px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  c.strokeStyle = css("--grid");
  c.fillStyle = css("--muted");
  c.lineWidth = 1;
  c.textAlign = "right";
  c.textBaseline = "middle";
  niceTicks(0, toDisp(zTop, "alt"), 4).forEach((v) => {
    const z = fromDisp(v, "alt");
    if (z > zTop + 1e-6) return;
    c.beginPath();
    c.moveTo(padL, Y(z));
    c.lineTo(W - padR, Y(z));
    c.stroke();
    c.fillText(Math.abs(v) >= 1000 ? v / 1000 + "k" : String(+v.toFixed(1)), padL - 6, Y(z));
  });
  c.textAlign = "center";
  c.textBaseline = "top";
  const xr = toDisp(xHalf, "alt");
  niceTicks(-xr, xr, 4).forEach((v) => {
    const x = fromDisp(v, "alt");
    if (Math.abs(x) > xHalf + 1e-6) return;
    c.fillText(String(Math.abs(+v.toFixed(1))), X(x), H - padB + 6);
  });
  // the cone from the pad
  const good = css("--good"),
    ex = zTop * Math.tan(cone);
  c.save();
  c.beginPath();
  c.rect(padL, padT, PW, PH);
  c.clip();
  c.beginPath();
  c.moveTo(X0, Y(0));
  c.lineTo(X(-ex), Y(zTop));
  c.lineTo(X(ex), Y(zTop));
  c.closePath();
  c.globalAlpha = 0.13;
  c.fillStyle = good;
  c.fill();
  c.globalAlpha = 1;
  c.setLineDash([5, 4]);
  c.strokeStyle = good;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(X(-ex), Y(zTop));
  c.lineTo(X0, Y(0));
  c.lineTo(X(ex), Y(zTop));
  c.stroke();
  c.setLineDash([]);
  c.strokeStyle = css("--muted");
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(padL, Y(0));
  c.lineTo(W - padR, Y(0));
  c.stroke();
  // flight path: thicker while a motor burns
  const acc = css("--accent"),
    tb = st.tb ?? 0;
  c.strokeStyle = acc;
  c.lineCap = "round";
  for (const [w, a, b] of [
    [1.6, 0, n],
    [
      3.2,
      0,
      Math.max(
        1,
        out.t.findIndex((t) => t > tb),
      ),
    ],
  ]) {
    const end = b < 0 ? n : Math.min(b, n);
    c.lineWidth = w;
    c.beginPath();
    for (let i = a; i < end; i++) {
      i === a ? c.moveTo(X(xs[i]), Y(zs[i])) : c.lineTo(X(xs[i]), Y(zs[i]));
    }
    c.stroke();
  }
  const dot = (i, col) => {
    if (i < 0 || i >= n) return;
    c.fillStyle = col;
    c.beginPath();
    c.arc(X(xs[i]), Y(zs[i]), 4, 0, 7);
    c.fill();
  };
  const ib = out.t.findIndex((t) => t >= tb - 1e-9),
    ie = n - 1;
  dot(ib, acc);
  dot(ie, css("--ink"));
  c.restore();
  c.fillStyle = css("--muted");
  c.textBaseline = "bottom";
  c.textAlign = "left";
  c.fillText("← upwind", padL + 4, Y(0) - 4);
  c.textAlign = "right";
  c.fillText("downwind →", W - padR - 4, Y(0) - 4);
  c.fillStyle = good;
  c.textAlign = "center";
  c.textBaseline = "bottom";
  c.fillText(`${coneDeg}° cone`, X0, Y(Math.min(zTop * 0.96, zTop)) + 14);
  const pt = st.powerTilt,
    inside = pt != null && pt <= coneDeg;
  document.getElementById("chartlegend").innerHTML =
    `<span style="--c:${good}">Safety cone ±${coneDeg}° (${uname("alt")}, true scale)</span>` +
    `<span style="--c:${acc}">Under power${pt != null ? `: up to ${pt.toFixed(0)}° from vertical, ${inside ? "inside" : "outside"} the cone` : ""}</span>` +
    `<span style="--c:var(--ink)">${st.tDeploy != null ? "Chute opens" : "Apogee"}${st.pathAngle != null ? `, ${st.pathAngle.toFixed(0)}° off vertical from the pad` : ""}</span>`;
}
function chartEvents(st) {
  const main = [st.tMain && st.tMain !== st.tApo && st.tMain !== st.tDeploy ? st.tMain : null, "Main"];
  const dep = [
    st.tDeploy != null && st.tApo != null && Math.abs(st.tDeploy - st.tApo) > 0.3 ? st.tDeploy : null,
    "Chute",
  ];
  if (!st.staged) return [[st.tb, "Burnout"], [st.tApo, "Apogee"], dep, main];
  const same = Math.abs(st.tIgn - st.tSep) < 0.05,
    same1 = st.three && Math.abs(st.tIgnMid - st.tSep1) < 0.05;
  return [
    ...(st.three
      ? [
          [st.tSep1, same1 ? "Staging 1" : "Separation 1"],
          [same1 || st.midAfterApogee ? null : st.tIgnMid, "Ignition 1"],
        ]
      : []),
    [st.tSep, same ? (st.three ? "Staging 2" : "Staging") : st.three ? "Separation 2" : "Separation"],
    [same || st.ignAfterApogee || st.ignLocked ? null : st.tIgn, "Ignition"],
    [st.ignAfterApogee || st.ignLocked ? null : st.tb, "Burnout"],
    [st.tApo, "Apogee"],
    dep,
    main,
  ];
}
function renderSeries() {
  document.getElementById("series").innerHTML = Object.entries(SERIES)
    .map(([k, [n]]) => `<button data-s="${k}" aria-pressed="${k === series}">${n}</button>`)
    .join("");
  document.querySelectorAll("#series button").forEach(
    (b) =>
      (b.onclick = () => {
        series = b.dataset.s;
        store.set("rfs-series", series);
        renderSeries();
        drawChart();
      }),
  );
}
function css(v) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}
function setupCanvas(cv) {
  const r = cv.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, r.width * dpr);
  cv.height = r.height * dpr;
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, W: r.width, H: r.height };
}
function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n) || 10 * mag;
  const lo = Math.floor(min / step) * step,
    hi = Math.ceil(max / step) * step;
  const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10));
  return t;
}
function drawChart() {
  if (!lastSim) return;
  const cv = document.getElementById("chart");
  cv.classList.toggle("tall", series === "land");
  const { c, W, H } = setupCanvas(cv);
  if (series === "cone") {
    drawConeChart(c, W, H);
    return;
  }
  if (series === "land") {
    drawMCInto(cv, c, W, H);
    return;
  }
  const { out, st } = lastSim;
  const [label, dim] = SERIES[series];
  let xs = out.t,
    ys = out[series].map((v) => toDisp(v, dim));
  // pitch: only until the first chute opens (after that the airframe just hangs under the chute)
  if (series === "pitch") {
    const tEnd = st.tDeploy ?? st.tLand;
    if (tEnd != null) {
      const k = xs.findIndex((t) => t > tEnd + 1e-9);
      if (k > 0) {
        xs = xs.slice(0, k);
        ys = ys.slice(0, k);
      }
    }
  }
  // angle of attack: from leaving the rail until the chute opens (or apogee, where the airspeed runs out)
  let aoaIx = null;
  if (series === "aoa") {
    const t0 = st.offRailT ?? 0,
      t1 = st.tDeploy ?? st.tApo ?? st.tLand ?? Infinity,
      ix = [];
    out.t.forEach((t, i) => {
      if (t >= t0 - 1e-9 && t <= t1 + 1e-9 && isFinite(out.aoa[i])) ix.push(i);
    });
    if (!ix.length) ix.push(0);
    aoaIx = ix;
    xs = ix.map((i) => out.t[i]);
    ys = ix.map((i) => (isFinite(out.aoa[i]) ? out.aoa[i] : 0));
  }
  if (series === "thrust" || series === "acc") {
    const tEnd = Math.max(st.tb * 1.3, (st.tApo || st.tb) * 0.25);
    const k = xs.findIndex((t) => t > tEnd);
    if (k > 0) {
      xs = xs.slice(0, k);
      ys = ys.slice(0, k);
    }
  }
  c.clearRect(0, 0, W, H);
  const padL = 48,
    padR = 10,
    padT = 10,
    padB = 26;
  const MEAS = typeof flOverlay === "function" ? flOverlay(series) : null,
    my = MEAS ? MEAS.flatMap((o) => o.y.filter(isFinite)) : [];
  const ymax = Math.max(...ys, ...my, 1e-6);
  let ymin = Math.min(0, ...ys, ...my);
  if (ymin < 0 && -ymin < 0.03 * ymax) ymin = 0;
  const yt = niceTicks(ymin, ymax, 4),
    xt = niceTicks(0, Math.max(xs[xs.length - 1] || 1, ...(MEAS ? MEAS.map((o) => o.t[o.t.length - 1]) : [0])), 5);
  const y0 = yt[0],
    y1 = yt[yt.length - 1],
    x1 = xt[xt.length - 1];
  const X = (t) => padL + (t / x1) * (W - padL - padR),
    Y = (v) => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);
  c.font = "11px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  c.fillStyle = css("--muted");
  c.strokeStyle = css("--grid");
  c.lineWidth = 1;
  c.textAlign = "right";
  c.textBaseline = "middle";
  yt.forEach((v) => {
    c.beginPath();
    c.moveTo(padL, Y(v));
    c.lineTo(W - padR, Y(v));
    c.stroke();
    c.fillText(Math.abs(v) >= 1000 ? v / 1000 + "k" : String(+v.toFixed(2)), padL - 6, Y(v));
  });
  c.textAlign = "center";
  c.textBaseline = "top";
  xt.forEach((t) => c.fillText(String(+t.toFixed(2)), X(t), H - padB + 6));
  c.textAlign = "left";
  c.fillText("s", W - padR - 8, H - padB + 6);
  // events
  const ev = chartEvents(st);
  c.setLineDash([3, 3]);
  c.strokeStyle = css("--muted");
  ev.forEach(([t, n]) => {
    if (t == null || t > x1) return;
    c.beginPath();
    c.moveTo(X(t), padT);
    c.lineTo(X(t), H - padB);
    c.stroke();
  });
  c.setLineDash([]);
  // area + line
  const acc = css("--accent");
  c.beginPath();
  xs.forEach((t, i) => (i ? c.lineTo(X(t), Y(ys[i])) : c.moveTo(X(t), Y(ys[i]))));
  c.lineTo(X(xs[xs.length - 1]), Y(Math.max(y0, 0)));
  c.lineTo(X(xs[0]), Y(Math.max(y0, 0)));
  c.closePath();
  c.globalAlpha = 0.35;
  c.fillStyle = css("--gulf");
  c.fill();
  c.globalAlpha = 1;
  c.beginPath();
  xs.forEach((t, i) => (i ? c.lineTo(X(t), Y(ys[i])) : c.moveTo(X(t), Y(ys[i]))));
  c.strokeStyle = acc;
  c.lineWidth = 2;
  c.stroke();
  // peak marker
  let im = 0;
  ys.forEach((v, i) => {
    if (series === "drift" ? Math.abs(v) > Math.abs(ys[im]) : v > ys[im]) im = i;
  });
  // angle of attack: the peak just off the rail (the crosswind's kick), and the largest at speed (half the top airspeed or more)
  let aoaFast = null;
  if (series === "aoa" && aoaIx) {
    const t0 = xs[0],
      vmax = Math.max(...aoaIx.map((i) => out.va[i]).filter(isFinite), 0);
    im = 0;
    xs.forEach((t, i) => {
      if (t <= t0 + 2 && ys[i] > ys[im]) im = i;
    });
    // at speed: once the first swing off the rail has passed (its first low point)
    let k0 = im + 1;
    while (k0 < ys.length - 1 && !(ys[k0] <= ys[k0 - 1] && ys[k0] <= ys[k0 + 1])) k0++;
    aoaFast = null;
    aoaIx.forEach((j, i) => {
      if (i > k0 && out.va[j] >= 0.5 * vmax && (aoaFast == null || ys[i] > ys[aoaFast])) aoaFast = i;
    });
  }
  if (series === "drift" && y0 < 0 && y1 > 0) {
    c.strokeStyle = css("--muted");
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(padL, Y(0));
    c.lineTo(W - padR, Y(0));
    c.stroke();
  }
  c.fillStyle = acc;
  c.beginPath();
  c.arc(X(xs[im]), Y(ys[im]), 4, 0, 7);
  c.fill();
  c.fillStyle = css("--ink");
  c.textBaseline = "bottom";
  c.textAlign = X(xs[im]) > W - 90 ? "right" : "left";
  c.fillText(
    series === "drift"
      ? `${Math.abs(ys[im]).toFixed(0)} ${uname(dim)} ${ys[im] < 0 ? "downwind" : "upwind"}`
      : series === "pitch"
        ? `${ys[im].toFixed(1)}° max`
        : series === "aoa"
          ? `${ys[im].toFixed(1)}° off the rail`
          : `${ys[im].toFixed(dim === "acc" ? 1 : 0)} ${uname(dim)}`,
    X(xs[im]) + (c.textAlign === "left" ? 7 : -7),
    series === "drift" && ys[im] < 0 && Y(ys[im]) + 18 < H - padB
      ? Y(ys[im]) + 18
      : Y(ys[im]) - 3 > 14
        ? Y(ys[im]) - 3
        : Y(ys[im]) + 16,
  );
  let bLeg = "";
  if (MEAS) {
    const mc = css("--ink");
    MEAS.forEach((o, k) => {
      c.save();
      c.strokeStyle = mc;
      c.globalAlpha = k ? 0.6 : 1;
      c.lineWidth = 1.8;
      c.setLineDash(k ? [7, 4] : [2, 3]);
      c.beginPath();
      let pen = false;
      o.t.forEach((t, i) => {
        const v = o.y[i];
        if (!isFinite(v) || t < 0 || t > x1) {
          pen = false;
          return;
        }
        pen ? c.lineTo(X(t), Y(v)) : c.moveTo(X(t), Y(v));
        pen = true;
      });
      c.stroke();
      c.restore();
      // the altimeter's events: short ticks along the bottom, lettered
      c.save();
      c.fillStyle = mc;
      c.strokeStyle = mc;
      c.lineWidth = 1.5;
      c.textAlign = "center";
      c.textBaseline = "bottom";
      c.font = "bold 10px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
      let lastX = -99;
      o.ev.forEach(([t, l]) => {
        if (t < 0 || t > x1) return;
        const xx = X(t);
        c.beginPath();
        c.moveTo(xx, H - padB);
        c.lineTo(xx, H - padB - 7);
        c.stroke();
        if (xx - lastX >= 9) {
          c.fillText(l, xx, H - padB - 8);
          lastX = xx;
        }
      });
      c.restore();
      bLeg += `<span style="--c:${mc}">${esc(o.label)}${o.ev.length ? " (" + o.ev.map((e) => e[1] + " " + e[0].toFixed(1) + " s").join(", ") + ")" : ""}</span>`;
    });
  }
  if (series === "alt" && out.balt && out.balt.length) {
    const bc = css("--gulf-ink");
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = bc;
    c.lineWidth = 1.6;
    c.beginPath();
    out.bt.forEach((t, i) => {
      if (t > x1) return;
      const yy = Y(toDisp(out.balt[i], "alt"));
      i ? c.lineTo(X(t), yy) : c.moveTo(X(t), yy);
    });
    c.stroke();
    c.restore();
    bLeg += `<span style="--c:${bc}">Booster altitude</span>`;
  }
  if (series === "alt" && out.b1alt && out.b1alt.length) {
    const bc = css("--muted");
    c.save();
    c.setLineDash([2, 4]);
    c.strokeStyle = bc;
    c.lineWidth = 1.6;
    c.beginPath();
    out.b1t.forEach((t, i) => {
      if (t > x1) return;
      const yy = Y(toDisp(out.b1alt[i], "alt"));
      i ? c.lineTo(X(t), yy) : c.moveTo(X(t), yy);
    });
    c.stroke();
    c.restore();
    bLeg += `<span style="--c:${bc}">First-stage altitude</span>`;
  }
  if (series === "pitch") {
    const v = ys[ys.length - 1],
      xe = X(xs[xs.length - 1]),
      ye = Y(v);
    c.fillStyle = acc;
    c.beginPath();
    c.arc(xe, ye, 4, 0, 7);
    c.fill();
    bLeg = `<span style="--c:${acc}">${st.tDeploy != null ? "At chute deployment" : "At landing (no chute opened)"}: ${v.toFixed(1)}°</span>`;
  }
  if (series === "aoa") {
    const g = css("--ink");
    if (aoaFast != null && aoaFast !== im && ys[aoaFast] >= 1) {
      const xa = X(xs[aoaFast]),
        ya = Y(ys[aoaFast]);
      c.fillStyle = g;
      c.beginPath();
      c.arc(xa, ya, 4, 0, 7);
      c.fill();
      c.textAlign = xa > W - 120 ? "right" : "left";
      c.textBaseline = "bottom";
      c.fillText(`${ys[aoaFast].toFixed(1)}° at speed`, xa + (c.textAlign === "left" ? 7 : -7), Math.max(ya - 3, 14));
    }
    const end = st.tDeploy != null ? "the chute opens" : "it reaches apogee";
    bLeg =
      `<span style="--c:${acc}">Off the rail: ${ys[im].toFixed(1)}° peak${ys[im] > 15 ? " — high: the rocket left the rail slowly for this wind" : ys[im] > 10 ? " — on the high side for this wind" : ""}</span>` +
      (aoaFast != null
        ? `<span style="--c:${g}">At speed, after the first swing (half the top airspeed or more): up to ${ys[aoaFast].toFixed(1)}°</span>`
        : "") +
      `<span style="--c:var(--muted)">Should settle within a few swings. It can rise steeply near apogee as the airspeed runs out; that's normal. Ends when ${end}.</span>`;
  }
  if (series === "drift" && st.landed) {
    const v = ys[ys.length - 1],
      xe = X(xs[xs.length - 1]),
      ye = Y(v);
    c.fillStyle = acc;
    c.beginPath();
    c.arc(xe, ye, 4, 0, 7);
    c.fill();
    const cr = toDisp(Math.abs(out.cross[out.cross.length - 1] || 0), dim);
    bLeg = `<span style="--c:${acc}">Lands ${Math.abs(v).toFixed(0)} ${uname(dim)} ${v < 0 ? "downwind" : "upwind"}${cr >= Math.max(3, 0.1 * Math.abs(v)) ? `, ${cr.toFixed(0)} ${uname(dim)} crosswind` : ""}</span>`;
  }
  document.getElementById("chartlegend").innerHTML =
    `<span style="--c:${acc}">${series === "drift" ? "Drift (+ upwind, − downwind)" : series === "pitch" ? "Pitch from vertical" : series === "aoa" ? "Angle of attack" : label} (${uname(dim)}) vs time</span>` +
    bLeg +
    ev
      .filter((e) => e[0] != null && e[0] <= x1)
      .map((e) => `<span style="--c:var(--muted)">${e[1]} ${e[0].toFixed(1)} s</span>`)
      .join("");
}
function drawFins() {
  drawFinsInto("finview", "finnote", {
    n: D.finCount,
    a: D.finRoot,
    b: D.finTip,
    s: D.finSpan,
    sw: D.finSweep,
    t: D.finThick,
    aft: D.finAft,
    edge: D.finEdge,
    pts: D.finPts,
  });
  if (D.twoStage)
    drawFinsInto("bfinview", "bfinnote", {
      n: D.bFinCount,
      a: D.bFinRoot,
      b: D.bFinTip,
      s: D.bFinSpan,
      sw: D.bFinSweep,
      t: D.bFinThick,
      aft: D.bFinAft,
      edge: D.bFinEdge,
    });
  if (typeof drawExtraFins === "function") drawExtraFins();
}
function drawFinsInto(cvId, noteId, FS) {
  const cv = document.getElementById(cvId);
  if (!cv || !cv.getBoundingClientRect().width) return;
  const { c, W, H } = setupCanvas(cv);
  c.clearRect(0, 0, W, H);
  const a = FS.a,
    b = FS.b,
    s = FS.s,
    sw = FS.sw,
    aft = Math.max(FS.aft, 0);
  const note = document.getElementById(noteId);
  if (!(a > 0 && s > 0)) {
    note.textContent = "Enter a root chord and span to see the fin.";
    return;
  }
  const ptsOK = FS.pts && FS.pts.length > 2;
  const xmin = ptsOK ? Math.min(0, ...FS.pts.map((p) => p[0])) : Math.min(0, sw),
    xmax = ptsOK ? Math.max(a + aft, ...FS.pts.map((p) => p[0])) : Math.max(a, sw + b, a + aft);
  const padL = 14,
    padR = 36,
    padT = 50,
    padB = 48;
  const sc = Math.min((W - padL - padR) / (xmax - xmin), (H - padT - padB) / s);
  const ox = padL + (W - padL - padR - (xmax - xmin) * sc) / 2 - xmin * sc,
    oy = H - padB;
  const X = (x) => ox + x * sc,
    Y = (y) => oy - y * sc;
  const ink = css("--ink"),
    muted = css("--muted"),
    acc = css("--accent"),
    field = css("--field");
  const mono = "11px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  const u = uname("len");
  // body tube surface and tail end
  c.fillStyle = field;
  c.fillRect(6, oy, W - 12, 10);
  c.strokeStyle = muted;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(6, oy + 0.5);
  c.lineTo(FS.noTail ? W - 6 : X(a + aft), oy + 0.5);
  c.stroke();
  if (!FS.noTail) {
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(X(a + aft), oy - 10);
    c.lineTo(X(a + aft), oy + 12);
    c.stroke();
    c.setLineDash([]);
  }
  // fin outline, to scale
  if (ptsOK) {
    // the fin's own outline from the design file
    c.beginPath();
    FS.pts.forEach(([px, py], i) => (i ? c.lineTo(X(px), Y(py)) : c.moveTo(X(px), Y(py))));
    c.closePath();
    c.globalAlpha = 0.18;
    c.fillStyle = acc;
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = acc;
    c.lineWidth = 2;
    c.lineJoin = "round";
    c.stroke();
  } else {
    c.beginPath();
    c.moveTo(X(0), Y(0));
    c.lineTo(X(sw), Y(s));
    c.lineTo(X(sw + b), Y(s));
    c.lineTo(X(a), Y(0));
    c.closePath();
    c.globalAlpha = 0.18;
    c.fillStyle = acc;
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = acc;
    c.lineWidth = 2;
    c.lineJoin = "round";
    c.stroke();
  }
  // free-form: number each outline point, in the order they're listed
  if (ptsOK && FS.showPts) {
    c.font = mono;
    FS.pts.forEach(([px, py], i) => {
      c.fillStyle = acc;
      c.beginPath();
      c.arc(X(px), Y(py), 3.5, 0, 7);
      c.fill();
      c.fillStyle = ink;
      c.textAlign = "center";
      c.textBaseline = py > 1e-9 ? "bottom" : "top";
      c.fillText(
        String(i + 1),
        X(px) + (i === 0 ? -8 : i === FS.pts.length - 1 ? 8 : 0),
        py > 1e-9 ? Y(py) - 6 : Y(py) + 3,
      );
    });
  }
  // dimension helpers
  c.font = mono;
  c.lineWidth = 1;
  c.strokeStyle = muted;
  const dimH = (x1, x2, y, label, below, minPx = 0) => {
    if (Math.abs(X(x2) - X(x1)) < 2) return;
    c.beginPath();
    c.moveTo(X(x1), y);
    c.lineTo(X(x2), y);
    [x1, x2].forEach((x) => {
      c.moveTo(X(x), y - 4);
      c.lineTo(X(x), y + 4);
    });
    c.stroke();
    if (Math.abs(X(x2) - X(x1)) < minPx) return;
    c.fillStyle = ink;
    c.textAlign = "center";
    c.textBaseline = below ? "top" : "bottom";
    const mid = Math.min(
      Math.max((X(x1) + X(x2)) / 2, c.measureText(label).width / 2 + 4),
      W - c.measureText(label).width / 2 - 4,
    );
    c.fillText(label, mid, below ? y + 4 : y - 4);
  };
  dimH(0, a, oy + 18, `Root ${fmt(a, "len")} ${u}`, true);
  if (aft > 1e-6) dimH(a, a + aft, oy + 18, `${fmt(aft, "len")} to ${FS.tailName || "tail"}`, true, 90);
  if (!ptsOK) dimH(sw, sw + b, Y(s) - 10, `Tip ${fmt(b, "len")} ${u}`, false);
  if (!ptsOK && Math.abs(sw) > 1e-6) {
    c.setLineDash([2, 3]);
    c.beginPath();
    c.moveTo(X(0), Y(0) - 2);
    c.lineTo(X(0), Y(s) - 30);
    c.moveTo(X(sw), Y(s) - 2);
    c.lineTo(X(sw), Y(s) - 30);
    c.stroke();
    c.setLineDash([]);
    dimH(0, sw, Y(s) - 30, `Sweep ${fmt(sw, "len")} ${u}`, false);
  }
  const sx = Math.min(X(ptsOK ? Math.max(...FS.pts.map((p) => p[0])) : Math.max(a, sw + b)) + 14, W - padR + 14);
  c.beginPath();
  c.moveTo(sx, Y(0));
  c.lineTo(sx, Y(s));
  c.moveTo(sx - 4, Y(0));
  c.lineTo(sx + 4, Y(0));
  c.moveTo(sx - 4, Y(s));
  c.lineTo(sx + 4, Y(s));
  c.stroke();
  c.save();
  c.translate(sx + 5, (Y(0) + Y(s)) / 2);
  c.rotate(Math.PI / 2);
  c.fillStyle = ink;
  c.textAlign = "center";
  c.textBaseline = "bottom";
  c.fillText(`Span ${fmt(s, "len")} ${u}`, 0, 0);
  c.restore();
  const area = ptsOK ? (finGeom({ pts: FS.pts }) || { area: ((a + b) / 2) * s }).area : ((a + b) / 2) * s,
    ai = units === "imp" ? area / (IN * IN) : area * 1e4;
  note.textContent =
    `Drawn to scale. ${FS.n} fins, each ${ai.toFixed(1)} ${units === "imp" ? "sq in" : "cm²"}, ${fmt(FS.t, "small")} ${uname("small")} thick with ${(FIN_EDGES.find((x) => x[0] === FS.edge) || [0, FS.edge])[1].replace(/ \(.*\)$/, "").toLowerCase()} edges${aft > 1e-6 ? `; trailing edge ${fmt(aft, "len")} ${u} from the ${FS.tailName || "tail"}` : ""}.` +
    (FS.cant ? ` Canted ${(+FS.cant).toFixed(1)}°, which spins the rocket.` : "") +
    (ptsOK && FS.note != null
      ? FS.note
      : ptsOK
        ? " The shape comes from your design file, and drag and stability are calculated from it directly. Root, tip, span and sweep above describe a trapezoid with the same area, span and lift point; changing any of them replaces the file's shape with that trapezoid."
        : "");
}
function drawProfile() {
  if (typeof bldDraw === "function" && BLD) {
    bldDraw();
    return;
  }
  drawFins();
  const cv = document.getElementById("profile");
  if (!cv.getBoundingClientRect().width) return;
  const { c, W, H } = setupCanvas(cv);
  c.clearRect(0, 0, W, H);
  const two = !!D.twoStage,
    m = flightMotor(),
    mb = two ? flightBoost() : null,
    SU = stability(D, m),
    S = two ? stackStability(D, m, mb) : SU;
  const DD = two ? fullStack(D) : D,
    AE = aero(DD),
    Lr = DD.length,
    r = AE.R;
  document.getElementById("stabtxt").textContent = two
    ? `Stack ${S.marginL.toFixed(2)} cal at liftoff · sustainer ${SU.marginL.toFixed(2)} cal alone`
    : `Margin ${S.marginL.toFixed(2)} cal at liftoff, ${S.marginB.toFixed(2)} at burnout`;
  const span = r + Math.max(0, ...AE.fins.map((f) => f.s));
  let xLo = 0,
    xHi = Lr;
  for (const f of AE.fins) {
    try {
      const ol = finOutline(f);
      xLo = Math.min(xLo, f.xLead + Math.min(...ol.map((p) => p[0])));
      xHi = Math.max(xHi, f.xLead + Math.max(...ol.map((p) => p[0])));
    } catch (e) {}
  }
  const sc = Math.min((W - 20) / (xHi - xLo + 0.02), (H - 40) / (2 * span));
  const ox = 10 - xLo * sc,
    oy = H / 2 - 6;
  const X = (x) => ox + x * sc,
    Y = (y) => oy - y * sc;
  c.lineWidth = 1.5;
  c.strokeStyle = css("--ink");
  c.fillStyle = css("--field");
  // body outline
  const pts = [];
  for (const sgm of AE.segs) {
    const k = sgm.kind === "tube" ? 1 : 30;
    for (let i = 0; i <= k; i++) {
      const x = (i / k) * sgm.len;
      pts.push([sgm.x + x, segR(sgm, x)]);
    }
  }
  c.beginPath();
  c.moveTo(X(pts[0][0]), Y(pts[0][1]));
  pts.forEach(([x, y]) => c.lineTo(X(x), Y(y)));
  for (let i = pts.length - 1; i >= 0; i--) c.lineTo(X(pts[i][0]), Y(-pts[i][1]));
  c.closePath();
  c.fill();
  c.stroke();
  // fins (top and bottom silhouettes)
  for (const f of AE.fins) {
    const xb = f.xLead,
      rf = radiusAt(AE, xb + f.a / 2);
    const ol = finOutline(f);
    [1, -1].forEach((sg) => {
      c.beginPath();
      ol.forEach(([px, py], i) => {
        const xx = X(xb + px),
          yy = Y(sg * (rf + py));
        i ? c.lineTo(xx, yy) : c.moveTo(xx, yy);
      });
      c.closePath();
      c.fill();
      c.stroke();
    });
  }
  // motors
  c.setLineDash([4, 3]);
  c.strokeStyle = css("--muted");
  c.strokeRect(X((D.mountAft ?? D.length) + D.motorOverhang - m.len), Y(m.dia / 2), m.len * sc, m.dia * sc);
  if (two) {
    c.strokeRect(X(Lr + (D.bOverhang || 0) - mb.len), Y(mb.dia / 2), mb.len * sc, mb.dia * sc);
    c.strokeStyle = css("--gulf-ink");
    c.beginPath();
    c.moveTo(X(D.length), Y(r) - 10);
    c.lineTo(X(D.length), Y(-r) + 10);
    c.stroke();
  }
  c.setLineDash([]);
  // CG / CP markers
  const mark = (x, color, lab, above) => {
    const cx = X(x),
      cy = oy;
    c.fillStyle = color;
    c.strokeStyle = color;
    c.beginPath();
    c.arc(cx, cy, 6, 0, 7);
    c.lineWidth = 2;
    c.stroke();
    if (lab === "CG") {
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, 6, -Math.PI / 2, 0);
      c.lineTo(cx, cy);
      c.arc(cx, cy, 6, Math.PI / 2, Math.PI);
      c.fill();
    } else {
      c.beginPath();
      c.arc(cx, cy, 2.5, 0, 7);
      c.fill();
    }
    c.font = "600 11px " + css("--f-body").split(",")[0].replace(/"/g, "") + ", sans-serif";
    c.textAlign = "center";
    c.textBaseline = above ? "bottom" : "top";
    c.fillText(
      `${lab} ${fmt(x, "len", 1)} ${uname("len")}`,
      Math.min(Math.max(cx, 40), W - 40),
      above ? cy - r * sc - 6 : cy + r * sc + 6,
    );
  };
  mark(S.cgL, css("--cg"), "CG", true);
  mark(S.cp, css("--bad"), "CP", false);
}
function drawSpark(cv, m) {
  const { c, W, H } = setupCanvas(cv);
  c.clearRect(0, 0, W, H);
  const tb = m.t[m.t.length - 1],
    fm = Math.max(...m.F);
  c.beginPath();
  m.t.forEach((t, i) => {
    const x = 2 + (t / tb) * (W - 4),
      y = H - 2 - (m.F[i] / fm) * (H - 4);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  });
  c.strokeStyle = css("--accent");
  c.lineWidth = 1.5;
  c.stroke();
}

let F = Object.assign({ brand: "all", dia: null, sys: "all", q: "", sparky: "all" }, store.get("rfs-filter", {}));
let shown = 40;
function motorMeta(m, s) {
  const bits = [
    `${Math.round(m.dia * 1000)} mm`,
    `${s.I.toFixed(0)} N·s`,
    `avg ${fmt(s.avg, "force", 0)} ${uname("force")}`,
    `${s.tb.toFixed(2)} s`,
    `${fmt(m.totalMass, "mass")} ${uname("mass")}`,
  ];
  if (m.case) bits.push(m.case);
  if (m.prop) bits.push(m.prop);
  if (m.delays) bits.push("delays " + m.delays);
  return bits.map(esc).join(" · ");
}
// sparky: "all", "only" (sparky motors only) or "none" (no sparky motors), from ThrustCurve's sparky flag
function filterMotors(dia, sys, q, brand = F.brand, sparky = F.sparky) {
  const qq = q.trim().toLowerCase().replace(/\s+/g, " ");
  return allMotors().filter(
    (m) =>
      (brand === "all" || m.brand === brand) &&
      (dia == null || Math.round(m.dia * 1000) === dia) &&
      (sys === "all" || m.sys === sys) &&
      (sparky === "all" || (sparky === "only") === !!m.sparky) &&
      (!qq ||
        [m.name, m.cn, m.prop, m.case, m.mfr, m.sys === "SU" ? "single use" : "", SYS_LABEL[m.sys]]
          .join(" ")
          .toLowerCase()
          .includes(qq)),
  );
}
function renderFilters() {
  const brands = BUILTIN_BRANDS.slice().concat(
    [...new Set(USER_MOTORS.map((m) => m.brand))].filter((b) => !BRAND_SYS[b]).sort(),
  );
  const upSys = (b) =>
    USER_MOTORS.some((m) => m.sys === "Imported" && (b === "all" || m.brand === b)) ? ["Imported"] : [];
  const sysOf = (b) =>
    b === "all"
      ? SYS_ORDER.filter((y) => Object.values(BRAND_SYS).some((l) => l.includes(y))).concat(upSys("all"))
      : BRAND_SYS[b]
        ? BRAND_SYS[b].concat(upSys(b))
        : [...new Set(USER_MOTORS.filter((m) => m.brand === b).map((m) => m.sys))];
  if (F.brand !== "all" && !brands.includes(F.brand)) F.brand = "all";
  const bc = (b) => filterMotors(F.dia, F.sys, F.q, b).length;
  document.getElementById("fbrand").innerHTML =
    `<button data-b="all" aria-pressed="${F.brand === "all"}">All<span class="ct">${bc("all")}</span></button>` +
    brands
      .map(
        (b) =>
          `<button data-b="${esc(b)}" aria-pressed="${F.brand === b}">${esc(b)}<span class="ct">${bc(b)}</span></button>`,
      )
      .join("");
  document.querySelectorAll("#fbrand button").forEach(
    (b) =>
      (b.onclick = () => {
        F.brand = b.dataset.b;
        if (F.sys !== "all" && !sysOf(F.brand).includes(F.sys)) F.sys = "all";
        shown = 40;
        saveFilter();
        renderMotors();
      }),
  );
  const dias = [
    ...new Set(
      allMotors()
        .filter((m) => F.brand === "all" || m.brand === F.brand)
        .map((m) => Math.round(m.dia * 1000)),
    ),
  ].sort((a, b) => a - b);
  const sysList = sysOf(F.brand);
  if (F.dia != null && !dias.includes(F.dia)) F.dia = null;
  if (F.sys !== "all" && !sysList.includes(F.sys)) F.sys = "all";
  const dc = (d) => filterMotors(d, F.sys, F.q).length,
    sc = (y) => filterMotors(F.dia, y, F.q).length;
  document.getElementById("fdia").innerHTML =
    `<button data-d="all" aria-pressed="${F.dia == null}">All<span class="ct">${dc(null)}</span></button>` +
    dias
      .map(
        (d) => `<button data-d="${d}" aria-pressed="${F.dia === d}">${d} mm<span class="ct">${dc(d)}</span></button>`,
      )
      .join("");
  document.getElementById("fsys").innerHTML =
    `<button data-y="all" aria-pressed="${F.sys === "all"}">All<span class="ct">${sc("all")}</span></button>` +
    sysList
      .map(
        (y) =>
          `<button data-y="${y}" aria-pressed="${F.sys === y}">${SYS_LABEL[y]}<span class="ct">${sc(y)}</span></button>`,
      )
      .join("");
  document.querySelectorAll("#fdia button").forEach(
    (b) =>
      (b.onclick = () => {
        F.dia = b.dataset.d === "all" ? null : +b.dataset.d;
        shown = 40;
        saveFilter();
        renderMotors();
      }),
  );
  document.querySelectorAll("#fsys button").forEach(
    (b) =>
      (b.onclick = () => {
        F.sys = b.dataset.y;
        shown = 40;
        saveFilter();
        renderMotors();
      }),
  );
  if (!["all", "only", "none"].includes(F.sparky)) F.sparky = "all";
  const kc = (k) => filterMotors(F.dia, F.sys, F.q, F.brand, k).length;
  document.getElementById("fspark").innerHTML = [
    ["all", "All"],
    ["only", "Sparky only"],
    ["none", "No sparky"],
  ]
    .map(
      ([k, l]) =>
        `<button data-k="${k}" aria-pressed="${F.sparky === k}">${l}<span class="ct">${kc(k)}</span></button>`,
    )
    .join("");
  document.querySelectorAll("#fspark button").forEach(
    (b) =>
      (b.onclick = () => {
        F.sparky = b.dataset.k;
        shown = 40;
        saveFilter();
        renderMotors();
      }),
  );
  const fs = document.getElementById("fsearch");
  if (fs.value !== F.q) fs.value = F.q;
}
function saveFilter() {
  store.set("rfs-filter", F);
}
let pickSlot = -1; // -1: choosing the main motor; otherwise the index of the extra motor being chosen
/* ---------- motor tube size ---------- */
const MOTOR_SIZES = [13, 18, 24, 29, 38, 54, 75, 98, 132, 152, 161]; // standard motor diameters, mm, up to the largest motors in the list
// the motor size a mount takes: the largest standard motor that slides into its inside diameter
function mountClass(d) {
  if (!(d > 0)) return null;
  const mm = d * 1000;
  let c = null;
  for (const s of MOTOR_SIZES) if (s <= mm + 0.6) c = s;
  return c;
}
// the mount size in use: the one chosen on the Rocket tab, or the one from the design file
function mountSize(Dx, booster) {
  const sel = booster ? Dx.bMountSel : Dx.mountSel;
  if (sel != null && sel !== "file" && +sel > 0) return { cls: +sel, src: "chosen" };
  const c = mountClass(booster ? Dx.bMountDia : Dx.mountDia);
  return c ? { cls: c, src: "file" } : null;
}
// a stand-in when a file's motor isn't in the list and the motor already selected doesn't fit the mount:
// a motor of the mount's size, in the file motor's impulse class if there is one (else a middling one)
function fitStandIn(Dx, booster, want) {
  const cur = findMotor(booster ? boostId : motorId),
    f = motorFit(cur, Dx, booster);
  if (!f || f.status === "ok") return null;
  const list = allMotors().filter((m) => Math.abs(Math.round(m.dia * 1000) - f.mount) <= 1);
  if (!list.length) return null;
  const cls = String((want && want.designation) || "")
      .trim()
      .toUpperCase()
      .match(/^(\d*)([A-O])/),
    I = (m) => motorStats(m).I;
  let target;
  if (cls) {
    const k = cls[2].charCodeAt(0) - 65;
    target = 0.75 * 2.5 * Math.pow(2, k);
  } // the middle of the class (A is 1.26–2.5 N·s; each letter doubles)
  else {
    const s = list.map(I).sort((a, b) => a - b);
    target = s[Math.floor(s.length / 2)];
  }
  return list.slice().sort((a, b) => Math.abs(Math.log(I(a) / target)) - Math.abs(Math.log(I(b) / target)))[0];
}
function motorFit(m, Dx, booster) {
  const ms = mountSize(Dx, booster);
  if (!ms || !m) return null;
  const md = Math.round(m.dia * 1000),
    cls = ms.cls;
  // within a millimetre counts as the same size (a 76 mm motor goes in a 75 mm mount)
  return { mount: cls, motor: md, src: ms.src, status: md > cls + 1 ? "big" : md < cls - 1 ? "small" : "ok" };
}
// a chosen mount bigger than the body it sits in
function mountTooBig(Dx, booster) {
  const ms = mountSize(Dx, booster);
  if (!ms || ms.src !== "chosen") return null;
  const body = (booster ? Dx.bDiameter : Dx.diameter) * 1000;
  // the mount tube (about 4% plus 2 mm over the motor) has to fit inside the body tube (about 3 mm under its outside)
  return ms.cls * 1.04 + 2 > body - 3 ? { cls: ms.cls, body } : null;
}
function renderMountNote() {
  // beside the field: a caution when the chosen mount is bigger than the one in the design file
  for (const [b, fid] of [
    [false, "f-mountSel"],
    [true, "f-bMountSel"],
  ]) {
    const f = document.getElementById(fid);
    if (!f) continue;
    const wrap = f.closest(".fld");
    let w = wrap.nextElementSibling;
    if (!(w && w.classList.contains("mountwarn"))) {
      w = null;
    }
    const ms = mountSize(D, b),
      fc = mountClass(b ? D.bMountDia : D.mountDia),
      big = ms && ms.src === "chosen" && fc && ms.cls > fc;
    if (!big) {
      if (w) w.remove();
      continue;
    }
    if (!w) {
      w = document.createElement("div");
      w.className = "mountwarn";
      wrap.after(w);
    }
    w.textContent = `⚠ Larger than the ${fc} mm motor mount in the original ${SOURCE && SOURCE.format === "rkt" ? ".rkt" : ".ork"} file. Exercise caution when modifying a rocket for a larger motor.`;
  }
  for (const [b, id] of [
    [false, "mountsizenote"],
    [true, "bmountsizenote"],
  ]) {
    const el = document.getElementById(id);
    if (!el) continue;
    const ms = mountSize(D, b),
      tb = mountTooBig(D, b);
    el.hidden = !ms;
    if (!ms) continue;
    el.style.color = tb ? "var(--bad)" : "";
    el.textContent = tb
      ? `⚠ A ${tb.cls} mm motor mount doesn't fit inside this ${fmt(b ? D.bDiameter : D.diameter, "small")} ${uname("small")} body tube. Choose a smaller size; LAUNCH is blocked until you do.`
      : ms.src === "chosen"
        ? `Motor mount set to ${ms.cls} mm${mountClass(b ? D.bMountDia : D.mountDia) ? ` (the design file has ${mountClass(b ? D.bMountDia : D.mountDia)} mm)` : ""}. ${ms.cls} mm motors fly without a fit warning, and the Motor tab lists them first.`
        : `Motor mount from the design file: ${ms.cls} mm. The Motor tab lists ${ms.cls} mm motors first; choose another size here to fly a different motor.`;
  }
}
function mountOptions(booster) {
  const fd = mountClass(booster ? D.bMountDia : D.mountDia);
  return [
    ["file", fd ? `From design file (${fd} mm)` : "Not set (no design file)"],
    ...MOTOR_SIZES.map((v) => [String(v), `${v} mm${fd === v ? " (same as file)" : ""}`]),
  ];
}
// show motors that fit the mount first on the Motor tab
// the first stage of a three-stage rocket, seen through the booster's field names (for its motor mount)
const s1View = (Dx) => ({ ...Dx, ...Dx.s1, bMountSel: Dx.s1 && Dx.s1.mountSel != null ? Dx.s1.mountSel : "file" });
const tgtFirst = () => isThree(D) && motorTarget === "first",
  tgtB = () => tgtFirst() || (!!D.twoStage && motorTarget === "booster"),
  tgtD = () => (tgtFirst() ? s1View(D) : D);
const TGT_NAME = { first: "First stage", booster: "Booster", sustainer: "Sustainer" };
function mountFilter() {
  const ms = mountSize(tgtD(), tgtB());
  if (!ms) return;
  F.dia = allMotors().some((m) => Math.round(m.dia * 1000) === ms.cls) ? ms.cls : null;
  F.brand = "all";
  saveFilter();
}
function renderMotors() {
  const two = !!D.twoStage,
    three = isThree(D);
  if (!two) motorTarget = "sustainer";
  if (!three && motorTarget === "first") motorTarget = "booster";
  const xkey = tgtFirst() ? "s1ExtraMotors" : two && motorTarget === "booster" ? "bExtraMotors" : "extraMotors",
    xlist = D[xkey] || (D[xkey] = []);
  if (pickSlot >= xlist.length) pickSlot = -1;
  const tp = document.getElementById("mtargetp");
  tp.hidden = !two;
  if (two) {
    const sm = flightMotor(),
      bm = flightBoost();
    document.getElementById("mtarget").innerHTML = [
      ...(three ? [["first", "First stage", flightFirst()]] : []),
      ["booster", "Booster", bm],
      ["sustainer", "Sustainer", sm],
    ]
      .map(
        ([k, l, mm]) =>
          `<button data-t="${k}" aria-pressed="${motorTarget === k}">${l}<span class="ct">${esc(mm.cn || mm.name)}</span></button>`,
      )
      .join("");
    document.querySelectorAll("#mtarget button").forEach(
      (b) =>
        (b.onclick = () => {
          motorTarget = b.dataset.t;
          pickSlot = -1;
          mountFilter();
          renderMotors();
        }),
    );
  }
  const tgtLab = TGT_NAME[motorTarget] || "Sustainer";
  document.getElementById("selmotorlabel").textContent =
    (two ? tgtLab + " " : "") + (xlist.length ? (two ? "main motor" : "Main motor") : two ? "motor" : "Selected motor");
  const mainM = tgtFirst() ? curFirst() : two && motorTarget === "booster" ? curBoost() : curMotor();
  const selId = pickSlot >= 0 && xlist[pickSlot] ? xlist[pickSlot].id : mainM.id;
  {
    const fit = motorFit(mainM, tgtD(), tgtB()),
      mn = document.getElementById("mountnote");
    if (mn) {
      mn.hidden = !fit;
      if (fit) {
        const src = fit.src === "chosen" ? "you chose on the Rocket tab" : "from your design file";
        mn.textContent =
          fit.status === "ok"
            ? `Fits the ${fit.mount} mm ${two ? tgtLab.toLowerCase() + " " : ""}motor mount ${src}.`
            : fit.status === "big"
              ? `⚠ Too big: this ${fit.motor} mm motor won't fit the ${fit.mount} mm motor mount ${src}.`
              : `⚠ This ${fit.motor} mm motor is smaller than the ${fit.mount} mm motor mount ${src}; it needs a motor adapter.`;
        mn.style.color = fit.status === "ok" ? "" : fit.status === "big" ? "var(--bad)" : "var(--warn)";
      }
    }
  }
  const cur = mainM,
    cs = mstats(cur);
  const sel = document.getElementById("selmotor");
  sel.innerHTML = `<div style="min-width:0"><div class="nm">${esc(cur.cn || cur.name)}</div><div class="sub" style="margin-top:2px">${cur.cn && cur.cn !== cur.name ? esc(cur.name) + " · " : ""}${esc(cur.mfr)} · ${esc(SYS_LABEL[cur.sys] || "")} · ${cs.cls} class</div><div class="meta" style="font:400 .78rem var(--f-mono);color:var(--muted);margin-top:4px;overflow-wrap:anywhere">${motorMeta(cur, cs)}</div></div><canvas></canvas>`;
  drawSpark(sel.querySelector("canvas"), cur);
  renderCluster(two, xlist, mainM);
  renderFilters();
  const items = filterMotors(F.dia, F.sys, F.q).sort((a, b) => mstats(a).I - mstats(b).I);
  document.getElementById("fcount").textContent = items.length
    ? `${items.length} motor${items.length === 1 ? "" : "s"}, sorted by total impulse`
    : "No motors match. Clear the search or pick another diameter or system.";
  const list = document.getElementById("motorlist");
  list.innerHTML = "";
  items.slice(0, shown).forEach((m) => {
    const s = mstats(m);
    const el = document.createElement("div");
    el.className = "mot";
    el.setAttribute("role", "radio");
    el.tabIndex = 0;
    el.setAttribute("aria-checked", m.id === selId);
    el.innerHTML = `<span class="dot"></span><div style="min-width:0"><div class="nm">${esc(m.cn || m.name)}${m.cn && m.cn !== m.name ? `<span class="sub" style="font:500 .78rem var(--f-mono);margin-left:6px">${esc(m.name)}</span>` : ""}${F.brand === "all" ? `<span class="tag">${esc(m.brand === "Cesaroni" ? "CTI" : m.brand === "AeroTech" ? "AT" : m.brand)}</span>` : ""}${m.builtin ? "" : '<span class="tag">Uploaded</span>'}${m.sparky ? '<span class="tag">Sparky</span>' : ""}${m.builtin ? "" : `<button class="del" data-id="${esc(m.id)}">Remove</button>`}</div>
      <div class="meta">${motorMeta(m, s)}</div></div><canvas></canvas>`;
    const pick = () => {
      const tg0 = mdTarget(),
        old = pickSlot >= 0 ? null : mdMotor(tg0);
      if (pickSlot >= 0 && xlist[pickSlot]) {
        xlist[pickSlot].id = m.id;
        store.set("rfs-design", D);
      } else if (tgtFirst()) {
        firstId = m.id;
        store.set("rfs-b1motor", firstId);
      } else if (two && motorTarget === "booster") {
        boostId = m.id;
        store.set("rfs-bmotor", boostId);
      } else {
        motorId = m.id;
        store.set("rfs-motor", motorId);
      }
      if (old) mdSnap(tg0, old, m);
      renderMotors();
      markStale();
      drawProfile();
    };
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("del")) return;
      pick();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        pick();
      }
    });
    list.appendChild(el);
    drawSpark(el.querySelector("canvas"), m);
  });
  const more = document.getElementById("moremotors");
  more.hidden = items.length <= shown;
  more.textContent = `Show ${Math.min(40, items.length - shown)} more of ${items.length - shown}`;
  list.querySelectorAll(".del").forEach(
    (b) =>
      (b.onclick = () => {
        USER_MOTORS = USER_MOTORS.filter((m) => m.id !== b.dataset.id);
        store.set("rfs-motors", USER_MOTORS);
        if (motorId === b.dataset.id) motorId = DEFAULT_MOTOR;
        store.set("rfs-motor", motorId);
        renderMotors();
        markStale();
      }),
  );
  mdRender();
  cfgRender();
  drawMtarget();
  if (CMP.rows && CMP.tgt !== motorTarget && !CMP.running) {
    CMP.rows = null;
    document.getElementById("cmpmsg").textContent = "";
  }
  cmpRender();
}
document.getElementById("moremotors").onclick = () => {
  shown += 40;
  renderMotors();
};
