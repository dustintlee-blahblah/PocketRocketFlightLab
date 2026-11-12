/**
 * The Rocket tab's side view: the rocket drawn to scale with its CG and CP, tapping a part to select it, and the
 * figures under the drawing (size, weights, CG, CP, and the stability lines behind Show details).
 */
import { BLD, bldFind, bldRender, bldSel, setBldSel } from "./builder-ui.js";
import { BLD_BUTTONS, bldLayout, bldLen, bldMountR, bldPts } from "./model.js";
import { esc } from "../core/helpers.js";
import { D } from "../design/defaults.js";
import { flightBoost, flightFirst, flightMotor } from "../motors/clusters.js";
import { stability } from "../physics/aerodynamics.js";
import { noseR, noseRTip, noseTip } from "../physics/geometry.js";
import { isThree, stackStability } from "../physics/staging.js";
import { setupCanvas } from "../ui/charts.js";
import { fmt, uname } from "../ui/units.js";
/**
 * Clickable areas of the side view, from the last drawing.
 */
var bldHits = [];
/** whether the stats under the side view are expanded */
let bldStatsOpen = false;
/**
 * Draws the side view of the rocket with its parts, CG and CP, and records the clickable areas.
 */
export function bldDraw() {
  const cv = document.getElementById("bldcv");
  if (!cv || !BLD || !cv.getBoundingClientRect().width) return;
  const { c, W, H } = setupCanvas(cv),
    cs = getComputedStyle(document.documentElement),
    col = (k) => cs.getPropertyValue(k).trim() || "#888";
  c.clearRect(0, 0, W, H);
  bldHits = [];
  const lay = bldLayout(BLD),
    R = lay.maxR;
  let span = 0;
  for (const b of lay.bodies)
    for (const k of b.kids)
      if (k.k.type === "fins")
        span = Math.max(span, k.k.shape === "freeform" ? Math.max(0, ...bldPts(k.k).pts.map((p) => p[1])) : k.k.span);
  // the drawing fits everything: fins swept back past the end of the body (or a fin tip swept forward) included
  let xLo = 0,
    xHi = lay.length;
  for (const b of lay.bodies)
    for (const kk of b.kids) {
      const k = kk.k;
      if (k.type !== "fins") continue;
      let lo = 0,
        hi = k.root || 0;
      if (k.shape === "freeform") {
        const P = bldPts(k).pts;
        if (P.length) {
          const mx = Math.min(...P.map((p) => p[0]));
          hi = Math.max(...P.map((p) => p[0])) - mx;
        }
      } else if (k.shape !== "elliptical") {
        lo = Math.min(0, k.sweep || 0);
        hi = Math.max(k.root || 0, (k.sweep || 0) + (k.tip || 0));
      }
      xLo = Math.min(xLo, kk.x + lo);
      xHi = Math.max(xHi, kk.x + hi);
    }
  // pods and tube fins (kept as the file has them; their shape comes from the design), each stage's from its front
  const lay0 = BLD.stages.map((_, si) => {
    const b = lay.bodies.find((q) => q.si === si);
    return b ? b.x : 0;
  });
  const podSets = [
      [D.pods, 0],
      [D.bPods, 1],
      [D.s1 && D.s1.bPods, 2],
    ].flatMap(([l, si]) => (l || []).map((pd) => ({ pd, dx: lay0[si] || 0 }))),
    tubeSets = [
      [D.tubeFins, 0],
      [D.bTubeFins, 1],
      [D.s1 && D.s1.bTubeFins, 2],
    ].flatMap(([l, si]) => (l || []).map((t) => ({ t, dx: lay0[si] || 0 })));
  let rOut = R + span;
  for (const { pd, dx } of podSets)
    for (const sg of pd.segs) {
      rOut = Math.max(rOut, (pd.rOff || 0) + Math.max(sg.r1, sg.r2));
      xLo = Math.min(xLo, sg.x + dx);
      xHi = Math.max(xHi, sg.x + dx + sg.len);
    }
  for (const { t } of tubeSets) rOut = Math.max(rOut, t.rb + 2 * t.ro);
  const ext = Math.max(xHi - xLo, 0.05);
  const padX = 14,
    sc = Math.min((W - 2 * padX) / ext, (H - 40) / (2 * rOut + 0.002)),
    x0 = padX + (W - 2 * padX - ext * sc) / 2 - xLo * sc,
    yc = (H - 22) / 2 + 2;
  const X = (x) => x0 + x * sc,
    Y = (r) => yc - r * sc,
    Yb = (r) => yc + r * sc;
  const ink = col("--ink"),
    acc = col("--accent"),
    mut = col("--muted"),
    fld = col("--field");
  // a nose cone's rounded tip, if it has one
  const tipOf = (b) =>
    b.p.type === "nose" && +b.p.tipR > 0 ? noseTip(b.p.shape, b.p.param, b.r2, b.len, Math.min(+b.p.tipR, b.r2)) : null;
  const rAt = (b, x) => {
    const t = Math.min(Math.max(x - b.x, 0), b.len);
    if (b.p.type === "tube") return b.r1;
    if (b.p.type === "nose") return noseRTip(b.p.shape, b.p.param, t, b.r2, b.len, tipOf(b));
    return b.r2 >= b.r1
      ? b.r1 + (b.r2 - b.r1) * noseR(b.p.shape, b.p.param, t, 1, b.len)
      : b.r2 + (b.r1 - b.r2) * noseR(b.p.shape, b.p.param, b.len - t, 1, b.len);
  };
  const bodyAt = (x) =>
    lay.bodies.find((b) => x >= b.x - 1e-9 && x <= b.x + b.len + 1e-9) || lay.bodies[lay.bodies.length - 1];
  // stages: the one being edited is shaded and named, so it's clear which stage a part or setting belongs to
  const stR = BLD.stages.map((_, si) => {
    const bs = lay.bodies.filter((b) => b.si === si);
    return bs.length ? [bs[0].x, bs[bs.length - 1].x + bs[bs.length - 1].len] : null;
  });
  if (BLD.stages.length > 1) {
    const fs = bldSel ? bldFind(bldSel) : null,
      ss = fs && fs.si != null ? fs.si : null;
    BLD.stages.forEach((stg, si) => {
      const r = stR[si];
      if (!r) return;
      const on = si === ss;
      if (on) {
        c.fillStyle = acc + "14";
        c.fillRect(X(r[0]), 2, (r[1] - r[0]) * sc, H - 24);
      }
      c.font = `${on ? 700 : 500} 10px ${cs.getPropertyValue("--f-body") || "sans-serif"}`;
      c.textAlign = "center";
      c.fillStyle = on ? acc : mut;
      c.fillText(stg.name || `Stage ${si + 1}`, X((r[0] + r[1]) / 2), 11);
      c.textAlign = "start";
    });
  }
  // fins first (behind the body); the ones on the near side are drawn after it
  const frontFins = [],
    finSets = [];
  for (const b of lay.bodies)
    for (const kk of b.kids) {
      const k = kk.k;
      if (k.type !== "fins") continue;
      const on = k.id === bldSel;
      const rr = rAt(bodyAt(kk.x + 0.0001), kk.x + 0.0001);
      let pts;
      if (k.shape === "freeform") {
        const P = bldPts(k).pts;
        if (!P.length) continue;
        const mx = Math.min(...P.map((p) => p[0]));
        pts = P.map(([x, y]) => [x - mx, y]);
      } else if (k.shape === "elliptical") {
        pts = [];
        for (let i = 0; i <= 24; i++) {
          const th = (Math.PI * i) / 24;
          pts.push([(k.root / 2) * (1 - Math.cos(th)), k.span * Math.sin(th)]);
        }
      } else
        pts = [
          [0, 0],
          [k.sweep, k.span],
          [k.sweep + k.tip, k.span],
          [k.root, 0],
        ];
      // each fin is drawn where it really sits around the body, seen from the side: fins on the near side go in front of the body
      const nF = Math.max(1, k.n || 3),
        rot0 = ((k.rot || 0) * Math.PI) / 180;
      for (let i = 0; i < nF; i++) {
        const ph = rot0 + (2 * Math.PI * i) / nF,
          cs_ = Math.cos(ph),
          sn = Math.sin(ph);
        const draw = () => {
          c.beginPath();
          pts.forEach(([x, y], j) => {
            const px = X(kk.x + x),
              py = Y((rr + y) * cs_);
            j ? c.lineTo(px, py) : c.moveTo(px, py);
          });
          c.closePath();
          c.fillStyle = on ? acc + (sn > 0.01 ? "55" : "33") : fld;
          c.fill();
          c.strokeStyle = on ? acc : ink;
          c.lineWidth = on ? 2 : 1.2;
          c.stroke();
        };
        if (sn > 0.01) frontFins.push(draw);
        else draw();
      }
      finSets.push({ k, on, rr });
      bldHits.push({
        id: k.id,
        x1: X(kk.x),
        x2: X(kk.x + bldLen(k)),
        y1: Y(rr + (k.span || 0.05)),
        y2: Yb(rr + (k.span || 0.05)),
        pri: 2,
      });
    }
  // pods: each copy where it sits around the rocket, seen from the side; tube fins likewise
  const segR = (sg, x) => {
    const t = Math.min(Math.max(x - sg.x, 0), sg.len);
    if (sg.kind === "tube") return sg.r1;
    if (sg.kind === "nose") return noseR(sg.shape, sg.param, t, sg.r2, sg.len);
    return sg.r2 >= sg.r1
      ? sg.r1 + (sg.r2 - sg.r1) * noseR(sg.shape, sg.param, t, 1, sg.len)
      : sg.r2 + (sg.r1 - sg.r2) * noseR(sg.shape, sg.param, sg.len - t, 1, sg.len);
  };
  for (const { pd, dx } of podSets) {
    if (!pd.segs.length) continue;
    const on = pd.id && pd.id === bldSel,
      n = Math.max(1, pd.n || 1);
    for (let i = 0; i < n; i++) {
      const ph = (pd.ang || 0) + (2 * Math.PI * i) / n,
        yo = (pd.rOff || 0) * Math.cos(ph);
      const draw = () => {
        for (const sg of pd.segs) {
          const N = sg.kind === "tube" ? 2 : 24;
          c.beginPath();
          for (let j = 0; j <= N; j++) {
            const x = sg.x + (sg.len * j) / N;
            j ? c.lineTo(X(x + dx), Y(yo + segR(sg, x))) : c.moveTo(X(x + dx), Y(yo + segR(sg, x)));
          }
          for (let j = N; j >= 0; j--) {
            const x = sg.x + (sg.len * j) / N;
            c.lineTo(X(x + dx), Y(yo - segR(sg, x)));
          }
          c.closePath();
          c.fillStyle = on ? acc + "33" : col("--panel");
          c.fill();
          c.strokeStyle = on ? acc : ink;
          c.lineWidth = on ? 2 : 1.2;
          c.stroke();
        }
      };
      if (Math.sin(ph) > 0.01) frontFins.push(draw);
      else draw();
    }
    if (pd.id) {
      const x1 = Math.min(...pd.segs.map((sg) => sg.x)) + dx,
        x2 = Math.max(...pd.segs.map((sg) => sg.x + sg.len)) + dx,
        pr = Math.max(...pd.segs.map((sg) => Math.max(sg.r1, sg.r2))),
        reach = (pd.rOff || 0) + pr;
      bldHits.push({ id: pd.id, x1: X(x1), x2: X(x2), y1: Y(reach), y2: Yb(reach), pri: 2 });
    }
  }
  for (const { t, dx } of tubeSets) {
    const on = t.id && t.id === bldSel,
      n = Math.max(1, t.n || 1);
    for (let i = 0; i < n; i++) {
      const ph = (t.rot || 0) + (2 * Math.PI * i) / n,
        yo = (t.rb + t.ro) * Math.cos(ph);
      const draw = () => {
        c.fillStyle = on ? acc + "33" : fld;
        c.fillRect(X(t.x + dx), Y(yo + t.ro), t.len * sc, 2 * t.ro * sc);
        c.strokeStyle = on ? acc : ink;
        c.lineWidth = on ? 2 : 1.2;
        c.strokeRect(X(t.x + dx), Y(yo + t.ro), t.len * sc, 2 * t.ro * sc);
      };
      if (Math.sin(ph) > 0.01) frontFins.push(draw);
      else draw();
    }
    if (t.id)
      bldHits.push({
        id: t.id,
        x1: X(t.x + dx),
        x2: X(t.x + dx + t.len),
        y1: Y(t.rb + 2 * t.ro),
        y2: Yb(t.rb + 2 * t.ro),
        pri: 2,
      });
  }
  // body outline
  for (const b of lay.bodies) {
    const on = b.p.id === bldSel,
      N = b.p.type === "tube" ? 2 : 40,
      s0 = tipOf(b)?.xs || 0,
      // points closer together toward a nose's tip, where it curves most
      xAt = (i) => b.x + s0 + (b.len - s0) * (b.p.type === "nose" ? (i / N) ** 2 : i / N);
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = xAt(i);
      const px = X(x),
        py = Y(rAt(b, x));
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    for (let i = N; i >= 0; i--) {
      const x = xAt(i);
      c.lineTo(X(x), Yb(rAt(b, x)));
    }
    c.closePath();
    c.fillStyle = on ? acc + "22" : col("--panel");
    c.fill();
    c.strokeStyle = on ? acc : ink;
    c.lineWidth = on ? 2 : 1.4;
    c.stroke();
    bldHits.push({
      id: b.p.id,
      x1: X(b.x),
      x2: X(b.x + b.len),
      y1: Y(Math.max(b.r1, b.r2)),
      y2: Yb(Math.max(b.r1, b.r2)),
      pri: 1,
    });
    if (b.p.type === "nose" && b.p.shLen > 0) {
      c.setLineDash([3, 3]);
      c.strokeStyle = mut;
      c.lineWidth = 1;
      const sr = b.p.shR > 0 ? b.p.shR : b.r2 - b.p.wall;
      c.strokeRect(X(b.x + b.len), Y(sr), b.p.shLen * sc, 2 * sr * sc);
      c.setLineDash([]);
    }
    if (b.p.mm && b.p.mm.motor) {
      const m = b.p.mm.motor,
        ml = m.len || 0.1;
      c.fillStyle = "rgba(120,120,120,.25)";
      c.fillRect(X(b.x + b.len + (b.p.mm.overhang || 0) - ml), Y(m.dia / 2), ml * sc, m.dia * sc);
    }
  }
  // a small view from behind shows how many fins there are and where they sit
  {
    const fsel = finSets.find((f) => f.on) || finSets[0];
    if (fsel) {
      const k = fsel.k,
        nF = Math.max(1, k.n || 3),
        rot0 = ((k.rot || 0) * Math.PI) / 180,
        rf = 15,
        rb = 6,
        cx = 6 + rf,
        cy = H - 6 - rf;
      c.fillStyle = col("--panel");
      c.strokeStyle = fsel.on ? acc : ink;
      c.lineWidth = 1.2;
      c.lineWidth = 2.4;
      for (let i = 0; i < nF; i++) {
        const ph = rot0 + (2 * Math.PI * i) / nF;
        c.beginPath();
        c.moveTo(cx + rb * Math.sin(ph), cy - rb * Math.cos(ph));
        c.lineTo(cx + rf * Math.sin(ph), cy - rf * Math.cos(ph));
        c.stroke();
      }
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(cx, cy, rb, 0, 2 * Math.PI);
      c.fill();
      c.stroke();
      c.font = `500 9px ${cs.getPropertyValue("--f-body") || "sans-serif"}`;
      c.textAlign = "start";
      c.fillStyle = mut;
      c.fillText(`${nF} fin${nF === 1 ? "" : "s"} · aft view`, cx + rf + 5, cy + 3);
      c.textAlign = "start";
    }
  }
  // stage joint
  for (let si = 1; si < BLD.stages.length; si++) {
    const j = lay.bodies.find((b) => b.si === si);
    if (j) {
      c.setLineDash([2, 3]);
      c.strokeStyle = mut;
      c.beginPath();
      c.moveTo(X(j.x), Y(R + span * 0.3));
      c.lineTo(X(j.x), Yb(R + span * 0.3));
      c.stroke();
      c.setLineDash([]);
    }
  }
  // inside and outside parts
  for (const b of lay.bodies)
    for (const kk of b.kids) {
      const k = kk.k,
        on = k.id === bldSel;
      if (k.type === "fins") continue;
      const x1 = X(kk.x),
        x2 = X(kk.x + Math.max(kk.len, 0.002)),
        rr = rAt(b, Math.min(Math.max(kk.x, b.x), b.x + b.len)),
        ri = Math.max(rr - (b.p.wall || 0), 0.001);
      c.strokeStyle = on ? acc : mut;
      c.fillStyle = on ? acc + "44" : mut + "33";
      c.lineWidth = on ? 2 : 1;
      let hit = null;
      switch (k.type) {
        case "mount":
        case "inner": {
          const ro = k.od / 2;
          c.setLineDash([4, 3]);
          c.strokeRect(x1, Y(ro), kk.len * sc, 2 * ro * sc);
          c.setLineDash([]);
          if (k.type === "mount" && k.overhang > 0) {
            c.strokeRect(X(kk.x + kk.len), Y(ro * 0.85), k.overhang * sc, 1.7 * ro * sc);
          }
          if (k.motor) {
            const ml = k.motor.len || 0.1,
              mx = kk.x + kk.len + (k.overhang || 0) - ml;
            c.fillStyle = on ? acc + "55" : "rgba(120,120,120,.25)";
            c.fillRect(X(mx), Y((k.motor.dia || k.od * 0.9) / 2), ml * sc, (k.motor.dia || k.od * 0.9) * sc);
          }
          hit = [x1, X(kk.x + kk.len), Y(ro), Yb(ro)];
          break;
        }
        case "ring":
        case "bulkhead": {
          const ro = k.od > 0 ? k.od / 2 : ri,
            hole = k.type === "ring" ? (k.id_ > 0 ? k.id_ / 2 : bldMountR(b)) : 0;
          // selected, a thin ring is drawn wider (only on screen) so it stands out; its real thickness doesn't change
          const tw = kk.len * sc,
            w = on ? Math.max(tw, 7) : Math.max(tw, 2),
            xr = on ? x1 + tw / 2 - w / 2 : x1;
          if (on) {
            c.fillStyle = acc + "cc";
            c.lineWidth = 1.5;
          }
          c.fillRect(xr, Y(ro), w, (ro - hole) * sc);
          c.fillRect(xr, Yb(hole), w, (ro - hole) * sc);
          if (on) {
            c.strokeRect(xr, Y(ro), w, (ro - hole) * sc);
            c.strokeRect(xr, Yb(hole), w, (ro - hole) * sc);
          }
          hit = [x1 - 3, x2 + 3, Y(ro), Yb(ro)];
          break;
        }
        case "coupler": {
          const ro = k.od > 0 ? k.od / 2 : ri;
          c.setLineDash([2, 3]);
          c.strokeRect(x1, Y(ro), kk.len * sc, 2 * ro * sc);
          c.setLineDash([]);
          hit = [x1, x2, Y(ro), Yb(ro)];
          break;
        }
        case "lug": {
          c.fillRect(x1, Y(rr + k.od), kk.len * sc, k.od * sc);
          hit = [x1, x2, Y(rr + k.od) - 4, Y(rr) + 2];
          break;
        }
        case "buttons": {
          const P = k.size === "custom" && k.dims ? k.dims : BLD_BUTTONS[k.size] || BLD_BUTTONS["1010"];
          for (let i = 0; i < k.n; i++) {
            const bx = X(kk.x + i * k.sep);
            c.fillRect(bx - (P.od * sc) / 2, Yb(rr), Math.max(P.od * sc, 3), Math.max(P.h * sc, 3));
          }
          hit = [x1 - 4, X(kk.x + (k.n - 1) * k.sep) + 4, Yb(rr) - 2, Yb(rr + P.h) + 4];
          break;
        }
        case "chute":
        case "streamer": {
          const pr = ri * 0.8;
          c.beginPath();
          c.ellipse((x1 + x2) / 2, yc, Math.max((x2 - x1) / 2, 3), pr * sc, 0, 0, 2 * Math.PI);
          c.fill();
          c.stroke();
          hit = [x1, x2, Y(pr), Yb(pr)];
          break;
        }
        case "cord": {
          const pr = ri * 0.5;
          c.beginPath();
          for (let i = 0; i <= 12; i++) {
            const px = x1 + ((x2 - x1) * i) / 12;
            c.lineTo(px, yc + (i % 2 ? -1 : 1) * pr * sc);
          }
          c.stroke();
          hit = [x1, x2, Y(pr), Yb(pr)];
          break;
        }
        case "bump": {
          if (k.shape === "ramp") {
            // the front face climbs at about 30° (or over half the length, if shorter), the back end is square
            const L = Math.max(kk.len * sc, 3),
              rise = Math.min(k.h * sc * Math.sqrt(3), L / 2);
            c.beginPath();
            c.moveTo(x1, Y(rr));
            c.lineTo(x1 + rise, Y(rr + k.h));
            c.lineTo(x1 + L, Y(rr + k.h));
            c.lineTo(x1 + L, Y(rr));
            c.closePath();
            c.fill();
          } else c.fillRect(x1, Y(rr + k.h), Math.max(kk.len * sc, 3), Math.max(k.h * sc, 2));
          hit = [x1, x2, Y(rr + k.h) - 4, Y(rr) + 2];
          break;
        }
        case "mass": {
          const pr = ri * 0.5;
          c.fillRect(x1, Y(pr), Math.max(kk.len * sc, 4), 2 * pr * sc);
          hit = [x1, x2, Y(pr), Yb(pr)];
          break;
        }
        case "raw": {
          // pods and tube fins are drawn with the body, from the design
          if (["podset", "parallelstage", "tubefinset"].includes(k.tag)) break;
          const pr = ri * 0.6;
          c.setLineDash([1, 3]);
          c.strokeRect(x1, Y(pr), Math.max(kk.len * sc, 4), 2 * pr * sc);
          c.setLineDash([]);
          hit = [x1, Math.max(x2, x1 + 6), Y(pr), Yb(pr)];
          break;
        }
      }
      if (hit) bldHits.push({ id: k.id, x1: hit[0], x2: hit[1], y1: hit[2], y2: hit[3], pri: 3 });
    }
  // fins on the near side cover the body and what is inside it, a little see-through
  c.save();
  c.globalAlpha = 0.85;
  frontFins.forEach((f) => f());
  c.restore();
  // CG with the motor in, and CP: the same numbers the flight uses
  const st = document.getElementById("bldstats");
  try {
    const two = !!D.twoStage,
      m = flightMotor(),
      mb = two ? flightBoost() : null,
      SU = stability(D, m),
      S = two ? stackStability(D, m, mb) : SU;
    const m1 = isThree(D) ? flightFirst() : null,
      dry = (two ? D.dryMass + D.bDryMass : D.dryMass) + (m1 ? D.s1.bDryMass : 0),
      lift = dry + (m ? m.totalMass : 0) + (two && mb ? mb.totalMass : 0) + (m1 ? m1.totalMass : 0);
    const mark = (x, kind) => {
      const px = X(x),
        py = yc + (R + span) * sc + 12;
      c.lineWidth = 1.5;
      if (kind === "cg") {
        c.strokeStyle = col("--cg");
        c.fillStyle = col("--cg");
        c.beginPath();
        c.arc(px, py, 6, 0, 2 * Math.PI);
        c.stroke();
        c.beginPath();
        c.moveTo(px, py);
        c.arc(px, py, 6, -Math.PI / 2, 0);
        c.closePath();
        c.fill();
        c.beginPath();
        c.moveTo(px, py);
        c.arc(px, py, 6, Math.PI / 2, Math.PI);
        c.closePath();
        c.fill();
      } else {
        c.strokeStyle = col("--bad");
        c.fillStyle = col("--bad");
        c.beginPath();
        c.arc(px, py, 6, 0, 2 * Math.PI);
        c.stroke();
        c.beginPath();
        c.arc(px, py, 2.2, 0, 2 * Math.PI);
        c.fill();
      }
    };
    mark(S.cgL, "cg");
    mark(S.cp, "cp");
    const cls = (v) => (v >= 1.5 ? "good" : v >= 1 ? "warn" : "bad"),
      mname =
        (m1 ? `${m1.cn || m1.name} → ` : "") + (two && mb ? `${mb.cn || mb.name} → ${m.cn || m.name}` : m.cn || m.name);
    // collapsed: size, weights, CG and CP; tapping the panel shows the stability lines below them
    const worst = Math.min(S.marginL, S.marginL10);
    st.innerHTML =
      `<span>Length <b>${fmt(lay.length, "len", 1)} ${uname("len")}</b></span><span>Diameter <b>${fmt(2 * lay.maxR, "len")} ${uname("len")}</b></span>` +
      `<span>Weight <b>${fmt(dry, "mass")} ${uname("mass")}</b> empty, <b>${fmt(lift, "mass")} ${uname("mass")}</b> on ${esc(mname)}</span>` +
      `<span><i class="dotcg"></i>CG <b>${fmt(S.cgL, "len", 1)} ${uname("len")}</b> with motor</span><span><i class="dotcp"></i>CP <b>${fmt(S.cp, "len", 1)} ${uname("len")}</b></span>` +
      `<span class="bldsum${worst < 1 ? " bad" : ""}">${worst < 1 ? "Stability under 1 cal · " : ""}<em>Show details ▾</em></span>` +
      `<span class="bldmore ${cls(S.marginL)}">Stability <b>${S.marginL.toFixed(2)} cal</b> at liftoff (${S.pctL.toFixed(0)}% of length; uncertainty margin ${(S.marginL - S.unc).toFixed(1)}–${(S.marginL + S.unc).toFixed(1)}), <b>${S.marginB.toFixed(2)}</b> at burnout${two ? ` · sustainer alone ${SU.marginL.toFixed(2)}` : ""}</span>` +
      `<span class="bldmore ${cls(S.marginL10)}">Tilted into the airflow (liftoff): <b>${S.marginL5.toFixed(2)}</b> at 5°, <b>${S.marginL10.toFixed(2)} cal</b> at 10°</span>`;
  } catch (e) {
    st.innerHTML = `<span class="bldsum bad">${esc(e.message || String(e))}</span>`;
  }
}
/**
 * Selects the part tapped on in the side view.
 * @param {MouseEvent} ev
 */
export function bldPick(ev) {
  const cv = document.getElementById("bldcv"),
    rc = cv.getBoundingClientRect(),
    x = ev.clientX - rc.left,
    y = ev.clientY - rc.top;
  const hit = bldHits
    .filter(
      (h) =>
        x >= Math.min(h.x1, h.x2) - 2 &&
        x <= Math.max(h.x1, h.x2) + 2 &&
        y >= Math.min(h.y1, h.y2) - 2 &&
        y <= Math.max(h.y1, h.y2) + 2,
    )
    .sort((a, b) => b.pri - a.pri)[0];
  if (hit) {
    setBldSel(hit.id);
    bldRender();
    document.getElementById("bldedit").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
/** Shows or hides the full stats under the side view. */
export function bldStatsToggle() {
  bldStatsOpen = !bldStatsOpen;
  const st = document.getElementById("bldstats");
  st.classList.toggle("open", bldStatsOpen);
  st.setAttribute("aria-expanded", String(bldStatsOpen));
}
