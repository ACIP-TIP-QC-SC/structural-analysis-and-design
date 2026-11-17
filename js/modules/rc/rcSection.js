// Strain-compatibility engine for rectangular RC sections under axial load and bending about one axis.
// Shared by Columns (interaction diagram) and Shear walls. Pure: no DOM, no rounding.
// section: { b, h, fc, fy, layers: [{ d, As }], spiral }   (mm, mm², MPa)
// Forces in N, moments in N·mm about the mid-depth of the section, compression positive.

export function sectionTotals(section) {
  const Ast = section.layers.reduce((t, l) => t + l.As, 0);
  const dt = Math.max(...section.layers.map((l) => l.d));
  return { Ast, dt, Ag: section.b * section.h };
}

// Squash load and the maximum axial strength.
export function axialCapacity(section, ed) {
  const C = ed.concrete, { Ast, Ag } = sectionTotals(section);
  const Po = C.sb * section.fc * (Ag - Ast) + section.fy * Ast;
  const k = section.spiral ? C.column.PnMax.spiral : C.column.PnMax.tied, phi = section.spiral ? C.phi.spiral : C.phi.tied;
  return { Po, PnMax: k * Po, phi, phiPnMax: phi * k * Po, k };
}

// One point of the interaction diagram for a neutral axis depth c.
export function interactionPoint(section, c, ed) {
  const C = ed.concrete, Es = C.Es, ecu = C.ecu, fy = section.fy, s85 = C.sb * section.fc, h = section.h;
  const a = Math.min(C.beta1(section.fc) * c, h);
  const Cc = s85 * a * section.b;
  let Pn = Cc, Mn = Cc * (h / 2 - a / 2);
  const forces = section.layers.map((l) => {
    const es = ecu * (c - l.d) / c, fs = Math.max(-fy, Math.min(fy, Es * es));
    const F = l.As * (fs - (l.d < a && fs > 0 ? s85 : 0));
    Pn += F; Mn += F * (h / 2 - l.d);
    return { d: l.d, As: l.As, es, fs, F };
  });
  const dt = Math.max(...section.layers.map((l) => l.d)), et = ecu * (dt - c) / c;
  const phi = C.phi.flexAxial(et, fy, !!section.spiral);
  return { c, a, Cc, Pn, Mn, et, phi, forces };
}

// Neutral axis depth for a target: bisection on a monotonic function of c.
function bisect(fn, lo, hi, n = 100) {
  let flo = fn(lo);
  for (let i = 0; i < n; i++) {
    const mid = (lo + hi) / 2, fm = fn(mid);
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return hi;
}

// Named points of the diagram.
export function namedPoints(section, ed) {
  const C = ed.concrete, { Ast, dt } = sectionTotals(section), ety = C.ety(section.fy), ax = axialCapacity(section, ed);
  const bal = interactionPoint(section, C.ecu / (C.ecu + ety) * dt, ed);
  const tc = interactionPoint(section, C.ecu / (C.ecu + C.etTension) * dt, ed);
  // Pure bending: Pn = 0. Pn grows with c, so bisect between a tiny and a full-depth neutral axis.
  const cPB = bisect((c) => interactionPoint(section, c, ed).Pn, 1e-3 * section.h, section.h);
  const pb = interactionPoint(section, cPB, ed);
  const PnT = -section.fy * Ast;
  return {
    pureCompression: { Pn: ax.Po, Mn: 0, phi: ax.phi, phiPn: Math.min(ax.phi * ax.Po, ax.phiPnMax), phiMn: 0 },
    maxAxial: { Pn: ax.PnMax, phiPn: ax.phiPnMax },
    balanced: Object.assign(bal, { phiPn: bal.phi * bal.Pn, phiMn: bal.phi * bal.Mn }),
    tensionLimit: Object.assign(tc, { phiPn: tc.phi * tc.Pn, phiMn: tc.phi * tc.Mn }),
    pureBending: Object.assign(pb, { phiPn: 0, phiMn: pb.phi * pb.Mn }),
    pureTension: { Pn: PnT, Mn: 0, phi: C.phi.tension, phiPn: C.phi.tension * PnT, phiMn: 0 }
  };
}

// Nominal and design curves from c = 3h down to 0.02h, plus the end points. phiPn is capped at phiPn,max.
export function interactionCurve(section, ed) {
  const K = ed.concrete.column, ax = axialCapacity(section, ed), { Ast } = sectionTotals(section);
  const nominal = [[0, ax.Po]], design = [[0, ax.phiPnMax]];
  for (let i = 0; i <= K.sweepSteps; i++) {
    const c = section.h * (K.sweepTop - (K.sweepTop - K.sweepBottom) * i / K.sweepSteps);
    const p = interactionPoint(section, c, ed);
    nominal.push([p.Mn, p.Pn]);
    design.push([p.phi * p.Mn, Math.min(p.phi * p.Pn, ax.phiPnMax)]);
  }
  const PnT = -section.fy * Ast;
  nominal.push([0, PnT]); design.push([0, ed.concrete.phi.tension * PnT]);
  return { nominal, design, axial: ax };
}

// Capacity at the eccentricity e = Mu / Pu (mm): neutral axis found by bisection so that Mn / Pn = e.
export function capacityAtEccentricity(section, e, ed) {
  const ax = axialCapacity(section, ed);
  const f = (c) => { const p = interactionPoint(section, c, ed); return p.Pn <= 0 ? -1 : e - p.Mn / p.Pn; };
  // Mn/Pn falls as c grows; the root lies between a shallow and a very deep neutral axis.
  const c = bisect(f, 1e-3 * section.h, 10 * section.h);
  const p = interactionPoint(section, c, ed);
  const phiPn = Math.min(p.phi * p.Pn, ax.phiPnMax);
  return Object.assign(p, { phiPn, phiMn: phiPn * e, capped: p.phi * p.Pn > ax.phiPnMax });
}

// Layers from a simple bar arrangement. arrangement: 'two' (two faces) or 'four' (all four faces).
export function layersFromBars(p) {
  const ab = Math.PI * p.db * p.db / 4, dc = p.cover + p.tie + p.db / 2, dt = p.h - dc;
  if (p.arrangement === 'two' || p.n < 4) {
    const top = Math.ceil(p.n / 2), bot = p.n - top;
    return [{ d: dc, As: top * ab }, { d: dt, As: bot * ab }].filter((l) => l.As > 0);
  }
  // All four faces: corner bars plus the rest shared round the perimeter.
  const perFace = Math.max(Math.round(p.n / 4) + 1, 2);
  const inner = p.n - 2 * perFace, nMid = Math.max(Math.round(inner / 2), 0);
  const layers = [{ d: dc, As: perFace * ab }];
  for (let i = 1; i <= nMid; i++) layers.push({ d: dc + (dt - dc) * i / (nMid + 1), As: 2 * ab });
  layers.push({ d: dt, As: perFace * ab });
  const used = 2 * perFace + 2 * nMid;
  if (used !== p.n) return null;
  return layers;
}
