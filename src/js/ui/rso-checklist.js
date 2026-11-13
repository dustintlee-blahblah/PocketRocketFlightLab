/**
 * The RSO checklist (the go/no-go items a range safety officer asks about), the results flags, the wind table and the
 * chart series.
 */
import { BLD } from "../builder/builder-ui.js";
import { esc } from "../core/helpers.js";
import { store } from "../core/storage.js";
import { curBoost, curMotor, L, mstats, PROFILE } from "../design/defaults.js";
import { RANGE_KEYS } from "../files/save.js";
import { motorStats } from "../motors/motor-files.js";
import { aero } from "../physics/aerodynamics.js";
import { apoRange, lastMC, mcFar95 } from "../physics/monte-carlo.js";
import { fullStack } from "../physics/staging.js";
import { coneWindNote } from "./charts.js";
import { siteRender } from "./launch-sites.js";
import { motorFit } from "./motor-tab.js";
import { bigDist, compass, driftDir, ejLiveFlag, lastSim, nosePlan, noseWeightText } from "./results.js";
import { renderDragTable } from "./state.js";
import { fmt, uname } from "./units.js";
/* ---------- RSO checklist: the go/no-go items a range safety officer asks about, from the last run ---------- */
/* high power under FAA Part 101 / NAR and Tripoli: any motor over 160 N·s (H and up), more than 320 N·s in all, more than
   125 g of propellant, or a liftoff weight over 1,500 g */
/**
 * Whether a flight is high power (see the note above), and why.
 * @param {object} st flight summary
 * @param {object} m sustainer motor
 * @param {object} [mb] booster motor
 * @param {object} [m1] first-stage motor
 * @returns {{hpr:boolean, I:number, prop:number, mass:number}} total impulse N·s, propellant and liftoff mass kg
 */
function hprFlight(st, m, mb, m1) {
  /**
   * The single motors in a motor or cluster.
   */
  const ex = (x) => (!x ? [] : x.members ? x.members.flatMap((e) => Array(e.n).fill(e.m)) : [x]),
    all = [...ex(m), ...ex(mb), ...ex(m1)];
  const I = all.map((x) => mstats(x).I),
    tot = I.reduce((a, b) => a + b, 0),
    prop = all.reduce((a, x) => a + (x.propMass || 0), 0),
    mass = (st && st.liftMass) || 0;
  return { hpr: I.some((v) => v > 160) || tot > 320 || prop > 0.125 || mass > 1.5, I: tot, prop, mass };
}
/**
 * The most cloud cover from the pad up to a height (see the note above).
 * @param {object} LL launch conditions
 * @param {number} z height above the pad, m
 * @returns {{c:number, z:number, from:string}|null} cover 0–1, its height, and whether it came from the forecast's
 *   levels or the cloud bands (null with no cloud)
 *
 * the most cloud cover at any height from the pad up to z (above the pad): from the forecast's level-by-level cover, or else
 * from the low (up to about 3 km above sea level), mid (3–8 km) and high (above 8 km) bands
 */
function cloudBelow(LL, z) {
  const P = LL.cloudProf;
  if (Array.isArray(P) && P.length) {
    let best = { c: 0, z: 0 };
    for (const r of P) {
      if (r.z > z) break;
      if (r.c / 100 > best.c) best = { c: r.c / 100, z: r.z };
    }
    // the level just above apogee counts as well when the apogee sits inside that layer
    const nx = P.find((r) => r.z > z);
    if (nx && best.c < nx.c / 100 && z > 0) {
      const lo = P.filter((r) => r.z <= z).pop();
      if (!lo || nx.z - z < (nx.z - (lo ? lo.z : 0)) / 2) best = { c: nx.c / 100, z: nx.z };
    }
    return { ...best, from: "levels" };
  }
  const e = LL.elev || 0,
    B = [
      [LL.cloudLow || 0, 0],
      [LL.cloudMid || 0, 3000 - e],
      [LL.cloudHigh || 0, 8000 - e],
    ];
  if (!B.some((b) => b[0] > 0)) return null;
  let best = { c: 0, z: 0 };
  for (const [c, b] of B) if (z >= Math.max(0, b) && c > best.c) best = { c, z: Math.max(0, b) };
  return { ...best, from: "bands" };
}
/**
 * Whether the rocket's lugs or buttons suit the pad's rod or rail. A launch tower needs none, and neither does a
 * rocket with a fly-away rail guide (a protuberance of that shape), which rides a rail and lets go at its end.
 * @param {string} rt rail type
 * @param {boolean} [launch] for the Launch button: also say so when no rail type is set and the design has no guides at all
 * @returns {Array|null} [status, label, why]; null when there is nothing to say
 *
 * whether the rocket's guides suit the pad: lugs over a rod (inside diameter at least the rod's), buttons of the rail's size
 */
export function padGuideCheck(rt, launch) {
  if (rt === "tower")
    return ["good", "Launch tower", "No lugs or buttons needed in a tower; the fins must clear its rails."];
  if (typeof BLD === "undefined" || !BLD) return null;
  const kids = BLD.stages.flatMap((st) => st.parts.flatMap((p) => p.kids || [])),
    lugs = kids.filter((k) => k.type === "lug"),
    btns = kids.filter((k) => k.type === "buttons"),
    fly = kids.some((k) => k.type === "bump" && k.shape === "flyaway");
  if (!rt || rt === "other")
    return !launch || lugs.length || btns.length || fly
      ? null
      : [
          "bad",
          "No rail guides",
          "The design has no launch lug, rail buttons or fly-away rail guide. Add the ones the rocket has in the builder, or set the rail type to Launch tower.",
        ];
  const pad = {
    rod18: ["1/8 in rod", 0.003175],
    rod316: ["3/16 in rod", 0.0047625],
    r1010: ["1010 rail", "1010"],
    r1515: ["1515 rail", "1515"],
  }[rt];
  if (!pad) return null;
  if (fly)
    return rt.startsWith("rod")
      ? [
          "bad",
          pad[0],
          "A fly-away rail guide rides a rail, not a rod. Use a rail, or give the rocket a rod-type launch lug in place of the guide.",
        ]
      : ["good", pad[0], "The fly-away rail guide carries the rocket up the rail, so it needs no rail buttons."];
  // rod lugs slide over a rod; rail lugs and rail buttons ride a rail of their own size
  const rodLugs = lugs.filter((l) => !(l.kind === "r1010" || l.kind === "r1515")),
    railLugs = lugs.filter((l) => l.kind === "r1010" || l.kind === "r1515"),
    railSz = [
      ...btns.map((b) => (b.size === "custom" && b.dims ? (b.dims.od > 0.013 ? "1515" : "1010") : b.size)),
      ...railLugs.map((l) => l.kind.slice(1)),
    ];
  if (rt.startsWith("rod")) {
    const d = pad[1];
    if (!rodLugs.length)
      return [
        "bad",
        pad[0],
        btns.length || railLugs.length
          ? `The rocket has ${railLugs.length ? "rail-type launch lugs" : "rail buttons"} but no rod-type launch lug, so it can't fly from a rod. Use a rail, or add a rod-type lug.`
          : "The design has no rod-type launch lug to slide over the rod.",
      ];
    const ok = rodLugs.filter((l) => (l.id_ || 0) >= d + 0.0003);
    return ok.length
      ? [
          "good",
          pad[0],
          `The launch lug (${fmt(Math.max(...ok.map((l) => l.id_)), "small")} ${uname("small")} inside) fits over the rod.`,
        ]
      : [
          "bad",
          pad[0],
          `The launch lug is too small for a ${pad[0]}: its inside diameter, ${fmt(Math.max(...rodLugs.map((l) => l.id_ || 0)), "small")} ${uname("small")}, needs to be at least ${fmt(d + 0.0003, "small")} ${uname("small")}.`,
        ];
  }
  if (!railSz.length)
    return [
      "bad",
      pad[0],
      rodLugs.length
        ? "The rocket has a rod-type launch lug but no rail buttons or rail-type lug, so it can't fly from a rail. Use a rod, or add rail buttons or a rail-type lug."
        : "The design has no rail buttons or rail-type launch lug.",
    ];
  const want = pad[1],
    what =
      btns.length && railLugs.length
        ? "rail buttons and lugs"
        : railLugs.length
          ? "rail-type launch lugs"
          : "rail buttons";
  return railSz.every((z) => z === want)
    ? ["good", pad[0], `${want} ${what} match the rail.`]
    : [
        "bad",
        pad[0],
        `The rocket's ${what} are ${[...new Set(railSz)].join(" and ")} size, which don't fit a ${pad[0]}. Use the matching rail or change them.`,
      ];
}
/**
 * The RSO checklist items for the last run.
 * @param {object} st flight summary
 * @param {object} S stability
 * @param {object} m motor
 * @param {object} D design
 * @param {object} LL launch conditions
 * @returns {{s:string, label:string, val:string, why:string}[]} s is "good", "warn" or "bad"
 */
export function rsoChecks(st, S, m, D, LL) {
  const c = [],
    sp = (v) => `${fmt(v, "speed")} ${uname("speed")}`,
    add = (s, label, val, why) => c.push({ s, label, val, why });
  if (st.error) {
    add("bad", "Simulation", `—`, st.error);
    return c;
  }
  // stability
  const ml = S.marginL,
    nw = typeof nosePlan === "function" ? nosePlan(st, S) : null;
  add(
    ml > 4 ? "warn" : ml >= 1.5 ? "good" : ml >= 1 ? "warn" : "bad",
    st.staged ? "Stack stability at liftoff" : "Stability at liftoff",
    `${ml.toFixed(2)} cal`,
    ml > 4
      ? "Very stable (over 4 calibers): it will turn into the wind strongly. Fine in calm air; in wind, a lower rail angle or less wind helps."
      : ml >= 1.5
        ? "At least 1 caliber is the usual minimum; this has margin."
        : ml >= 1
          ? "Just above the 1 caliber minimum. Confirm the CG with the motor in, and consider a little nose weight." +
            (S.unc && ml - S.unc < 1
              ? ` The CP estimate is good to about ±${S.unc.toFixed(1)} cal on this rocket, so it could be below 1.`
              : "")
          : `Below 1 caliber. Add ${nw && nw.cal > 0 ? noseWeightText(nw.cal) + " at mid-nose" : "nose weight"} or larger fins before flying.`,
  );
  // margin as a share of the rocket's length: one caliber is little on a long, thin rocket
  if (S.pctL != null && ml >= 1)
    add(
      S.pctL >= 10 ? "good" : "warn",
      "Stability as a share of length",
      `${S.pctL.toFixed(0)}%`,
      S.pctL >= 10
        ? "The CP is at least 10% of the rocket's length behind the CG, a common guide for long rockets."
        : `${ml.toFixed(2)} cal is only ${S.pctL.toFixed(0)}% of this rocket's length. Long, thin rockets lose margin quickly when they tilt; 10–15% of the length is a common guide for them. ${nw && nw.pct > 0 ? `Reaching 10% takes ${noseWeightText(nw.pct)} at mid-nose.` : "Consider nose weight."}`,
    );
  // leaving the rail in this wind
  if (st.railMargin != null && !st.tumble)
    add(
      st.railMargin >= 1 ? "good" : "warn",
      "Stability leaving the rail",
      `${st.railMargin.toFixed(2)} cal at ${st.railAoA.toFixed(0)}°`,
      `In this wind the airflow meets the rocket at ${st.railAoA.toFixed(0)}° as it leaves the rail. Body lift moves the CP forward as it tilts, leaving ${st.railMargin.toFixed(2)} cal.` +
        (st.railMargin < 0
          ? " The simulated flight recovers as it speeds up and the angle shrinks, but a gust or a slower start could tip it over. A longer rail, a faster motor, nose weight or less wind helps."
          : st.railMargin < 1
            ? " A longer rail, a faster motor, nose weight or less wind raises it."
            : "") +
        (st.railMargin < 1 && nw && nw.rail > 0 ? ` 1 cal here takes ${noseWeightText(nw.rail)} at mid-nose.` : ""),
    );
  // dynamic stability: how well it damps its wobble
  {
    const dm = st.dampMax || st.dampRail;
    if (dm && !st.tumble)
      add(
        dm.zeta < 0.05 ? "warn" : dm.zeta > 0.3 ? "warn" : "good",
        "Damping ratio",
        dm.zeta.toFixed(2),
        dm.zeta < 0.05
          ? "Lightly damped: after a gust it keeps oscillating for a while. A longer rocket or fins farther aft damp it more."
          : dm.zeta > 0.3
            ? "Heavily damped: it turns back slowly after a gust. Usually fine; very high values come with weak correction."
            : "Within the usual 0.05–0.3: gusts die out in a few swings.",
      );
  }
  if (st.minMargin && st.minMargin.cal < ml - 0.05)
    add(
      st.minMargin.cal >= 1 ? "good" : st.minMargin.cal >= 0 ? "warn" : "bad",
      "Lowest stability in flight",
      `${st.minMargin.cal.toFixed(2)} cal`,
      `At Mach ${st.minMargin.M.toFixed(2)}, T+${st.minMargin.t.toFixed(1)} s.` +
        (st.minMargin.cal < 1 ? " It drops below 1 caliber on the way up." : ""),
    );
  // above Mach 1 the stability estimate is less certain, and more so for square fin edges
  // near Mach 1 too: NASA TN D-4013 measured the long Arcas model's center of pressure dipping forward about 7% of its
  // length around Mach 1 (the short model and the stubby bodies of TM X-653 showed no dip); the app doesn't model that
  if ((st.mMaxMach || 0) >= 0.9 && st.marginAtMaxMach != null && !st.tumble) {
    const sup = st.mMaxMach > 1,
      A0 = aero(st.staged && typeof fullStack === "function" ? fullStack(D) : D),
      fins = A0.fins || [],
      sq = fins.some((f) => f.edge === "square"),
      full = fins.some((f) => f.edge !== "square"),
      slim = A0.L / (2 * A0.R) >= 20;
    add(
      "warn",
      sup ? "Supersonic stability" : "Stability near Mach 1",
      `${st.marginAtMaxMach.toFixed(2)} cal at Mach ${st.mMaxMach.toFixed(2)}`,
      (sup
        ? "This flight goes supersonic, where stability estimates are less certain than below Mach 1."
        : "This flight comes close to Mach 1, where stability estimates are less certain.") +
        ` In NASA wind-tunnel tests of a long, slender sounding rocket, the center of pressure moved forward by about 7% of the body length for a moment near Mach 1, which this app doesn't model; a shorter version of the same rocket showed no dip${slim ? ", but this rocket is long and slender too" : ""}.` +
        (!sup
          ? ""
          : sq && !full
            ? " Fins with square edges are counted cautiously (less fin lift) above Mach 1, so the real margin there is probably a little higher."
            : full && !sq
              ? " Above Mach 1 these fins use full supersonic theory, which matched NASA wind-tunnel data for a slender sounding rocket with double-wedge fins within about 2% of body length and came out a little cautious for a stubby body with round-edged fins."
              : " Above Mach 1, square-edged fins are counted cautiously; the others use full supersonic theory.") +
        " Leave extra margin, confirm the fins are built as designed, and discuss the flight with your RSO.",
    );
  }
  // the weight and CG most often differ from the real rocket (glue, paint, fillets, wiring): ask for the measured ones
  if (D.massKnown === false)
    add(
      "warn",
      "Weight and CG",
      "Estimated",
      `Added up from the parts list, not weighed. Built rockets usually come out heavier, which lowers apogee and moves the CG. Weigh the rocket ready to fly without its motor, find its balance point, and enter both on the Rocket tab (select the stage in the design tree).`,
    );
  if (st.tumble)
    add(
      "bad",
      "Flight path",
      "Tumbles",
      `Goes end over end ${st.tumble.powered ? "under power" : "after burnout"}. Do not fly as is.`,
    );
  // speed off the rail and thrust-to-weight
  const orv = st.offRail || 0,
    rl = LL.rail || 0;
  add(
    orv >= 15.24 ? "good" : orv >= 12.2 ? "warn" : "bad",
    "Speed off the rail",
    sp(orv),
    `Guideline at least ${fmt(15.24, "speed", 0)} ${uname("speed")}, on a ${fmt(rl, "alt", 1)} ${uname("alt")} rail.` +
      (orv < 15.24 ? " Use a longer rail or a higher-thrust motor." : ""),
  );
  add(
    st.avgTtw >= 5 ? "good" : st.avgTtw >= 3 ? "warn" : "bad",
    "Thrust-to-weight (average)",
    `${st.avgTtw.toFixed(1)} : 1`,
    st.avgTtw >= 5
      ? "At least 5:1 is the usual minimum."
      : "Below the usual 5:1 minimum. Choose a higher-thrust motor or lighten the rocket.",
  );
  // safety cone under power
  {
    const cone = LL.cone ?? 20;
    if (st.powerTilt != null && !st.tumble)
      add(
        st.powerTilt <= cone ? "good" : "bad",
        "Safety cone under power",
        `${st.powerTilt.toFixed(0)}° of ${cone}°`,
        st.powerTilt <= cone
          ? "Stays inside the cone while the motor burns."
          : "Leaves the cone while the motor burns. Wait for less wind, reduce the rail angle, or use a faster motor or longer rail.",
      );
  }
  // deployment timing
  const ideal =
    (st.tApoFree ?? st.tApo) != null && st.tb != null ? Math.max(0, (st.tApoFree ?? st.tApo) - st.tb) : null;
  if (st.noChute) add("bad", "Recovery", "None", "No parachute or streamer: it comes down ballistic. Add recovery.");
  else if (st.noDeploy)
    add(
      "bad",
      "Deployment",
      "Never",
      st.plugSkip
        ? "The chute is set to open at the motor ejection charge, but the motor is plugged: nothing opens and the rocket comes down ballistic."
        : "The rocket lands before the chute opens.",
    );
  else {
    if (D.ejDelay != null && ideal != null && !st.ignAfterApogee) {
      const diff = D.ejDelay - ideal,
        alt = st.depMode !== "motor";
      const ok = Math.abs(diff) <= 1.5;
      add(
        ok ? "good" : alt ? "warn" : Math.abs(diff) > 3 ? "bad" : "warn",
        `${st.staged ? "Sustainer motor" : "Motor"} ejection delay`,
        `${+D.ejDelay.toFixed(1)} s · ideal ${ideal.toFixed(1)} s`,
        ok
          ? "Fires within 1.5 s of apogee."
          : `Fires ${Math.abs(diff).toFixed(1)} s ${diff < 0 ? "before" : "after"} apogee. ${alt ? "With an altimeter doing deployment, use a plugged motor or a delay as backup set near the ideal." : "Drill or choose a delay closer to the ideal."}`,
      );
    } else if (D.ejDelay == null && st.depMode === "motor")
      add(
        "bad",
        "Motor ejection delay",
        "Plugged",
        `${st.single ? "The parachute" : "The drogue"} is set to open at the motor ejection charge, but the motor is plugged, so it never opens and the rocket comes down ballistic${!st.single && st.tMain != null ? " until the main opens" : ""}. Choose a delay under Motor Delay on the Motor tab, or set the chute to open at apogee with an altimeter.`,
      );
    for (const [b, nm] of [
      [st.booster, "Booster"],
      [st.first, "First stage"],
    ])
      if (b && b.ejLive) {
        const f = ejLiveFlag({ ejLive: b.ejLive }, nm.toLowerCase());
        add(
          f[0],
          `${nm} charge and packed chute`,
          `Fires ${b.ejLive.dt == null ? "on the way up" : b.ejLive.dt < 0 ? (-b.ejLive.dt).toFixed(1) + " s before its apogee" : b.ejLive.dt.toFixed(1) + " s after its apogee"}`,
          f[1],
        );
      }
    if (st.ejLive) {
      const f = ejLiveFlag(st);
      add(
        f[0],
        "Motor charge and packed chute",
        `Fires ${st.ejLive.dt == null ? "before apogee" : st.ejLive.dt < 0 ? (-st.ejLive.dt).toFixed(1) + " s before apogee" : st.ejLive.dt.toFixed(1) + " s after apogee"}`,
        f[1],
      );
    }
    const v = st.vDeploy ?? st.vApo;
    if (v != null)
      add(
        v <= 15 ? "good" : v <= 30 ? "warn" : "bad",
        st.single ? "Speed when the chute opens" : "Speed when the drogue opens",
        sp(v),
        v <= 15
          ? "Slow, near apogee: a gentle opening."
          : v <= 30
            ? "Opens while still moving; check the shock cord and attachment points."
            : "Opens fast: risk of zippering or a broken shock cord. Set deployment closer to apogee.",
      );
    if (!st.single && st.drogueRate)
      add(
        st.drogueRate <= 30.5 ? "good" : "warn",
        "Drogue descent",
        sp(st.drogueRate),
        st.drogueRate <= 30.5
          ? "Typical drogue rates are 50–100 ft/s (15–30 m/s)."
          : "Faster than about 100 ft/s (30 m/s); the main opening will be harder. Consider a larger drogue.",
      );
    if (st.mainRate)
      add(
        st.mainRate <= 6.1 ? "good" : st.mainRate <= 7.3 ? "warn" : "bad",
        st.single ? "Landing speed" : "Landing speed under the main",
        sp(st.mainRate),
        st.mainRate <= 6.1
          ? "At or below about 20 ft/s (6 m/s)."
          : st.mainRate <= 7.3
            ? "A little fast; 15–20 ft/s (4.5–6 m/s) is the usual target. A larger chute helps."
            : "Too fast for a safe landing. Use a larger parachute.",
      );
    if (st.shockM && st.shockM.g >= 25)
      add(
        st.shockM.g >= 50 ? "bad" : "warn",
        st.single ? "Chute opening load" : "Main opening load",
        `${st.shockM.g.toFixed(0)} g`,
        "A hard opening. Check the shock cord, harness and anchors.",
      );
  }
  // speed of sound and altimeter lockout
  add(
    st.maxMach < 0.8 ? "good" : "warn",
    "Max Mach",
    st.maxMach.toFixed(2),
    st.maxMach < 0.8
      ? "Subsonic: the drag estimate is most reliable here."
      : st.maxMach <= 2
        ? "Transonic or supersonic: estimates are less certain, and fins, nose and joints take higher loads."
        : "Above Mach 2: expect heating and flutter concerns; estimates are least certain.",
  );
  if (st.mach08 != null && !st.noChute && (st.depMode !== "motor" || !st.single)) {
    const end = Math.ceil(st.mach08end + 1);
    add(
      "warn",
      "Altimeter Mach lockout",
      `≥ ${end} s`,
      `Above Mach 0.8 from T+${st.mach08.toFixed(1)} to T+${st.mach08end.toFixed(1)} s. Set the barometric altimeter's Mach (or apogee) lockout so the pressure jump can't fire a charge early.`,
    );
  }
  if (st.flutter && st.maxMach > 0.5 && st.flutter.ratio >= 0.8)
    add(
      st.flutter.ratio >= 1 ? "bad" : "warn",
      "Fin flutter",
      `${Math.round(st.flutter.ratio * 100)}%`,
      `Peak airspeed is ${Math.round(st.flutter.ratio * 100)}% of the estimated flutter speed (${fmt(st.flutter.vf, "speed")} ${uname("speed")})${st.flutter.ratio >= 1 ? ", so the fins could flutter and fail" : ""}. Thicker or stiffer fins, or tip-to-tip reinforcement, raise it.`,
    );
  // wind
  {
    const w = LL.wind || 0;
    add(
      w <= 8.94 ? (w <= 6.7 ? "good" : "warn") : "bad",
      "Wind at the pad",
      `${fmt(w, "wind", 0)} ${uname("wind")}`,
      w > 8.94
        ? "Above 20 mph: the NFPA 1127 high-power code prohibits launching."
        : w > 6.7
          ? "Gusty-range wind: expect weathercocking and long drift."
          : "Within the 20 mph limit.",
    );
  }
  // the range: waiver ceiling, certification level, recovery area, flight type
  {
    const w = LL.waiver || 0;
    if (w > 0) {
      const ceil = w - (LL.waiverRef === "msl" ? LL.elev || 0 : 0),
        RG = apoRange(st, D),
        hi = RG ? RG.hi : st.maxAlt;
      if (ceil <= 0)
        add(
          "bad",
          "Waiver ceiling",
          "Below the field",
          "The ceiling is at or below the field elevation. Check whether the waiver is above ground or sea level.",
        );
      else
        add(
          hi > ceil ? "bad" : hi > 0.9 * ceil ? "warn" : "good",
          "Apogee vs. waiver",
          `${fmt(hi, "alt")} of ${fmt(ceil, "alt")} ${uname("alt")}`,
          hi > ceil
            ? `${st.maxAlt > ceil ? `Over the ceiling by ${fmt(st.maxAlt - ceil, "alt")} ${uname("alt")} at the predicted apogee` : `The predicted apogee is under the ceiling, but the top of the likely range is over it by ${fmt(hi - ceil, "alt")} ${uname("alt")}`}. Use a smaller motor or add weight.`
            : hi > 0.9 * ceil
              ? `The top of the likely apogee range is within 10% of the ceiling; a hot motor or less drag could take it over.`
              : `${Math.round((hi / ceil) * 100)}% of the ceiling, at the top of the likely apogee range.`,
        );
    }
  }
  // the pad's rail or rod against the rocket's launch lugs or rail buttons (from the builder's parts)
  {
    const rt = LL.railType || "";
    const g = padGuideCheck(rt);
    if (g) add(g[0], "Rail or rod fit", g[1], g[2]);
  }
  // clouds and rain: no rocket is flown into clouds; high-power flights (FAA Part 101.25) also need cloud cover of no more
  // than five-tenths at every altitude they reach, and 5 miles' visibility
  {
    const hp = hprFlight(st, m, lastSim && lastSim.mb, lastSim && lastSim.m1),
      RG = apoRange(st, D),
      top = st.error ? 0 : RG ? RG.hi : st.maxAlt;
    const cov = cloudBelow(LL, top),
      tag = hp.hpr ? "High-power flight (FAA Part 101.25)" : "Model rocket";
    if (cov && top > 0)
      add(
        cov.c > 0.5 ? (hp.hpr ? "bad" : "warn") : "good",
        "Cloud cover up to apogee",
        `${Math.round(cov.c * 100)}%${cov.c > 0 ? ` at ${fmt(cov.z, "alt")} ${uname("alt")}` : ""}`,
        cov.c > 0.5
          ? hp.hpr
            ? `More than five-tenths cloud cover below the top of the likely apogee range. ${tag}: it may not be flown to an altitude where clouds cover more than half the sky. Wait for clearer skies or use a smaller motor.`
            : `More than half the sky is cloudy below the predicted apogee. The five-tenths limit is written for high-power flights, but the rocket must still not go into any cloud.`
          : `${tag}: at most ${Math.round(cov.c * 100)}% cover at the heights it flies through${cov.from === "bands" ? " (worked out from the low, mid and high cloud cover)" : " (from the forecast's cloud cover at each level)"}. Forecasts are rough; look at the sky before launch.`,
      );
    const vis = LL.vis || 0;
    if (vis > 0)
      add(
        vis < 8046.7 ? (hp.hpr ? "bad" : "warn") : "good",
        "Visibility",
        `${fmt(vis, "vis")} ${uname("vis")}`,
        vis < 8046.7
          ? hp.hpr
            ? `Under 5 miles (8 km). ${tag} needs at least 5 miles' horizontal visibility.`
            : "Under 5 miles (8 km): keep the rocket in sight; high-power flights would need at least 5 miles."
          : `At least 5 miles (8 km).${hp.hpr ? " Meets the high-power minimum." : ""}`,
      );
  }
  // the dispersion flights, with the balance varied: how often it tumbles
  {
    const mc = lastMC && lastSim && lastMC.when === lastSim.when ? lastMC : null;
    if (mc && mc.n > 0 && !st.error) {
      const f = mc.tumbles / mc.n;
      add(
        f === 0 ? "good" : f < 0.02 ? "warn" : "bad",
        "Chance of tumbling",
        `${+(100 * f).toFixed(1)}% (${mc.tumbles} of ${mc.n})`,
        f === 0
          ? `None of the ${mc.n} dispersion flights tumbled, with the wind, weight and balance varied.`
          : `${mc.tumbles} of the ${mc.n} dispersion flights tumbled, with the wind, weight and balance (CG against CP) varied. Add nose weight or larger fins, or wait for less wind.`,
      );
    }
  }
  {
    const cz = LL.ceiling || 0;
    if (cz > 0 && !st.error) {
      const mc = lastMC && lastSim && lastMC.when === lastSim.when ? lastMC : null,
        hi = mc ? Math.max(mc.p95, st.maxAlt) : st.maxAlt;
      add(
        hi > cz ? "bad" : hi > 0.8 * cz ? "warn" : "good",
        "Apogee vs. cloud base",
        `${fmt(hi, "alt")} of ${fmt(cz, "alt")} ${uname("alt")}`,
        hi > cz
          ? `Flies into the clouds by ${fmt(hi - cz, "alt")} ${uname("alt")}. Rockets must not be launched into clouds: wait for the clouds to lift or clear, or use a smaller motor.`
          : hi > 0.8 * cz
            ? "Close to the cloud base. Clouds move and forecasts miss: check the sky before launch."
            : "Stays below the cloud base.",
      );
    }
    const pp = LL.precip || 0;
    if (pp >= 0.5)
      add(
        "warn",
        "Chance of precipitation",
        `${Math.round(pp * 100)}%`,
        "Rain or snow is likely at launch time: wet motors and electronics misbehave, and rain usually comes with low clouds.",
      );
  }
  {
    const cert = PROFILE.cert || "",
      mb0 = lastSim && lastSim.mb;
    if (cert) {
      const base = certCheck(st, m, mb0, cert, false),
        att = LL.flightType === "cert" ? certCheck(st, m, mb0, cert, true) : null;
      if (!base.ok)
        add(
          att && att.s === "good" ? "warn" : "bad",
          `Above your ${CERT_NAME[cert].replace(/^No certification$/, "certification")}`,
          base.val,
          base.why + (att ? " The flight type is set to Certification." : ""),
        );
      if (att) add(att.s, "Certification attempt", att.val, att.why);
      else if (base.ok) add(base.s, "Certification for this motor", base.val, base.why);
    }
  }
  {
    const R = LL.recRadius || 0;
    if (R > 0) {
      const mc = lastMC && lastSim && lastMC.when === lastSim.when ? lastMC : null,
        d = Math.hypot(st.drift || 0, st.driftY || 0),
        far = mc ? Math.max(mcFar95(mc), d) : d;
      add(
        far > R ? "bad" : far > 0.8 * R ? "warn" : "good",
        "Landing inside the recovery area",
        `${fmt(far, "alt")} ${uname("alt")} of ${fmt(R, "dist")} ${uname("dist")}`,
        far > R
          ? `Lands ${fmt(far - R, "alt")} ${uname("alt")} beyond the recovery area${mc ? " (edge of the 95% landing ellipse)" : ""}. Deploy the main lower, use a smaller drogue, or wait for less wind.`
          : far > 0.8 * R
            ? `Close to the edge of the recovery area${mc ? " (edge of the 95% landing ellipse)" : ""}.`
            : `Inside the recovery area${mc ? `, including the 95% landing ellipse${mc.far > R ? ` (the single farthest of the ${mc.n} landings, ${fmt(mc.far, "alt")} ${uname("alt")}, was outside)` : ""}` : "; run the dispersion on this tab to include wind changes"}.`,
      );
      const b = st.booster;
      if (st.staged && b && b.drift != null) {
        const bd = Math.hypot(b.drift, b.driftY || 0);
        add(
          bd > R ? "bad" : bd > 0.8 * R ? "warn" : "good",
          "Booster inside the recovery area",
          `${fmt(bd, "alt")} ${uname("alt")} of ${fmt(R, "dist")} ${uname("dist")}`,
          bd > R ? "The booster lands outside the recovery area." : "The booster lands inside the recovery area.",
        );
      }
      const f1 = st.first;
      if (st.three && f1 && f1.drift != null) {
        const fd = Math.hypot(f1.drift, f1.driftY || 0);
        add(
          fd > R ? "bad" : fd > 0.8 * R ? "warn" : "good",
          "First stage inside the recovery area",
          `${fmt(fd, "alt")} ${uname("alt")} of ${fmt(R, "dist")} ${uname("dist")}`,
          fd > R
            ? "The first stage lands outside the recovery area."
            : "The first stage lands inside the recovery area.",
        );
      }
    }
  }
  {
    const complex = !!(st.staged || (D.extraMotors || []).length),
      ft = LL.flightType || "standard";
    if (ft === "cert")
      add(
        "warn",
        "Flight type",
        "Certification",
        "Certification flight: tell the RSO and your certification team before it goes on the pad; it's usually flown heads-up. Check the Certification attempt row for the motor class.",
      );
    else if (ft === "first")
      add(
        "warn",
        "Flight type",
        "First flight",
        "First flight of this design: expect it to be called a heads-up flight. Check the CG and CP on the finished rocket against the simulation.",
      );
    else if (ft === "headsup")
      add(
        "warn",
        "Flight type",
        "Heads-up",
        "Announce it as a heads-up flight so everyone on the field watches the launch.",
      );
    if (complex)
      add(
        "warn",
        "Complex rocket",
        st.three ? "Three-stage" : st.staged ? "Two-stage" : "Cluster",
        `${st.staged ? "Staged" : "Clustered"} rockets need larger distances from the pad than single-motor rockets of the same total impulse, and are usually flown heads-up.`,
      );
  }
  // motor fit
  {
    const fit = motorFit(m, D, false);
    if (!fit && m.dia > D.diameter * 0.9)
      add("bad", "Motor fit", `${Math.round(m.dia * 1000)} mm`, "Wider than the airframe allows.");
    else if (fit)
      add(
        fit.status === "ok" ? "good" : fit.status === "small" ? "warn" : "bad",
        "Motor fit",
        `${fit.motor} mm in ${fit.mount} mm`,
        fit.status === "ok"
          ? "Fits the motor mount."
          : fit.status === "small"
            ? `Needs a ${fit.motor}-to-${fit.mount} mm adapter.`
            : "Won't fit the motor mount.",
      );
  }
  return c;
}
/* certification scope (NAR and Tripoli): no certification = model rockets (F and G at most, under the model rocket limits);
   Level 1 = H and I (160.01–640 N·s); Level 2 = J, K and L (640.01–5,120 N·s); Level 3 = M, N and O (5,120.01–40,960 N·s).
   A single motor is judged by its certified (labeled) class; a cluster or staged rocket also by the combined impulse of all its motors. */
/**
 * The biggest motor class each certification level allows, and the levels' names.
 */
export const CERT_NAME = { none: "No certification", L1: "Level 1", L2: "Level 2", L3: "Level 3" };
/**
 * Whether the flyer's certification covers the motors (or, for an attempt, whether they suit it).
 * @param {object} st
 * @param {object} m motor
 * @param {object} [mb] booster motor
 * @param {string} cert "none", "L1", "L2" or "L3"
 * @param {boolean} attempt a certification attempt flight
 * @returns {{s:string, ok:boolean, val:string, why:string}}
 */
function certCheck(st, m, mb, cert, attempt) {
  /**
   * The single motors in a motor or cluster.
   */
  const expand = (x) => (!x ? [] : x.cluster && x.members ? x.members.flatMap((e) => Array(e.n).fill(e.m)) : [x]);
  const motors = [...expand(m), ...(st.staged ? expand(mb) : [])];
  /**
   * A motor's labeled class letter.
   */
  const lab = (x) => {
    const c = String(x.cn || x.name || "")
      .trim()
      .toUpperCase()
      .match(/^\d*([A-O])\d/);
    return c ? c[1] : impulseLetter(motorStats(x).I);
  };
  const L = "ABCDEFGHIJKLMNOP",
    I = motors.reduce((a, x) => a + motorStats(x).I, 0),
    multi = motors.length > 1;
  const top = motors.reduce((a, x) => (L.indexOf(lab(x)) > L.indexOf(a) ? lab(x) : a), "A");
  // the class that sets the level: the biggest single motor's label, or for several motors their combined impulse
  const need = multi && L.indexOf(impulseLetter(I)) > L.indexOf(top) ? impulseLetter(I) : top;
  /**
   * The certification level a class needs.
   */
  const lvl = (c) =>
    L.indexOf(c) <= L.indexOf("G")
      ? "none"
      : L.indexOf(c) <= L.indexOf("I")
        ? "L1"
        : L.indexOf(c) <= L.indexOf("L")
          ? "L2"
          : L.indexOf(c) <= L.indexOf("O")
            ? "L3"
            : "beyond";
  let req = lvl(need);
  const why = [];
  // without a certification, model-rocket limits apply too (NFPA 1122 / NAR): 320 N·s in all, under 80 N average thrust, 125 g of propellant, 1,500 g at liftoff
  if (req === "none") {
    if (I > 320) why.push(`more than 320 N·s in total (${Math.round(I)} N·s)`);
    const hot = motors.find((x) => motorStats(x).avg > 80);
    if (hot) why.push(`the ${hot.cn || hot.name} averages over 80 N of thrust`);
    const prop = motors.reduce((a, x) => a + (x.propMass || 0), 0);
    if (prop > 0.125) why.push(`${Math.round(prop * 1000)} g of propellant (over 125 g)`);
    if (st.liftMass > 1.5) why.push(`a liftoff weight of ${fmt(st.liftMass, "mass")} ${uname("mass")} (over 1,500 g)`);
    if (why.length) req = "L1";
  }
  const rank = { none: 0, L1: 1, L2: 2, L3: 3, beyond: 4 },
    ok = rank[req] <= rank[cert];
  // a certification flight is flown one level up, on a motor of that level's classes
  if (attempt) {
    const tgt = { none: "L1", L1: "L2", L2: "L3" }[cert];
    const val0 = multi ? `${need} · ${motors.length} motors, ${Math.round(I)} N·s` : `${top} · ${Math.round(I)} N·s`;
    if (!tgt)
      return {
        s: "warn",
        ok: true,
        val: val0,
        why: "Level 3 is the highest certification; this is a regular flight for you.",
      };
    const cls = { L1: "H or I", L2: "J, K or L", L3: "M, N or O" }[tgt],
      aCls = { L1: "an H or I", L2: "a J, K or L", L3: "an M, N or O" }[tgt],
      have = lvl(need); // the motor's class decides, not the model-rocket weight or thrust rules
    if (rank[have] === rank[tgt])
      return {
        s: "good",
        ok: true,
        val: val0,
        why: `Right class for a ${CERT_NAME[tgt]} attempt (${cls}). It must be witnessed by your club's certification team, and the rocket must be recovered undamaged and fit to fly again.`,
      };
    if (rank[have] < rank[tgt])
      return {
        s: "warn",
        ok: true,
        val: val0,
        why: `Too small for a ${CERT_NAME[tgt]} attempt: that needs ${aCls} motor${multi ? " (or motors totalling that class)" : ""}.`,
      };
    return {
      s: "bad",
      ok: false,
      val: val0,
      why: `Too big for a ${CERT_NAME[tgt]} attempt: it must be flown on ${aCls} motor.`,
    };
  }
  const val = multi ? `${need} · ${motors.length} motors, ${Math.round(I)} N·s` : `${top} · ${Math.round(I)} N·s`;
  const reqName = req === "beyond" ? "more than Level 3 allows" : req === "none" ? "no certification" : CERT_NAME[req];
  let txt;
  if (ok)
    txt = `${CERT_NAME[cert]} covers ${cert === "none" ? "model rockets: G and smaller, up to 320 N·s in all" : cert === "L1" ? "H and I motors (160–640 N·s)" : cert === "L2" ? "J, K and L motors (640–5,120 N·s)" : "M, N and O motors (5,120–40,960 N·s)"}${multi ? ", counting all motors together" : ""}.`;
  else
    txt = `This flight needs ${reqName}${why.length ? ": " + why.join(", ") : multi ? ` (the motors together are ${need} class)` : ` (${top} class)`}. Fly it only as a certification attempt under NAR or Tripoli rules, or have a qualified flier fly it.`;
  return { s: ok ? "good" : "bad", ok, val, why: txt };
}
/**
 * The impulse class letter of a total impulse.
 * @param {number} I N·s
 * @returns {string}
 */
export function impulseLetter(I) {
  const c = "ABCDEFGHIJKLMNOP";
  let lim = 2.5;
  for (let i = 0; i < c.length; i++) {
    if (I <= lim + 1e-6) return c[i];
    lim *= 2;
  }
  return "P+";
}
// the checklist starts folded up, showing just its summary; a tap opens it (and it stays open until it's tapped again)
var rsoOpen = false;
/**
 * Opens or folds the checklist.
 * @param {boolean} o
 */
function rsoSetOpen(o) {
  rsoOpen = o;
  const t = document.getElementById("rsotog"),
    l = document.getElementById("rsolist"),
    m = document.getElementById("rsomore");
  if (t) t.setAttribute("aria-expanded", String(o));
  if (l) l.hidden = !o;
  if (m) m.textContent = o ? "Hide checks" : "Show checks";
}
/**
 * Shows the motor temperature beside its folded title.
 *
 * motor temperature (Motor tab) starts folded up; its value shows beside the title
 */
export function mtSummary() {
  const e = document.getElementById("mtsum");
  if (e) {
    const v = L.motorDT || 0;
    e.textContent = Math.abs(v) < 1e-9 ? "" : `${v > 0 ? "+" : "−"}${fmt(Math.abs(v), "dtemp")} ${uname("dtemp")}`;
  }
}
/**
 * Names the imperfections that are switched on in their folded header.
 *
 * the folded Imperfections header names any that are switched on
 */
function imperfSum() {
  const e = document.getElementById("imperfsum");
  if (!e) return;
  const open = document.getElementById("imperfbody") && !document.getElementById("imperfbody").hidden;
  const on = [
    L.thrustMis ? `thrust ${+L.thrustMis}°` : "",
    L.finMis ? `fin ${+L.finMis}°` : "",
    L.cgOff ? `CG offset` : "",
    L.clusterFail === true || L.clusterFail === "true" ? "motor out" : "",
  ].filter(Boolean);
  e.textContent = open || !on.length ? "" : on.join(", ");
}
/**
 * Draws the RSO checklist from the last run.
 */
export function renderRSO() {
  const P = document.getElementById("rsopanel");
  if (!P) return;
  if (!lastSim) {
    P.hidden = true;
    return;
  }
  const { st, m, D } = lastSim,
    S = lastSim.SS || lastSim.S;
  const LL = Object.assign({}, lastSim.L || L);
  RANGE_KEYS.forEach((k) => {
    LL[k] = L[k];
  }); // the range settings are read live
  // a motor above the flier's certification makes this a certification flight (once per motor choice, so it can be changed back)
  if (PROFILE.cert) {
    const c = certCheck(st, m, lastSim.mb, PROFILE.cert, false),
      key = [m.id, lastSim.mb && lastSim.mb.id, PROFILE.cert].join("|");
    if (!c.ok && L.flightType !== "cert" && L.ftAutoKey !== key) {
      L.flightType = "cert";
      L.ftAutoKey = key;
      LL.flightType = "cert";
      store.set("rfs-launch", L);
      const sel = document.getElementById("f-flightType");
      if (sel) {
        sel.value = "cert";
        sel.dataset.shown = "cert";
      }
      prToast("Motor is above your certification: flight type set to Certification.");
      try {
        siteRender();
      } catch (e) {}
    }
  }
  const list = rsoChecks(st, S, m, D, LL);
  const n = { good: 0, warn: 0, bad: 0 };
  list.forEach((x) => n[x.s]++);
  document.getElementById("rsosum").innerHTML =
    (n.bad ? `<span class="bad">${n.bad} to fix</span>` : "") +
    (n.warn ? `<span class="warn">${n.warn} to check</span>` : "") +
    (!n.bad && !n.warn ? `<span class="good">All clear</span>` : `<span class="good">${n.good} OK</span>`);
  const ic = { good: "✓", warn: "!", bad: "✕" };
  document.getElementById("rsolist").innerHTML = list
    .map(
      (x) =>
        `<div class="rso ${x.s}"><span class="ic" aria-label="${x.s === "good" ? "OK" : x.s === "warn" ? "Check" : "Fix"}">${ic[x.s]}</span><b>${esc(x.label)}</b><span class="val">${esc(x.val)}</span><span class="why">${esc(x.why)}</span></div>`,
    )
    .join("");
  rsoSetOpen(rsoOpen);
  P.hidden = false;
}
/**
 * The results flags: stability, rail exit speed, tumbling, deployment speed, landing...
 * @param {object} st
 * @param {object} S
 * @param {object} m motor
 * @param {object} D design
 * @returns {Array[]} [status, text]
 */
export function resultFlags(st, S, m, D) {
  const flags = [];
  if (st.error) flags.push(["bad", st.error]);
  if (st.tumble)
    flags.push([
      "bad",
      `The rocket is unstable and tumbles end over end ${st.tumble.t - (st.offRailT || 0) < 0.6 ? "right after leaving the rail" : `at ${fmt(st.tumble.alt, "alt")} ${uname("alt")}`}${st.tumble.powered ? ", with the motor still burning" : ""}. It won't reach a useful altitude and may come in fast or sideways. ${(() => {
        const nw = typeof nosePlan === "function" ? nosePlan(st, S) : null;
        return nw && nw.cal > 0 && isFinite(nw.cal)
          ? `Add ${noseWeightText(nw.cal)} at mid-nose for 1 caliber, or bigger fins.`
          : "Add nose weight or bigger fins.";
      })()}`,
    ]);
  else {
    const orv = st.offRail || 0;
    flags.push(
      orv >= 15.24
        ? ["good", `Off-rail speed OK (≥ ${fmt(15.24, "speed", 0)} ${uname("speed")})`]
        : [
            "bad",
            `Slow off the rail: ${fmt(orv, "speed")} ${uname("speed")} with an average thrust-to-weight of ${st.avgTtw.toFixed(1)}:1. Use a longer rail or a higher-thrust motor.`,
          ],
    );
    flags.push(
      S.marginL >= 1.5
        ? ["good", st.staged ? "Stack stable at liftoff" : "Stable at liftoff"]
        : S.marginL >= 1
          ? ["warn", `Marginal stability (${S.marginL.toFixed(2)} cal)`]
          : ["bad", `Unstable or near-unstable (${S.marginL.toFixed(2)} cal). Add nose weight.`],
    );
    const tiltTxt =
      st.burnTilt != null
        ? `, and it is ${st.burnTilt.toFixed(0)}° from vertical at ${st.staged ? "sustainer " : ""}burnout`
        : "";
    if (st.tumble) {
      // the tumble warning covers it; weathercocking numbers mean nothing once the rocket goes end over end
    } else if (st.maxAoA > 20)
      flags.push([
        "bad",
        `Strong weathercocking: the crosswind meets the rocket at up to ${st.maxAoA.toFixed(0)}° just after it leaves the rail${tiltTxt}. Use a longer rail or a faster motor, or wait for less wind.`,
      ]);
    else if (st.maxAoA > 10)
      flags.push([
        "warn",
        `Noticeable weathercocking: up to ${st.maxAoA.toFixed(0)}° angle of attack off the rail${tiltTxt}.`,
      ]);
    {
      const cone = (lastSim && lastSim.L ? lastSim.L.cone : L.cone) ?? 20;
      if (st.powerTilt != null && !st.tumble)
        flags.push(
          st.powerTilt <= cone
            ? [
                "good",
                `Stays inside the ${cone}° safety cone under power (up to ${st.powerTilt.toFixed(0)}° from vertical)`,
              ]
            : [
                "bad",
                `Leaves the ${cone}° safety cone under power: ${st.powerTilt.toFixed(0)}° from vertical while the motor is still burning. A low, fast flight path can reach spectators or the parking area. Wait for less wind, use a faster motor or longer rail, or reduce the rail angle.`,
              ],
        );
    }
    if (st.noChute)
      flags.push([
        "bad",
        `No parachute or streamer: the rocket comes down tumbling at about ${st.tumbleRate ? fmt(st.tumbleRate, "speed") : "—"} ${uname("speed")}. Add recovery under the Rocket tab.`,
      ]);
    else if (st.noDeploy)
      flags.push([
        "bad",
        st.plugSkip
          ? "The chute is set to open at the motor ejection charge, but the motor is plugged (Motor tab, Motor Delay): nothing opens and the rocket comes down ballistic."
          : st.depMode === "motor" && st.ignAfterApogee
            ? "The sustainer never lights, so its ejection charge never fires and the chute stays packed."
            : "The rocket hits the ground before the chute opens.",
      ]);
    else if (st.plugSkip)
      flags.push([
        "bad",
        `The drogue is set to open at the motor ejection charge, but the motor is plugged (Motor tab, Motor Delay): it stays packed and the rocket falls ballistic from apogee until the main opens at ${fmt(st.altDeploy ?? 0, "alt")} ${uname("alt")}, at ${fmt(st.vDeploy ?? 0, "speed")} ${uname("speed")}.`,
      ]);
    else if (st.tDeploy != null && st.tApo != null && (st.depMode !== "apogee" || st.depDelay > 0)) {
      const dt = st.tDeploy - (st.tApoFree ?? st.tApo),
        v = st.vDeploy;
      const when =
        Math.abs(dt) < 0.1
          ? "at apogee"
          : dt < 0
            ? `${(-dt).toFixed(1)} s before apogee`
            : `${dt.toFixed(1)} s after apogee`;
      if (Math.abs(dt) <= 1.5) flags.push(["good", `Chute opens ${when} at ${fmt(v, "speed")} ${uname("speed")}`]);
      else
        flags.push([
          v > 30 ? "bad" : "warn",
          `Chute opens ${when}, at ${fmt(v, "speed")} ${uname("speed")}${dt > 0 ? ` and ${fmt(st.maxAlt - st.altDeploy, "alt")} ${uname("alt")} below apogee` : ""}. ${st.depMode === "motor" ? "Use a delay closer to the ideal motor delay for apogee." : "Adjust the timing."}`,
        ]);
    }
    if (st.ejLive && !st.noChute) flags.push(ejLiveFlag(st));
    for (const [b, nm] of [
      [st.booster, "booster"],
      [st.first, "first stage"],
    ])
      if (b && b.ejLive) flags.push(ejLiveFlag({ ejLive: b.ejLive }, nm));
    // roll lock-in (roll resonance): the roll rate at the pitch frequency
    if (st.rollLock && st.rollLock.dur >= 0.25)
      flags.push([
        st.rollLock.dur >= 0.6 && st.rollLock.v > 30 ? "bad" : "warn",
        `Roll lock-in risk: the roll rate stays near the rocket’s pitch frequency (${st.rollLock.f.toFixed(1)} Hz) for ${st.rollLock.dur.toFixed(1)} s from T+${st.rollLock.t.toFixed(1)} s, at ${fmt(st.rollLock.v, "speed")} ${uname("speed")}. Any small fin misalignment or mass imbalance is then driven into a growing coning motion that costs altitude and can damage the rocket. Change the fin cant so the roll rate stays well away from the pitch frequency.`,
      ]);
    else if (st.rollCross)
      flags.push([
        "warn",
        `The roll rate passes through the pitch frequency (${st.rollCross.f.toFixed(1)} Hz) at T+${st.rollCross.t.toFixed(1)} s, at ${fmt(st.rollCross.v, "speed")} ${uname("speed")}. A quick pass like this is usually harmless; lingering there is what causes roll lock-in.`,
      ]);
    if (st.avgTtw < 5)
      flags.push(["warn", `Average thrust-to-weight is ${st.avgTtw.toFixed(1)}:1, below the usual 5:1 minimum`]);
    if (lastSim && lastSim.L && lastSim.L.wind > 8.95)
      flags.push(["bad", `Wind above 20 mph. The NFPA 1127 high-power safety code prohibits launching.`]);
    if (st.maxMach > 5)
      flags.push([
        "warn",
        `Flies at Mach ${st.maxMach.toFixed(1)}. Above Mach 5 the drag has no measurements to check it against (the methods are carried up from lower speeds), and the heating of the air around the rocket isn’t modeled. Treat the apogee as a rough estimate.`,
      ]);
    else if (st.maxMach > 2)
      flags.push([
        "warn",
        `Flies at Mach ${st.maxMach.toFixed(1)}. Above Mach 2 the estimates are less certain: fin lift and drag come from linear supersonic theory, and aerodynamic heating isn’t modeled.`,
      ]);
    else if (st.maxMach > 0.8) flags.push(["warn", "Transonic flight. Drag estimate is less reliable above Mach 0.8."]);
    // barometric altimeters and the pressure jump near Mach 1
    if (st.mach08 != null && !st.noChute && (st.depMode !== "motor" || !st.single)) {
      const end = Math.ceil(st.mach08end + 1);
      flags.push([
        "warn",
        `Barometric altimeters can be fooled by the pressure jump near Mach 1 and fire a charge early. The rocket is above Mach 0.8 from T+${st.mach08.toFixed(1)} to T+${st.mach08end.toFixed(1)} s; set the altimeter’s Mach lockout (or apogee lockout) to at least ${end} s after liftoff.`,
      ]);
    }
    // aerodynamic heating
    if (st.maxT0 && st.maxT0.T - 273.15 >= 80) {
      const c = st.maxT0.T - 273.15;
      flags.push([
        c >= 150 ? "bad" : "warn",
        `Aerodynamic heating: the air stopped at the nose tip reaches about ${fmt(c, "temp", 0)} ${uname("temp")} at Mach ${st.maxT0.M.toFixed(1)}. Many laminating epoxies soften around 60–120 °C (140–250 °F); the nose tip and fin leading edges heat first. How hot the parts actually get depends on how long the rocket stays fast.`,
      ]);
    }
    // recovery loads
    for (const [k, nm] of [
      ["shockD", "drogue"],
      ["shockM", st.single ? "parachute" : "main"],
    ]) {
      const o = st[k];
      if (o && o.g >= 25)
        flags.push([
          o.g >= 50 ? "bad" : "warn",
          `Hard ${nm} opening: about ${fmt(o.F, "force", 0)} ${uname("force")} (${o.g.toFixed(0)} g on the airframe) as it fills at ${fmt(o.v, "speed")} ${uname("speed")}. Check the shock cord, quick links and anchors are rated well above this, or open it at a lower speed.`,
        ]);
    }
    // staging lockout
    if (st.ignLocked)
      flags.push([
        "bad",
        `The sustainer was locked out and didn't light: at T+${st.ignLocked.t.toFixed(1)} s it was ${st.ignLocked.why === "alt" ? `only ${fmt(st.ignLocked.alt, "alt")} ${uname("alt")} up` : `tilted ${st.ignLocked.tilt.toFixed(0)}° from vertical`}, outside the lockout set on the Range tab.`,
      ]);
    if (st.rarefied)
      flags.push([
        "warn",
        `Goes above about 85 km (279,000 ft). The air there is so thin it no longer behaves as a continuous gas, so drag and stability numbers above that height don’t mean much; drag is negligible there anyway.`,
      ]);
    // leaving the rail in this wind, with body lift moving the CP forward at that angle
    if (st.railMargin != null && !st.tumble && S.marginL >= 1) {
      if (st.railMargin < 0)
        flags.push([
          "warn",
          `Unstable for a moment leaving the rail in this wind: at ${st.railAoA.toFixed(0)}° to the airflow the margin is ${st.railMargin.toFixed(2)} cal. The simulated flight recovers as it speeds up, but a gust or a slower start could tip it over. A longer rail, a faster motor, nose weight or less wind helps.`,
        ]);
      else if (st.railMargin < 1)
        flags.push([
          "warn",
          `Stability leaving the rail drops to ${st.railMargin.toFixed(2)} cal at ${st.railAoA.toFixed(0)}° to the airflow in this wind.`,
        ]);
    }
    // stability on the way up, with the CP moving as the fins lose lift at high Mach
    if (st.minMargin && !st.tumble && S.marginL >= 1) {
      const mm = st.minMargin,
        why =
          mm.M > 1
            ? "as the fins lose lift at supersonic speed"
            : mm.M > 0.8
              ? "through the transonic range"
              : "as the CG and CP shift during the climb";
      if (mm.cal < 0)
        flags.push([
          "bad",
          `Goes unstable at Mach ${mm.M.toFixed(2)} (T+${mm.t.toFixed(1)} s): the stability margin falls to ${mm.cal.toFixed(2)} cal ${why}. Add nose weight or larger fins.`,
        ]);
      else if (mm.cal < 1)
        flags.push([
          "warn",
          `Stability drops to ${mm.cal.toFixed(2)} cal at Mach ${mm.M.toFixed(2)} (T+${mm.t.toFixed(1)} s), ${why}.`,
        ]);
    }
    // fin flutter (rough estimate, NACA TN 4197)
    if (st.flutter && st.flutter.ratio >= 0.8) {
      const f = st.flutter,
        matTxt = f.mat
          ? `${f.mat} (shear modulus about ${(f.G / 1e9).toFixed(1)} GPa)`
          : `material judged from its density (shear modulus about ${(f.G / 1e9).toFixed(1)} GPa)`;
      flags.push([
        f.ratio >= 1 ? "bad" : "warn",
        `${f.ratio >= 1 ? "Fin flutter likely" : "Close to fin flutter"}: at T+${f.t.toFixed(1)} s the airspeed is ${Math.round(f.ratio * 100)}% of the estimated flutter speed (${fmt(f.vf, "speed")} ${uname("speed")} at ${fmt(f.alt, "alt")} ${uname("alt")}), for fins of ${matTxt}. This is a rough, conservative estimate; thicker fins, a stiffer material, a smaller span or tip-to-tip reinforcement raise the flutter speed.`,
      ]);
    }
    if (st.mainRate && st.mainRate > 6.7)
      flags.push([
        "warn",
        `${st.single ? "Descent" : "Main descent"} is fast (${fmt(st.mainRate, "speed")} ${uname("speed")}). ${st.single ? "Consider a larger parachute." : "Consider a larger main."}`,
      ]);
    if (!motorFit(m, D, false) && m.dia > D.diameter * 0.9)
      flags.push([
        "bad",
        st.staged
          ? "The sustainer motor is wider than the sustainer allows."
          : "This motor is wider than the airframe allows.",
      ]);
    for (const [mm, bb, who] of [
      [curMotor(), false, st.staged ? "sustainer " : ""],
      ...(st.staged ? [[curBoost(), true, "booster "]] : []),
    ]) {
      const fit = motorFit(mm, D, bb);
      if (!fit) continue;
      if (fit.status === "big")
        flags.push([
          "bad",
          `The ${mm.cn || mm.name} (${fit.motor} mm) won't fit the ${fit.mount} mm ${who}motor mount.`,
        ]);
      else if (fit.status === "small")
        flags.push([
          "warn",
          `The ${mm.cn || mm.name} (${fit.motor} mm) is smaller than the ${fit.mount} mm ${who}motor mount. Fly it with a ${fit.motor}-to-${fit.mount} mm motor adapter.`,
        ]);
    }
    if (st.staged) {
      const mb = lastSim && lastSim.mb,
        SU = lastSim && lastSim.S;
      if (mb && mb.dia > D.bDiameter * 0.9) flags.push(["bad", "The booster motor is wider than the booster allows."]);
      if (st.ignAfterApogee) flags.push(["bad", "The sustainer would light after apogee. Shorten the ignition delay."]);
      else if (st.ign) {
        const tl = st.ign.tilt;
        flags.push(
          tl > 30
            ? [
                "bad",
                `The rocket is ${tl.toFixed(0)}° from vertical when the sustainer lights. Tilt lockouts are usually set at 20–30°.`,
              ]
            : tl > 20
              ? [
                  "warn",
                  `The rocket is ${tl.toFixed(0)}° from vertical when the sustainer lights. Check your altimeter’s tilt lockout.`,
                ]
              : ["good", `Tilt at sustainer ignition ${tl.toFixed(0)}°`],
        );
      }
      if (SU)
        flags.push(
          SU.marginL >= 1.5
            ? ["good", "Sustainer stable after separation"]
            : SU.marginL >= 1
              ? ["warn", `Sustainer is marginally stable alone (${SU.marginL.toFixed(2)} cal)`]
              : ["bad", `Sustainer is unstable alone (${SU.marginL.toFixed(2)} cal). Add nose weight.`],
        );
    }
  }
  return flags;
}
/**
 * The wind table rows from the last run.
 * @returns {object[]}
 */
export function windRows() {
  const { windTable, L: RL } = lastSim;
  return windTable.map((r) => ({
    wind: `${fmt(r.w, "wind", 0)} ${uname("wind")}`,
    apo: r.error ? "—" : `${fmt(r.apo, "alt")} ${uname("alt")}`,
    land: r.error || !r.landed ? "—" : `${fmt(Math.hypot(r.drift, r.driftY || 0), "alt")} ${uname("alt")}`,
    landBig: r.error || !r.landed ? "" : bigDist(r.drift, r.driftY),
    dir: r.error ? "Doesn't leave the rail" : driftDir(r.drift, r.driftY) || "at the pad",
    tilt: r.error || r.powerTilt == null ? "—" : `${r.powerTilt.toFixed(0)}°`,
    outCone: !r.error && r.powerTilt > (RL.cone ?? 20),
    current: Math.abs(r.w - RL.wind) < 0.05,
    over: r.w > 8.95,
  }));
}
/**
 * The text under the wind table: the wind profile and what the rows assume.
 * @returns {string}
 */
function windExplain() {
  const RL = lastSim.L,
    st = lastSim.st;
  const prof = {
    typical: "Wind grows with height using the 1/7 power law for open ground",
    shear: "Wind grows with height using a 0.25 power law, typical of calm mornings and evenings",
    constant: "Wind is the same at every altitude",
  }[RL.windProfile || "typical"];
  const aloft =
    st.windApo != null && RL.windProfile !== "constant"
      ? ` With your ${fmt(RL.wind, "wind")} ${uname("wind")} at the pad, that's about ${fmt(st.windApo, "wind")} ${uname("wind")} at apogee.`
      : "";
  return `${prof}, measured at ${fmt(RL.windRef || 2, "alt", 0)} ${uname("alt")}.${aloft} The wind blows from the ${compass(RL.windDir ?? 270)}. ${RL.railMode === "fixed" ? `The rail leans toward the ${compass(RL.railDir || 0)}.` : "The rail leans into the wind, so light winds can land the rocket upwind of the pad."}${RL.turb > 0 ? ` Gusts vary the wind by about ${(RL.turb * 100).toFixed(0)}% (RMS), the same pattern every run.` : ""}`;
}
/**
 * Draws the wind table.
 */
export function renderWindTable() {
  const el = document.getElementById("windtable");
  if (!el || !lastSim) return;
  const rows = windRows();
  el.innerHTML = `<table><thead><tr><th>Wind</th><th>Apogee</th><th>Tilt, powered</th><th>Landing</th></tr></thead><tbody>${rows.map((r) => `<tr${r.current ? ' class="cur"' : ""}><td>${r.wind}${r.over ? ' <span class="over">over limit</span>' : ""}</td><td>${r.apo}</td><td${r.outCone ? ' class="outcone"' : ""}>${r.tilt}</td><td>${r.land}<span class="big">${r.dir}${r.landBig && /^[0-9.]+/.test(r.landBig) && parseFloat(r.landBig) >= 0.1 ? " · " + r.landBig : ""}</span></td></tr>`).join("")}</tbody></table>`;
  document.getElementById("windnote").textContent = windExplain() + " " + coneWindNote();
}
/**
 * The chart series: [label, dimension].
 */
export const SERIES = {
  alt: ["Altitude", "alt"],
  vel: ["Velocity", "speed"],
  acc: ["Acceleration", "acc"],
  thrust: ["Thrust", "force"],
  drift: ["Drift", "alt"],
  pitch: ["Pitch", "deg"],
  aoa: ["AoA", "deg"],
  cone: ["Cone", "alt"],
  land: ["Landing", "alt"],
};
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("rsotog").onclick = () => rsoSetOpen(!rsoOpen);
  // the dispersion figures start folded up as well
  document.getElementById("mctog").onclick = () => {
    const t = document.getElementById("mctog"),
      o = t.getAttribute("aria-expanded") !== "true";
    t.setAttribute("aria-expanded", String(o));
    document.getElementById("mcbody").hidden = !o;
    t.textContent = o ? "Hide results" : "Show results";
  };
  // panels that start folded: a Show/Hide button with data-fold naming the part it opens
  document.querySelectorAll("[data-fold]").forEach(
    (b) =>
      (b.onclick = () => {
        const o = b.getAttribute("aria-expanded") !== "true",
          body = document.getElementById(b.dataset.fold);
        b.setAttribute("aria-expanded", String(o));
        if (body) body.hidden = !o;
        b.textContent = o ? "Hide" : "Show";
        if (o && b.dataset.fold === "dragbody" && typeof renderDragTable === "function") renderDragTable();
        if (typeof imperfSum === "function") imperfSum();
      }),
  );
  document.getElementById("imperfpanel").addEventListener("input", () => setTimeout(imperfSum, 0));
  document.getElementById("imperfpanel").addEventListener("change", () => setTimeout(imperfSum, 0));
  imperfSum();
  document.getElementById("mttog").onclick = () => {
    const t = document.getElementById("mttog"),
      o = t.getAttribute("aria-expanded") !== "true";
    t.setAttribute("aria-expanded", String(o));
    document.getElementById("mtbody").hidden = !o;
    t.textContent = o ? "Hide" : "Show";
  };
  document.getElementById("motortemppanel").addEventListener("input", () => setTimeout(mtSummary, 0));
  mtSummary();
  // the drift table starts folded up too
  document.getElementById("windtog").onclick = () => {
    const t = document.getElementById("windtog"),
      o = t.getAttribute("aria-expanded") !== "true";
    t.setAttribute("aria-expanded", String(o));
    document.getElementById("windbody").hidden = !o;
    document.getElementById("windmore").textContent = o ? "Hide table" : "Show table";
  };
}
