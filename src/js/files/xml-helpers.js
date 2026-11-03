/* --- small XML helpers --- */
const kidOf = (el, t) => [...el.children].find((c) => c.tagName === t);
const txtOf = (el, t) => {
  const c = kidOf(el, t);
  return c ? c.textContent.trim() : null;
};
const numStr = (v) => String(+(+v).toPrecision(10));
function setKid(el, t, v) {
  let c = kidOf(el, t);
  if (!c) {
    c = el.ownerDocument.createElementNS(el.namespaceURI, t);
    const end = kidOf(el, "subcomponents") || kidOf(el, "AttachedParts");
    el.insertBefore(c, end || null);
  }
  c.textContent = typeof v === "number" ? numStr(v) : String(v);
  return c;
}
function delKid(el, t) {
  [...el.children].filter((c) => c.tagName === t).forEach((c) => c.remove());
}
function renameEl(el, tag, drop) {
  const ne = el.ownerDocument.createElementNS(el.namespaceURI, tag);
  for (const a of [...el.attributes]) ne.setAttribute(a.name, a.value);
  for (const c of [...el.childNodes]) {
    if (c.nodeType === 1 && drop.includes(c.tagName)) continue;
    ne.appendChild(c);
  }
  el.replaceWith(ne);
  return ne;
}
function srcLists(doc, format) {
  if (format === "ork") {
    const rocket = doc.querySelector("openrocket > rocket") || doc.getElementsByTagName("rocket")[0],
      all = [...rocket.getElementsByTagName("*")],
      f = (re) => all.filter((e) => re.test(e.tagName));
    return {
      rocket,
      fin: f(/^(trapezoid|elliptical|freeform)finset$/),
      chute: f(/^(parachute|streamer)$/),
      nosecone: f(/^nosecone$/),
      bodytube: f(/^bodytube$/),
      transition: f(/^transition$/),
      motor: f(/^motor$/),
      innertube: f(/^innertube$/),
      stage: [...(kidOf(rocket, "subcomponents") || rocket).children].filter((e) => e.tagName === "stage"),
      sims: [...doc.getElementsByTagName("simulation")],
    };
  }
  const design = doc.getElementsByTagName("RocketDesign")[0];
  const R = {
    rocket: design,
    fin: [],
    chute: [],
    nosecone: [],
    bodytube: [],
    transition: [],
    innertube: [],
    stage: [],
    sims: [...doc.getElementsByTagName("SimulationResults")],
  };
  const kids = (el) => {
    const ap = kidOf(el, "AttachedParts");
    return ap ? [...ap.children] : [];
  };
  // the same walk the .rkt importer makes, so the n-th part here is the n-th part it reported
  const visit = (el) => {
    const t = el.tagName;
    if (t === "SubAssembly") {
      kids(el).forEach(visit);
      return;
    }
    if (t === "NoseCone") {
      R.nosecone.push(el);
      kids(el).forEach(visit);
    } else if (t === "BodyTube") {
      (txtOf(el, "IsInsideTube") === "1" ? R.innertube : R.bodytube).push(el);
      kids(el).forEach(visit);
    } else if (t === "Transition") {
      R.transition.push(el);
      kids(el).forEach(visit);
    } else if (t === "FinSet" || t === "CustomFinSet") R.fin.push(el);
    else if (t === "Parachute" || t === "Streamer") R.chute.push(el);
  };
  const n = Math.max(1, parseFloat(txtOf(design, "StageCount")) || 1);
  for (const st of ["Stage3Parts", "Stage2Parts", "Stage1Parts"].slice(0, n)) {
    const e = kidOf(design, st);
    if (e) {
      R.stage.push(e);
      [...e.children].forEach(visit);
    }
  }
  return R;
}
const FINISH_NAME = (v) => {
  let best = "normal",
    bd = 1e9;
  for (const [k, x] of Object.entries(FINISH_RS)) {
    if (["roughunfinished", "finishpolished"].includes(k)) continue;
    const d = Math.abs(Math.log((x || 1e-7) / (v || 1e-7)));
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
};
