/**
 * The Rocket tab's Export CAD button: asks for the format (STEP, or STL with a fine or coarse mesh), builds the
 * rocket's outer surface (step-export.js) and saves it. The
 * solid modelling library (OpenCascade) is a separate, large script, step-kernel.js, loaded the first time the button
 * is used: from the app's own files in the Android app, and from next to the page in the web version.
 */
import { BLD } from "./builder-ui.js";
import { buildStep, buildStl } from "./step-export.js";
import { downloadsNS } from "../report/pdf-report.js";
import { fmt, uname } from "../ui/units.js";
/** the kernel script's name: it sits next to the page (web) or in the app's assets (Android) */
const STEP_KERNEL_FILE = "step-kernel.js";
/** the loading of the kernel, once started */
let stepKernelLoad = null;
/**
 * Loads the solid modelling library.
 * @returns {Promise<object>} the replicad module, ready to use
 */
function stepLoadKernel() {
  if (stepKernelLoad) return stepKernelLoad;
  stepKernelLoad = new Promise((ok, no) => {
    if (window.PRStepKernel) return ok();
    const s = document.createElement("script");
    s.src = STEP_KERNEL_FILE;
    s.onload = () => ok();
    s.onerror = () => no(new Error("missing"));
    document.head.appendChild(s);
  })
    .then(() => window.PRStepKernel.load())
    .catch((e) => {
      // let the next try start over
      stepKernelLoad = null;
      throw e;
    });
  return stepKernelLoad;
}
/**
 * Says something under the Design Tree heading.
 * @param {string} text what to stepSay
 * @param {boolean} [bad] an error
 */
function stepSay(text, bad) {
  const el = document.getElementById("bldstepmsg");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
  el.classList.toggle("bad", !!bad);
}
/**
 * Builds the file for the rocket in the builder and saves it.
 * @param {"step"|"stl"} format
 * @param {"fine"|"coarse"} [mesh] for STL
 */
async function stepExport(format, mesh) {
  const btn = document.getElementById("bldstep"),
    what = format === "stl" ? "STL" : "STEP";
  if (!BLD) return;
  if (!downloadsNS) {
    stepSay("Saving files isn’t available in this view.", true);
    return;
  }
  btn.disabled = true;
  stepSay(`Building the ${what} file…`);
  // a box that says it's working, which can take a minute or two (Dustin, Nov 24), shown and painted before the
  // building starts (it holds the page while it runs) and gone before the save dialog
  const busy = document.getElementById("cadbusy");
  if (busy) {
    document.getElementById("cadbusytitle").textContent = `Exporting ${what} file…`;
    busy.hidden = false;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
  }
  const unbusy = () => busy && (busy.hidden = true);
  try {
    let R;
    try {
      R = await stepLoadKernel();
    } catch (e) {
      if (e && e.message === "missing")
        throw new Error(
          `The CAD export needs ${STEP_KERNEL_FILE}, which isn’t here. In the web version, keep it in the same folder as the page (it comes with each release). The Android app has it built in.`,
        );
      throw e;
    }
    const { text, shape, info } = await buildStep(R, BLD);
    const stl = format === "stl" ? buildStl(shape, mesh, info.volume) : null;
    const name =
      (BLD.name || "rocket")
        .replace(/[^\w.-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") + (stl ? ".stl" : ".step");
    unbusy();
    const res = await downloadsNS.save({
      filename: name,
      data: stl ? stl.data : new TextEncoder().encode(text).buffer,
    });
    const L = (mm) => `${fmt(mm / 1000, "len")} ${uname("len")}`;
    stepSay(
      `${res.status === "saved" || res.status === "delivered" ? `Saved ${name}.` : "Choose where to save the file."} ` +
        `Full size (millimetres): ${L(info.length)} long, one closed ${stl ? `mesh of ${stl.triangles.toLocaleString()} triangles (${mesh})` : "solid"} with the base closed flat` +
        `${info.fillet > 0 ? `, fin fillets ${+info.fillet.toFixed(2)} mm` : ""}.` +
        `${info.warnings.length ? " " + info.warnings.join(" ") : ""}`,
      false,
    );
  } catch (e) {
    stepSay(
      e && e.code === "declined"
        ? "Save cancelled."
        : `Couldn’t make the ${what} file: ${e && e.message ? e.message : "something went wrong."}`,
      !(e && e.code === "declined"),
    );
  } finally {
    unbusy();
    btn.disabled = false;
  }
}
/**
 * Shows the Export CAD box at its first question (the format) or its second (the STL's mesh).
 * @param {boolean} mesh the second question
 */
function cadStage(mesh) {
  document.getElementById("cadfmt").hidden = mesh;
  document.getElementById("cadmesh").hidden = !mesh;
  document.getElementById("cadback").hidden = !mesh;
  document.getElementById("cadtitle").textContent = mesh ? "Export CAD: STL mesh" : "Export CAD";
  document.getElementById("cadnote").textContent = mesh
    ? "How closely the triangles follow the curved surfaces."
    : "The rocket’s outer surface, full size in millimetres, as one closed solid with the base closed flat. Which format?";
  const first = document.querySelector(mesh ? "#cadmesh .flchoice" : "#cadfmt .flchoice");
  if (first) first.focus();
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  const btn = document.getElementById("bldstep"),
    box = document.getElementById("cadmodal");
  if (!btn || !box) return;
  const close = () => {
    box.hidden = true;
    btn.focus();
  };
  btn.onclick = () => {
    if (!BLD) return;
    box.hidden = false;
    cadStage(false);
  };
  document.getElementById("cadcancel").onclick = close;
  document.getElementById("cadback").onclick = () => cadStage(false);
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cad]");
    if (!b) return;
    const c = b.dataset.cad;
    if (c === "stl") return cadStage(true);
    close();
    stepExport(c === "step" ? "step" : "stl", c === "step" ? undefined : c);
  });
}
