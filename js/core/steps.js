// Step recorder and check helpers shared by every calc file. Pure: no DOM, no rounding.

// Token helpers. v(): number without its unit (for substitution lines);
// u(): number with its unit (for result lines); si(): stays in SI with unit in both systems.
export const v = (x, q = 'ratio') => ({ v: x, q });
export const u = (x, q = 'ratio') => ({ v: x, q, u: true });
export const si = (x, q = 'ratio') => ({ v: x, q, u: true, si: true });
export const dc = (x) => ({ v: x, q: 'ratio', dc: true });

// Tagged template that builds a token array: S`a = ${v(As,'area')} / ${0.85}`.
// A value of the form { SI: [...], US: [...] } makes the whole line unit-system specific.
export function S(strings, ...vals) {
  const dual = vals.some((x) => x && !Array.isArray(x) && typeof x === 'object' && x.SI && x.US);
  const build = (sys) => {
    const out = [];
    strings.forEach((str, i) => {
      if (str) out.push(str);
      if (i < vals.length) {
        let x = vals[i];
        if (x && !Array.isArray(x) && typeof x === 'object' && x.SI && x.US) x = x[sys];
        if (Array.isArray(x)) out.push(...x);
        else if (typeof x === 'number') out.push({ v: x, q: 'ratio' });
        else if (x != null) out.push(x);
      }
    });
    return out;
  };
  return dual ? { SI: build('SI'), US: build('US') } : build('SI');
}

// A moment (kN·m) written in the units a stress formula needs: N·mm, or kip·in in English units.
export const Nmm = (M) => ({ SI: [v(M, 'moment'), ' × 10⁶'], US: [v(M, 'moment'), ' × 12'] });
// A force (kN) written in N for a stress formula (kip stays kip in English units).
export const Nn = (P) => ({ SI: [v(P, 'force'), ' × 10³'], US: [v(P, 'force')] });

export function recorder() {
  const steps = [];
  return {
    steps,
    add(title, formula, substitution, result, clause, note) {
      steps.push({ title, formula: formula || null, substitution: substitution || null, result: result || null, note: note || '', clause: clause || null });
    }
  };
}

// Status thresholds on demand over capacity (a display convention, not a code value).
// A ratio within 1e-4 of 1.000 prints as 1.000 and is treated as meeting the limit, so the 5-significant-figure
// rounding of converted English inputs cannot turn a check that sits exactly on its limit into NG.
export const LIMITS = { near: 0.90, ng: 1.00, tol: 1e-4 };
export function statusOf(ratio) {
  if (!(ratio <= LIMITS.ng + LIMITS.tol)) return 'NG';
  return ratio >= LIMITS.near ? 'NEAR' : 'OK';
}

// demand and capacity are [label, value, quantity]. D/C is demand over capacity.
export function check(name, demand, capacity, ratio, clause, extra) {
  const c = {
    name,
    demand: { label: demand[0], value: demand[1], q: demand[2] },
    capacity: { label: capacity[0], value: capacity[1], q: capacity[2] },
    dc: ratio, status: statusOf(ratio), clause
  };
  if (extra) Object.assign(c, extra);
  return c;
}

export function verdictOf(checks) {
  if (!checks.length) return null;
  let gov = checks[0];
  checks.forEach((c) => { if (!(c.dc <= gov.dc)) gov = c; });
  return { pass: !checks.some((c) => c.status === 'NG'), governing: gov.name, dc: gov.dc };
}

export function blank() {
  return { ok: true, errors: [], warnings: [], notes: [], verdict: null, checks: [], results: [], steps: [], diagram: {}, send: [] };
}

export function fail(errors, diagram) {
  const r = blank();
  r.ok = false; r.errors = [].concat(errors); r.diagram = diagram || {};
  return r;
}

export const res = (label, value, q = 'ratio', symbol = '') => ({ label, symbol, value, q });

// True when every listed key of obj is a finite number above zero.
export function positive(obj, keys) { return keys.every((k) => typeof obj[k] === 'number' && isFinite(obj[k]) && obj[k] > 0); }
export function finite(obj, keys) { return keys.every((k) => typeof obj[k] === 'number' && isFinite(obj[k])); }
