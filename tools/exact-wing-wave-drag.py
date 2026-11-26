#!/usr/bin/env python3
"""Exact linear (thin-wing) theory wave drag of a symmetric, straight-edged wing at zero lift, worked out independently
of the app's area rule (finWaveAt in src/js/physics/drag-model.js), so tests/drag-benchmarks.js can check it.

    python3 tools/exact-wing-wave-drag.py '<wing as JSON>' '[beta, ...]'

The wing: {"cr": root chord, "ct": tip chord, "s": semispan, "xt": leading edge's offset at the tip, "sec": ...}, the
fin mirrored at its root (the body as a wall), any one unit of length; "sec" is "hex" (a plate of thickness "t" with
bevels "le" and "te" long, as the app's beveled fin), "hexr" (thickness ratio "tc", bevels the fraction "fa" of the
chord) or "dw" (double wedge, thickness ratio "tc"). Prints CD on the wing's planform area at each beta = sqrt(M^2 - 1).
Needs numpy. Checked: a rectangular double-wedge wing gives 4(t/c)^2/beta to five figures.
"""
import numpy as np, sys, json
# Exact linear (thin-wing) theory wave drag of a symmetric wing at zero lift, by the supersonic source
# distribution: phi(x,y) = -(1/pi) iint lam(xi,eta) / sqrt((x-xi)^2 - beta^2 (y-eta)^2); drag/q = -4 iint lam u dA,
# and per strip  int lam u dx = sum_s lam_s [phi(end_s) - phi(start_s)]  (lam piecewise constant along x).
# Fin outline: trapezoid with root chord cr, tip chord ct, semispan s, LE offset at tip xt; mirrored at the root.
def segs_at(y, g):
    cr, ct, s, xt = g["cr"], g["ct"], g["s"], g["xt"]
    f = abs(y)/s
    xl = xt*f; c = cr + (ct-cr)*f
    if g["sec"] == "hex":
        t, le, te = g["t"], g["le"], g["te"]
        k = 1/((le+te)/c) if le+te > c else 1
        a, b = le*k, te*k; T = t*k
        return [(xl, xl+a, (T/2)/a), (xl+a, xl+c-b, 0.0), (xl+c-b, xl+c, -(T/2)/b)]
    if g["sec"] == "hexr":
        T = g["tc"]*c; a = g["fa"]*c; b = g["fa"]*c
        return [(xl, xl+a, (T/2)/a), (xl+a, xl+c-b, 0.0), (xl+c-b, xl+c, -(T/2)/b)]
    if g["sec"] == "dw":
        T = g["tc"]*c
        return [(xl, xl+c/2, (T/2)/(c/2)), (xl+c/2, xl+c, -(T/2)/(c/2))]
def cd(g, beta, ns=240, ne=6000):
    s = g["s"]
    ys = (np.arange(ns)+0.5)/ns*s                      # strips on one half (symmetric)
    eta = (np.arange(ne)+0.5)/ne*2*s - s               # source strips over the whole wing
    deta = 2*s/ne
    E = [segs_at(e, g) for e in eta]
    xa = np.array([[sg[0] for sg in e] for e in E]); xb = np.array([[sg[1] for sg in e] for e in E]); la = np.array([[sg[2] for sg in e] for e in E])
    def phi(x, y):
        r = beta*np.abs(y-eta)[:, None]
        r = np.maximum(r, 1e-12)
        top = np.minimum(xb, x - r)
        ok = (x - r) > xa
        z1 = np.where(ok, (x-xa)/r, 1.0); z2 = np.where(ok, np.maximum((x-top)/r, 1.0), 1.0)
        val = np.where(ok, np.arccosh(np.maximum(z1, 1.0)) - np.arccosh(z2), 0.0)
        return -(1/np.pi)*np.sum(la*val)*deta
    D = 0.0; area = 0.0
    for y in ys:
        sg = segs_at(y, g)
        c = sg[-1][1]-sg[0][0]; area += c*(s/ns)
        tot = 0.0
        for (a, b, lam) in sg:
            if lam != 0: tot += lam*(phi(b, y)-phi(a, y))
        D += -4*tot*(s/ns)
    return D/area
g = json.loads(sys.argv[1]); betas = json.loads(sys.argv[2])
for b in betas:
    v = cd(g, b)
    print(f"beta {b}: CD {v:.5f}")
