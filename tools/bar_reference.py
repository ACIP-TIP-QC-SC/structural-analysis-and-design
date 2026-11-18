#!/usr/bin/env python3
"""Independent checks of the Bars (axial) tests BR-1 to BR-3 (hand-off Section 9).

Two separate solutions of each problem:
  * by hand: closed-form equilibrium and compatibility of the free node (written out below);
  * by the direct stiffness method with numpy, using the hand-off's fixed-end forces
      Pf1 = -( L(2w1 + w2)/6 + P(L - a)/L ) + EA(a dT + e0/L)
      Pf2 = -( L(w1 + 2w2)/6 + P a/L )     - EA(a dT + e0/L)
    and N@1st = k(u2 - u1) - Pf1, N@2nd = k(u2 - u1) + Pf2.
Units: kN, m, kPa (consistent). Usage: python3 tools/bar_reference.py [--json out.json]
"""
import sys, json, math
import numpy as np

E1, E2 = 2e8, 7e7   # steel and aluminium, kPa

CASES = {
    'BR-1': dict(title='two elements between walls: a point load in element 1, a linear load on element 2, a node load',
                 nodes={1: ('fixed', 0), 2: ('free', 30.0), 3: ('fixed', 0)},
                 elems=[dict(i=1, j=2, E=E1, A=0.001, L=2.0, P=60.0, a=1.2),
                        dict(i=2, j=3, E=E2, A=0.0015, L=3.0, w1=5.0, w2=15.0)]),
    'BR-2': dict(title='two steel elements between walls heated 40 degrees: N = -EA alpha dT',
                 nodes={1: ('fixed', 0), 2: ('free', 0), 3: ('fixed', 0)},
                 elems=[dict(i=1, j=2, E=E1, A=0.002, L=2.0, alpha=11.7e-6, dT=40.0),
                        dict(i=2, j=3, E=E1, A=0.002, L=2.0, alpha=11.7e-6, dT=40.0)]),
    'BR-3': dict(title='bolt and sleeve: bolt 0.2 mm too short (misfit), both heated 50 degrees',
                 nodes={1: ('fixed', 0), 2: ('free', 0)},
                 elems=[dict(i=1, j=2, E=E1, A=math.pi * 0.02 ** 2 / 4, L=0.15, e0=-0.0002, alpha=11.7e-6, dT=50.0),
                        dict(i=1, j=2, E=E2, A=0.0006, L=0.15, alpha=23e-6, dT=50.0)]),
}

def g(e, k): return e.get(k, 0.0)

def pf(e):
    L, w1, w2, P, a = e['L'], g(e, 'w1'), g(e, 'w2'), g(e, 'P'), g(e, 'a')
    th = e['E'] * e['A'] * (g(e, 'alpha') * g(e, 'dT') + g(e, 'e0') / L)
    return (-(L * (2 * w1 + w2) / 6 + P * (L - a) / L) + th, -(L * (w1 + 2 * w2) / 6 + P * a / L) - th)

def dsm(c):
    ids = sorted(c['nodes']); ix = {n: k for k, n in enumerate(ids)}
    n = len(ids); K = np.zeros((n, n)); F = np.zeros(n); Feq = np.zeros(n)
    for e in c['elems']:
        k = e['E'] * e['A'] / e['L']; p, q = ix[e['i']], ix[e['j']]
        K[np.ix_([p, q], [p, q])] += k * np.array([[1, -1], [-1, 1]])
        f1, f2 = pf(e); Feq[p] -= f1; Feq[q] -= f2
    for nd, (sup, load) in c['nodes'].items(): F[ix[nd]] += load
    free = [ix[nd] for nd, (sup, _) in c['nodes'].items() if sup == 'free']
    U = np.zeros(n)
    U[free] = np.linalg.solve(K[np.ix_(free, free)], (F + Feq)[free])
    R = K @ U - F - Feq
    out = {'U': {f'U{nd}': U[ix[nd]] for nd in ids}, 'R': {f'F{nd}': R[ix[nd]] for nd, (s, _) in c['nodes'].items() if s == 'fixed'}, 'N1': {}, 'N2': {}}
    for m, e in enumerate(c['elems'], 1):
        k = e['E'] * e['A'] / e['L']; du = U[ix[e['j']]] - U[ix[e['i']]]; f1, f2 = pf(e)
        out['N1'][str(m)] = k * du - f1; out['N2'][str(m)] = k * du + f2
    return out

def by_hand(name):
    """Closed-form solutions (one free node each)."""
    if name == 'BR-1':
        k1, k2 = E1 * 0.001 / 2, E2 * 0.0015 / 3                 # 100 000 and 35 000 kN/m
        # fixed-end forces: element 1, P = 60 at a = 1.2: Pf = -60(0.8)/2, -60(1.2)/2 = -24, -36
        # element 2, w1 = 5, w2 = 15 over L = 3: Pf = -3(10 + 15)/6, -3(5 + 30)/6 = -12.5, -17.5
        u2 = (30 + 36 + 12.5) / (k1 + k2)                          # node 2: k u2 = F + Feq
        return {'U.U2': u2, 'N1.1': k1 * u2 + 24, 'N2.1': k1 * u2 - 36, 'N1.2': -k2 * u2 + 12.5, 'N2.2': -k2 * u2 - 17.5,
                'R.F1': -(k1 * u2 + 24), 'R.F3': -k2 * u2 - 17.5}
    if name == 'BR-2':
        N = -E1 * 0.002 * 11.7e-6 * 40                             # -187.2 kN: no movement, N = -EA alpha dT
        return {'U.U2': 0.0, 'N1.1': N, 'N2.1': N, 'N1.2': N, 'N2.2': N, 'R.F1': -N, 'R.F3': N}
    if name == 'BR-3':
        Ab = math.pi * 0.02 ** 2 / 4; L = 0.15
        kb, ks = E1 * Ab / L, E2 * 0.0006 / L
        eb, es = 11.7e-6 * 50 - 0.0002 / L, 23e-6 * 50           # free strains of bolt and sleeve
        u2 = L * (kb * eb + ks * es) / (kb + ks)                   # node 2 moves until the forces balance
        Nb, Ns = kb * (u2 - L * eb), ks * (u2 - L * es)            # equal and opposite
        return {'U.U2': u2, 'N1.1': Nb, 'N2.1': Nb, 'N1.2': Ns, 'N2.2': Ns, 'R.F1': 0.0}

def main():
    out, bad = {}, 0
    for name, c in CASES.items():
        d = dsm(c); hand = by_hand(name)
        flat = {f'{grp}.{k}': v for grp in ('U', 'R', 'N1', 'N2') for k, v in d[grp].items()}
        print(f'{name}: {c["title"]}')
        for path, hv in hand.items():
            dv = flat[path]; ok = abs(dv - hv) <= 1e-9 * max(1.0, abs(hv))
            bad += 0 if ok else 1
            print(f'   {path:8s} by hand {hv: .10g}   by DSM {dv: .10g}   {"ok" if ok else "DIFFERS"}')
        out[name] = {'hand': hand, 'dsm': flat}
    print(f'\n{sum(len(by_hand(n)) for n in CASES) - bad} of {sum(len(by_hand(n)) for n in CASES)} hand values reproduced by the DSM ({bad} differ).')
    if '--json' in sys.argv: json.dump(out, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)

if __name__ == '__main__':
    main()
