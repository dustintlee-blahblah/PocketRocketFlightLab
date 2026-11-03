/* ---------- ejection charge: black powder for a recovery compartment ----------
   Ideal gas: m = P·V / (R·T), with R = 22.16 ft·lbf/(lbm·°R) = 265.9 in·lbf/(lbm·°R) and T = 3307 °R for black powder's
   combustion gas (the figures most rocketry ejection calculators use; 15 psi in a 1 in² × 1 in volume ≈ 0.0061 g).
   Shear pins: their combined strength over the bulkhead area is added to the separation pressure. Substitutes: Pyrodex
   loads 1:1 with black powder by volume and weighs about 77% as much for that volume; Triple Seven loads at 85% of the
   black powder volume (the makers' loading guidance), about 65% of the black powder weight. */
const BP_PIN = { "2-56": 35, "4-40": 50 }; // approximate shear strength of one nylon pin, lbf
// each design's own charge settings (per bay: pressure, pins, what fires it; where bays divide) live with the design, and
// are saved inside its .ork file. Settings from before this lived on the device; the open design takes them over once.
// RockSim's EjectionDelay field: 0 or more is the delay in seconds (0 fires at burnout); negative (-1 plugged, -2) is no charge
const rktEj = (v) => (v == null || !isFinite(+v) || +v < 0 ? null : +v);
const BP_ORK = "pocketrocket/ejection-charges.json",
  FIN_ORK = "pocketrocket/fin-edges.json";
function bpDesign() {
  if (typeof BLD === "undefined" || !BLD) return { comps: {}, splits: {} };
  if (!BLD.bp) {
    BLD.bp = { comps: {}, splits: {} };
    const g = store.get("rfs-bp", {});
    if (g.comps || g.splits) {
      BLD.bp.comps = g.comps || {};
      BLD.bp.splits = g.splits || {};
      delete g.comps;
      delete g.splits;
      store.set("rfs-bp", g);
    }
  }
  BLD.bp.comps = BLD.bp.comps || {};
  BLD.bp.splits = BLD.bp.splits || {};
  return BLD.bp;
}
function bpDesignSave() {
  try {
    bldSave();
  } catch (e) {}
}
const BP = {
  get() {
    return Object.assign({ d: null, l: 12 * IN, p: 15 * 6894.757, n: 0, pin: "2-56" }, store.get("rfs-bp", {}));
  },
  set(v) {
    store.set("rfs-bp", v);
  },
};
function bpCalc(v) {
  const din = v.d / IN,
    lin = v.l / IN,
    A = (Math.PI / 4) * din * din,
    V = A * lin,
    pPin = v.n > 0 && A > 0 ? (v.n * BP_PIN[v.pin]) / A : 0,
    pSep = v.p / 6894.757,
    P = pSep + pPin;
  const lbm = (P * V) / (265.92 * 3307),
    g = lbm * 453.592;
  return { A, V, pSep, pPin, P, g, force: P * A };
}
// the inside diameter of the rocket's aft-most body tube (from the builder's parts), with a key that changes when that tube does
function bpAftTube() {
  try {
    if (typeof BLD === "undefined" || !BLD) return null;
    const tubes = bldLayout(BLD).bodies.filter((b) => b.p.type === "tube" && b.p.od > 0);
    if (!tubes.length) return null;
    const t = tubes[tubes.length - 1].p,
      id = t.od - 2 * (t.wall || 0);
    return id > 0 ? { id, name: t.name || "Body tube", key: `${t.id}|${t.od}|${t.wall}` } : null;
  } catch (e) {
    return null;
  }
}
/* the recovery compartments of the sustainer (or the only stage), from the builder's parts. Bulkheads are the walls: they
   are what stops the gas. A coupler without a bulkhead is only a sleeve joining two tubes, so the gas passes through it.
   The inside runs from the nose cone's base to the forward-most centering ring in the aft tube (or the front of the motor
   mount); nothing behind that counts. Each space between walls is a compartment: the nose cone's shoulder (or a coupler
   in the nose reaching back into the tube) is taken out of the one it reaches into. A sealed space with no parachute or
   streamer in it, closed by bulkheads at both ends, gets no charge: inside a coupler it's an electronics bay. */
function bpCompartments() {
  try {
    if (typeof BLD === "undefined" || !BLD) return [];
    const bodies = bldLayout(BLD).bodies.filter((b) => b.si === 0),
      tubes = bodies.filter((b) => b.p.type === "tube" && b.p.od > 0);
    if (!tubes.length) return [];
    const nose = bodies.find((b) => b.p.type === "nose"),
      kids = bodies.flatMap((b) => b.kids.map((kk) => ({ ...kk, b })));
    const last = tubes[tubes.length - 1],
      S = tubes[0].x;
    // the aft end: the forward-most centering ring in the aft tube, else the front of its motor mount, else the tube's end
    let E = last.x + last.len,
      endBy = null,
      mountK = null;
    // only the rings around the motor mount count as its centering rings: a ring well ahead of the mount is something else,
    // and a long one (some designs draw the electronics bay's coupler as a "ring") is treated as a coupler.
    const mounts = kids.filter((kk) => kk.k.type === "mount" && kk.x > S + 0.01);
    mountK = mounts.reduce((a, b) => (!a || b.x < a.x ? b : a), null);
    const motorRing = (kk) => kk.k.type === "ring" && (!mountK || kk.x >= mountK.x - 0.5 * IN),
      longRing = (kk) =>
        kk.k.type === "ring" && !motorRing(kk) && (kk.len >= 1 * IN || /coupler/i.test(kk.k.name || ""));
    {
      const rings = kids.filter((kk) => mountK && motorRing(kk) && kk.x > S + 0.01);
      const stop = (rings.length ? rings : mounts.filter((kk) => kk.x > S + 0.01)).reduce(
        (a, b) => (!a || b.x < a.x ? b : a),
        null,
      );
      if (stop && stop.x < E) {
        E = stop.x;
        endBy = stop.k.type;
      }
    }
    // inside radius at a point along the body (tubes can change size)
    const riAt = (x) => {
      const t = tubes.find((t) => x >= t.x - 1e-6 && x <= t.x + t.len + 1e-6);
      return t ? t.ri : tubes[0].ri;
    };
    const volBetween = (a, b) => {
      let V = 0;
      const N = Math.max(4, Math.ceil((b - a) / 0.005));
      for (let k = 0; k < N; k++) {
        const x = a + ((k + 0.5) * (b - a)) / N,
          r = riAt(x);
        V += (Math.PI * r * r * (b - a)) / N;
      }
      return V;
    };
    // walls: every bulkhead inside the span, in order
    const walls = kids
      .filter(
        (kk) =>
          (kk.k.type === "bulkhead" ||
            (kk.k.type === "ring" && !motorRing(kk) && !longRing(kk) && /bulkhead/i.test(kk.k.name || ""))) &&
          kk.x + kk.len > S + 1e-4 &&
          kk.x < E - 1e-4,
      )
      .map((kk) => ({ a: kk.x, b: kk.x + Math.max(kk.len, 0), name: kk.k.name || "Bulkhead" }))
      .sort((p, q) => p.a - q.a);
    // things that take up the forward end: the nose shoulder, or a coupler inside the nose reaching back into the tube
    const intr = [];
    if (nose) {
      const nb = nose.x + nose.len;
      if (nose.p.shLen > 0) intr.push({ a: nb, b: nb + nose.p.shLen, r: nose.p.shR > 0 ? nose.p.shR : null });
      for (const kk of nose.kids)
        if (kk.k.type === "coupler" && kk.x + kk.len > nb)
          intr.push({ a: Math.max(kk.x, nb), b: kk.x + kk.len, r: kk.k.od > 0 ? kk.k.od / 2 : null });
    }
    const couplers = kids.filter((kk) => (kk.k.type === "coupler" || longRing(kk)) && kk.b !== nose);
    const segs = [];
    let x = S,
      leftWall = null;
    for (const w of [...walls, { a: E, b: E, end: true }]) {
      if (w.a > x + 0.003) segs.push({ x0: x, x1: w.a, left: leftWall, right: w.end ? null : w });
      x = Math.max(x, w.b);
      leftWall = w.end ? null : w;
    }
    // most designs don't draw the electronics bay's bulkheads. When two parachutes or streamers share a space, whatever sits
    // between them is where the rocket comes apart: a coupler there is the electronics bay (sealed, so each side gets its own
    // charge); with no coupler, the joint between two tubes. With neither (one tube, as with a chute release), they share a charge.
    // a parachute drawn ahead of the first tube (in the nose cone) packs into the forward end; one drawn behind the aft end, into the aft end
    const ord = (k) =>
      k.deploy === "altitude"
        ? 2 + Math.max(0, 1e4 - (k.alt || 0)) / 1e6
        : k.deploy === "apogee"
          ? 1 + (k.delay || 0) / 1e3
          : 0;
    const recov = kids
      .filter((kk) => kk.k.type === "chute" || kk.k.type === "streamer")
      .map((kk) => ({
        c: Math.min(Math.max(kk.x + kk.len / 2, S + 1e-4), E - 1e-4),
        o: ord(kk.k),
        name: kk.k.name || BLD_NAMES[kk.k.type],
      }))
      .sort((p, q) => p.c - q.c);
    const splits = bpDesign().splits,
      did = (tubes[0].p.id || "") + "";
    const joints = tubes.slice(1).map((t) => t.x);
    for (let gi = 0; gi < segs.length; gi++) {
      const g = segs[gi],
        cs = recov.filter((r) => r.c >= g.x0 && r.c <= g.x1).map((r) => r.c);
      let cut = null;
      for (let k = 0; k + 1 < cs.length && !cut; k++) {
        const a = cs[k],
          b = cs[k + 1];
        const cp = couplers
          .filter((kk) => kk.x >= a && kk.x + kk.len <= b)
          .sort((p, q) => Math.abs(p.x + p.len / 2 - (a + b) / 2) - Math.abs(q.x + q.len / 2 - (a + b) / 2))[0];
        if (cp) cut = { a: cp.x, b: cp.x + cp.len, bay: true, name: cp.k.name };
        else {
          const j = joints
            .filter((j) => j > a && j < b)
            .sort((p, q) => Math.abs(p - (a + b) / 2) - Math.abs(q - (a + b) / 2))[0];
          if (j != null) cut = { a: j, b: j };
        }
      }
      if (!cut) continue;
      const wA = { a: cut.a, b: cut.a, name: cut.bay ? "electronics bay" : "tube joint" },
        wB = { a: cut.b, b: cut.b, name: cut.bay ? "electronics bay" : "tube joint" };
      const parts = [{ x0: g.x0, x1: cut.a, left: g.left, right: wA }];
      if (cut.bay)
        parts.push({
          x0: cut.a,
          x1: cut.b,
          left: { a: cut.a, b: cut.a, name: "bulkhead" },
          right: { a: cut.b, b: cut.b, name: "bulkhead" },
          implied: true,
        });
      parts.push({ x0: cut.b, x1: g.x1, left: wB, right: g.right });
      segs.splice(gi, 1, ...parts);
      gi--;
    }
    // still two that open at different times in one space, with nothing between them in the design (a single tube drawn
    // for the whole airframe): the rocket must come apart between them, so divide the space there. The first to open (the
    // drogue, at apogee) goes aft and the later one (the main) forward, the usual dual deploy. Where the divide is can be set.
    for (let gi = 0; gi < segs.length; gi++) {
      const g = segs[gi],
        rs = recov.filter((r) => r.c >= g.x0 && r.c <= g.x1);
      if (rs.length < 2 || g.split) continue;
      const o0 = Math.min(...rs.map((r) => r.o));
      if (rs.every((r) => r.o === o0)) continue;
      const key = `${did}|${Math.round(g.x0 * 1000)}`;
      if (splits[key] === -1) {
        g.shared = { key };
        continue;
      }
      const first = rs.filter((r) => r.o === o0),
        later = rs.filter((r) => r.o !== o0);
      const fa = Math.max(...later.map((r) => r.c)),
        fb = Math.min(...first.map((r) => r.c));
      let xs = splits[key] > 0 ? splits[key] : fb - fa > 1 * IN ? (fa + fb) / 2 : (g.x0 + g.x1) / 2;
      xs = Math.min(Math.max(xs, g.x0 + 0.02), g.x1 - 0.02);
      const w = { a: xs, b: xs, name: "bay divide" },
        sp = { key, x: xs, set: splits[key] > 0, lo: g.x0 + 0.02, hi: g.x1 - 0.02 };
      later.forEach((r) => (r.c = (g.x0 + xs) / 2));
      first.forEach((r) => (r.c = (xs + g.x1) / 2));
      segs.splice(
        gi,
        1,
        { x0: g.x0, x1: xs, left: g.left, right: w, split: sp },
        { x0: xs, x1: g.x1, left: w, right: g.right, split: sp },
      );
      gi++;
    }
    const out = [];
    for (const g of segs) {
      let V = volBetween(g.x0, g.x1),
        shV = 0;
      for (const s0 of intr) {
        const a = Math.max(s0.a, g.x0),
          b = Math.min(s0.b, g.x1);
        if (b > a) {
          const r = Math.min(s0.r ?? riAt(a), riAt(a));
          shV += Math.PI * r * r * (b - a);
        }
      }
      V = Math.max(V - shV, 0);
      if (V < 0.5 * IN ** 3) continue;
      const mid = (g.x0 + g.x1) / 2,
        t = tubes.find((t) => mid >= t.x && mid <= t.x + t.len) || tubes[0];
      const holds = [];
      const inCoupler = !!g.implied || couplers.some((kk) => kk.x <= g.x0 + 0.003 && kk.x + kk.len >= g.x1 - 0.003);
      const sealed = !!(g.left && g.right),
        aft = Math.abs(g.x1 - E) < 1e-6,
        implied = !!g.implied;
      const kind0 = sealed && inCoupler ? "ebay" : sealed ? "sealed" : "empty";
      const span = [
        ...new Set(
          tubes
            .filter((tb) => tb.x < g.x1 - 0.003 && tb.x + tb.len > g.x0 + 0.003)
            .map((tb) => tb.p.name || "Body tube"),
        ),
      ];
      out.push({
        implied,
        split: g.split || null,
        shared: g.shared || null,
        x0: g.x0,
        x1: g.x1,
        len: g.x1 - g.x0,
        d: 2 * riAt(mid),
        V,
        shV,
        holds,
        kind0,
        aft,
        endBy: aft ? endBy : null,
        from: g.left ? g.left.name : null,
        to: g.right ? g.right.name : null,
        tubes: span,
        tube: t.p.name || "Body tube",
        mount:
          aft && mountK
            ? { x: mountK.x, len: mountK.len, ri: Math.max((mountK.k.od || 0) / 2 - (mountK.k.wall || 0), 0) }
            : null,
      });
    }
    // each parachute or streamer goes in the space it sits in; one drawn where no space is kept (in the nose cone, or in a
    // shoulder) goes in the nearest open space, not a sealed one if there's a choice
    for (const r of recov) {
      let c = out.find((c) => r.c >= c.x0 && r.c <= c.x1);
      if (!c) {
        const dist = (c) => (r.c < c.x0 ? c.x0 - r.c : r.c - c.x1),
          open = out.filter((c) => c.kind0 === "empty");
        c = (open.length ? open : out).reduce((a, b) => (!a || dist(b) < dist(a) ? b : a), null);
      }
      if (c) c.holds.push(r.name);
    }
    out.forEach((c) => (c.kind = c.holds.length ? "recovery" : c.kind0));
    // recovery compartments are named in order from the nose
    const rec = out.filter((c) => c.kind === "recovery");
    rec.forEach((c, k) => {
      c.name =
        rec.length === 1
          ? "Recovery bay"
          : k === 0
            ? "Forward bay"
            : k === rec.length - 1
              ? "Aft bay"
              : rec.length > 3
                ? `Middle bay ${k}`
                : "Middle bay";
    });
    out.forEach((c, k) => {
      if (!c.name)
        c.name =
          c.kind === "ebay"
            ? "Electronics bay"
            : c.kind === "sealed"
              ? "Sealed space"
              : !c.from && k === 0
                ? "Payload space"
                : c.aft
                  ? "Fin can space"
                  : "Empty space";
      c.key = `${c.kind}|${c.tubes.join("+")}|${c.holds.join("+")}`;
    });
    return out;
  } catch (e) {
    return [];
  }
}
function bpRender() {
  const out = document.getElementById("bpout");
  if (!out) return;
  // nothing is sized until the black powder warning has been acknowledged once
  {
    const ack = !!store.get("rfs-bp-ack", null),
      b = document.getElementById("bpbody");
    if (b) b.classList.toggle("bpgate", !ack);
    document.getElementById("bpack").hidden = ack;
    if (!ack) {
      out.innerHTML = "";
      return;
    }
  }
  const v = BP.get(),
    aft = bpAftTube();
  // follow the design's aft body tube until you type your own diameter; a different aft tube takes over again
  if (aft && (!v.dManual || v.dKey !== aft.key)) {
    if (v.d !== aft.id || v.dKey !== aft.key) {
      v.d = aft.id;
      v.dKey = aft.key;
      v.dManual = false;
      BP.set(v);
    }
  }
  if (!(v.d > 0)) {
    const od = (typeof D !== "undefined" && D.diameter) || 0.054;
    v.d = Math.max(od - 2 * 0.0016, 0.005);
  } // no builder parts: the body's diameter less a typical wall
  {
    const h = document.getElementById("bpdsrc");
    if (h) {
      h.hidden = !aft || (!!v.manual && !v.dManual);
      /* sizing by hand: no note about where the diameter came from */ if (aft)
        h.innerHTML = v.dManual
          ? `Your own value. <button type="button" class="linkbtn" id="bpduse">Use the ${esc(aft.name)} (${fmt(aft.id, "small")} ${uname("small")})</button>`
          : `From the aft-most body tube${/^body tube$/i.test(aft.name) ? "" : `, ${esc(aft.name)}`}.`;
      const b = document.getElementById("bpduse");
      if (b)
        b.onclick = () => {
          const w = BP.get();
          w.dManual = false;
          w.dKey = null;
          BP.set(w);
          bpRender();
        };
    }
  }
  const lenU = units === "imp" ? "in" : "mm",
    pU = units === "imp" ? "psi" : "kPa",
    toL = (x) => (units === "imp" ? x / IN : x * 1000),
    toP = (x) => (units === "imp" ? x / 6894.757 : x / 1000);
  document.querySelectorAll(".bpu-len").forEach((e) => (e.textContent = lenU));
  document.querySelectorAll(".bpu-p").forEach((e) => (e.textContent = pU));
  const sv = (id, x, dec) => {
    const e = document.getElementById(id);
    if (e && document.activeElement !== e) e.value = +x.toFixed(dec);
  };
  sv("bp-d", toL(v.d), units === "imp" ? 3 : 1);
  sv("bp-l", toL(v.l), units === "imp" ? 2 : 0);
  sv("bp-p", toP(v.p), units === "imp" ? 1 : 0);
  {
    const n = document.getElementById("bp-n");
    if (document.activeElement !== n) n.value = String(v.n);
    const pn = document.getElementById("bp-pin");
    if (document.activeElement !== pn) pn.value = v.pin;
    pn.disabled = !(v.n > 0);
  }
  const comps = bpCompartments(),
    auto = comps.length > 0 && !v.manual;
  document.querySelectorAll(".bpmanual").forEach((e) => (e.hidden = auto));
  {
    const t = document.getElementById("bpmode");
    if (t) {
      t.hidden = !comps.length;
      t.textContent = auto ? "Size a different compartment by hand" : "Use the compartments from the design";
    }
  }
  if (auto) {
    bpRenderComps(comps, v, out);
    return;
  }
  const R = bpCalc(v);
  if (!(R.g > 0)) {
    out.innerHTML = `<p class="note">Enter the inside diameter and the length of the compartment the charge pressurizes.</p>`;
    document.getElementById("bpnote").textContent = "";
    return;
  }
  const gr = (x) => (x * 15.4324).toFixed(1),
    g2 = (x) => (x < 1 ? x.toFixed(2) : x.toFixed(1)),
    bp = R.g,
    bpGr = gr(bp);
  const rows = [
    [
      "Black powder FFFFg",
      `${g2(bp)} g`,
      `${bpGr} gr`,
      "The usual choice for ejection: fine grain, lights easily and burns fast.",
    ],
    [
      "Black powder FFFg",
      `${g2(bp)} g`,
      `${bpGr} gr`,
      "Same weight as FFFFg. Coarser, so it burns a little slower; fine for larger charges.",
    ],
    [
      "Pyrodex P",
      `≈${g2(bp * 0.77)} g`,
      `${bpGr} gr`,
      "Same volume as black powder (a volumetric measure set for the black powder weight). Needs tight confinement; less reliable in cold, thin air.",
    ],
    [
      "Hodgdon Triple Seven FFFg",
      `≈${g2(bp * 0.65)} g`,
      `${gr(bp * 0.85)} gr`,
      "85% of the black powder volume. Needs tight confinement and a hot igniter; ground test carefully.",
    ],
  ];
  out.innerHTML = `<table class="bpt"><thead><tr><th>Powder</th><th>Weight</th><th>Measure</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}<span class="sub">${r[3]}</span></td><td><b>${r[1]}</b></td><td>${r[2]}</td></tr>`).join("")}</tbody></table>`;
  const fN = R.force * 4.44822,
    fU = units === "imp" ? `${Math.round(R.force)} lbf` : `${Math.round(fN)} N`;
  const vU = units === "imp" ? `${R.V.toFixed(1)} in³` : `${(R.V * 16.387).toFixed(0)} cm³`;
  document.getElementById("bpnote").textContent =
    `Compartment ${vU}, ${units === "imp" ? R.P.toFixed(1) + " psi" : (R.P * 6.894757).toFixed(0) + " kPa"} in all${R.pPin > 0 ? ` (${units === "imp" ? R.pSep.toFixed(1) + " psi" : (R.pSep * 6.894757).toFixed(0) + " kPa"} to separate plus ${units === "imp" ? R.pPin.toFixed(1) + " psi" : (R.pPin * 6.894757).toFixed(0) + " kPa"} to break ${v.n} pin${v.n > 1 ? "s" : ""})` : ""}: ${fU} on the bulkhead. A backup charge is usually 25–50% larger: ${g2(bp * 1.25)}–${g2(bp * 1.5)} g of black powder. Ground test before flying.`;
}
// each compartment's own settings: pressure, shear pins, and what fires its charge
function bpCompSet(v, c) {
  const all = bpDesign().comps;
  return Object.assign(
    {
      p: 15 * 6894.757,
      n: 0,
      pin: "2-56",
      src: c.aft && typeof D !== "undefined" && D.deployMode === "motor" ? "motor" : "alt",
    },
    all[c.key] || {},
  );
}
// the charge for each compartment of the design
{
  const c = document.getElementById("bpackchk"),
    b = document.getElementById("bpackok");
  c.addEventListener("change", () => {
    b.disabled = !c.checked;
  });
  b.addEventListener("click", () => {
    if (!c.checked) return;
    store.set("rfs-bp-ack", { when: new Date().toISOString() });
    bpRender();
  });
}
function bpRenderComps(comps, v, out) {
  const toIn3 = (x) => x / (IN * IN * IN),
    gr = (x) => (x * 15.4324).toFixed(1),
    g2 = (x) => (x < 1 ? x.toFixed(2) : x.toFixed(1));
  const vol = (x) => (units === "imp" ? `${toIn3(x).toFixed(1)} in³` : `${(x * 1e6).toFixed(0)} cm³`),
    L = (x) => `${fmt(x, "len")} ${uname("len")}`,
    Dm = (x) => `${fmt(x, "small")} ${uname("small")}`;
  const pU = units === "imp" ? "psi" : "kPa",
    pD = (x) => (units === "imp" ? x / 6894.757 : x / 1000);
  const P = [
    ["Black powder FFFFg", 1, 1, "The usual choice for ejection: fine grain, lights easily and burns fast."],
    ["Black powder FFFg", 1, 1, "Same weight as FFFFg; burns a little slower."],
    ["Pyrodex P", 0.77, 1, "Same volume as black powder. Needs tight confinement; less reliable in cold, thin air."],
    [
      "Hodgdon Triple Seven FFFg",
      0.65,
      0.85,
      "85% of the black powder volume. Needs tight confinement and a hot igniter.",
    ],
  ];
  const m = typeof curMotor === "function" ? curMotor() : null;
  const cards = comps
    .map((c, ci) => {
      const gen = (n) => !n || /^bulkhead$/i.test(n.trim()),
        nm = (n) => (gen(n) ? "bulkhead" : esc(n));
      const ends =
        c.from && c.to
          ? gen(c.from) && gen(c.to)
            ? " between two bulkheads"
            : ` between the ${nm(c.from)} and the ${nm(c.to)}`
          : `${c.from ? ` from the ${nm(c.from)}` : " from the nose cone"}${c.to ? ` to the ${nm(c.to)}` : c.endBy ? ` to the forward ${c.endBy === "ring" ? "centering ring" : "end of the motor mount"}` : ""}`;
      const where = `${Dm(c.d)} inside × ${L(c.len)}${ends}${c.shV > 0 ? `, less ${vol(c.shV)} of nose shoulder` : ""}`;
      if (c.kind !== "recovery")
        return `<div class="bpcard bpnone"><div class="bph"><b>${esc(c.name)}</b> · ${esc(c.kind === "ebay" ? c.tube : c.tubes.join(", "))}</div><div class="bpgeo">${where} = ${vol(c.V)}. ${c.kind === "ebay" ? (c.implied ? "The coupler between the two recovery bays, taken as sealed at both ends: no charge. If it isn’t sealed, add its bulkheads in the builder." : "Sealed by bulkheads at both ends, inside a coupler: no charge.") : c.kind === "sealed" ? "Sealed by bulkheads at both ends, with nothing to deploy: no charge." : "No parachute or streamer in it, so no charge is sized."}</div></div>`;
      const S = bpCompSet(v, c);
      // the motor's ejection charge also fills the motor mount ahead of the motor
      let Vx = 0;
      if (S.src === "motor" && c.mount && m && c.mount.ri > 0) {
        const mFront = (D.mountAft ?? D.length) + D.motorOverhang - m.len;
        Vx = Math.max(0, Math.PI * c.mount.ri ** 2 * (mFront - c.mount.x));
      }
      const V = c.V + Vx,
        din = c.d / IN,
        A = (Math.PI / 4) * din * din,
        pPin = S.n > 0 ? (S.n * BP_PIN[S.pin]) / A : 0,
        Pt = S.p / 6894.757 + pPin,
        g = ((Pt * toIn3(V)) / (265.92 * 3307)) * 453.592;
      return `<div class="bpcard" data-k="${esc(c.key)}"><div class="bph"><b>${esc(c.name)}</b> · ${esc(c.tubes.join(", "))}${c.holds.length ? ` · holds the ${c.holds.map(esc).join(" and ")}` : ""}</div>
      <div class="bpgeo">${where}${Vx > 0 ? `, plus ${vol(Vx)} of motor mount ahead of the motor` : ""} = <b>${vol(V)}</b> · ${pD(Pt * 6894.757).toFixed(units === "imp" ? 1 : 0)} ${pU}${pPin > 0 ? ` with ${S.n} pin${S.n > 1 ? "s" : ""}` : ""} · ${units === "imp" ? Math.round(Pt * A) + " lbf" : Math.round(Pt * A * 4.44822) + " N"} on the bulkhead</div>
      ${c.split && !c.split.done ? ((c.split.done = true), `<div class="bpsplit"><label>Bays divide at <span class="in"><input type="number" inputmode="decimal" step="any" data-split="${esc(c.split.key)}" value="${units === "imp" ? (c.split.x / IN).toFixed(1) : (c.split.x * 1000).toFixed(0)}"><span class="u">${units === "imp" ? "in" : "mm"} from the nose tip</span></span></label><span class="note">${c.split.set ? "Your setting." : "Estimated: nothing in the design separates the two bays."} Set it to where your electronics bay or coupler sits. <button type="button" class="linkbtn" data-share="${esc(c.split.key)}">They share one bay (chute release)</button></span></div>`) : ""}
      ${c.shared ? `<p class="note" style="margin:4px 0;font-size:.8rem">One charge deploys both, as with a chute release. <button type="button" class="linkbtn" data-unshare="${esc(c.shared.key)}">They deploy separately</button></p>` : ""}
      <div class="bpset">
        <label>Pressure <span class="in"><input type="number" inputmode="decimal" step="any" data-f="p" value="${+pD(S.p).toFixed(units === "imp" ? 1 : 0)}"><span class="u">${pU}</span></span></label>
        <label>Shear pins <select data-f="n">${[0, 1, 2, 3, 4, 6].map((k) => `<option value="${k}"${k === S.n ? " selected" : ""}>${k || "None"}</option>`).join("")}</select></label>
        <label>Pin size <select data-f="pin"${S.n > 0 ? "" : " disabled"}><option value="2-56"${S.pin === "2-56" ? " selected" : ""}>#2-56 nylon</option><option value="4-40"${S.pin === "4-40" ? " selected" : ""}>#4-40 nylon</option></select></label>
        <label>Charge <select data-f="src"><option value="alt"${S.src === "alt" ? " selected" : ""}>Altimeter</option><option value="motor"${S.src === "motor" ? " selected" : ""}${c.mount ? "" : " disabled"}>Motor ejection</option></select></label>
      </div>
      <table class="bpt bpt2"><tbody>${P.map(([n, kw, kv]) => `<tr><td>${n}</td><td><b>${kw < 1 ? "≈" : ""}${g2(g * kw)} g</b></td><td>${gr(g * kv)} gr</td></tr>`).join("")}</tbody></table>
      ${c.holds.length > 1 && !c.shared ? `<p class="note warn" style="margin:6px 0 0;font-size:.8rem">These share one bay with nothing between them, so one charge deploys both (as with a chute release). If they deploy separately, put a coupler or bulkhead between them in the builder and each gets its own charge.</p>` : ""}
      ${S.src === "motor" ? `<p class="note" style="margin:6px 0 0;font-size:.8rem">The motor's own ejection charge fires this bay. Check that the motor's charge is big enough, and top it up in the forward closure if it isn't.</p>` : ""}</div>`;
    })
    .join("");
  out.innerHTML = `${cards}
    <ul class="note bpcomp" style="margin:10px 0 0;padding-left:18px">${P.map(([n, , , why]) => `<li><b>${n}:</b> ${why}</li>`).join("")}</ul>`;
  // the settings on each card
  out.querySelectorAll("[data-share],[data-unshare]").forEach((el) =>
    el.addEventListener("click", () => {
      const w = bpDesign();
      if (el.dataset.share) w.splits[el.dataset.share] = -1;
      else delete w.splits[el.dataset.unshare];
      bpDesignSave();
      bpRender();
    }),
  );
  out.querySelectorAll("[data-split]").forEach((el) =>
    el.addEventListener("change", () => {
      const x = parseFloat(el.value);
      if (!isFinite(x)) return;
      const w = bpDesign();
      w.splits[el.dataset.split] = units === "imp" ? x * IN : x / 1000;
      bpDesignSave();
      bpRender();
    }),
  );
  out.querySelectorAll(".bpcard[data-k]").forEach((card) => {
    const key = card.dataset.k;
    card.querySelectorAll("[data-f]").forEach((el) =>
      el.addEventListener("change", () => {
        const w = bpDesign(),
          c = comps.find((c) => c.key === key);
        const S = bpCompSet(w, c),
          f = el.dataset.f;
        if (f === "p") {
          const x = parseFloat(el.value);
          if (!(isFinite(x) && x > 0)) return;
          S.p = units === "imp" ? x * 6894.757 : x * 1000;
        } else if (f === "n") S.n = +el.value;
        else S[f] = el.value;
        w.comps[key] = S;
        bpDesignSave();
        bpRender();
      }),
    );
  });
  document.getElementById("bpnote").textContent =
    `These settings are saved with the design, in its .ork file. A backup charge is usually 25–50% larger. Ground test every charge before flying.`;
}
{
  const set = (k, f) => {
    const v = BP.get();
    if (!(v.d > 0)) v.d = Math.max(((typeof D !== "undefined" && D.diameter) || 0.054) - 2 * 0.0016, 0.005);
    v[k] = f;
    BP.set(v);
    bpRender();
  };
  const num = (id, k, fromU) =>
    document.getElementById(id).addEventListener("input", (e) => {
      const x = parseFloat(e.target.value);
      if (isFinite(x) && x > 0) set(k, fromU(x));
    });
  const L_ = (x) => (units === "imp" ? x * IN : x / 1000),
    P_ = (x) => (units === "imp" ? x * 6894.757 : x * 1000);
  document.getElementById("bp-d").addEventListener("input", (e) => {
    const x = parseFloat(e.target.value);
    if (isFinite(x) && x > 0) {
      const w = BP.get();
      const a = bpAftTube();
      w.d = L_(x);
      w.dManual = true;
      w.dKey = a ? a.key : null;
      BP.set(w);
      bpRender();
    }
  });
  num("bp-l", "l", L_);
  num("bp-p", "p", P_);
  document.getElementById("bp-n").addEventListener("change", (e) => set("n", +e.target.value));
  document.getElementById("bpmode").addEventListener("click", () => {
    const w = BP.get();
    w.manual = !w.manual;
    BP.set(w);
    bpRender();
  });
  document.getElementById("bp-pin").addEventListener("change", (e) => set("pin", e.target.value));
  bpRender();
}
