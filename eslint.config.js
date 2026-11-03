// ESLint setup. The app's files are joined into one <script> by build.js, so they share one global scope: names
// defined in one file are used in others, which is why no-undef is off and no-unused-vars only checks names inside
// functions. Top-level names nothing uses are found by tools/unused-globals.js (npm run lint:globals).
"use strict";
const js = require("@eslint/js");
const globals = require("globals");
module.exports = [
  { ignores: ["web/**", "android/**", "src/data/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["src/js/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser, jspdf: "readonly" } },
    rules: {
      "no-undef": "off",
      // array destructuring keeps unused positions named (the state vector [x, z, vx, vz, y, vy, ...] reads better whole)
      "no-unused-vars": [
        "error",
        { vars: "local", args: "none", caughtErrors: "none", destructuredArrayIgnorePattern: "." },
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
