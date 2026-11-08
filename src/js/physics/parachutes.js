/**
 * Parachute opening: how fast a canopy fills after deployment, and the drag area it presents while it does.
 */
/* parachutes take time to open: a canopy fills once the air has travelled a set distance through it, n·D (Knacke's
   fill distance, fill constant n = 8 for solid canopies), and the drag area grows as (s/(n·D))² with s the distance
   so far. Knacke's fill time t_f = n·D/v is the same thing at a steady speed; counting distance instead keeps a chute
   opened at apogee, where the rocket is barely moving, from taking many seconds to fill: it fills as the rocket falls.
   The airframe hanging below adds its own drag (Cd about 0.5). */
/**
 * A canopy starting to open: when, at what airspeed, the distance it needs to fill and an estimate of its fill time.
 * @param {number} t
 * @param {number} va airspeed
 * @param {number} d canopy diameter
 * @returns {object}
 */
export function opening(t, va, d) {
  const FILL_N = 8; // fill constant n, for solid canopies
  const sf = Math.max(FILL_N * d, 1e-3);
  return { t, v: va, sf, s: 0, ts: t, va, tf: Math.max(sf / Math.max(va, 1), 0.05) };
}
/**
 * Moves a filling canopy's distance on to time t at airspeed va (after each step), and its fill-time estimate.
 * @param {object|null} o from opening
 * @param {number} t
 * @param {number} va
 */
export function fillStep(o, t, va) {
  if (!o || o.s >= o.sf) return;
  o.s += 0.5 * (o.va + va) * (t - o.ts);
  o.ts = t;
  o.va = va;
  o.tf = o.s >= o.sf ? Math.max(t - o.t, 0.05) : Math.max(t - o.t + (o.sf - o.s) / Math.max(va, 1), 0.05);
}
/**
 * How far open a canopy is at time t, as a fraction of its full drag area (1 with none).
 * @param {object|null} o from opening
 * @param {number} t
 * @returns {number}
 */
export function fill(o, t) {
  return !o ? 1 : Math.min(1, Math.max(0, (o.s + o.va * Math.max(t - o.ts, 0)) / o.sf) ** 2);
}
