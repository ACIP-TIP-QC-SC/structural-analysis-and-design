// Unit systems and conversion. Internal values are SI in the "SI unit shown" below.
// English value x factor = SI value.
export const QUANTITIES = {
  length_mm:  { si: 'mm',    us: 'in',     f: 25.4 },
  length_m:   { si: 'm',     us: 'ft',     f: 0.3048 },
  area:       { si: 'mm²',   us: 'in²',    f: 645.16 },
  inertia:    { si: 'mm⁴',   us: 'in⁴',    f: 416231.4256 },
  modulus3:   { si: 'mm³',   us: 'in³',    f: 16387.064 },
  force:      { si: 'kN',    us: 'kip',    f: 4.4482216 },
  moment:     { si: 'kN·m',  us: 'kip·ft', f: 1.3558179 },
  stress:     { si: 'MPa',   us: 'ksi',    f: 6.8947573 },
  pressure:   { si: 'kPa',   us: 'ksf',    f: 47.880259 },
  lineload:   { si: 'kN/m',  us: 'kip/ft', f: 14.593903 },
  unitweight: { si: 'kN/m³', us: 'pcf',    f: 0.15708746 },
  ratio:      { si: '',      us: '',       f: 1 },
  strain:     { si: '',      us: '',       f: 1 },
  count:      { si: 'pcs',   us: 'pcs',    f: 1 },
  angle_deg:  { si: '°',     us: '°',      f: 1 },
  // Derived quantities (built from the factors above).
  area_m2:      { si: 'm²',     us: 'ft²',       f: 0.3048 * 0.3048 },
  area_per_mm:  { si: 'mm²/mm', us: 'in²/in',    f: 25.4 },
  area_per_m:   { si: 'mm²/m',  us: 'in²/ft',    f: 645.16 / 0.3048 },
  moment_per_m: { si: 'kN·m/m', us: 'kip·ft/ft', f: 1.3558179 / 0.3048 },
  warping:      { si: 'mm⁶',    us: 'in⁶',       f: Math.pow(25.4, 6) },
  inertia_m4:   { si: 'm⁴',     us: 'ft⁴',       f: Math.pow(0.3048, 4) },
  rigidity:     { si: 'N·mm²',  us: 'kip·in²',   f: 4448.2216 * 645.16 },
  force_per_mm: { si: 'kN/mm',  us: 'kip/in',    f: 4.4482216 / 25.4 },
  n_per_mm:     { si: 'N/mm',   us: 'kip/in',    f: 4448.2216 / 25.4 },
  bar:          { si: 'mm',     us: 'mm',        f: 1 },   // bar designations stay metric
  // Matrix Analysis (direct stiffness method).
  disp:         { si: 'mm',       us: 'in',         f: 25.4 },
  rotation:     { si: 'rad',      us: 'rad',        f: 1 },
  stiffness:    { si: 'kN/m',     us: 'kip/in',     f: 4.4482216 / 0.0254 },
  rotstiffness: { si: 'kN·m/rad', us: 'kip·ft/rad', f: 1.3558179 },
  text:         { si: '',       us: '',          f: 1 },
  // Wind and seismic loads, composite and prestressed (hand-off Later 4.1).
  speed_kph:   { si: 'km/h',  us: 'mph',   f: 1.609344 },      // basic wind speed V
  pressure_lo: { si: 'kPa',   us: 'psf',   f: 0.04788026 },    // wind pressures (ksf is too coarse)
  time_s:      { si: 's',     us: 's',     f: 1 },             // period T
  dist_km:     { si: 'km',    us: 'mi',    f: 1.609344 },      // distance to the seismic source
  density:     { si: 'kg/m³', us: 'pcf',   f: 16.018463 }       // concrete density wc
};

export const SYSTEMS = { SI: 'SI (mm, MPa, kN·m)', US: 'English (in, ksi, kip·ft)' };

function def(q) { return QUANTITIES[q] || QUANTITIES.ratio; }

export function unitLabel(q, sys) { const d = def(q); return sys === 'US' ? d.us : d.si; }
export function fromSI(v, q, sys) { return sys === 'US' ? v / def(q).f : v; }
export function toSI(v, q, sys) { return sys === 'US' ? v * def(q).f : v; }

// Convert a typed value from one system to the other, rounded to 5 significant figures.
export function convertTyped(v, q, from, to) {
  if (from === to || !isFinite(v) || def(q).f === 1) return v;
  const si = toSI(v, q, from);
  return Number(fromSI(si, q, to).toPrecision(5));
}
