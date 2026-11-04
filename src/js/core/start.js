/**
 * App start: strict mode and the build number, which the build script (bump.sh) writes here and into the splash screen.
 */
"use strict";
const APP_BUILD = "252";
document.querySelectorAll(".bnum").forEach((e) => (e.textContent = APP_BUILD)); // set by the build script, with the splash screen's build number
