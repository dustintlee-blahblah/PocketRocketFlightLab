/* ---------- flight animation (side view along the wind) ---------- */
const ANIM = { on: false, t: 0, speed: 1, playing: false, raf: 0, last: 0, cam: null };
// the rocket's outline in its own frame: x from the nose tip, r out from the axis
function animShape(DD, x0 = 0, x1 = Infinity) {
  const AE = aero(DD),
    body = [],
    fins = [];
  for (const sg of AE.segs) {
    if (sg.x + sg.len <= x0 + 1e-9 || sg.x >= x1 - 1e-9) continue;
    const k = sg.kind === "tube" ? 1 : 24;
    for (let i = 0; i <= k; i++) {
      const x = (i / k) * sg.len;
      body.push([sg.x + x - x0, segR(sg, x)]);
    }
  }
  for (const f of AE.fins) {
    if (f.xLead < x0 - 1e-9 || f.xLead >= x1 - 1e-9) continue;
    const rf = radiusAt(AE, f.xLead + f.a / 2);
    fins.push(finOutline(f).map(([px, py]) => [f.xLead - x0 + px, rf + py]));
  }
  const len = Math.max(...body.map((p) => p[0]), 0.01),
    R = Math.max(...body.map((p) => p[1]), 0.005);
  return { body, fins, len, R };
}
function animOpen() {
  if (!lastSim) return;
  const { out, st, D: RD } = lastSim,
    two = !!st.staged;
  const three = two && !!st.three && isThree(RD),
    SD = three ? stackDesign3(RD) : two ? stackDesign(RD) : RD,
    L2 = RD.length + (RD.bLength || 0);
  ANIM.full = three ? animShape(SD) : null; // all three stages, until the first one drops
  ANIM.shape = animShape(SD, 0, three ? L2 : Infinity); // booster and sustainer
  ANIM.sus = two ? animShape(SD, 0, RD.length) : ANIM.shape;
  ANIM.boo = two ? animShape(SD, RD.length, three ? L2 : Infinity) : null;
  ANIM.first = three ? animShape(SD, L2) : null;
  ANIM.tEnd = Math.max(
    st.tLand || out.t[out.t.length - 1],
    out.bt && out.bt.length ? out.bt[out.bt.length - 1] : 0,
    out.b1t && out.b1t.length ? out.b1t[out.b1t.length - 1] : 0,
  );
  // running extents of the flight so far, so the view always holds the whole path flown
  {
    let zmax = 0,
      xmin = 0,
      xmax = 0;
    ANIM.ext = out.t.map((_, i) => {
      const xx = -out.drift[i];
      zmax = Math.max(zmax, out.alt[i]);
      xmin = Math.min(xmin, xx);
      xmax = Math.max(xmax, xx);
      return [zmax, xmin, xmax];
    });
  }
  ANIM.t = 0;
  ANIM.cam = null;
  ANIM.on = true;
  document.getElementById("animmodal").hidden = false;
  document.getElementById("animscrub").max = String(ANIM.tEnd);
  animPlay(true);
}
function animClose() {
  if (VID.busy) VID.cancel = true;
  document.getElementById("animvidbox").hidden = true;
  ANIM.on = false;
  ANIM.playing = false;
  cancelAnimationFrame(ANIM.raf);
  document.getElementById("animmodal").hidden = true;
}
function animPlay(on) {
  ANIM.playing = on;
  document.getElementById("animplay").textContent = on ? "Pause" : "Play";
  if (on) {
    if (ANIM.t >= ANIM.tEnd - 1e-6) ANIM.t = 0;
    ANIM.last = performance.now();
    cancelAnimationFrame(ANIM.raf);
    ANIM.raf = requestAnimationFrame(animTick);
  }
}
function animTick(now) {
  if (!ANIM.on || (typeof VID !== "undefined" && VID.busy)) return; // a video being made owns the animation
  if (ANIM.playing) {
    ANIM.t = Math.min(ANIM.tEnd, ANIM.t + ((now - ANIM.last) / 1000) * ANIM.speed);
    ANIM.last = now;
    if (ANIM.t >= ANIM.tEnd) animPlay(false);
  }
  animDraw();
  if (ANIM.playing) ANIM.raf = requestAnimationFrame(animTick);
}
// linear interpolation of a recorded series at time t
function animAt(ts, ys, t) {
  if (!ts.length) return 0;
  if (t <= ts[0]) return ys[0];
  if (t >= ts[ts.length - 1]) return ys[ys.length - 1];
  let lo = 0,
    hi = ts.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ts[m] <= t) lo = m;
    else hi = m;
  }
  const f = (t - ts[lo]) / (ts[hi] - ts[lo] || 1);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}
