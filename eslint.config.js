// ESLint setup. The app's files are ES modules (bundled into the page by build.js), so ESLint checks every name: an
// undefined one is an error, as is an unused import or top-level name. Exports nothing imports are found by
// tools/unused-exports.js.
"use strict";
const js = require("@eslint/js");
const globals = require("globals");
module.exports = [
  { ignores: ["web/**", "android/**", "src/data/**", "node_modules/**"] },
  js.configs.recommended,
  {
    // Two checks ESLint 10 added to its recommended set, left off. The first objects to a starting value a later line
    // always replaces (`let p = null; try { p = ... } catch { return; }`), which this code writes on purpose so a name
    // is never without a value; the second wants every error thrown from a catch block to carry the one caught, where
    // the app throws a plain message for the person to read. Neither found a fault here (27 places looked at).
    rules: { "no-useless-assignment": "off", "preserve-caught-error": "off" },
  },
  {
    files: ["src/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        // the PDF library, loaded by its own <script>
        jspdf: "readonly",
        // functions the app puts on window for the Android app to call, and calls itself
        prToast: "readonly",
        prKeyboard: "readonly",
        prSavedAs: "readonly",
        prFetchDone: "readonly",
        prIncoming: "readonly",
        prBack: "readonly",
        prLastSimNote: "readonly",
        prSettingsOpen: "readonly",
        prSettingsClose: "readonly",
        prOpenProfile: "readonly",
        // the Android app's bridge (window.Android), absent in a browser
        Android: "readonly",
      },
    },
    rules: {
      // array destructuring keeps unused positions named (the state vector [x, z, vx, vz, y, vy, ...] reads better whole)
      "no-unused-vars": [
        "error",
        { vars: "all", args: "none", caughtErrors: "none", destructuredArrayIgnorePattern: "." },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["build.js", "tests/**/*.js", "tools/**/*.js", "validation/**/*.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: { ...globals.node } },
  },
  {
    // the STEP export's library script: an ES module bundled for the browser (tools/build-step-kernel.js)
    files: ["tools/step-kernel/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser } },
  },
  {
    // the page-side code in the tests, validation scripts and screenshot tool runs in the browser, against the app's
    // names (exposed as globals)
    files: ["tests/**/*.js", "validation/**/*.js", "tools/screenshots.js"],
    rules: { "no-undef": "off" },
  },
];
