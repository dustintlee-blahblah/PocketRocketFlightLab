/* ---------- animation scenery: sky, sun, clouds, mountains, tree line, field, windsock, smoke ---------- */
const SCN_R = (i) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function animScenery(c, W, H, gy, K, CX, t, wind) {
  // sky: deep blue overhead, hazy pale near the horizon
  const g = c.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, "#2f6fb3");
  g.addColorStop(0.45, "#6fa6d8");
  g.addColorStop(0.85, "#b9d6ea");
  g.addColorStop(1, "#dde9ef");
  c.fillStyle = g;
  c.fillRect(0, 0, W, gy);
  // sun and its glow
  const sx = W * 0.8,
    sy = Math.min(H * 0.13, 90);
  let sg = c.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.35);
  sg.addColorStop(0, "rgba(255,248,225,.55)");
  sg.addColorStop(0.15, "rgba(255,244,214,.18)");
  sg.addColorStop(1, "rgba(255,244,214,0)");
  c.fillStyle = sg;
  c.fillRect(0, 0, W, gy);
  c.fillStyle = "#fffdf2";
  c.beginPath();
  c.arc(sx, sy, 11, 0, 7);
  c.fill();
  // clouds: flat-bottomed cumulus, drifting with the wind (nearer ones faster and brighter)
  const span = W * 1.6,
    wpx = 6 + wind * 3;
  for (let i = 0; i < 8; i++) {
    const depth = 0.35 + 0.65 * SCN_R(i + 3),
      sc = (0.55 + 0.8 * SCN_R(i + 11)) * (0.6 + 0.5 * depth) * Math.min(1.3, W / 420 + 0.3);
    const yb = gy * (0.1 + 0.55 * SCN_R(i + 21)) * (1.15 - 0.4 * depth) + 18;
    let x0 = (SCN_R(i + 31) * span + t * wpx * depth - CX * K * 0.04 * depth) % span;
    if (x0 < 0) x0 += span;
    x0 -= W * 0.3;
    const n = 4 + Math.floor(SCN_R(i + 41) * 4),
      w = 70 * sc;
    c.save();
    c.beginPath();
    c.rect(x0 - w, yb - 80 * sc, w * 3.2, 80 * sc);
    c.clip();
    const cg = c.createLinearGradient(0, yb - 45 * sc, 0, yb);
    cg.addColorStop(0, `rgba(255,255,255,${0.55 + 0.4 * depth})`);
    cg.addColorStop(0.7, `rgba(236,241,247,${0.55 + 0.38 * depth})`);
    cg.addColorStop(1, `rgba(196,208,224,${0.55 + 0.35 * depth})`);
    c.fillStyle = cg;
    c.filter = `blur(${(1.2 + 1.8 * (1 - depth)).toFixed(1)}px)`;
    c.beginPath();
    for (let k = 0; k < n; k++) {
      const px = x0 + ((k * w * 1.1) / n) * 1.6,
        r = (14 + 16 * SCN_R(i * 7 + k)) * sc * (k === 0 || k === n - 1 ? 0.7 : 1);
      c.moveTo(px + r, yb);
      c.arc(px, yb, r, 0, Math.PI * 2);
      // a second, higher row of billows so the tops are lumpy rather than a row of domes
      if (k > 0 && k < n - 1) {
        const r2 = r * (0.65 + 0.3 * SCN_R(i * 13 + k)),
          y2 = yb - r * (0.45 + 0.35 * SCN_R(i * 17 + k)),
          x2 = px + (SCN_R(i * 19 + k) - 0.5) * r * 0.8;
        c.moveTo(x2 + r2, y2);
        c.arc(x2, y2, r2, 0, Math.PI * 2);
      }
    }
    c.fill();
    c.filter = "none";
    c.restore();
  }
  // two mountain ranges, the far one bluer and snow-capped; they shift only a little as the view follows the rocket
  const ridge = (hmax, f, seed, col1, col2, snow) => {
    const sh = -CX * K * f,
      hh = Math.min(hmax, gy * 0.5);
    c.beginPath();
    c.moveTo(0, gy);
    for (let px = 0; px <= W + 4; px += 4) {
      const X = (px - sh) / Math.max(W, 320);
      const h =
        hh *
        (0.55 +
          0.22 * Math.sin(X * 8.2 + seed) +
          0.13 * Math.sin(X * 19.7 + seed * 2.3) +
          0.07 * Math.sin(X * 41 + seed * 0.7) +
          0.03 * Math.sin(X * 97 + seed));
      c.lineTo(px, gy - h);
    }
    c.lineTo(W, gy);
    c.closePath();
    const mg = c.createLinearGradient(0, gy - hh, 0, gy);
    if (snow) {
      mg.addColorStop(0, "#f4f7fa");
      mg.addColorStop(0.16, "#e2e9ef");
      mg.addColorStop(0.24, col1);
    } else mg.addColorStop(0, col1);
    mg.addColorStop(1, col2);
    c.fillStyle = mg;
    c.fill();
  };
  ridge(H * 0.2, 0.015, 1.7, "#8ea6be", "#bccddb", true);
  ridge(H * 0.11, 0.05, 4.2, "#6d8b78", "#a2b7a6", false);
  // tree line along the far edge of the field
  const tsh = -CX * K * 0.15,
    tp = W + 40;
  c.fillStyle = "#3d5f3a";
  c.beginPath();
  for (let i = 0; i < Math.ceil(W / 7) + 8; i++) {
    let x0 = (i * 7 + tsh) % tp;
    if (x0 < 0) x0 += tp;
    x0 -= 20;
    const h = 5 + 8 * SCN_R(i + (Math.floor((i * 7 + tsh) / tp) | 0) * 97);
    if (SCN_R(i + 500) < 0.18) continue;
    c.moveTo(x0 - 3.2, gy + 1);
    c.lineTo(x0, gy - h);
    c.lineTo(x0 + 3.2, gy + 1);
  }
  c.fill();
}
function animGround(c, W, H, gy, K, CX, padX, t, wind) {
  // the field: hazy where it meets the trees, darker and richer close up, with mown stripes in perspective
  const gg = c.createLinearGradient(0, gy, 0, H);
  gg.addColorStop(0, "#93b56f");
  gg.addColorStop(1, "#4c7a34");
  c.fillStyle = gg;
  c.fillRect(0, gy, W, H - gy);
  const d = H - gy;
  c.fillStyle = "rgba(255,255,255,.06)";
  for (let i = 0; i < 7; i += 2) {
    const y1 = gy + d * Math.pow(i / 7, 1.7),
      y2 = gy + d * Math.pow((i + 1) / 7, 1.7);
    c.fillRect(0, y1, W, y2 - y1);
  }
  // a few grass tufts, fixed to the ground so they slide past as the view moves
  c.strokeStyle = "rgba(40,70,25,.45)";
  c.lineWidth = 1;
  c.beginPath();
  const sh = -CX * K * 0.6,
    per = W + 60;
  for (let i = 0; i < 26; i++) {
    let x0 = (SCN_R(i + 700) * per + sh) % per;
    if (x0 < 0) x0 += per;
    x0 -= 30;
    const y0 = gy + 6 + (d - 10) * SCN_R(i + 800),
      hh = 2 + (3 * (y0 - gy)) / d;
    c.moveTo(x0, y0);
    c.lineTo(x0 - 1.5, y0 - hh);
    c.moveTo(x0, y0);
    c.lineTo(x0 + 0.5, y0 - hh * 1.2);
    c.moveTo(x0, y0);
    c.lineTo(x0 + 2, y0 - hh * 0.9);
  }
  c.stroke();
  // worn dirt patch around the pad
  const pg = c.createRadialGradient(padX, gy + 3, 1, padX, gy + 3, 30);
  pg.addColorStop(0, "rgba(150,125,85,.85)");
  pg.addColorStop(1, "rgba(150,125,85,0)");
  c.fillStyle = pg;
  c.beginPath();
  c.ellipse(padX, gy + 3, 30, 7, 0, 0, Math.PI * 2);
  c.fill();
  // windsock beside the pad: droops in a calm, stands out straight in a strong wind
  const wx = padX - 46,
    top = gy - 26,
    lift = Math.min(1, Math.max(0, wind / 7.5)),
    ang = (1 - lift) * 1.15 + 0.08 * Math.sin(t * 3.1) * lift;
  c.strokeStyle = "#5a5f64";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(wx, gy + 2);
  c.lineTo(wx, top);
  c.stroke();
  c.save();
  c.translate(wx, top + 1);
  c.rotate(ang);
  const L = 16;
  for (let k = 0; k < 4; k++) {
    const a = (k * L) / 4,
      b = ((k + 1) * L) / 4,
      ra = 4 - (1.8 * a) / L,
      rb = 4 - (1.8 * b) / L;
    c.fillStyle = k % 2 ? "#f5f5f5" : "#ee6a1f";
    c.beginPath();
    c.moveTo(a, -ra);
    c.lineTo(b, -rb);
    c.lineTo(b, rb);
    c.lineTo(a, ra);
    c.closePath();
    c.fill();
  }
  c.restore();
}
function animSmoke(c, out, st, RD, t, SX, SY, K, wind) {
  if (!out.t.length) return;
  const tEj = st.tEject != null ? st.tEject : null,
    tb = st.tb != null ? st.tb : null;
  const puffs = [];
  let lx = null,
    ly = null;
  for (let i = 0; i < out.t.length; i++) {
    const ti = out.t[i];
    if (ti > t) break;
    const burn = (out.thrust[i] || 0) > 1,
      delay = !burn && tb != null && tEj != null && ti > tb && ti < tEj;
    if (!burn && !delay) continue;
    const age = t - ti,
      wx = -out.drift[i] + wind * age,
      wz = Math.max(0, out.alt[i]) + age * 0.2;
    const r = Math.min(
      burn ? 34 : 14,
      Math.max(
        (burn ? 2.2 : 1.2) + age * (burn ? 0.9 : 0.4),
        (burn ? 0.35 : 0.15) * K + (burn ? 0.35 : 0.15) * age * K,
      ),
    );
    const a = (burn ? 0.42 : 0.22) * Math.exp(-age / (burn ? 22 : 12));
    if (a < 0.01) continue;
    const x = SX(wx),
      y = SY(wz);
    if (lx != null && Math.hypot(x - lx, y - ly) < Math.max(1.5, r * 0.45)) continue;
    lx = x;
    ly = y;
    puffs.push([x, y, r, a]);
  }
  for (const [x, y, r, a] of puffs) {
    c.fillStyle = `rgba(236,236,232,${a})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  // ejection charge puffs
  let evs = [];
  try {
    evs = chargeEvents(st, RD, out) || [];
  } catch (_) {
    evs = [];
  }
  for (const e of evs) {
    if (e.t == null || t < e.t) continue;
    const age = t - e.t;
    if (age > 6) continue;
    const z0 = animAt(out.t, out.alt, e.t),
      x0 = -animAt(out.t, out.drift, e.t) + wind * age;
    const r = Math.max(6 + age * 9, (0.8 + age * 1.6) * K),
      a = 0.55 * Math.exp(-age / 1.6);
    const pg = c.createRadialGradient(SX(x0), SY(z0), 0, SX(x0), SY(z0), r);
    pg.addColorStop(0, `rgba(205,205,200,${a})`);
    pg.addColorStop(1, "rgba(205,205,200,0)");
    c.fillStyle = pg;
    c.beginPath();
    c.arc(SX(x0), SY(z0), r, 0, Math.PI * 2);
    c.fill();
  }
}
// draws one frame: on the screen, or (for a video) on a given canvas, with the readout drawn into the picture
function animDraw(target) {
  const video = !!target;
  const { c, W, H } = target || setupCanvas(document.getElementById("animcv"));
  const { out, st, L: RL, D: RD } = lastSim,
    t = ANIM.t;
  const x = -animAt(out.t, out.drift, t),
    z = Math.max(0, animAt(out.t, out.alt, t));
  let bx = animAt(out.t, out.ax, t),
    bz = animAt(out.t, out.az, t);
  {
    const n = Math.hypot(bx, bz) || 1;
    bx /= n;
    bz /= n;
  }
  const tDep = st.tDeploy,
    landed = st.tLand != null && t >= st.tLand - 1e-6,
    chute = tDep != null && t >= tDep && !landed && !st.noChute;
  // no recovery: show it turning end over end on the way down
  if (st.noChute && tDep != null && t >= tDep && !landed) {
    const a = (t - tDep) * 2 * Math.PI * 0.7,
      c0 = Math.cos(a),
      s0 = Math.sin(a);
    [bx, bz] = [bx * c0 - bz * s0, bx * s0 + bz * c0];
  }
  const mainOpen = chute && (st.single || (st.tMain != null && t >= st.tMain));
  // dual deployment with no drogue: nothing opens until the main
  const noDrogue = !st.single && !(RD.drogueDia > 0),
    mainOpenAtDep = st.single || (st.tMain != null && tDep != null && st.tMain <= tDep + 1e-6);
  const freefall = chute && !mainOpen && noDrogue;
  // coming down ballistic, the drawn attitude is the simulated one: a stable rocket swings over and falls nose first
  const staged = st.staged && st.tSep != null && t >= st.tSep;
  const boost = st.staged && !staged ? true : false;
  // booster after separation
  let bpos = null;
  if (st.staged && staged && out.bt && out.bt.length) {
    bpos = [animAt(out.bt, out.bxp || out.bt.map(() => 0), t), Math.max(0, animAt(out.bt, out.balt, t))];
  }
  const full = !!(st.three && st.tSep1 != null && t < st.tSep1);
  let fpos = null;
  if (st.three && !full && out.b1t && out.b1t.length) {
    fpos = [animAt(out.b1t, out.b1xp, t), Math.max(0, animAt(out.b1t, out.b1alt, t))];
  }
  // camera: keep the pad and the rocket in view, never closer than about 40 m across
  const nIdx = Math.max(0, ((out.t.findIndex((tt) => tt > t) + out.t.length) % out.t.length) - 1),
    ex = ANIM.ext[nIdx] || [0, 0, 0];
  const xs = [0, x, ex[1], ex[2], ...(bpos ? [bpos[0]] : []), ...(fpos ? [fpos[0]] : [])],
    zs = [0, z, ex[0], ...(bpos ? [bpos[1]] : []), ...(fpos ? [fpos[1]] : [])];
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    maxZ = Math.max(...zs);
  const viewH = Math.max(40, maxZ * 1.25 + 10),
    viewW = Math.max((maxX - minX) * 1.3 + 20, (viewH * W) / H);
  const k = Math.min(W / viewW, (H - 104) / viewH); // room at the top for the event notices
  const cx = (minX + maxX) / 2;
  if (!ANIM.cam) ANIM.cam = { k, cx };
  else {
    ANIM.cam.k += (k - ANIM.cam.k) * 0.12;
    ANIM.cam.cx += (cx - ANIM.cam.cx) * 0.12;
  }
  // easing may lag a fast climb (or a sped-up video): zoom out at once rather than lose the rocket off the edge
  if (ANIM.cam.k > k) {
    ANIM.cam.k = k;
    ANIM.cam.cx = cx;
  }
  const K = ANIM.cam.k,
    CX = ANIM.cam.cx,
    gy = H - 50;
  const SX = (wx) => W / 2 + (wx - CX) * K,
    SY = (wz) => gy - wz * K;
  // sky, getting deeper with height
  const dark = false; // always a daytime sky, whatever the app's light or dark theme
  animScenery(c, W, H, gy, K, CX, t, RL.wind || 0);
  // altitude grid
  c.font = "11px " + css("--f-mono").split(",")[0].replace(/"/g, "") + ", monospace";
  const topZ = gy / K;
  c.strokeStyle = dark ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.3)";
  c.fillStyle = dark ? "rgba(255,255,255,.55)" : "rgba(20,40,60,.6)";
  c.lineWidth = 1;
  c.textAlign = "left";
  c.textBaseline = "bottom";
  niceTicks(0, toDisp(topZ, "alt"), 4).forEach((v) => {
    if (v <= 0) return;
    const zz = fromDisp(v, "alt");
    if (zz > topZ) return;
    const yy = SY(zz);
    c.beginPath();
    c.moveTo(0, yy);
    c.lineTo(W, yy);
    c.stroke();
    c.fillText(`${Math.abs(v) >= 1000 ? v / 1000 + "k" : v} ${uname("alt")}`, 6, yy - 2);
  });
  // the RSO's safety cone: the angle from vertical, either side of the pad, the rocket must stay inside while a motor burns.
  // It turns red while the rocket is outside it under power.
  {
    const cone = RL.cone > 0 ? RL.cone : 20,
      tn = Math.tan((cone * Math.PI) / 180),
      p0 = SX(0),
      dz = gy / K + 1,
      dx = dz * tn * K;
    const powered = animAt(out.t, out.thrust, t) > 0,
      outside = powered && z > Math.max(2 * RL.rail, 15) && Math.abs(x) > z * tn,
      col = outside ? "220,50,40" : "255,255,255";
    c.save();
    c.beginPath();
    c.moveTo(p0, gy);
    c.lineTo(p0 - dx, gy - dz * K);
    c.lineTo(p0 + dx, gy - dz * K);
    c.closePath();
    c.fillStyle = `rgba(${col},${outside ? 0.14 : 0.1})`;
    c.fill();
    c.setLineDash([7, 5]);
    c.lineWidth = 1.4;
    c.strokeStyle = `rgba(${outside ? "200,40,30" : "255,255,255"},${outside ? 0.95 : 0.8})`;
    c.beginPath();
    c.moveTo(p0, gy);
    c.lineTo(p0 - dx, gy - dz * K);
    c.moveTo(p0, gy);
    c.lineTo(p0 + dx, gy - dz * K);
    c.stroke();
    c.setLineDash([]);
    // no standing label: a warning appears only while the rocket is outside the cone under power
    if (outside) {
      c.font = "600 11px " + css("--f-body").split(",")[0].replace(/"/g, "") + ", sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      const txt = `Outside the ${+cone.toFixed(1)}° safety cone under power!`,
        tw = c.measureText(txt).width,
        ly = 58,
        lx = Math.min(Math.max(p0, tw / 2 + 8), W - tw / 2 - 8);
      c.fillStyle = outside ? "rgba(150,25,15,.75)" : "rgba(20,30,40,.4)";
      c.beginPath();
      c.roundRect ? c.roundRect(lx - tw / 2 - 5, ly - 9, tw + 10, 18, 5) : c.rect(lx - tw / 2 - 5, ly - 9, tw + 10, 18);
      c.fill();
      c.fillStyle = "#fff";
      c.fillText(txt, lx, ly);
    }
    c.restore();
  }
  // ground, pad and rail, windsock
  animGround(c, W, H, gy, K, CX, SX(0), t, RL.wind || 0);
  const rl = Math.max(RL.rail * K, 18);
  let rx0 = out.ax[0] || 0,
    rz0 = out.az[0] || 1;
  {
    const q = Math.hypot(rx0, rz0) || 1;
    rx0 /= q;
    rz0 /= q;
  }
  {
    const p0 = SX(0);
    c.strokeStyle = "#3a3f44";
    c.lineWidth = 1.6;
    c.beginPath(); // tripod legs and the blast plate
    c.moveTo(p0, gy - 6);
    c.lineTo(p0 - 9, gy + 4);
    c.moveTo(p0, gy - 6);
    c.lineTo(p0 + 9, gy + 4);
    c.moveTo(p0, gy - 6);
    c.lineTo(p0 + 2, gy + 6);
    c.stroke();
    c.fillStyle = "#8a8f94";
    c.fillRect(p0 - 7, gy - 5, 14, 3);
    c.strokeStyle = "#4a5056";
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(p0, gy - 4);
    c.lineTo(p0 + rx0 * rl, gy - 4 - rz0 * rl);
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,.5)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(p0 + 0.8, gy - 4);
    c.lineTo(p0 + 0.8 + rx0 * rl, gy - 4 - rz0 * rl);
    c.stroke();
  }
  // exhaust and delay-grain smoke, drifting downwind and fading, plus the puff of each ejection charge
  animSmoke(c, out, st, RD, t, SX, SY, K, RL.wind || 0);
  // flight path so far
  const n = out.t.findIndex((tt) => tt > t);
  const upto = n < 0 ? out.t.length : n;
  c.strokeStyle = "rgba(255,255,255,.6)";
  c.lineWidth = 1.1;
  c.setLineDash([3, 5]);
  c.beginPath();
  for (let i = 0; i < upto; i += Math.max(1, Math.floor(upto / 600))) {
    const px = SX(-out.drift[i]),
      py = SY(Math.max(0, out.alt[i]));
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.lineTo(SX(x), SY(z));
  c.stroke();
  c.setLineDash([]);
  // the rocket, drawn larger than scale so it stays visible
  const ink = dark ? "#e8edf1" : "#15202a",
    body = dark ? "#3a4a57" : "#f4f6f8",
    acc = window.PR_ACCENT ? "#" + window.PR_ACCENT.hex.slice(1) : "#D9501C";
  const drawShape = (S, px, py, ux, uz, sizePx) => {
    const sc = sizePx / S.len,
      ang = Math.atan2(-uz, ux); // screen angle of the nose direction
    c.save();
    c.translate(px, py);
    c.rotate(ang);
    // local frame: +x toward the nose; the shape's x runs from the nose, so flip it
    const P = ([xx, rr]) => [(S.len / 2 - xx) * sc, rr * sc];
    c.fillStyle = body;
    c.strokeStyle = ink;
    c.lineWidth = 1.3;
    for (const f of S.fins)
      for (const sg of [1, -1]) {
        c.beginPath();
        f.forEach((p, i) => {
          const [a, b] = P(p);
          i ? c.lineTo(a, sg * b) : c.moveTo(a, sg * b);
        });
        c.closePath();
        c.fill();
        c.stroke();
      }
    c.beginPath();
    S.body.forEach((p, i) => {
      const [a, b] = P(p);
      i ? c.lineTo(a, b) : c.moveTo(a, b);
    });
    for (let i = S.body.length - 1; i >= 0; i--) {
      const [a, b] = P(S.body[i]);
      c.lineTo(a, -b);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    return sc;
  };
  const size = Math.max(46, Math.min(90, H * 0.13));
  let pose = null;
  const thrust = animAt(out.t, out.thrust, t);
  const px = SX(x),
    py = SY(z);
  if (chute && !freefall) {
    // hanging under the canopy
    const mainCan = Math.min(64, size * 0.8),
      can = mainOpen ? mainCan : mainCan / 2,
      lineL = size * 0.75; // drogue drawn at half the main's size
    const cy = py - lineL;
    c.strokeStyle = ink;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(px, py - 4);
    c.lineTo(px - can / 2, cy);
    c.moveTo(px, py - 4);
    c.lineTo(px + can / 2, cy);
    c.stroke();
    c.fillStyle = mainOpen ? acc : "#f2b134";
    c.beginPath();
    c.ellipse(px, cy, can / 2, can * 0.32, 0, Math.PI, 0);
    c.closePath();
    c.fill();
    c.strokeStyle = ink;
    c.stroke();
    drawShape(ANIM.sus, px, py, 1, -0.15, size * 0.85);
    pose = { x: px, y: py, ux: 1, uz: -0.15, len: size * 0.85, frac: 1 };
  } else if (landed) {
    drawShape(ANIM.sus, px, py - size * 0.06, 1, 0, size * 0.85);
    pose = { x: px, y: py - size * 0.06, ux: 1, uz: 0, len: size * 0.85, frac: 1 };
  } else {
    const S = full && ANIM.full ? ANIM.full : boost ? ANIM.shape : ANIM.sus;
    const sz0 = boost ? size * 1.25 : size,
      lift0 = (sz0 / 2) * Math.max(0, Math.min(1, 1 - (z * K) / sz0));
    if (thrust > 1) {
      // exhaust flame from the tail
      const tail = [px + bx * lift0 - (bx * sz0) / 2, py - bz * lift0 + (bz * sz0) / 2],
        fl = size * (0.35 + 0.45 * Math.min(1, thrust / 400)) * (0.9 + 0.2 * Math.random());
      const gr = c.createLinearGradient(tail[0], tail[1], tail[0] - bx * fl, tail[1] + bz * fl);
      gr.addColorStop(0, "#fff4c2");
      gr.addColorStop(0.35, "#ffb02e");
      gr.addColorStop(1, "rgba(255,80,20,0)");
      const w = size * 0.07; // across the axis: perpendicular to the screen direction (bx,-bz)
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(tail[0] + bz * w, tail[1] + bx * w);
      c.lineTo(tail[0] - bx * fl, tail[1] + bz * fl);
      c.lineTo(tail[0] - bz * w, tail[1] - bx * w);
      c.closePath();
      c.fill();
    }
    // near the ground, slide the drawing up its axis so the tail sits on the rail instead of under the ground
    const sz = boost ? size * 1.25 : size,
      lift = (sz / 2) * Math.max(0, Math.min(1, 1 - (z * K) / sz)),
      qx = px + bx * lift,
      qy = py - bz * lift;
    drawShape(S, qx, qy, bx, bz, sz);
    pose = { x: qx, y: qy, ux: bx, uz: bz, len: sz, frac: S === ANIM.sus ? 1 : ANIM.sus.len / S.len };
  }
  /* a short flash inside the body when a charge fires: the motor's delay charge near the tail end of the sustainer,
     the altimeter's drogue (apogee) charge just aft of the middle, the main charge forward of it. It lasts about 0.2 s
     of flight time (longer when the playback is sped up, so a frame still catches it) */
  if (pose) {
    let evs = [];
    try {
      evs = chargeEvents(st, RD, out) || [];
    } catch (_) {
      evs = [];
    }
    const dur = 0.2 * Math.max(1, ANIM.speed || 1);
    for (const e of evs) {
      const age = t - e.t;
      if (!(age >= 0 && age < dur)) continue;
      let P = pose,
        f = e.motor ? 0.82 : /Main/.test(e.name) ? 0.32 : 0.55;
      if (e.booster) {
        if (!bpos || !ANIM.boo) continue;
        P = { x: SX(bpos[0]), y: SY(bpos[1]), ux: 0.3, uz: -1, len: size * 0.5, frac: 1 };
        f = 0.3;
      }
      const um = Math.hypot(P.ux, P.uz) || 1,
        ox = P.ux / um,
        oy = -P.uz / um,
        along = (0.5 - f * P.frac) * P.len;
      const fx = P.x + ox * along,
        fy = P.y + oy * along,
        k = 1 - age / dur,
        r = Math.max(10, P.len * 0.22) * (0.6 + 0.6 * Math.sin(Math.PI * Math.min(1, (age / dur) * 2)));
      c.save();
      const g = c.createRadialGradient(fx, fy, 0, fx, fy, r);
      g.addColorStop(0, `rgba(255,255,235,${k})`);
      g.addColorStop(0.3, `rgba(255,196,60,${0.95 * k})`);
      g.addColorStop(0.65, `rgba(240,90,20,${0.55 * k})`);
      g.addColorStop(1, "rgba(220,60,10,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(fx, fy, r, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
  if (fpos && ANIM.first) {
    drawShape(
      ANIM.first,
      SX(fpos[0]),
      SY(fpos[1]) - (fpos[1] <= 0 ? size * 0.05 : 0),
      fpos[1] <= 0 ? 1 : 0.3,
      fpos[1] <= 0 ? 0 : -1,
      size * 0.5,
    );
  }
  if (bpos && ANIM.boo) {
    drawShape(
      ANIM.boo,
      SX(bpos[0]),
      SY(bpos[1]) - (bpos[1] <= 0 ? size * 0.05 : 0),
      bpos[1] <= 0 ? 1 : 0.3,
      bpos[1] <= 0 ? 0 : -1,
      size * 0.5,
    );
  }
  // readout
  const vz = landed ? 0 : animAt(out.t, out.vel, t);
  const phase = landed
    ? "Landed"
    : chute && !freefall
      ? mainOpen
        ? st.single
          ? "Under parachute"
          : "Under main"
        : "Under drogue"
      : freefall
        ? "Falling, main not yet open"
        : (st.tumble && t >= st.tumble.t) || (st.noChute && tDep != null && t >= tDep)
          ? "Tumbling"
          : thrust > 1
            ? "Motor burning"
            : t < (st.tApo ?? 1e9)
              ? "Coasting up"
              : "Falling";
  const mono = css("--f-mono").split(",")[0].replace(/"/g, ""),
    fam = css("--f-body").split(",")[0].replace(/"/g, "");
  if (!video) {
    document.getElementById("animhud").innerHTML =
      `<b>${phase}</b><span>T+${t.toFixed(1)} s</span><span>Altitude ${fmt(z, "alt")} ${uname("alt")}</span><span>Vertical speed ${fmt(vz, "speed")} ${uname("speed")}</span><span>${Math.abs(x) < 0.5 ? "Over the pad" : `${fmt(Math.abs(x), "alt")} ${uname("alt")} ${x > 0 ? "downwind" : "upwind"}`}</span>`;
    const sc = document.getElementById("animscrub");
    if (document.activeElement !== sc) sc.value = String(t);
  } else {
    // in a video the readout is part of the picture, in the ground band at the lower left
    c.save();
    c.shadowColor = "rgba(0,0,0,.45)";
    c.shadowBlur = 3;
    c.fillStyle = "#fff";
    c.textAlign = "left";
    c.textBaseline = "bottom";
    c.font = `700 12px ${fam}, sans-serif`;
    c.fillText(`${phase}  ·  T+${t.toFixed(1)} s`, 8, H - 24);
    c.font = `11px ${mono}, monospace`;
    c.fillText(
      `${fmt(z, "alt")} ${uname("alt")}  ${vz >= 0 ? "↑" : "↓"} ${fmt(Math.abs(vz), "speed")} ${uname("speed")}`,
      8,
      H - 8,
    );
    c.restore();
  }
  // wind, in the lower right corner
  if (RL.wind > 0.2) {
    c.save();
    c.shadowColor = "rgba(0,0,0,.45)";
    c.shadowBlur = 3;
    c.fillStyle = "#fff";
    c.font = `11px ${mono}, monospace`;
    c.textAlign = "right";
    c.textBaseline = "bottom";
    c.fillText(`wind ${fmt(RL.wind, "wind", 0)} ${uname("wind")} →`, W - 8, H - 8);
    c.restore();
  }
  if (video) {
    c.save();
    c.fillStyle = "rgba(255,255,255,.75)";
    c.font = `600 9px ${fam}, sans-serif`;
    c.textAlign = "right";
    c.textBaseline = "bottom";
    c.fillText("Pocket Rocket Flight Lab", W - 8, H - 24);
    c.restore();
  }
  // event notices: across the top of the window, above the flight
  const dur = (2.5 / Math.max(ANIM.speed, 1)) * 1.5;
  // every charge, named for what it does: the motor's delay charge, or the altimeter/timer charge for each chute
  const evs = [
    [st.tb, "Burnout"],
    [st.tApo, `Apogee ${fmt(st.maxAlt, "alt")} ${uname("alt")}`],
    ...chargeEvents(st, RD, out).map((c) => [
      c.t,
      c.motor ? `${c.name} fires (${+c.delay.toFixed(1)} s)` : `${c.name} fires`,
    ]),
    [
      st.noChute || (noDrogue && !mainOpenAtDep) ? null : tDep,
      mainOpenAtDep ? (st.single ? "Chute opens" : "Main opens") : "Drogue opens",
    ],
    [mainOpenAtDep || st.tMain == null ? null : st.tMain, "Main opens"],
    [st.tSep1, "First stage drops"],
    [st.tSep, "Staging"],
    [st.tumble ? st.tumble.t : st.noChute ? tDep : null, "Tumbling"],
    [st.tLand, "Landed"],
  ]
    .filter((e) => e[0] != null && t >= e[0] && t - e[0] < dur)
    .sort((a, b) => a[0] - b[0])
    .slice(-3);
  if (evs.length) {
    let fs = 14;
    const widths = () =>
      evs.map((e) => {
        c.font = `600 ${fs}px ${fam}, sans-serif`;
        return c.measureText(e[1]).width + 22;
      });
    let ws = widths();
    while (fs > 10 && ws.reduce((a, b) => a + b, 0) + 8 * (ws.length - 1) > W - 16) {
      fs--;
      ws = widths();
    }
    const bh = fs + 12,
      total = ws.reduce((a, b) => a + b, 0) + 8 * (ws.length - 1),
      y0 = 10;
    let xx = W / 2 - total / 2;
    c.textAlign = "center";
    c.textBaseline = "middle";
    evs.forEach((e, i) => {
      const w = ws[i],
        fresh = t - e[0] < 0.6;
      c.fillStyle = fresh ? "rgba(196,72,20,.95)" : "rgba(21,32,42,.85)";
      c.beginPath();
      c.roundRect ? c.roundRect(xx, y0, w, bh, 8) : c.rect(xx, y0, w, bh);
      c.fill();
      c.fillStyle = "#fff";
      c.font = `600 ${fs}px ${fam}, sans-serif`;
      c.fillText(e[1], xx + w / 2, y0 + bh / 2 + 1);
      xx += w + 8;
    });
  }
}
document.getElementById("animbtn").onclick = animOpen;
// the phone's Back button (the Android app asks this first): close the animation window, or an info or About box, instead of leaving the app
window.prBack = function () {
  if (window.prSettingsOpen && window.prSettingsOpen()) {
    window.prSettingsClose();
    return true;
  }
  if (typeof ANIM !== "undefined" && ANIM.on) {
    animClose();
    return true;
  }
  const ib = document.getElementById("infobox");
  if (ib && !ib.hidden) {
    ib.hidden = true;
    return true;
  }
  for (const [id, b] of [
    ["altmodal", "altcancel"],
    ["flallmodal", "flallclose"],
    ["flmodal", "flcancel"],
  ]) {
    const e = document.getElementById(id);
    if (e && !e.hidden) {
      document.getElementById(b).click();
      return true;
    }
  }
  const ab = document.getElementById("about");
  if (ab && !ab.hidden) {
    document.getElementById("aboutclose").click();
    return true;
  }
  return false;
};
document.getElementById("animclose").onclick = animClose;
document.getElementById("animplay").onclick = () => animPlay(!ANIM.playing);
document.getElementById("animrestart").onclick = () => {
  ANIM.t = 0;
  ANIM.cam = null;
  animPlay(true);
};
document.getElementById("animspeed").onchange = (e) => {
  ANIM.speed = parseFloat(e.target.value) || 1;
};
document.getElementById("animscrub").addEventListener("input", (e) => {
  ANIM.t = parseFloat(e.target.value) || 0;
  ANIM.cam = null;
  if (!ANIM.playing) animDraw();
});
document.addEventListener("keydown", (e) => {
  if (!ANIM.on) return;
  if (e.key === "Escape") animClose();
  else if (e.key === " ") {
    e.preventDefault();
    animPlay(!ANIM.playing);
  }
});
window.addEventListener("resize", () => {
  if (ANIM.on && !ANIM.playing && !VID.busy) animDraw();
});
