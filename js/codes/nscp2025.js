// NSCP 2025 (8th edition). DRAFT: no NSCP 2025 value has been entered, so every value and clause number below is
// the NSCP 2015 one, and the edition stays disabled (selectable only with ?edition-preview=1).
//
// When the NSCP 2025 text is available:
//   1. Go through docs/NSCP2025_CHECKLIST.md (written by `node tools/edition-checklist.mjs`): one row per value
//      and clause of NSCP 2015. Fill its NSCP 2025 column from the code.
//   2. Enter every changed value as an override below, by path or as nested objects:
//        'concrete.phi.shear': 0.75,  'wind.Kd': [...],  steel: { compression: { phi: 0.90 } }
//      Arrays are replaced whole. Note that a few NSCP 2015 entries are functions with their numbers inside
//      (for example concrete.beta1, concrete.Ec, concrete.fr): if those numbers change, override the function too.
//   3. Change clause numbers in `clauses`, per clause key:
//        'clauses.steel.comp.Fcr': { nscp: '505.3' }    or    clauses: { 'steel.comp.Fcr': { nscp: '505.3' } }
//   4. A provision that is new in NSCP 2025: add a new key to BOTH editions (NSCP 2015 gets null or its old
//      value), so that the parity test keeps both editions in step, and read it in the calculator.
//   5. Run `node tests/edition.mjs` (also run by `node tests/run.mjs`) and the full test suite.
//   6. Set `enabled: true` and `status: 'final'` below, and change the label (drop "draft").
import nscp2015 from './nscp2015.js';
import { derive } from './derive.js';

export default derive(nscp2015, {
  // NSCP 2025 overrides go here. None entered: the 2025 text is not available yet.
}, {
  id: 'nscp2025',
  label: 'NSCP 2025 (TBE)',
  short: 'NSCP 2025 (TBE)',
  status: 'draft',
  enabled: false,
  banner: 'NSCP 2025 (TBE): values to be entered. Results repeat NSCP 2015.'
});
