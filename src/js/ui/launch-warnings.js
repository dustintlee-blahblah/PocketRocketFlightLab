/**
 * The warnings shown instead of a run (rail too short, motor too big for its mount, mount too big for the body),
 * and closing the pop-up dialogs with a tap outside them or the Escape key.
 */
import { D, L, setMotorTarget, units } from "../design/defaults.js";
import { showTab } from "./events.js";
import { mountFilter, renderMotors } from "./motor-tab.js";
import { fmt, uname } from "./units.js";
/**
 * The warning shown instead of a run when the rail is too short (almost always a units mix-up).
 */
export function showRailWarn() {
  document.getElementById("railwarntxt").textContent =
    `The rail is only ${fmt(L.rail, "alt", units === "imp" ? 1 : 2)} ${uname("alt")} long. A launch rail shorter than ${units === "imp" ? "2.5 ft" : "0.76 m"} won't guide the rocket to a safe speed, so the flight wasn't simulated. Check the rail length on the Range tab.`;
  document.getElementById("railwarn").hidden = false;
  document.getElementById("railfix").focus();
}
/**
 * The warning shown instead of a run when a motor is too big for its mount.
 * @param {object} m motor
 * @param {object} fit from motorFit
 * @param {string} [stage]
 */
export function showFitWarn(m, fit, stage) {
  document.getElementById("fitwarntxt").textContent =
    `The ${m.cn || m.name} is a ${fit.motor} mm motor, too big for the ${fit.mount} mm ${stage ? (stage === "first" ? "first-stage" : stage) + " " : ""}motor mount ${fit.src === "chosen" ? "you chose" : "in your design"}, so the flight wasn't simulated. Choose a motor that fits on the Motor tab${fit.src === "file" ? " or pick a larger motor mount in the design tree on the Rocket tab" : ""}.`;
  document.getElementById("fitfix").textContent = "Choose another motor";
  document.getElementById("fitwarn").hidden = false;
  document.getElementById("fitfix").focus();
  document.getElementById("fitfix").onclick = () => {
    document.getElementById("fitwarn").hidden = true;
    if (stage) setMotorTarget(stage);
    mountFilter();
    showTab("motor");
    renderMotors();
    window.scrollTo({ top: 0 });
  };
}
/**
 * The warning shown when a chosen mount is bigger than its body.
 * @param {{cls:number, body:number}} tb from mountTooBig
 * @param {string} [stage]
 * @param {boolean} booster
 */
export function showMountWarn(tb, stage, booster) {
  document.getElementById("fitwarntxt").textContent =
    `A ${tb.cls} mm motor mount doesn't fit inside the ${fmt(booster ? D.bDiameter : D.diameter, "small")} ${uname("small")} ${stage ? stage + " " : ""}body tube, so the flight wasn't simulated. Choose a smaller motor mount in the design tree on the Rocket tab.`;
  const fx = document.getElementById("fitfix");
  fx.textContent = "Change mount size";
  fx.onclick = () => {
    document.getElementById("fitwarn").hidden = true;
    showTab("rocket");
  };
  document.getElementById("fitwarn").hidden = false;
  fx.focus();
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.getElementById("railok").onclick = () => {
    document.getElementById("railwarn").hidden = true;
  };
  document.getElementById("fitok").onclick = () => {
    document.getElementById("fitwarn").hidden = true;
  };
  document.getElementById("railfix").onclick = () => {
    document.getElementById("railwarn").hidden = true;
    showTab("flight");
    const f = document.getElementById("f-rail");
    if (f) {
      f.scrollIntoView({ block: "center" });
      f.focus();
      f.select && f.select();
    }
  };
  // pop-up dialogs close on a tap outside the box or the Escape key
  for (const id of ["resetconfirm", "openconfirm", "railwarn", "fitwarn"]) {
    const m = document.getElementById(id);
    m.addEventListener("click", (e) => {
      if (e.target === m) m.hidden = true;
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      for (const id of ["resetconfirm", "openconfirm", "railwarn", "fitwarn"])
        document.getElementById(id).hidden = true;
  });
}
