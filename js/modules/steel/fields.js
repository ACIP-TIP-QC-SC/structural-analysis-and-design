// Field definitions shared by the steel UI files.
export const num = (key, label, symbol, quantity, step, def, extra) => Object.assign({ key, label, symbol, quantity, step, default: def }, extra);
export const sel = (key, label, step, def, options, extra) => Object.assign({ key, label, type: 'select', step, default: def, options }, extra);

// Grade select plus Fy (and Fu) when Custom is chosen.
export function gradeFields(ed, val, step, def, withFu) {
  const opts = ed.steel.grades.map((g) => ({ value: g.value, label: g.label + ' (Fy ' + g.Fy + (withFu ? ', Fu ' + g.Fu : '') + ' MPa)' })).concat([{ value: 'custom', label: 'Custom' }]);
  const f = [sel('grade', 'Steel grade', step, def, opts, { wide: true })];
  if (val.grade === 'custom') {
    f.push(num('Fy', 'yield strength', 'Fy', 'stress', step, 248));
    if (withFu) f.push(num('Fu', 'tensile strength', 'Fu', 'stress', step, 400));
  }
  return f;
}
export const prop = (key, col, label, symbol, quantity, def, extra) => Object.assign({ key, col, label, symbol, quantity, default: def }, extra);
export const demand = (method, what, sym, quantity, step, def) => num(what, 'required strength (' + method + ')', method === 'ASD' ? sym + 'a' : sym + 'u', quantity, step, def);

// Property fields of an I-shape. `defaults` holds mm-based SI values keyed by field key.
const I_PROPS = {
  Ag: ['A', 'gross area', 'Ag', 'area'], dsec: ['d', 'depth', 'd', 'length_mm'], bf: ['bf', 'flange width', 'bf', 'length_mm'], tf: ['tf', 'flange thickness', 'tf', 'length_mm'],
  tw: ['tw', 'web thickness', 'tw', 'length_mm'], bf2tf: ['bf_2tf', 'flange slenderness', 'bf/2tf', 'ratio'], htw: ['h_tw', 'web slenderness', 'h/tw', 'ratio'],
  Ix: ['Ix', 'moment of inertia, major axis', 'Ix', 'inertia'], Zx: ['Zx', 'plastic modulus, major axis', 'Zx', 'modulus3'], Sx: ['Sx', 'elastic modulus, major axis', 'Sx', 'modulus3'],
  rx: ['rx', 'radius of gyration, major axis', 'rx', 'length_mm'], Iy: ['Iy', 'moment of inertia, minor axis', 'Iy', 'inertia'], Zy: ['Zy', 'plastic modulus, minor axis', 'Zy', 'modulus3'], Sy: ['Sy', 'elastic modulus, minor axis', 'Sy', 'modulus3'],
  ry: ['ry', 'radius of gyration, minor axis', 'ry', 'length_mm'], J: ['J', 'torsional constant', 'J', 'inertia'], rts: ['rts', 'effective radius of gyration', 'rts', 'length_mm'],
  ho: ['ho', 'distance between flange centroids', 'ho', 'length_mm']
};
export function iProps(keys, defaults, optional = []) {
  return keys.map((k) => prop(k, I_PROPS[k][0], I_PROPS[k][1], I_PROPS[k][2], I_PROPS[k][3], defaults[k], optional.includes(k) ? { optional: true } : null));
}
// Maps the estimate of core/shapes.js onto the field keys.
export function estimatePatch(est, keys) {
  const map = { Ag: 'A', dsec: 'd', bf: 'bf', tf: 'tf', tw: 'tw', bf2tf: 'bf_2tf', htw: 'h_tw', Ix: 'Ix', Zx: 'Zx', Sx: 'Sx', rx: 'rx', Zy: 'Zy', Sy: 'Sy', ry: 'ry', J: 'J', rts: 'rts', ho: 'ho' };
  const out = {};
  keys.forEach((k) => { if (typeof est[map[k]] === 'number' && isFinite(est[map[k]])) out[k] = est[map[k]]; });
  return out;
}
export const W250x73 = { Ag: 9290, dsec: 254, bf: 254, tf: 14.2, tw: 8.6, bf2tf: 8.93, htw: 23.1, Ix: 113.21e6, Zx: 989.8e3, Sx: 894.7e3, rx: 110, Zy: 463.8e3, Sy: 306.4e3, ry: 64.5, J: 578.6e3, rts: 72.1, ho: 239.8, Iy: 38.88e6 };
export const W250x45 = { Ag: 5703, dsec: 267, bf: 148, tf: 13.0, tw: 7.6, bf2tf: 5.7, htw: 29.5, Ix: 70.759e6, Zx: 599.8e3, Sx: 530.9e3, rx: 111, Zy: 144.9e3, Sy: 94.23e3, ry: 34.8, J: 258.9e3, rts: 40.6, ho: 253.7 };
