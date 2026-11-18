// Plane truss by the direct stiffness method (Kassimali Ch. 3; inclined rollers 9.4).
// Pure: no DOM, no rounding. Inputs follow hand-off 5.1 in the calc's consistent units (see dsm.js).
import { run as analyse, normalise, cellErrors } from './analysis.js';
import { fail } from '../../core/steps.js';

function build(input) {
  const kind = 'truss';
  const units = input.units === 'US' || input.units === 'SI' ? input.units : 'consistent';
  const { joints, members } = normalise(input, kind);
  return analyse({ kind, units, input, model: { joints, members, items: {} }, preErrors: cellErrors(input, kind) });
}

export function run(input) {
  try {
    const { r, vals } = build(input);
    return { vals: vals || {}, result: r };
  } catch (e) {
    return { vals: {}, result: fail(['The truss could not be analysed (' + e.message + ').']) };
  }
}
export const compute = (input) => run(input).vals;
export const solve = (input) => run(input).result;
