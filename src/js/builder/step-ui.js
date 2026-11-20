/**
 * The Rocket tab's STEP button: builds the rocket's outer surface as a STEP file (step-export.js) and saves it. The
 * solid modelling library (OpenCascade) is a separate, large script, step-kernel.js, loaded the first time the button
 * is used: from the app's own files in the Android app, and from next to the page in the web version.
 */
import { BLD } from "./builder-ui.js";
import { buildStep } from "./step-export.js";
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
 * Builds the STEP file for the rocket in the builder and saves it.
 */
async function stepExport() {
  const btn = document.getElementById("bldstep");
  if (!BLD) return;
  if (!downloadsNS) {
    stepSay("Saving files isn’t available in this view.", true);
    return;
  }
  btn.disabled = true;
  stepSay("Building the STEP file…");
  try {
    let R;
    try {
      R = await stepLoadKernel();
    } catch (e) {
      if (e && e.message === "missing")
        throw new Error(
          `The STEP export needs ${STEP_KERNEL_FILE}, which isn’t here. In the web version, keep it in the same folder as the page (it comes with each release). The Android app has it built in.`,
        );
      throw e;
    }
    const { text, info } = await buildStep(R, BLD);
    const name =
      (BLD.name || "rocket")
        .replace(/[^\w.-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") + ".step";
    const res = await downloadsNS.save({ filename: name, data: new TextEncoder().encode(text).buffer });
    const L = (mm) => `${fmt(mm / 1000, "len")} ${uname("len")}`;
    stepSay(
      `${res.status === "saved" || res.status === "delivered" ? `Saved ${name}.` : "Choose where to save the file."} ` +
        `Full size (millimetres): ${L(info.length)} long, one closed solid with the base closed flat` +
        `${info.fillet > 0 ? `, fin fillets ${+info.fillet.toFixed(2)} mm` : ""}.` +
        `${info.warnings.length ? " " + info.warnings.join(" ") : ""}`,
      false,
    );
  } catch (e) {
    stepSay(
      e && e.code === "declined"
        ? "Save cancelled."
        : `Couldn’t make the STEP file: ${e && e.message ? e.message : "something went wrong."}`,
      !(e && e.code === "declined"),
    );
  } finally {
    btn.disabled = false;
  }
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  const btn = document.getElementById("bldstep");
  if (btn) btn.onclick = stepExport;
}
