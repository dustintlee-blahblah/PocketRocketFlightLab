// The STEP export's solid modelling library, as one script: replicad (https://replicad.xyz, MIT) on OpenCascade
// (LGPL-2.1 with the OCCT exception), with its WebAssembly inside. The app loads it only when STEP export is used:
// `window.PRStepKernel.load()` resolves to the replicad module, ready to use.
import opencascade from "replicad-opencascadejs";
import wasm from "replicad-opencascadejs/wasm";
import * as replicad from "replicad";

let ready = null;
window.PRStepKernel = {
  load() {
    if (!ready)
      ready = opencascade({
        // the WebAssembly is in this script: start it from the bytes instead of fetching a file
        instantiateWasm: (imports, done) => {
          WebAssembly.instantiate(wasm, imports).then((r) => done(r.instance));
          return {};
        },
      }).then((oc) => {
        replicad.setOC(oc);
        return replicad;
      });
    return ready;
  },
};
