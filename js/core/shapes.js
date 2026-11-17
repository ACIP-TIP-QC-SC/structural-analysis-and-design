// Steel shape helpers. Nothing here depends on which shapes exist.

// Multipliers that turn the file units of data/steel-shapes.json into mm-based SI.
export const SHAPE_SCALE = { Ix: 1e6, Iy: 1e6, Iz: 1e6, Zx: 1e3, Sx: 1e3, Zy: 1e3, Sy: 1e3, Sz: 1e3, J: 1e3, Cw: 1e9 };

export function shapeValue(shape, col) {
  const x = shape ? shape[col] : null;
  if (x == null || x === '') return null;
  return typeof x === 'number' ? x * (SHAPE_SCALE[col] || 1) : x;
}

// Properties of an I-shape from its four dimensions, ignoring fillets ("estimated").
export function estimateI(d, bf, tf, tw) {
  const hw = d - 2 * tf;
  const A = 2 * bf * tf + hw * tw;
  const Ix = (bf * Math.pow(d, 3) - (bf - tw) * Math.pow(hw, 3)) / 12;
  const Sx = 2 * Ix / d;
  const Zx = bf * tf * (d - tf) + tw * hw * hw / 4;
  const Iy = (2 * tf * Math.pow(bf, 3) + hw * Math.pow(tw, 3)) / 12;
  const Sy = 2 * Iy / bf;
  const Zy = tf * bf * bf / 2 + hw * tw * tw / 4;
  const ho = d - tf;
  const J = (2 * bf * Math.pow(tf, 3) + (d - tf) * Math.pow(tw, 3)) / 3;
  const Cw = Iy * ho * ho / 4;
  return {
    A, d, bf, tf, tw, Ix, Sx, Zx, Iy, Sy, Zy, rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A), ho, J, Cw,
    rts: Math.sqrt(Math.sqrt(Iy * Cw) / Sx), h_tw: hw / tw, bf_2tf: bf / (2 * tf)
  };
}
