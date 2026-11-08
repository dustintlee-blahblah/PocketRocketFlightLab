/**
 * App start: strict mode and the build number, which tools/set-build.js writes here and into the splash screen.
 */
export const APP_BUILD = "280";
// set by the build script, with the splash screen's build number
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  document.querySelectorAll(".bnum").forEach((e) => (e.textContent = APP_BUILD));
}
