/**
 * Streamlines and the state of the flow along the body, for the Wind Tunnel's test section. Drawn only: nothing here
 * feeds a number in the flight or the charts.
 *
 * The streamlines lie in the plane of the angle of attack (where, by symmetry, the flow stays in the plane):
 * - Below Mach 1, slender-body potential flow: sources along the axis, of strength U·dA/dx, give the body its thickness
 *   (their sum equals the base area, so the flow leaves the base as if the body ran on, which is where the dead air of
 *   the wake sits), and doublets of strength 2·U·sin α·A per length turn the crossflow around each section, as around a
 *   circle (the slender-body theory behind Barrowman's body lift).
 * - Above Mach 1, the flow is undisturbed ahead of the nose shock; behind it, each point is turned by the slope of the
 *   body where the Mach line through it starts (linear supersonic theory), fading as √(r/y) away from the body as the
 *   disturbance spreads round it, plus the crossflow around a circle. Behind the base the flow turns in towards the wake
 *   neck about one base diameter back, where it straightens again (the recompression).
 *
 * Along the body, from the same rules the drag model uses:
 * - Laminar boundary layer from the tip to Re_x = 5×10⁵ (natural transition on a smooth surface), turbulent behind;
 *   thicknesses from Blasius (5x/√Re_x) and the 1/7-power turbulent layer (0.37x/Re_x^0.2).
 * - Separation behind a rearward step (reattaching about six step heights downstream), on a boattail steeper than 8°
 *   (all of it by 20°, Hoerner's rule, as in the base drag), behind the base (the wake), on the lee side of the body
 *   above about 5° angle of attack (the crossflow separation behind body lift at larger angles), and on the fins as they
 *   stall, from 18° to 35° (the fin stall in the normal-force model).
 */
import { smooth01 } from "./aerodynamics.js";

/**
 * Radius of the outline at x (linear between points; 0 outside the body).
 * @param {{x:number, r:number}[]} P outline from the tip
 * @param {number} x
 * @returns {number}
 */
function rOf(P, x) {
  if (x < P[0].x || x > P[P.length - 1].x) return 0;
  let lo = 0,
    hi = P.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (P[m].x <= x) lo = m;
    else hi = m;
  }
  const a = P[lo],
    b = P[hi],
    d = b.x - a.x;
  return d > 1e-12 ? a.r + ((b.r - a.r) * (x - a.x)) / d : Math.max(a.r, b.r);
}

/**
 * A velocity field around the body, in body axes (x back from the tip, y across, towards the lee side positive for a
 * positive angle), in units of the free-stream speed.
 * @param {{x:number, r:number}[]} P outline
 * @param {number} M Mach number
 * @param {number} al angle of attack (rad)
 * @param {number} shock half-angle of the nose shock (rad), above Mach 1
 * @returns {{vel:(x:number, y:number)=>number[], rWake:(x:number)=>number, L:number}}
 */
function field(P, M, al, shock) {
  const L = P[P.length - 1].x,
    Ux = Math.cos(al),
    Uy = Math.sin(al),
    rb = P[P.length - 1].r;
  if (M <= 1.05) {
    const N = 160,
      dx = L / N,
      xs = [],
      ms = [],
      ps = [];
    for (let i = 0; i < N; i++) {
      const x0 = i * dx,
        x1 = x0 + dx,
        a0 = Math.PI * rOf(P, x0) ** 2,
        a1 = Math.PI * rOf(P, Math.min(x1, L - 1e-9)) ** 2;
      xs.push(x0 + dx / 2);
      ms.push(Ux * (a1 - a0));
      ps.push(2 * Uy * ((a0 + a1) / 2) * dx);
    }
    const e2 = (dx * 0.6) ** 2,
      k = 1 / (4 * Math.PI);
    return {
      L,
      rWake: () => 0,
      vel(x, y) {
        let u = Ux,
          v = Uy;
        for (let i = 0; i < N; i++) {
          const ddx = x - xs[i],
            d2 = ddx * ddx + y * y + e2,
            d = Math.sqrt(d2),
            d3 = d2 * d,
            d5 = d3 * d2,
            s = (ms[i] * k) / d3;
          u += s * ddx - (3 * ps[i] * k * y * ddx) / d5;
          v += s * y + ps[i] * k * (1 / d3 - (3 * y * y) / d5);
        }
        return [u, v];
      },
    };
  }
  const be = Math.sqrt(M * M - 1),
    neck = L + 2 * rb,
    rWake = (x) => (x <= L ? rOf(P, x) : x >= neck ? 0.35 * rb : rb - ((rb - 0.35 * rb) * (x - L)) / (neck - L)),
    slope = (x) => {
      const h = Math.max(L / 400, 1e-4);
      return (rWake(x + h) - rWake(Math.max(x - h, 0))) / (x + h - Math.max(x - h, 0));
    },
    tanS = Math.tan(Math.max(shock || Math.asin(1 / M), 0.05));
  return {
    L,
    rWake,
    vel(x, y) {
      const ay = Math.abs(y),
        sg = y >= 0 ? 1 : -1;
      // ahead of the nose shock nothing has heard of the rocket
      if (x < P[0].x + ay / tanS) return [Ux, Uy];
      // the body station whose Mach line passes through this point
      let lo = 0,
        hi = neck + 4 * rb + 1;
      const g = (xi) => x - xi - be * (ay - rWake(xi));
      if (g(0) <= 0) hi = 0;
      for (let i = 0; i < 40 && hi > lo; i++) {
        const m = (lo + hi) / 2;
        if (g(m) > 0) lo = m;
        else hi = m;
      }
      const xi = (lo + hi) / 2,
        rx = Math.max(rWake(xi), 1e-6),
        dl = Math.max(-0.5, Math.min(0.5, Math.atan(slope(xi)) * Math.sqrt(Math.min(1, rx / Math.max(ay, rx))))),
        th = sg * dl,
        rc = rWake(Math.min(x, neck));
      return [
        Math.cos(th) * Ux - Math.sin(th) * Uy,
        Math.sin(th) * Ux + Math.cos(th) * Uy - (Uy * rc * rc) / Math.max(ay * ay, rc * rc),
      ];
    },
  };
}

/**
 * Traces streamlines across a region of the body's axes, and finds where the flow along the body is laminar,
 * turbulent and separated.
 * @param {{x:number, r:number}[]} P outline from the tip (x along the body, r its radius), m
 * @param {object} A aerodynamic model (segs, fins, R, L)
 * @param {{M:number, aoa:number, V:number, nu:number, shock?:number, box:{x0:number, x1:number, y0:number, y1:number}, n?:number}} o
 *   Mach number, angle of attack (degrees), speed (m/s), kinematic viscosity (m²/s), nose shock half-angle (rad), the
 *   region to cover in body axes (m) and how many streamlines
 * @returns {object} lines (each a list of [x, y, speed]), the boundary layer, the separated regions and the attachment
 *   points, all in body axes
 */
export function flowScene(P, A, o) {
  const al = (o.aoa * Math.PI) / 180,
    F = field(P, o.M, al, o.shock),
    L = F.L,
    R = A.R,
    box = o.box,
    n = o.n || 26,
    dir = [Math.cos(al), Math.sin(al)],
    nrm = [-dir[1], dir[0]],
    inside = (x, y) => x > P[0].x && x < L && Math.abs(y) < rOf(P, x);
  // seed a line of starting points upstream, across the flow: closer together near the body, where the flow bends most
  const cx = (box.x0 + box.x1) / 2,
    cy = (box.y0 + box.y1) / 2,
    diag = Math.hypot(box.x1 - box.x0, box.y1 - box.y0),
    h = Math.max(L, diag) / 260,
    tb = (L / 2 - cx) * nrm[0] - cy * nrm[1],
    lines = [];
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n - 0.5,
      t = tb + Math.sign(u) * Math.abs(2 * u) ** 1.7 * diag * 0.6;
    let x = cx - dir[0] * diag * 0.6 + nrm[0] * t,
      y = cy - dir[1] * diag * 0.6 + nrm[1] * t;
    const pts = [];
    for (let s = 0; s < 4000; s++) {
      const v1 = F.vel(x, y),
        s1 = Math.hypot(v1[0], v1[1]) || 1,
        xm = x + (h / 2) * (v1[0] / s1),
        ym = y + (h / 2) * (v1[1] / s1),
        v2 = F.vel(xm, ym),
        s2 = Math.hypot(v2[0], v2[1]) || 1;
      x += h * (v2[0] / s2);
      y += h * (v2[1] / s2);
      // a streamline that reaches the body slides along it
      if (inside(x, y)) y = (y >= 0 ? 1 : -1) * (rOf(P, x) + h * 0.2);
      if (x > box.x0 - diag * 0.1 && x < box.x1 + diag * 0.1) pts.push([x, y, s2]);
      if (x > box.x1 + diag * 0.1 || y < box.y0 - diag || y > box.y1 + diag) break;
    }
    if (pts.length > 2) lines.push(pts);
  }

  // the boundary layer: laminar (Blasius) to Re_x = 5×10⁵, turbulent (1/7-power law) behind, never thinner
  const x0b = P[0].x,
    Rex = (x) => (o.V * Math.max(x - x0b, 1e-6)) / o.nu,
    xtr = Math.min(L, x0b + (5e5 * o.nu) / Math.max(o.V, 1e-6)),
    dLam = (x) => (5 * (x - x0b)) / Math.sqrt(Rex(x)),
    delta = (x) => (x <= xtr ? dLam(x) : Math.max(dLam(xtr), (0.37 * (x - x0b)) / Rex(x) ** 0.2));

  // separated regions: {x0, x1 (along the body), side (+1 lee, -1 windward, 0 both), kind, h (height), reattach}
  const seps = [],
    reattach = [],
    a = Math.abs(o.aoa),
    lee = o.aoa >= 0 ? 1 : -1,
    segs = A.segs || [];
  segs.forEach((sg, i) => {
    const r1 = sg.r1 ?? rOf(P, sg.x),
      r2 = sg.r2 ?? rOf(P, sg.x + sg.len),
      last = i === segs.length - 1;
    if (sg.kind === "trans" && r2 < r1 && sg.len > 0) {
      const deg = (Math.atan((r1 - r2) / sg.len) * 180) / Math.PI,
        k = smooth01((deg - 8) / 12);
      if (k > 0.03) {
        const xs = sg.x + sg.len * (1 - k),
          x1 = last ? L : sg.x + sg.len + 4 * (r1 - r2) * k;
        seps.push({ x0: xs, x1, side: 0, kind: "boattail", h: (r1 - r2) * Math.max(k, 0.4) });
        if (!last) reattach.push([x1, rOf(P, x1)]);
      }
    }
    const nx = segs[i + 1];
    if (nx) {
      const ra = sg.r2 ?? rOf(P, sg.x + sg.len - 1e-6),
        rbn = nx.r1 ?? rOf(P, nx.x + 1e-6),
        x = nx.x;
      if (ra - rbn > 0.01 * R) {
        const st = ra - rbn,
          x1 = Math.min(L, x + 6 * st);
        seps.push({ x0: x, x1, side: 0, kind: "step", h: st });
        if (x1 < L) reattach.push([x1, rOf(P, x1)]);
      } else if (rbn - ra > 0.01 * R) {
        const st = rbn - ra;
        seps.push({ x0: Math.max(P[0].x, x - 1.5 * st), x1: x, side: 0, kind: "corner", h: st * 0.6 });
      }
    }
  });
  const rb = P[P.length - 1].r;
  if (rb > 0.03 * R) seps.push({ x0: L, x1: L + 2 * rb * (o.M > 1.05 ? 1 : 1.6), side: 0, kind: "wake", h: rb });
  if (a > 5) {
    const s = smooth01((a - 5) / 12),
      x0 = P[0].x + (L - P[0].x) * Math.max(0.08, 1 - (a - 5) / 25);
    seps.push({ x0, x1: L, side: lee, kind: "lee", h: R * (0.4 + 1.2 * s), s });
  }
  const st = smooth01((a - 18) / 17);
  if (st > 0)
    for (const f of A.fins || [])
      seps.push({
        x0: f.xLead,
        x1: f.xLead + f.a * (1 + st),
        side: lee,
        kind: "stall",
        h: f.s * (0.35 + 0.65 * st),
        s: st,
      });

  // streamlines are left out inside separated air (the eddies there are drawn instead)
  const inSep = (x, y) =>
    seps.some((q) => {
      if (x < q.x0 || x > q.x1 || (q.side && Math.sign(y || 1) !== q.side)) return false;
      const u = (x - q.x0) / Math.max(q.x1 - q.x0, 1e-9),
        ay = Math.abs(y);
      if (q.kind === "wake") return ay < q.h * (1 - 0.6 * u);
      const r = rOf(P, Math.min(x, L)),
        top = r + q.h * (q.kind === "lee" || q.kind === "stall" ? 0.4 + 0.6 * u : 1);
      return ay < top;
    });
  const kept = [];
  for (const ln of lines) {
    let cur = [];
    for (const p of ln) {
      if (inSep(p[0], p[1])) {
        if (cur.length > 2) kept.push(cur);
        cur = [];
      } else cur.push(p);
    }
    if (cur.length > 2) kept.push(cur);
  }

  // where the flow divides on the nose: the tip, or on a rounded tip a little round to the windward side
  const tipR = (segs[0] && segs[0].tip) || 0,
    ta = Math.min((a * Math.PI) / 180, 1.2),
    stag = [P[0].x + tipR * (1 - Math.cos(ta)), -lee * tipR * Math.sin(ta)];

  return { lines: kept, xtr, delta, seps, reattach, stag, L, rOf: (x) => rOf(P, x) };
}
