#!/usr/bin/env python3
"""Cross-check a steel shapes CSV for transcription errors.

Usage:  python3 tools/validate_shapes.py data/steel-shapes.csv

Each W row is tested with 13 internal consistency checks, each S row with 8. A printed
table is rounded and its dimensions are soft-converted, so each check has a
tolerance. A row that fails any check almost always has a mistyped digit:
compare that row with the printed table again. C and L rows are checked
for rx, ry, rz and mass (their other relations differ).
Units: A mm2; lengths mm; I in 1e6 mm4; S and Z in 1e3 mm3; J in 1e3 mm4;
Cw in 1e9 mm6; W in kg/m.
"""
import csv, math, sys

def num(row, key):
    v = (row.get(key) or "").strip()
    return float(v) if v else None

def checks_for(r):
    g = lambda k: num(r, k)
    A, d, bf, tw, tf = g("A"), g("d"), g("bf"), g("tw"), g("tf")
    Ix, Iy, Sx, Sy, Zx, Zy = g("Ix"), g("Iy"), g("Sx"), g("Sy"), g("Zx"), g("Zy")
    out = []  # (name, listed, computed, tolerance as a fraction)
    def add(name, listed, computed, tol):
        if listed is not None and computed is not None:
            out.append((name, listed, computed, tol))
    if A and Ix: add("rx = sqrt(Ix/A)", g("rx"), math.sqrt(Ix * 1e6 / A), 0.015)
    if A and Iy: add("ry = sqrt(Iy/A)", g("ry"), math.sqrt(Iy * 1e6 / A), 0.015)
    if A: add("W = 7850 A", g("W"), A * 7850e-6, 0.07)
    if A and g("Iz"): add("rz = sqrt(Iz/A)", g("rz"), math.sqrt(g("Iz") * 1e6 / A), 0.03)
    if (r.get("type") or "").strip() not in ("W", "S"):
        return out
    if None in (A, d, bf, tw, tf):
        return out
    if Ix: add("Sx = 2 Ix/d", Sx, 2 * Ix * 1e6 / d / 1e3, 0.015)
    if Iy: add("Sy = 2 Iy/bf", Sy, 2 * Iy * 1e6 / bf / 1e3, 0.02)
    add("bf/2tf", g("bf_2tf"), bf / (2 * tf), 0.03)
    add("ho = d - tf", g("ho"), d - tf, 0.01)
    if g("kdes") and r["type"].strip() == "W":
        add("h/tw = (d - 2 kdes)/tw", g("h_tw"), (d - 2 * g("kdes")) / tw, 0.04)
    if Iy and g("ho"): add("Cw = Iy ho^2/4", g("Cw"), Iy * 1e6 * g("ho") ** 2 / 4 / 1e9, 0.03)
    if r["type"].strip() == "S":
        return out  # tapered flanges: the flat plate formulas below do not apply
    add("A (plates, no fillets)", A, 2 * bf * tf + (d - 2 * tf) * tw, 0.06)
    add("Zx (plates, no fillets)", Zx, (bf * tf * (d - tf) + tw * (d - 2 * tf) ** 2 / 4) / 1e3, 0.05)
    add("Zy (plates, no fillets)", Zy, (tf * bf ** 2 / 2 + (d - 2 * tf) * tw ** 2 / 4) / 1e3, 0.05)
    if Iy and g("Cw") and Sx:
        add("rts = sqrt(sqrt(Iy Cw)/Sx)", g("rts"),
            math.sqrt(math.sqrt(Iy * 1e6 * g("Cw") * 1e9) / (Sx * 1e3)), 0.02)
    return out

def main(path):
    bad = rows = 0
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows += 1
            for name, listed, comp, tol in checks_for(r):
                err = abs(listed - comp) / abs(comp) if comp else 0
                if err > tol:
                    bad += 1
                    print(f"CHECK {r['designation']}: {name}: listed {listed:g}, "
                          f"computed {comp:.4g} ({err*100:.1f}% apart, limit {tol*100:g}%)")
    print(f"{rows} rows read, {bad} checks failed")
    return 1 if bad else 0

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
