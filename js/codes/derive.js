// Builds an edition from another one: a deep copy of `base` with `overrides` merged on top and `meta` (id, label,
// short, status, enabled, ...) set on the result. Used for NSCP 2025: enter only what changed.
//
// overrides accepts both forms, mixed freely:
//   { 'concrete.phi.shear': 0.80 }                        a dotted path to one value
//   { concrete: { phi: { shear: 0.80 } } }                 nested objects, merged key by key
//   { 'clauses.steel.comp.Fcr': { nscp: '505.3' } }        a clause: everything after 'clauses.' is the clause key
// Functions are kept (copied by reference) and arrays are replaced whole. Clause overrides merge per clause key:
// the fields given replace those of that clause, the other clauses stay as they are.

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export function deepCopy(x) {
  if (Array.isArray(x)) return x.map(deepCopy);
  if (isObj(x)) { const out = {}; Object.keys(x).forEach((k) => { out[k] = deepCopy(x[k]); }); return out; }
  return x;   // numbers, strings, booleans, null and functions
}

function mergeInto(target, src) {
  Object.keys(src).forEach((k) => {
    if (isObj(src[k]) && isObj(target[k])) mergeInto(target[k], src[k]);
    else target[k] = deepCopy(src[k]);
  });
}

function setPath(obj, path, val) {
  const clause = path.startsWith('clauses.');
  const keys = clause ? ['clauses', path.slice('clauses.'.length)] : path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { if (!isObj(o[k])) o[k] = {}; o = o[k]; });
  const last = keys[keys.length - 1];
  if (isObj(val) && isObj(o[last])) mergeInto(o[last], val); else o[last] = deepCopy(val);
}

export function derive(base, overrides = {}, meta = {}) {
  const out = deepCopy(base);
  Object.keys(overrides).forEach((k) => {
    if (k.includes('.')) setPath(out, k, overrides[k]);
    else mergeInto(out, { [k]: overrides[k] });
  });
  return Object.assign(out, meta);
}
