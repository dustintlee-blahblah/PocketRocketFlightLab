/**
 * The flight animation in 3D: the rocket as a solid model flying its simulated path over the launch site, drawn with
 * the browser's own 3D graphics (WebGL), with no library. One pass draws the sky and the ground (plain, or the site's
 * aerial photo); the rocket, rail, flame, smoke, parachute and dropped stages are drawn over it.
 *
 * Axes of the picture: x east, y up, z south, in metres from the pad. The flight's own axes (x downwind, y to the left
 * of downwind, z up) are turned into these by the wind's direction, so the picture has north where the photo has it.
 */
import { ANIM, animAt } from "./animation.js";
import { sitePhoto } from "./site-photo.js";
import { store } from "../core/storage.js";
import { lastSim } from "../ui/results.js";
import { fmt, uname } from "../ui/units.js";
/**
 * The 3D view's state: on (the animation is showing in 3D), gl and its programs, the models of the open flight, the
 * camera (mode "ground", "chase" or "over"; az and el the angles it looks from, zoom), and what is being dragged.
 */
export const V3 = {
  on: false,
  gl: null,
  bad: false,
  models: null,
  mode: "ground",
  az: 0.6,
  el: 0.25,
  zoom: 1,
  key: null,
};
/** Corners around the body, and the size (px) the rocket is never drawn smaller than in the far views. */
const V3_SIDES = 28,
  V3_MIN_PX = 64;
const V3_SKY = `
attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0.9999, 1.0); }`;
/* each pixel's line of sight: above the horizon the sky, below it the ground where that line meets it: the site's
   photo where there is one (a near, sharp square inside a far, coarse one), else a plain field with a 100 m grid */
const V3_SKY_F = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;
uniform vec3 eye, fwd, right, up, sun;
uniform vec2 tanv;
uniform float dark;
uniform sampler2D nearT, farT;
uniform vec3 nearB, farB;
vec3 sky(vec3 d){
  float e = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(vec3(0.80, 0.88, 0.95), vec3(0.22, 0.45, 0.78), pow(e, 0.55));
  c += vec3(1.0, 0.95, 0.8) * pow(max(dot(d, sun), 0.0), 600.0) * 2.0;
  return mix(c, vec3(0.02, 0.04, 0.10), dark * (0.35 + 0.65 * e));
}
void main(){
  vec3 d = normalize(fwd + v.x * tanv.x * right + v.y * tanv.y * up);
  if (d.y >= -0.0005) { gl_FragColor = vec4(sky(d), 1.0); return; }
  float s = eye.y / -d.y;
  vec2 g = eye.xz + d.xz * s;
  vec2 gr = abs(fract(g / 100.0) - 0.5) * 100.0; // lines 100 m apart, the pad in the middle of a square
  float px = s * tanv.y * 0.004;
  float line = 1.0 - smoothstep(px * 0.6 + 0.04, px * 1.6 + 0.12, min(gr.x, gr.y));
  vec3 c = mix(vec3(0.42, 0.50, 0.33), vec3(0.50, 0.57, 0.40), 0.5 + 0.5 * sin(g.x * 0.013) * sin(g.y * 0.017));
  c = mix(c, c * 0.84, line * clamp(1.0 - s / 4000.0, 0.0, 1.0));
  vec2 uf = (g - farB.xy) / farB.z * 0.5 + 0.5;
  if (farB.z > 0.0 && uf.x > 0.0 && uf.x < 1.0 && uf.y > 0.0 && uf.y < 1.0) {
    float edge = smoothstep(0.0, 0.08, min(min(uf.x, 1.0 - uf.x), min(uf.y, 1.0 - uf.y)));
    c = mix(c, texture2D(farT, uf).rgb, edge);
  }
  vec2 un = (g - nearB.xy) / nearB.z * 0.5 + 0.5;
  if (nearB.z > 0.0 && un.x > 0.0 && un.x < 1.0 && un.y > 0.0 && un.y < 1.0) {
    float edge = smoothstep(0.0, 0.06, min(min(un.x, 1.0 - un.x), min(un.y, 1.0 - un.y)));
    c = mix(c, texture2D(nearT, un).rgb, edge);
  }
  float fog = 1.0 - exp(-s / 30000.0);
  gl_FragColor = vec4(mix(c, sky(vec3(d.x, 0.0, d.z)), fog), 1.0);
}`;
const V3_MESH = `
attribute vec3 p, n, c;
uniform mat4 vp, m;
varying vec3 vn, vc;
void main(){ vn = mat3(m) * n; vc = c; gl_Position = vp * m * vec4(p, 1.0); }`;
const V3_MESH_F = `
precision mediump float;
varying vec3 vn, vc;
uniform vec3 sun;
uniform vec4 tint;
uniform float lit;
void main(){
  vec3 nn = normalize(vn);
  float l = mix(1.0, 0.42 + 0.58 * max(dot(nn, sun), 0.0) + 0.12 * max(-nn.y, 0.0), lit);
  gl_FragColor = vec4(vc * tint.rgb * l, tint.a);
}`;
const V3_PUFF = `
attribute vec4 p;
attribute float a;
uniform mat4 vp;
uniform float h;
varying float va;
void main(){ va = a; gl_Position = vp * vec4(p.xyz, 1.0); gl_PointSize = clamp(p.w * h / max(gl_Position.w, 0.01), 1.0, 512.0); }`;
const V3_PUFF_F = `
precision mediump float;
varying float va;
uniform vec3 col;
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(col, va * smoothstep(1.0, 0.25, r)); }`;
/* ---------- small vector and matrix helpers (column-major 4×4, as WebGL takes them) ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
/**
 * The matrix that takes the picture's coordinates to the screen, for a camera at eye looking at a point.
 * @returns {{vp:Float32Array, f:number[], r:number[], u:number[]}} the matrix, and the camera's forward, right and up
 */
function viewProj(eye, at, fovY, aspect, near, far) {
  const f = norm(sub(at, eye)),
    r = norm(cross(f, Math.abs(f[1]) > 0.999999 ? [0, 0, -1] : [0, 1, 0])),
    u = cross(r, f),
    t = 1 / Math.tan(fovY / 2),
    A = (far + near) / (near - far),
    B = (2 * far * near) / (near - far);
  // projection × view, written out
  const V = [r[0], r[1], r[2], -dot(r, eye), u[0], u[1], u[2], -dot(u, eye), -f[0], -f[1], -f[2], dot(f, eye)];
  const vp = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    vp[c * 4] = (t / aspect) * V[c];
    vp[c * 4 + 1] = t * V[4 + c];
    vp[c * 4 + 2] = A * V[8 + c] + (c === 3 ? B : 0);
    vp[c * 4 + 3] = -V[8 + c];
  }
  return { vp, f, r, u };
}
/**
 * A model's matrix: its own y axis laid along dir, turned by roll about it, scaled, and put at pos.
 */
function place(pos, dir, roll, scale) {
  const y = norm(dir),
    x0 = norm(cross(Math.abs(y[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], y)),
    z0 = cross(x0, y),
    c = Math.cos(roll),
    s = Math.sin(roll),
    x = add(mul(x0, c), mul(z0, s)),
    z = add(mul(z0, c), mul(x0, -s));
  const k = Array.isArray(scale) ? scale : [scale, scale, scale];
  return new Float32Array([
    x[0] * k[0],
    x[1] * k[0],
    x[2] * k[0],
    0,
    y[0] * k[1],
    y[1] * k[1],
    y[2] * k[1],
    0,
    z[0] * k[2],
    z[1] * k[2],
    z[2] * k[2],
    0,
    pos[0],
    pos[1],
    pos[2],
    1,
  ]);
}
/* ---------- models ---------- */
/**
 * Triangles of a flat outline that may have hollows in it (ear clipping).
 * @param {number[][]} P corners [x, y] in order
 * @returns {number[]} corner numbers, three to a triangle
 */
function earcut(P) {
  const n = P.length,
    idx = [];
  let area = 0;
  for (let i = 0; i < n; i++) area += P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1];
  const V = P.map((_, i) => i);
  if (area < 0) V.reverse();
  const cr = (a, b, c) => (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]);
  let guard = n * n;
  while (V.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < V.length; i++) {
      const a = V[(i + V.length - 1) % V.length],
        b = V[i],
        c = V[(i + 1) % V.length];
      if (cr(a, b, c) <= 1e-14) continue;
      if (V.some((q) => q !== a && q !== b && q !== c && cr(a, b, q) >= 0 && cr(b, c, q) >= 0 && cr(c, a, q) >= 0))
        continue;
      idx.push(a, b, c);
      V.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (V.length === 3) idx.push(V[0], V[1], V[2]);
  return idx;
}
/**
 * A list of triangles being built: positions, normals and colours, three corners at a time.
 */
function builder() {
  const p = [],
    n = [],
    c = [];
  return {
    p,
    n,
    c,
    tri(a, b, d, na, nb, nd, col) {
      p.push(...a, ...b, ...d);
      n.push(...na, ...nb, ...nd);
      c.push(...col, ...col, ...col);
    },
    quad(a, b, d, e, na, nb, nd, ne, col) {
      this.tri(a, b, d, na, nb, nd, col);
      this.tri(a, d, e, na, nd, ne, col);
    },
  };
}
/**
 * A rocket (or one stage of it) as triangles, from the outline the 2D animation draws: the body turned about its
 * axis, a flat base, and each fin as a thin plate. Its nose is at y = len and its tail at y = 0.
 * @param {{body:number[][], fins:object[], len:number, R:number}} S from animShape
 * @param {number[]} bodyCol colour of the body
 * @param {number[]} finCol colour of the fins
 */
function rocketMesh(S, bodyCol, finCol) {
  const B = builder(),
    N = V3_SIDES,
    Y = (x) => S.len - x;
  const ring = (r, y, k) => [r * Math.cos((2 * Math.PI * k) / N), y, r * Math.sin((2 * Math.PI * k) / N)];
  for (let i = 0; i + 1 < S.body.length; i++) {
    const [x0, r0] = S.body[i],
      [x1, r1] = S.body[i + 1];
    if (x1 - x0 < 1e-9 && Math.abs(r1 - r0) < 1e-9) continue;
    // the surface's lean: straight out on a tube, tipped forward on a nose cone
    const sl = Math.atan2(r0 - r1, x1 - x0),
      ny = -Math.sin(sl),
      nr = Math.cos(sl);
    for (let k = 0; k < N; k++) {
      const nrm = (j) => [nr * Math.cos((2 * Math.PI * j) / N), ny, nr * Math.sin((2 * Math.PI * j) / N)];
      B.quad(
        ring(r0, Y(x0), k),
        ring(r0, Y(x0), k + 1),
        ring(r1, Y(x1), k + 1),
        ring(r1, Y(x1), k),
        nrm(k),
        nrm(k + 1),
        nrm(k + 1),
        nrm(k),
        S.nose && i < 24 && S.body.length > 25 && S.body[0][1] < 1e-6 ? finCol : bodyCol,
      );
    }
  }
  const last = S.body[S.body.length - 1];
  if (last && last[1] > 0)
    for (let k = 0; k < N; k++)
      B.tri(
        [0, Y(last[0]), 0],
        ring(last[1], Y(last[0]), k + 1),
        ring(last[1], Y(last[0]), k),
        [0, -1, 0],
        [0, -1, 0],
        [0, -1, 0],
        [0.25, 0.25, 0.27],
      );
  for (const f of S.fins) {
    const tri = earcut(f.pts),
      th = Math.max(0.0025, S.R * 0.05);
    for (let k = 0; k < f.n; k++) {
      const a = (2 * Math.PI * k) / f.n + (f.n % 2 ? Math.PI / 2 : Math.PI / f.n),
        ca = Math.cos(a),
        sa = Math.sin(a),
        side = [-sa, 0, ca];
      const at = (q, s) => [q[1] * ca + side[0] * s * th, Y(q[0]), q[1] * sa + side[2] * s * th];
      for (const s of [1, -1]) {
        const nn = mul(side, s);
        for (let i = 0; i < tri.length; i += 3)
          B.tri(at(f.pts[tri[i]], s), at(f.pts[tri[i + 1]], s), at(f.pts[tri[i + 2]], s), nn, nn, nn, finCol);
      }
      // the edge all the way round
      for (let i = 0; i < f.pts.length; i++) {
        const q = f.pts[i],
          w = f.pts[(i + 1) % f.pts.length],
          dx = w[0] - q[0],
          dr = w[1] - q[1],
          l = Math.hypot(dx, dr) || 1,
          en = [(dx / l) * ca, dr / l, (dx / l) * sa];
        B.quad(at(q, 1), at(w, 1), at(w, -1), at(q, -1), en, en, en, en, mul(finCol, 0.85));
      }
    }
  }
  return B;
}
/**
 * A parachute as triangles: a dome one unit across with its opening down at y = 0, in gores of two colours, and its
 * lines running down to a point at y = -1.4.
 */
function chuteMesh(colA, colB) {
  const B = builder(),
    N = 16,
    M = 6;
  const P = (i, j) => {
    const a = (2 * Math.PI * i) / N,
      e = ((Math.PI / 2) * j) / M;
    return [0.5 * Math.cos(e) * Math.cos(a), 0.36 * Math.sin(e), 0.5 * Math.cos(e) * Math.sin(a)];
  };
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      const n = (q) => norm([q[0], q[1] * 1.9 + 0.02, q[2]]),
        a = P(i, j),
        b = P(i + 1, j),
        c = P(i + 1, j + 1),
        d = P(i, j + 1);
      B.quad(a, b, c, d, n(a), n(b), n(c), n(d), i % 2 ? colA : colB);
    }
  return B;
}
/**
 * A cone one unit long pointing down from y = 0, radius one at its top: the flame.
 */
function coneMesh() {
  const B = builder(),
    N = 14;
  for (let k = 0; k < N; k++) {
    const a0 = (2 * Math.PI * k) / N,
      a1 = (2 * Math.PI * (k + 1)) / N;
    B.tri(
      [Math.cos(a0), 0, Math.sin(a0)],
      [Math.cos(a1), 0, Math.sin(a1)],
      [0, -1, 0],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 1],
    );
  }
  return B;
}
/**
 * A box one unit tall on y from 0 to 1, one unit square: the rail (scaled thin) and the pad (scaled flat).
 */
function boxMesh(col) {
  const B = builder(),
    F = [
      [
        [1, 0, 0],
        [0, 0, 1],
      ],
      [
        [-1, 0, 0],
        [0, 0, -1],
      ],
      [
        [0, 0, 1],
        [-1, 0, 0],
      ],
      [
        [0, 0, -1],
        [1, 0, 0],
      ],
    ];
  for (const [n, t] of F) {
    const c = (y, s) => [n[0] * 0.5 + t[0] * 0.5 * s, y, n[2] * 0.5 + t[2] * 0.5 * s];
    B.quad(c(0, -1), c(0, 1), c(1, 1), c(1, -1), n, n, n, n, col);
  }
  B.quad(
    [-0.5, 1, -0.5],
    [-0.5, 1, 0.5],
    [0.5, 1, 0.5],
    [0.5, 1, -0.5],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    col,
  );
  return B;
}
/* ---------- WebGL ---------- */
/**
 * Sets WebGL up on the 3D canvas: the three programs and the fixed models. False if this device can't.
 */
function glStart() {
  if (V3.gl) return true;
  if (V3.bad) return false;
  const cv = document.getElementById("anim3d");
  const gl = cv.getContext("webgl", { antialias: true, alpha: false }) || cv.getContext("experimental-webgl");
  if (!gl) {
    V3.bad = true;
    return false;
  }
  const prog = (vs, fs) => {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "program");
    const u = {},
      a = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      const n = gl.getActiveUniform(p, i).name;
      u[n] = gl.getUniformLocation(p, n);
    }
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) {
      const n = gl.getActiveAttrib(p, i).name;
      a[n] = gl.getAttribLocation(p, n);
    }
    return { p, u, a };
  };
  try {
    V3.sky = prog(V3_SKY, V3_SKY_F);
    V3.mesh = prog(V3_MESH, V3_MESH_F);
    V3.puff = prog(V3_PUFF, V3_PUFF_F);
  } catch (e) {
    V3.bad = true;
    return false;
  }
  V3.gl = gl;
  V3.quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, V3.quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  V3.dyn = gl.createBuffer();
  V3.fixed = {
    cone: upload(coneMesh()),
    rail: upload(boxMesh([0.62, 0.64, 0.67])),
    pad: upload(boxMesh([0.36, 0.37, 0.4])),
    disc: upload(discMesh()),
  };
  V3.tex = {};
  return true;
}
/**
 * A flat disc one unit across on the ground: the rocket's shadow.
 */
function discMesh() {
  const B = builder(),
    N = 20;
  for (let k = 0; k < N; k++) {
    const a0 = (2 * Math.PI * k) / N,
      a1 = (2 * Math.PI * (k + 1)) / N;
    B.tri(
      [0, 0, 0],
      [0.5 * Math.cos(a1), 0, 0.5 * Math.sin(a1)],
      [0.5 * Math.cos(a0), 0, 0.5 * Math.sin(a0)],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 1],
    );
  }
  return B;
}
/**
 * Puts a built model on the graphics card.
 * @returns {{b:WebGLBuffer, n:number}} one buffer of position, normal and colour for each corner, and how many corners
 */
function upload(B) {
  const gl = V3.gl,
    n = B.p.length / 3,
    d = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    d.set(B.p.slice(i * 3, i * 3 + 3), i * 9);
    d.set(B.n.slice(i * 3, i * 3 + 3), i * 9 + 3);
    d.set(B.c.slice(i * 3, i * 3 + 3), i * 9 + 6);
  }
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
  return { b, n };
}
/**
 * Draws a model with a matrix, a tint (colour and opacity), lit by the sun or flat.
 */
function drawMesh(M, m, tint = [1, 1, 1, 1], lit = 1) {
  const gl = V3.gl,
    P = V3.mesh;
  gl.bindBuffer(gl.ARRAY_BUFFER, M.b);
  for (const [name, off] of [
    ["p", 0],
    ["n", 12],
    ["c", 24],
  ]) {
    if (P.a[name] == null || P.a[name] < 0) continue;
    gl.enableVertexAttribArray(P.a[name]);
    gl.vertexAttribPointer(P.a[name], 3, gl.FLOAT, false, 36, off);
  }
  gl.uniformMatrix4fv(P.u.m, false, m);
  gl.uniform4fv(P.u.tint, tint);
  gl.uniform1f(P.u.lit, lit);
  gl.drawArrays(gl.TRIANGLES, 0, M.n);
}
/**
 * The site photo as textures, once it has arrived (see site-photo.js): a near, sharp square and a far, coarse one.
 */
function photoTextures() {
  const gl = V3.gl,
    L = lastSim.L,
    ph = sitePhoto(L.lat, L.lon, () => ANIM.on && V3.on && !ANIM.playing && anim3dDraw());
  for (const k of ["near", "far"]) {
    const img = ph && ph[k];
    if (!img) {
      V3.tex[k] = null;
      continue;
    }
    if (V3.tex[k] && V3.tex[k].img === img) continue;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    V3.tex[k] = { t, img, half: ph[k + "Half"] };
  }
  const note = document.getElementById("anim3dcredit");
  if (note) note.hidden = !(V3.tex.near || V3.tex.far);
}
/* ---------- the flight in the picture's axes ---------- */
/**
 * The flight's axes in the picture: which way downwind (ex) and left of downwind (ey) point, from the wind direction.
 */
function flightAxes() {
  const b = (((lastSim.L.windDir ?? 270) + 180) * Math.PI) / 180;
  return { ex: [Math.sin(b), 0, -Math.cos(b)], ey: [-Math.cos(b), 0, -Math.sin(b)] };
}
/**
 * Where the rocket is at a time, and which way it points, in the picture's axes.
 */
function stateAt(t) {
  const { out } = lastSim,
    { ex, ey } = flightAxes(),
    X = out.more || {};
  const w = (x, y, z) => add(add(mul(ex, x), mul(ey, y)), [0, z, 0]);
  const pos = w(-animAt(out.t, out.drift, t), animAt(out.t, out.cross, t), Math.max(0, animAt(out.t, out.alt, t)));
  const ax = animAt(out.t, out.ax, t),
    az = animAt(out.t, out.az, t),
    ay = X.ay ? animAt(out.t, X.ay, t) : 0;
  return { pos, dir: norm(w(ax, ay, az)) };
}
/**
 * Builds the models of the flight that is open (each stage, the parachutes), once for each run.
 */
function models() {
  const key = lastSim.when;
  if (V3.models && V3.key === key) return V3.models;
  const white = [0.93, 0.94, 0.95],
    red = [0.85, 0.31, 0.11],
    mk = (S, nose) => (S ? { ...upload(rocketMesh({ ...S, nose }, white, red)), len: S.len, R: S.R } : null);
  V3.models = {
    full: mk(ANIM.full, true),
    shape: mk(ANIM.shape, true),
    sus: mk(ANIM.sus, true),
    boo: mk(ANIM.boo, false),
    first: mk(ANIM.first, false),
    main: upload(chuteMesh([0.9, 0.3, 0.12], [0.96, 0.96, 0.96])),
    drogue: upload(chuteMesh([0.95, 0.75, 0.1], [0.2, 0.2, 0.22])),
  };
  V3.key = key;
  // the whole flight's reach, for the overview
  const { out } = lastSim;
  let far = 30,
    top = 10;
  for (let i = 0; i < out.t.length; i += 4) {
    far = Math.max(far, Math.hypot(out.drift[i], out.cross[i]));
    top = Math.max(top, out.alt[i]);
  }
  V3.reach = { far, top };
  return V3.models;
}
/**
 * Draws the flight at the animation's time.
 */
export function anim3dDraw() {
  if (!lastSim || !glStart()) return;
  const gl = V3.gl,
    cv = gl.canvas,
    dpr = Math.min(window.devicePixelRatio || 1, 2),
    W = Math.max(2, Math.round(cv.clientWidth * dpr)),
    H = Math.max(2, Math.round(cv.clientHeight * dpr));
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  const { out, st, D: RD, L: RL } = lastSim,
    t = ANIM.t,
    M = models();
  photoTextures();
  const S = stateAt(t),
    z = S.pos[1];
  // what is flying: every stage, then fewer; and what has been dropped
  const full = !!(st.three && st.tSep1 != null && t < st.tSep1),
    sepd = st.staged && st.tSep != null && t >= st.tSep,
    body = full && M.full ? M.full : st.staged && !sepd ? M.shape : M.sus;
  const tDep = st.tDeploy,
    landed = st.tLand != null && t >= st.tLand - 1e-6,
    chute = tDep != null && t >= tDep && !landed && !st.noChute,
    mainOpen = chute && (st.single || (st.tMain != null && t >= st.tMain)),
    drogue = chute && !mainOpen && RD.drogueDia > 0;
  const thrust = animAt(out.t, out.thrust, t);
  // under a parachute (or lying where it landed) the rocket hangs or lies, whatever its last attitude in free flight
  let dir = S.dir,
    roll = ANIM.rollAng ? animAt(out.t, ANIM.rollAng, t) : 0;
  const { ex } = flightAxes();
  if (landed) dir = norm(add(ex, [0, 0.02, 0]));
  else if (chute && (mainOpen || drogue))
    dir = norm(add(mul(ex, 0.3), [0, 1, 0])); // hanging tail down from the nose end
  else if (st.noChute && tDep != null && t >= tDep) {
    const a = (t - tDep) * 4.4;
    dir = norm(add(mul(ex, Math.cos(a)), [0, Math.sin(a), 0]));
  }
  // the camera
  const len = body.len,
    aspect = W / H;
  let eye, at, fov, near;
  if (V3.mode === "chase") {
    // under a parachute the view takes in the canopy above the rocket
    const canopy = mainOpen ? RD.mainDia || 1 : drogue ? RD.drogueDia : 0,
      d = Math.max(len * 5, 4, canopy * 4.5) * V3.zoom;
    at = add(S.pos, canopy ? [0, len + canopy * 0.6, 0] : mul(dir, len * 0.5));
    eye = add(at, [d * Math.cos(V3.el) * Math.sin(V3.az), d * Math.sin(V3.el), d * Math.cos(V3.el) * Math.cos(V3.az)]);
    eye[1] = Math.max(eye[1], 0.3);
    fov = 0.9;
    near = Math.max(0.05, len * 0.05);
  } else if (V3.mode === "over") {
    const R = V3.reach,
      span = Math.max(R.far, R.top, 60),
      d = span * 1.9 * V3.zoom,
      c = mul(add(S.pos, [0, R.top * 0.45 - S.pos[1], 0]), 0.5);
    at = [c[0], R.top * 0.45, c[2]];
    eye = add(at, [d * Math.cos(V3.el) * Math.sin(V3.az), d * Math.sin(V3.el), d * Math.cos(V3.el) * Math.cos(V3.az)]);
    eye[1] = Math.max(eye[1], 2);
    fov = 0.8;
    near = Math.max(0.5, d * 0.01);
  } else {
    // a spectator at the flight line: beside the pad, eye height, following the rocket and zooming in as it goes
    const { ey } = flightAxes(),
      back = Math.max(30, len * 18);
    eye = add(add(mul(ey, -back), mul(ex, -back * 0.35)), [0, 1.7, 0]);
    at = add(S.pos, mul(dir, len * 0.5));
    const dist = Math.hypot(...sub(at, eye));
    // wide while the rocket is near, so the pad and the field are in the picture; narrowing to follow it away
    fov = Math.min(0.95, Math.max(0.1, 2 * Math.atan((back * 0.62) / Math.max(dist, back))));
    if (z < len * 3) at = [at[0], Math.max(at[1], len * 1.4), at[2]];
    near = 0.3;
  }
  // easing, so the picture doesn't jump when the view or the time changes
  if (V3.cam && V3.cam.mode === V3.mode && !V3.jump) {
    const k = 0.18;
    eye = add(V3.cam.eye, mul(sub(eye, V3.cam.eye), V3.mode === "ground" ? 1 : k * 2.5));
    at = add(V3.cam.at, mul(sub(at, V3.cam.at), V3.mode === "ground" ? 0.25 : 0.6));
    fov = V3.cam.fov + (fov - V3.cam.fov) * 0.15;
  }
  V3.jump = false;
  V3.cam = { eye, at, fov, mode: V3.mode };
  const dist = Math.hypot(...sub(at, eye)),
    C = viewProj(eye, at, fov, aspect, near, Math.max(60000, dist * 4)),
    tanY = Math.tan(fov / 2);
  // far off, the rocket is drawn larger than life so it can still be seen
  const px = (len * H) / (2 * tanY * Math.max(dist, 1e-3)),
    big = V3.mode === "chase" ? 1 : Math.max(1, V3_MIN_PX / Math.max(px, 1e-6));
  const sun = norm([0.45, 0.8, 0.35]);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  // sky and ground
  {
    const P = V3.sky;
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, V3.quad);
    gl.enableVertexAttribArray(P.a.p);
    gl.vertexAttribPointer(P.a.p, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(P.u.eye, eye);
    gl.uniform3fv(P.u.fwd, C.f);
    gl.uniform3fv(P.u.right, C.r);
    gl.uniform3fv(P.u.up, C.u);
    gl.uniform3fv(P.u.sun, sun);
    gl.uniform2f(P.u.tanv, tanY * aspect, tanY);
    gl.uniform1f(P.u.dark, Math.min(1, Math.max(0, (eye[1] - 12000) / 60000)));
    for (const [k, unit] of [
      ["near", 0],
      ["far", 1],
    ]) {
      const T = V3.tex[k];
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, T ? T.t : null);
      gl.uniform1i(P.u[k + "T"], unit);
      // north is up in the photo: east runs with x, and south (the picture's z) runs down it
      gl.uniform3f(P.u[k + "B"], 0, 0, T ? T.half : 0);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // solid things
  const Pm = V3.mesh;
  gl.useProgram(Pm.p);
  gl.uniformMatrix4fv(Pm.u.vp, false, C.vp);
  gl.uniform3fv(Pm.u.sun, sun);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // the rocket's shadow, straight below it, fainter with height
  {
    const sh = Math.max(len * big * 0.8, 0.4),
      a = 0.32 * Math.max(0, 1 - z / Math.max(400, len * 150));
    if (a > 0.01)
      drawMesh(V3.fixed.disc, place([S.pos[0], 0.01, S.pos[2]], [0, 1, 0], 0, [sh, 1, sh * 0.5]), [0, 0, 0, a], 0);
  }
  gl.enable(gl.DEPTH_TEST);
  // pad and rail
  {
    const th = ((RL.angle || 0) * Math.PI) / 180,
      rail = norm(stateAt(0).dir[1] > 0.2 ? stateAt(0).dir : [Math.sin(th), Math.cos(th), 0]),
      rl = Math.max(RL.rail || 1, 0.5),
      w = Math.max(0.025, body.R * 0.5);
    const side = norm(cross(rail, [rail[2], 0, -rail[0] + 1e-6]));
    drawMesh(
      V3.fixed.pad,
      place([0, -0.02, 0], [0, 1, 0], 0, [Math.max(0.6, body.R * 14), 0.06, Math.max(0.6, body.R * 14)]),
    );
    drawMesh(V3.fixed.rail, place(add(mul(side, body.R + w), [0, 0, 0]), rail, 0, [w, rl, w]));
  }
  // dropped stages, each along its own path
  for (const [key, m] of [
    ["b", M.boo],
    ["b1", M.first],
  ]) {
    const T = out[key + "t"];
    if (!m || !T || !T.length || t < T[0]) continue;
    const { ex: X0 } = flightAxes(),
      alt = Math.max(0, animAt(T, out[key + "alt"], t)),
      p = add(mul(X0, animAt(T, out[key + "xp"] || T.map(() => 0), t)), [0, alt, 0]),
      a = alt > 0 ? (t - T[0]) * 3.1 : 0;
    drawMesh(m, place(p, alt > 0 ? [Math.cos(a), Math.sin(a) * 0.9, 0.3] : [1, 0.03, 0], 0, big));
  }
  // the rocket (after its smoke, so it shows through its own trail)
  const tail = S.pos,
    lying = landed ? [tail[0], body.R * big, tail[2]] : tail;
  gl.depthMask(false);
  // smoke: puffs left along the path while the motor burned, spreading, thinning and drifting with the wind
  {
    const pts = [],
      al = [],
      { ex: X0, ey: Y0 } = flightAxes(),
      wind = RL.wind || 0,
      life = 14;
    // one puff for each stretch of the powered path, close enough together to read as one trail
    let burn = 0;
    for (let i = 1; i < out.t.length; i++)
      if (out.thrust[i] > 1) burn += Math.hypot(out.alt[i] - out.alt[i - 1], out.drift[i] - out.drift[i - 1]);
    const gap = Math.max(0.4, burn / 420);
    let run = gap;
    for (let i = 1; i < out.t.length && out.t[i] <= t; i++) {
      if (!(out.thrust[i] > 1)) continue;
      run += Math.hypot(out.alt[i] - out.alt[i - 1], out.drift[i] - out.drift[i - 1]);
      if (run < gap) continue;
      run = 0;
      const age = t - out.t[i];
      if (age > life) continue;
      const q = add(add(mul(X0, -out.drift[i] + wind * age * 0.8), mul(Y0, out.cross[i])), [
        0,
        Math.max(0, out.alt[i]) + 0.3 * age,
        0,
      ]);
      pts.push(q[0], q[1], q[2], Math.max(body.R * 5 + 0.25, gap * 1.6) + 0.6 * age);
      al.push(0.26 * (1 - age / life) ** 1.5);
    }
    if (al.length) {
      const P = V3.puff;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.vp, false, C.vp);
      gl.uniform1f(P.u.h, H / (2 * tanY)); // a puff's width in metres to pixels at distance 1
      gl.uniform3f(P.u.col, 0.93, 0.93, 0.92);
      const d = new Float32Array(al.length * 5);
      for (let i = 0; i < al.length; i++) {
        d.set(pts.slice(i * 4, i * 4 + 4), i * 5);
        d[i * 5 + 4] = al[i];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, V3.dyn);
      gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(P.a.p);
      gl.vertexAttribPointer(P.a.p, 4, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(P.a.a);
      gl.vertexAttribPointer(P.a.a, 1, gl.FLOAT, false, 20, 16);
      gl.drawArrays(gl.POINTS, 0, al.length);
      gl.disableVertexAttribArray(P.a.a);
    }
  }
  gl.useProgram(Pm.p);
  gl.depthMask(true);
  drawMesh(body, place(lying, dir, roll, big));
  // parachute and its lines, above the nose end it hangs from
  if (mainOpen || drogue) {
    const dia = (mainOpen ? RD.mainDia || 1 : RD.drogueDia) * big,
      top = add(lying, mul(dir, len * big)),
      can = add(top, [0, Math.max(dia * 1.3, len * big * 0.8), 0]);
    drawMesh(mainOpen ? M.main : M.drogue, place(can, [0, 1, 0], 0, dia));
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = (2 * Math.PI * k) / 8;
      pts.push(can[0] + 0.5 * dia * Math.cos(a), can[1], can[2] + 0.5 * dia * Math.sin(a), ...top);
    }
    drawLines(pts, [0.15, 0.15, 0.17, 0.9], gl.LINES);
  }
  // the path flown so far
  {
    const pts = [],
      n = out.t.length,
      stepN = Math.max(1, Math.floor(n / 1500)),
      { ex: X0, ey: Y0 } = flightAxes();
    for (let i = 0; i < n && out.t[i] <= t; i += stepN) {
      const q = add(add(mul(X0, -out.drift[i]), mul(Y0, out.cross[i])), [0, Math.max(0, out.alt[i]), 0]);
      pts.push(q[0], q[1], q[2]);
    }
    pts.push(tail[0], tail[1], tail[2]);
    if (pts.length >= 6) drawLines(pts, [1, 1, 1, 0.55], gl.LINE_STRIP);
  }
  // flame
  gl.depthMask(false);
  if (thrust > 1 && !landed) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const fl = (1.6 + 0.5 * Math.sin(t * 90) * Math.sin(t * 53)) * Math.min(1, 0.4 + thrust / (st.maxThrust || thrust)),
      r = body.R * big * 0.75;
    drawMesh(
      V3.fixed.cone,
      place(tail, dir, 0, [r, Math.max(r * 7 * fl, len * big * 0.35 * fl), r]),
      [1, 0.55, 0.12, 0.85],
      0,
    );
    drawMesh(
      V3.fixed.cone,
      place(tail, dir, 0, [r * 0.55, Math.max(r * 4 * fl, len * big * 0.2 * fl), r * 0.55]),
      [1, 0.95, 0.7, 0.9],
      0,
    );
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  gl.depthMask(true);
  /**
   * Draws lines through points (x, y, z each) in one colour.
   */
  function drawLines(pts, col, how) {
    const d = new Float32Array((pts.length / 3) * 9);
    for (let i = 0; i < pts.length / 3; i++) {
      d.set(pts.slice(i * 3, i * 3 + 3), i * 9);
      d.set([0, 1, 0, 1, 1, 1], i * 9 + 3);
    }
    const tmp = { b: V3.dyn, n: pts.length / 3 };
    gl.bindBuffer(gl.ARRAY_BUFFER, V3.dyn);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    const P = V3.mesh;
    for (const [name, off] of [
      ["p", 0],
      ["n", 12],
      ["c", 24],
    ]) {
      if (P.a[name] == null || P.a[name] < 0) continue;
      gl.enableVertexAttribArray(P.a[name]);
      gl.vertexAttribPointer(P.a[name], 3, gl.FLOAT, false, 36, off);
    }
    gl.uniformMatrix4fv(P.u.m, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    gl.uniform4fv(P.u.tint, col);
    gl.uniform1f(P.u.lit, 0);
    gl.drawArrays(how, 0, tmp.n);
  }
  // readout
  const vz = landed ? 0 : animAt(out.t, out.vel, t),
    phase = landed
      ? "Landed"
      : mainOpen
        ? st.single
          ? "Under parachute"
          : "Under main"
        : drogue
          ? "Under drogue"
          : (st.tumble && t >= st.tumble.t) || (st.noChute && tDep != null && t >= tDep)
            ? "Tumbling"
            : thrust > 1
              ? "Motor burning"
              : t < (st.tApo ?? 1e9)
                ? "Coasting up"
                : "Falling";
  document.getElementById("animhud").innerHTML = ANIM.countEnd
    ? ""
    : `${t > 0 ? `<b>${phase}</b>` : ""}<span>T+${t.toFixed(1)} s</span><span>Altitude ${fmt(z, "alt")} ${uname("alt")}</span><span>Vertical speed ${fmt(vz, "speed")} ${uname("speed")}</span>${big > 1.5 ? `<span>Rocket drawn ${big >= 10 ? Math.round(big) : big.toFixed(1)}× size</span>` : ""}`;
  const sc = document.getElementById("animscrub");
  if (document.activeElement !== sc) sc.value = String(t);
}
/**
 * Shows the animation in 3D or in 2D, and remembers the choice.
 * @param {boolean} on
 */
export function anim3dSet(on) {
  if (on && !glStart()) {
    on = false;
    const b = document.getElementById("anim3dbtn");
    b.disabled = true;
    b.textContent = "3D not available";
  }
  V3.on = on;
  store.set("rfs-anim-3d", on);
  document.getElementById("anim3d").hidden = !on;
  document.getElementById("animcv").hidden = on;
  document.getElementById("anim3dbar").hidden = !on;
  document.getElementById("animvideo").hidden = on;
  if (!V3.bad) document.getElementById("anim3dbtn").textContent = on ? "2D view" : "3D view";
  V3.jump = true;
  anim3dModes();
}
/**
 * Marks the camera button that is on.
 */
function anim3dModes() {
  document
    .querySelectorAll("#anim3dbar [data-cam]")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.cam === V3.mode));
  const hint = document.getElementById("anim3dhint");
  if (hint) hint.hidden = V3.mode === "ground";
}
/**
 * Start-up: what this module does when the app opens (called once, in order, from main.js).
 */
export function start() {
  const cv = document.getElementById("anim3d"),
    redraw = () => {
      if (ANIM.on && V3.on && !ANIM.playing) anim3dDraw();
    };
  V3.on = !!store.get("rfs-anim-3d", false);
  document.querySelectorAll("#anim3dbar [data-cam]").forEach(
    (b) =>
      (b.onclick = () => {
        V3.mode = b.dataset.cam;
        V3.zoom = 1;
        V3.jump = true;
        anim3dModes();
        redraw();
      }),
  );
  // drag to look round the rocket (or the whole flight); pinch or the wheel to move in and out
  const P = new Map();
  let pinch = 0;
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    P.set(e.pointerId, [e.clientX, e.clientY]);
    pinch = 0;
  });
  cv.addEventListener("pointermove", (e) => {
    const was = P.get(e.pointerId);
    if (!was || V3.mode === "ground") return;
    P.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.size === 1) {
      V3.az -= (e.clientX - was[0]) * 0.008;
      V3.el = Math.min(1.45, Math.max(-0.3, V3.el + (e.clientY - was[1]) * 0.006));
    } else if (P.size === 2) {
      const [a, b] = [...P.values()],
        d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) V3.zoom = Math.min(8, Math.max(0.25, (V3.zoom * pinch) / Math.max(d, 1)));
      pinch = d;
    }
    redraw();
  });
  for (const ev of ["pointerup", "pointercancel"])
    cv.addEventListener(ev, (e) => {
      P.delete(e.pointerId);
      pinch = 0;
    });
  cv.addEventListener(
    "wheel",
    (e) => {
      if (V3.mode === "ground") return;
      e.preventDefault();
      V3.zoom = Math.min(8, Math.max(0.25, V3.zoom * Math.exp(e.deltaY * 0.0012)));
      redraw();
    },
    { passive: false },
  );
  window.addEventListener("resize", redraw);
}
