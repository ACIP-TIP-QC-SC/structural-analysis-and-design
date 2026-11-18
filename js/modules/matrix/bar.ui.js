// Bars (axial) (Matrix Analysis): element, node and load tables, drawing and result cards.
import { solve as calcSolve, areaOf, nodePositions } from './bar.calc.js';
import presetsFile from '../../../presets/matrix-bar.js';
import { h } from '../../ui/dom.js';
import { unitsField, qf, solveWith, resultCards, reportSections, listTables, SIGNS, sectionHelper, saveCard } from './mxui.js';
import { drawModel, interactive, newCanvasState } from './modelCanvas.js';
import { signsFigureCard } from './signs.js';
import { SUPPORT_LABELS } from './analysis.js';

const KIND = 'bar';
const state = newCanvasState(KIND);
const SUP = Object.entries(SUPPORT_LABELS.bar).map(([value, label]) => ({ value, label }));
const isNum = (x) => typeof x === 'number' && isFinite(x);
const nid = (r, i) => (isNum(r.id) ? r.id : i + 1);
const newNode = (rows) => ({ id: rows.reduce((m, r, i) => Math.max(m, nid(r, i)), 0) + 1, support: 'free', FX: '', settle: '' });
const newElement = (rows) => { const last = rows[rows.length - 1] || { E: 200000, d: '', A: 500, L: 1, j: 1 }; return { i: last.j, j: last.j + 1, E: last.E, d: last.d, A: last.A, L: last.L }; };

function fields(mode, method, val, ed) {
  const q = qf(val), cons = val.units === 'consistent';
  // A used in mm² (in²) from the display values: A, else πd²/4 with d in mm (in).
  const Aused = (r) => { const A = areaOf(r); return isNum(A) ? A : null; };
  const X = nodePositions((val.members || []).map((m, k) => Object.assign({ id: k + 1 }, m)), []);
  return [
    unitsField(),
    { key: 'members', type: 'list', step: 'Elements', label: 'Element table', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Element', newRow: newElement, default: DEFAULT.members,
      selectedRow: state.sel && state.sel.type === 'member' ? state.sel.id - 1 : -1, onRowFocus: (i) => { state.sel = { type: 'member', id: i + 1 }; },
      hint: 'The 1st node is the left end. Give A, or the diameter d of a round bar (A = πd²/4). Elements between the same two nodes act side by side.',
      columns: [
        { key: 'i', label: '1st node' }, { key: 'j', label: '2nd node' }, { key: 'E', label: 'E', quantity: q('stress') },
        { key: 'd', label: 'd', quantity: q('length_mm'), optional: true, placeholder: '' }, { key: 'A', label: 'A', quantity: q('area'), optional: true, placeholder: '' },
        { key: 'L', label: 'L', quantity: q('length_m') },
        { key: 'Au', label: 'A used', readonly: true, quantity: q('area'), compute: Aused },
        { key: 'k', label: 'k = EA/L', readonly: true, title: 'kN/m (kip/ft)', compute: (r, rows, ctx) => { const A = Aused(r); if (!A || !(r.L > 0)) return null; return cons || (ctx && ctx.sys === 'US') ? r.E * A / r.L : r.E * A / 1000 / r.L; } }
      ] },
    ...(ed ? sectionHelper(val, ed, { listKey: 'members', needA: true, needI: false, rowWord: 'Element', step: 'Elements' }) : []),
    { key: 'clear', type: 'action', step: 'Elements', label: 'Clear all elements, nodes and loads', run: () => ((typeof window === 'undefined' || window.confirm('Clear the element, node and load tables?')) ? { joints: [], members: [], memberLoads: [] } : null) },
    { key: 'joints', type: 'list', step: 'Nodes', label: 'Node table', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Row', newRow: newNode, default: DEFAULT.joints,
      selectedRow: state.sel && state.sel.type === 'joint' ? (val.joints || []).findIndex((r, i) => nid(r, i) === state.sel.id) : -1, onRowFocus: (i) => { state.sel = { type: 'joint', id: nid((val.joints || [])[i] || {}, i) }; },
      hint: 'X comes from the element lengths: the lowest-numbered node of each piece is at X = 0. F + to the right. A prescribed displacement only at a fixed node.',
      columns: [
        { key: 'id', label: 'Node' },
        { key: 'X', label: 'X', readonly: true, quantity: q('length_m'), compute: (r, rows) => { const id = nid(r, rows.indexOf(r)); return X.has(id) ? X.get(id) : null; } },
        { key: 'support', label: 'Support', type: 'select', options: SUP, structural: true },
        { key: 'FX', label: 'F', quantity: q('force'), optional: true },
        { key: 'settle', label: 'Prescribed displacement', quantity: q('disp'), optional: true, enabledIf: (r) => r.support === 'fixed' }
      ] },
    { key: 'memberLoads', type: 'list', step: 'Loads', label: 'Element loads, temperature and misfit', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Row', default: DEFAULT.memberLoads,
      newRow: (rows) => ({ member: rows.length ? rows[rows.length - 1].member : 1, w1: '', w2: '', P: '', a: '', alpha: '', dT: '', e0: '' }),
      hint: 'w1 at the 1st node and w2 at the 2nd (a linear axial load over the element); P at a from the 1st node; + to the right. α and ΔT together (α per degree, ΔT in the same degrees). e0: misfit, + when the element is too long.',
      columns: [
        { key: 'member', label: 'Element' },
        { key: 'w1', label: 'w1', quantity: q('lineload'), optional: true }, { key: 'w2', label: 'w2', quantity: q('lineload'), optional: true },
        { key: 'P', label: 'P', quantity: q('force'), optional: true }, { key: 'a', label: 'a', quantity: q('length_m'), optional: true },
        { key: 'alpha', label: 'α', optional: true, placeholder: '' }, { key: 'dT', label: 'ΔT', optional: true },
        { key: 'e0', label: 'Misfit e0', quantity: q('disp'), optional: true }
      ] }
  ];
}

// Default in SI display units: a steel and an aluminium bar between walls, loaded at the joint.
const DEFAULT = {
  members: [{ i: 1, j: 2, E: 200000, d: '', A: 1000, L: 2 }, { i: 2, j: 3, E: 70000, d: '', A: 1500, L: 3 }],
  joints: [{ id: 1, support: 'fixed', FX: '', settle: '' }, { id: 2, support: 'free', FX: 60, settle: '' }, { id: 3, support: 'fixed', FX: '', settle: '' }],
  memberLoads: []
};
const example = {
  id: 'bar-si', name: 'Example: stepped bar between walls, heated, with a gap closing support movement (kN, m, mm)', mode: 'nodes', inputs: { units: 'site',
    members: [{ i: 1, j: 2, E: 200000, d: 30, L: 1.5 }, { i: 2, j: 3, E: 200000, A: 400, L: 1 }, { i: 3, j: 4, E: 105000, A: 900, L: 1.2 }],
    joints: [{ id: 1, support: 'fixed' }, { id: 2, support: 'free', FX: 40 }, { id: 3, support: 'free', FX: -15 }, { id: 4, support: 'fixed', settle: -0.3 }],
    memberLoads: [{ member: 1, w1: 10, w2: 10 }, { member: 3, alpha: 17e-6, dT: 30 }] }
};

const cfg = { kind: KIND, state, jointsKey: 'joints', membersKey: 'members', canEdit: false, jointStep: 'Nodes', memberStep: 'Elements' };

export default {
  id: 'matrix/bar', group: 'matrix', title: 'Bars (axial)',
  methods: [],
  modes: [{ id: 'nodes', label: 'By nodes', icon: 'bar' }],
  steps: ['Setup', 'Elements', 'Nodes', 'Loads', 'Results'],
  fields: (mode, method, val, ed) => fields(mode, method, val, ed),
  presets: presetsFile.concat([example]),
  solve: (input, ctx) => solveWith(calcSolve, input, ctx),
  draw: (result, o) => drawModel(result, o, state, KIND),
  drawInteractive: (svg, ctx) => interactive(svg, ctx, cfg),
  drawOptions: [{ key: 'loads', label: 'Loads' }, { key: 'reactions', label: 'Reactions' }],
  extraCards: (r, ctx) => resultCards(r, ctx, KIND, state),
  reportExtra: (r, ctx, vals) => reportSections(r, ctx, listTables(fields('nodes', null, vals || {}), vals || {}, ctx.sys), state),
  setupExtra: (ctx) => h('div', { style: 'margin-top:12px' }, signsFigureCard(KIND), saveCard('matrix/bar', ctx)),
  signNote: SIGNS.bar,
  setupNote: 'Direct stiffness method, Kassimali Ch. 3 (axial bar elements). Results update as you type. Use Consistent units for book problems given with E = A = 1.',
  stepHelp: (step) => (step === 'Elements' ? 'The drawing places the nodes from the element lengths, left to right from the 1st node of each element.' : '')
};
