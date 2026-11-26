// The STEP export's solid modelling library, as one script: replicad (https://replicad.xyz, MIT) on OpenCascade
// (LGPL-2.1 with the OCCT exception), with its WebAssembly inside. The app loads it only when STEP export is used:
// `window.PRStepKernel.load()` resolves to the replicad module, ready to use.
import opencascade from "replicad-opencascadejs";
// (gzipped by tools/build-step-kernel.js)
import wasmGz from "replicad-opencascadejs/wasm";
import * as replicad from "replicad";

/**
 * The WebAssembly's bytes, unpacked. DecompressionStream is in Chrome and Android's WebView from 80 (2020), Safari
 * from 16.4 and Firefox from 113 (2023).
 */
async function wasmBytes() {
  if (typeof DecompressionStream !== "function") {
    const e = new Error("This browser is too old to unpack the CAD library (it needs DecompressionStream).");
    e.code = "old-browser";
    throw e;
  }
  return new Response(new Blob([wasmGz]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}
let ready = null;
window.PRStepKernel = {
  load() {
    if (!ready)
      ready = wasmBytes()
        .then((wasm) =>
          opencascade({
            // the WebAssembly is in this script: start it from the bytes instead of fetching a file
            instantiateWasm: (imports, done) => {
              WebAssembly.instantiate(wasm, imports).then((r) => done(r.instance));
              return {};
            },
          }),
        )
        .then((oc) => {
          replicad.setOC(oc);
          return replicad;
        })
        .catch((e) => {
          // let the next try start over
          ready = null;
          throw e;
        });
    return ready;
  },
};
