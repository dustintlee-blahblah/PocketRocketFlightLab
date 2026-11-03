"use strict";
const APP_BUILD = "248";
document.querySelectorAll(".bnum").forEach((e) => (e.textContent = APP_BUILD)); // set by the build script, with the splash screen's build number
