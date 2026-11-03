/**
 * Saving the builder's design over an OpenRocket file without losing what the builder doesn't keep (see the notes
 * below).
 */
/* ---------- saving over an OpenRocket file ----------
   The rocket is rewritten from the builder; anything the builder doesn't keep (part colors and decals, comments,
   other motor configurations and their deployment settings, simulations, photo settings) is carried over
   from the original file. */
/* ---------- saving into an OpenRocket file: a three-way merge ----------
   The builder's design is written as .ork twice: as it was when the file was opened (base) and as it is now (new).
   Only what differs between those two goes into the original file; everything else in it stays exactly as it was:
   fields the app doesn't use, "auto" sizes, positions measured from the middle, parts nested inside inner tubes,
   the order of parts, other flight configurations and parts the app can't show. */
/**
 * Three-way merge into the original document: what differs between base and new goes into the original.
 * @param {Document} od original document (changed in place)
 * @param {Element} oRocket original rocket
 * @param {Element} bRocket base rocket (the design as opened, written by the builder)
 * @param {Element} nRocket new rocket (the design now)
 * @param {string} cfg motor configuration id
 * @returns {{changed:boolean}}
 */
function orkMerge3(od, oRocket, bRocket, nRocket, cfg) {
  const K = (el) => [...el.children],
    tag = (el) => el.tagName;
  /**
   * A component's id.
   */
  const idOf = (el) => {
    const i = K(el).find((c) => tag(c) === "id");
    return i ? i.textContent.trim() : null;
  };
  /**
   * True for a component element.
   */
  const isComp = (el) => tag(el) !== "motormount" && !!idOf(el);
  /**
   * A component's subcomponents element, or null.
   */
  const subs = (el) => K(el).find((c) => tag(c) === "subcomponents") || null;
  /**
   * A component's child components.
   */
  const compKids = (el) => {
    const s = subs(el);
    return s ? K(s).filter(isComp) : [];
  };
  /**
   * Every component in a rocket by key, with its parent and order.
   *
   * the rocket itself is matched as the rocket, whatever its id
   */
  const index = (root) => {
    const m = new Map(),
      par = new Map();
    m.set("ROOT", root);
    const walk = (el, p) => {
      for (const c of compKids(el)) {
        const i = idOf(c);
        if (i && !m.has(i)) {
          m.set(i, c);
          par.set(i, p);
        }
        walk(c, i || p);
      }
    };
    walk(root, "ROOT");
    return { m, par };
  };
  /**
   * A component's key: its id, or ROOT for the rocket.
   */
  const keyOf = (el, root) => (el === root ? "ROOT" : idOf(el));
  const O = index(oRocket),
    B = index(bRocket),
    N = index(nRocket);
  // a file whose parts have no ids of their own (very old files) can't be matched part by part
  const known = [...B.m.keys()].filter((i) => i !== "ROOT" && O.m.has(i)).length;
  if (B.m.size > 1 && known < 0.6 * (B.m.size - 1)) return false;
  /**
   * An element as text, without namespace declarations.
   */
  const ser = (el) => (el ? new XMLSerializer().serializeToString(el).replace(/\s+xmlns="[^"]*"/g, "") : null);
  /**
   * An element's fields: its direct children (not its parts), keyed by name, configuration and repeat.
   *
   * an element's fields: its direct children (not its parts), keyed by name, flight configuration and repeat count
   */
  const fields = (el) => {
    const out = new Map(),
      n = {};
    for (const c of K(el)) {
      if (tag(c) === "subcomponents" || tag(c) === "id" || isComp(c)) continue;
      const k =
        tag(c) +
        (c.getAttribute("configid") ? "#" + c.getAttribute("configid") : "") +
        (c.getAttribute("model") ? "@" + c.getAttribute("model") : "");
      n[k] = (n[k] || 0) + 1;
      out.set(n[k] > 1 ? k + "~" + n[k] : k, c);
    }
    return out;
  };
  // settings OpenRocket keeps per flight configuration override the plain ones: a changed plain value goes into the flown configuration's copy too
  const PERCFG = {
    deploymentconfiguration: ["deployevent", "deployaltitude", "deploydelay"],
    separationconfiguration: ["separationevent", "separationdelay", "separationaltitude"],
    ignitionconfiguration: ["ignitionevent", "ignitiondelay"],
  };
  const NESTED = new Set(["motormount"]),
    NESTED_CFG = new Set(["motor"]);
  /**
   * An element copied into the original document.
   */
  const imp = (el) => od.importNode(el, true);
  /**
   * Writes the fields that changed between base and new into the original element.
   * @returns {boolean} true if anything changed
   */
  const mergeFields = (oEl, bEl, nEl) => {
    const fo = fields(oEl),
      fb = fields(bEl),
      fn = fields(nEl),
      keys = [...new Set([...fb.keys(), ...fn.keys()])];
    let changed = false;
    for (const k of keys) {
      const b = fb.get(k),
        n = fn.get(k),
        o = fo.get(k);
      if (ser(b) === ser(n)) continue; // not changed in the app: the file's own value stays
      changed = true;
      const t = k.split(/[#@~]/)[0];
      // containers are merged field by field too, so their own extra settings stay
      if (o && b && n && (NESTED.has(t) || NESTED_CFG.has(t))) {
        // a different motor: the old one's thrust-curve fingerprint no longer applies
        if (t === "motor") {
          const d = (x) =>
            (K(x).find((y) => tag(y) === "designation")?.textContent || "").trim() +
            "|" +
            (K(x).find((y) => tag(y) === "manufacturer")?.textContent || "").trim();
          if (d(b) !== d(n))
            K(o)
              .filter((y) => tag(y) === "digest")
              .forEach((y) => o.removeChild(y));
        }
        mergeFields(o, b, n);
        continue;
      }
      if (!n) {
        if (o) oEl.removeChild(o);
        continue;
      }
      const x = imp(n);
      if (o) oEl.replaceChild(x, o);
      // a part that moved: OpenRocket's old-style position entry would otherwise win over the new one
      if (t === "axialoffset")
        K(oEl)
          .filter((c) => tag(c) === "position")
          .forEach((c) => oEl.removeChild(c));
      else {
        // a field the file didn't have: where the new design puts it
        const sib = K(nEl),
          at = sib.indexOf(n);
        let ref = null;
        for (let j = at + 1; j < sib.length && !ref; j++) {
          const kk = [...fn.entries()].find((e) => e[1] === sib[j]);
          if (kk && fo.get(kk[0])) ref = fo.get(kk[0]);
          else if (tag(sib[j]) === "subcomponents") ref = subs(oEl);
        }
        oEl.insertBefore(x, ref && ref.parentNode === oEl ? ref : subs(oEl));
      }
      // the flown configuration's own copy of this setting
      if (cfg)
        for (const [ct, ks] of Object.entries(PERCFG))
          if (ks.includes(t)) {
            const cc = K(oEl).find((c) => tag(c) === ct && c.getAttribute("configid") === cfg);
            const f = cc && K(cc).find((c) => tag(c) === t);
            if (f) f.textContent = n.textContent;
          }
    }
    return changed;
  };
  let changed = false;
  // parts: deleted in the app → removed; changed → merged; moved → moved; added → inserted where the new design has them
  for (const [i, bEl] of B.m) {
    if (i === "ROOT") continue;
    if (!N.m.has(i) && O.m.has(i)) {
      const o = O.m.get(i);
      o.parentNode && o.parentNode.removeChild(o);
      changed = true;
    }
  }
  for (const [i, nEl] of N.m) {
    if (i === "ROOT") continue;
    const bEl = B.m.get(i),
      oEl = O.m.get(i);
    if (bEl && oEl) {
      if (tag(bEl) !== tag(nEl)) {
        // a different kind of part (say, a fin shape that's now free-form): the new one, with the file's looks and notes
        const x = imp(nEl);
        const keepT = new Set([
          "appearance",
          "insideappearance",
          "comment",
          "preset",
          "linestyle",
          "decal",
          "filletradius",
          "filletmaterial",
          "tabheight",
          "tablength",
          "tabposition",
          "tabrelativeto",
        ]);
        for (const c of K(oEl))
          if (keepT.has(tag(c)) && !K(x).some((y) => tag(y) === tag(c))) x.insertBefore(imp(c), subs(x));
        const os = subs(oEl),
          xs = subs(x);
        if (os && xs) {
          while (xs.firstChild) xs.removeChild(xs.firstChild);
          for (const c of K(os)) xs.appendChild(c);
        }
        oEl.parentNode.replaceChild(x, oEl);
        O.m.set(i, x);
        changed = true;
      } else if (mergeFields(oEl, bEl, nEl)) changed = true;
    }
  }
  /**
   * A component's subcomponents element, created if missing.
   *
   * structure: each part the app knows sits under the parent the new design gives it, in the new design's order;
   * parts the app doesn't know keep their place among their neighbours
   */
  const ensureSubs = (el) => {
    let s = subs(el);
    if (!s) {
      s = od.createElementNS(el.namespaceURI, "subcomponents");
      el.appendChild(s);
    }
    return s;
  };
  /**
   * Puts each part the app knows under the parent the new design gives it, in the new design's order.
   */
  const place = (nParent) => {
    const pid = keyOf(nParent, nRocket),
      oP = O.m.get(pid);
    if (!oP) return;
    const want = compKids(nParent)
      .map((c) => idOf(c))
      .filter(Boolean);
    const bOrder = B.m.get(pid) ? compKids(B.m.get(pid)).map((c) => idOf(c)) : [];
    const bParentOf = (i) => B.par.get(i);
    const sameKids =
      want.length === bOrder.length && want.every((x, j) => x === bOrder[j]) && want.every((x) => bParentOf(x) === pid);
    for (const i of want) {
      let el = O.m.get(i);
      if (!el) {
        el = imp(N.m.get(i));
        [...el.getElementsByTagName("subcomponents")].forEach((s) => {
          while (s.firstChild) s.removeChild(s.firstChild);
        });
        O.m.set(i, el);
        changed = true;
      } else if (bParentOf(i) === pid && B.m.has(i) && sameKids) continue; // untouched: stays exactly where it is in the file
      // placed after the part that comes before it in the new design (or first)
      const s = ensureSubs(oP),
        j = want.indexOf(i),
        prev = j > 0 ? O.m.get(want[j - 1]) : null;
      if (prev && prev.parentNode === s) {
        if (prev.nextElementSibling !== el) s.insertBefore(el, prev.nextSibling);
      } else if (j === 0) {
        const first = K(s).find(isComp);
        if (first !== el) s.insertBefore(el, first || null);
      } else if (el.parentNode !== s) s.appendChild(el);
      if (bParentOf(i) !== pid || !sameKids) changed = true;
    }
    for (const c of compKids(nParent)) place(c);
  };
  // the rocket element's own fields (configurations, reference length, designer…)
  if (mergeFields(oRocket, bRocket, nRocket)) changed = true;
  place(nRocket);
  return { changed };
}
/**
 * The text to save over an OpenRocket file: the three-way merge when the design as opened is known, else the
 * rocket rewritten with the original's other content carried over.
 * @param {string} origXml the original file
 * @param {string} newXml the design now, as .ork
 * @param {string} cfg motor configuration id
 * @param {object} Lnew launch conditions now
 * @param {object} Lold launch conditions as opened
 * @param {string} [baseXml] the design as opened, as .ork
 * @returns {string} XML
 */
function bldMergeOrk(origXml, newXml, cfg, Lnew, Lold, baseXml) {
  const P = new DOMParser(),
    od = P.parseFromString(origXml, "application/xml"),
    nd = P.parseFromString(newXml, "application/xml");
  const oRocket = od.querySelector("openrocket > rocket") || od.getElementsByTagName("rocket")[0],
    nRocket = nd.querySelector("openrocket > rocket") || nd.getElementsByTagName("rocket")[0];
  if (!oRocket || !nRocket) return newXml;
  let m3 = null;
  if (baseXml) {
    const bd = P.parseFromString(baseXml, "application/xml"),
      bRocket = bd.querySelector("openrocket > rocket") || bd.getElementsByTagName("rocket")[0];
    if (bRocket)
      try {
        m3 = orkMerge3(od, oRocket, bRocket, nRocket, cfg);
      } catch (e) {
        m3 = false;
      }
    // a merge that failed part way leaves nothing behind: start again from the file
    if (m3 === false) {
      return bldMergeOrk(origXml, newXml, cfg, Lnew, Lold, null);
    }
  }
  let rocketChanged = true;
  if (m3) {
    rocketChanged = m3.changed;
  } else {
    const kids = (el) => [...el.children],
      idOf = (el) => {
        const i = kids(el).find((c) => c.tagName === "id");
        return i ? i.textContent.trim() : null;
      };
    const byId = new Map();
    [oRocket, ...oRocket.getElementsByTagName("*")].forEach((e) => {
      const i = idOf(e);
      if (i && !byId.has(i)) byId.set(i, e);
    });
    // only what the builder doesn't manage is carried over: looks, notes, fin tabs and fillets, and other configurations
    const KEEP = new Set([
      "appearance",
      "insideappearance",
      "comment",
      "preset",
      "linestyle",
      "decal",
      "filletradius",
      "filletmaterial",
      "tabheight",
      "tablength",
      "tabposition",
      "tabrelativeto",
      "designer",
      "revision",
      "customreference",
      "photostudio",
    ]);
    const other = (e) => e.getAttribute("configid") && e.getAttribute("configid") !== cfg;
    const merge = (n, o) => {
      const have = new Set(kids(n).map((c) => c.tagName));
      for (const c of kids(o)) {
        const t = c.tagName;
        // settings for other flight configurations are kept; the one being flown comes from the builder
        if (
          [
            "deploymentconfiguration",
            "separationconfiguration",
            "ignitionconfiguration",
            "motorconfiguration",
          ].includes(t)
        ) {
          if (other(c)) n.appendChild(nd.importNode(c, true));
          continue;
        }
        if (t === "motormount" && have.has(t)) {
          const nm = kids(n).find((x) => x.tagName === "motormount"),
            nmHave = new Set(kids(nm).map((x) => x.tagName));
          for (const mc of kids(c)) {
            if (mc.tagName === "motor" || mc.tagName === "ignitionconfiguration") {
              if (other(mc)) nm.appendChild(nd.importNode(mc, true));
            }
            // same motor as before: keep its digest so OpenRocket picks the exact same thrust curve
            if (mc.tagName === "motor" && !other(mc)) {
              const t = (el, x) => (kids(el).find((y) => y.tagName === x)?.textContent || "").trim(),
                dg = kids(mc).find((y) => y.tagName === "digest");
              const nmo = kids(nm).find((y) => y.tagName === "motor" && !other(y));
              if (
                dg &&
                nmo &&
                !kids(nmo).some((y) => y.tagName === "digest") &&
                t(nmo, "designation") === t(mc, "designation") &&
                t(nmo, "manufacturer") === t(mc, "manufacturer")
              )
                nmo.insertBefore(nd.importNode(dg, true), kids(nmo).find((y) => y.tagName === "designation") || null);
            }
          }
          continue;
        }
        if (KEEP.has(t) && !have.has(t))
          n.insertBefore(nd.importNode(c, true), kids(n).find((x) => x.tagName === "subcomponents") || null);
      }
    };
    // the rocket itself (designer, revision, other motor configurations...)
    merge(nRocket, oRocket);
    // keep the original configuration's name and stage settings for the flown configuration
    const oCfg = kids(oRocket).find((c) => c.tagName === "motorconfiguration" && c.getAttribute("configid") === cfg),
      nCfg = kids(nRocket).find((c) => c.tagName === "motorconfiguration" && c.getAttribute("configid") === cfg);
    if (oCfg && nCfg) {
      const keep = nd.importNode(oCfg, true);
      nRocket.replaceChild(keep, nCfg);
    }
    for (const e of [...nRocket.getElementsByTagName("*")]) {
      const i = idOf(e);
      if (i && byId.has(i) && byId.get(i).tagName === e.tagName) merge(e, byId.get(i));
    }
    oRocket.parentNode.replaceChild(od.importNode(nRocket, true), oRocket);
  }
  let condChanged = false;
  // launch conditions the user changed go into the simulation that flies this configuration
  if (Lnew && Lold) {
    const sims = [...od.getElementsByTagName("simulation")],
      sim = sims.find((s) => s.getElementsByTagName("configid")[0]?.textContent.trim() === cfg) || sims[0];
    const c = sim && [...sim.children].find((x) => x.tagName === "conditions");
    const ch = (...k) => {
      const r = k.some((x) => JSON.stringify(Lnew[x]) !== JSON.stringify(Lold[x]));
      if (r) condChanged = true;
      return r;
    };
    const set = (el, t, v) => {
      let x = [...el.children].find((y) => y.tagName === t);
      if (!x) {
        x = od.createElementNS(el.namespaceURI, t);
        el.appendChild(x);
      }
      x.textContent = String(+(+v).toPrecision(10));
    };
    if (c) {
      if (ch("rail")) set(c, "launchrodlength", Lnew.rail);
      if (ch("angle")) set(c, "launchrodangle", Lnew.angle);
      if (ch("elev")) set(c, "launchaltitude", Lnew.elev);
      if (ch("lat")) set(c, "launchlatitude", Lnew.lat ?? 40);
      if (ch("wind")) set(c, "windaverage", Lnew.wind);
      if (ch("turb")) set(c, "windturbulence", Lnew.turb || 0);
      if (ch("windDir")) set(c, "winddirection", ((Lnew.windDir || 0) * Math.PI) / 180);
      if (ch("wind", "windDir", "turb")) {
        const w = [...c.children].find((e) => e.tagName === "wind" && e.getAttribute("model") === "average");
        if (w) {
          set(w, "speed", Lnew.wind);
          set(w, "direction", ((Lnew.windDir || 0) * Math.PI) / 180);
          set(w, "standarddeviation", Lnew.wind * (Lnew.turb || 0));
        }
      }
      if (ch("tempC", "elev")) {
        [...c.children].filter((e) => e.tagName === "atmosphere").forEach((e) => c.removeChild(e));
        const at = od.createElementNS(c.namespaceURI, "atmosphere");
        at.setAttribute("model", "extendedisa");
        c.insertBefore(at, [...c.children].find((e) => e.tagName === "timestep") || null);
        set(at, "basetemperature", Lnew.tempC + 273.15);
        set(at, "basepressure", 101325 * Math.pow(Math.max(1 - 2.25577e-5 * Lnew.elev, 0.01), 5.25588));
      }
      if (ch("railMode", "railDir")) {
        const t = [...c.children].find((e) => e.tagName === "launchintowind");
        if (t) t.textContent = Lnew.railMode !== "fixed" ? "true" : "false";
        if (Lnew.railMode === "fixed") set(c, "launchroddirection", Lnew.railDir);
      }
    }
  }
  // the rocket or its launch conditions changed, so saved flight results are out of date
  if (rocketChanged || condChanged)
    for (const s of od.getElementsByTagName("simulation")) s.setAttribute("status", "outdated");
  return new XMLSerializer().serializeToString(od);
}
/**
 * A RockSim part's id in the converted design: a fixed UUID from its place in the file.
 * @param {number} i
 * @returns {string}
 *
 * RockSim parts, numbered in file order; the importer gives each builder part the same number, so a save can find it again
 * a RockSim part's id in the converted design: a fixed UUID from its place in the file (OpenRocket needs UUIDs, and the same file always gets the same ids)
 */
function rktPartId(i) {
  return "00000000-0000-4000-8000-" + (0x52000000000 + (i | 0)).toString(16).padStart(12, "0");
}
/**
 * RockSim parts numbered in file order.
 * @param {Element} design
 * @returns {Map<Element, number>}
 */
function rktIndex(design) {
  const m = new Map();
  let i = 0;
  for (const e of design.getElementsByTagName("*")) if ([...e.children].some((c) => c.tagName === "Xb")) m.set(e, i++);
  return m;
}
