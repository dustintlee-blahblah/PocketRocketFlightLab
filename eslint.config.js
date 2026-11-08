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
    files: ["build.js", "tests/**/*.js", "tools/**/*.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: { ...globals.node } },
  },
  {
    // the page-side code in the test runs in the browser, against the app's globals
    files: ["tests/**/*.js"],
    rules: { "no-undef": "off" },
  },
];
