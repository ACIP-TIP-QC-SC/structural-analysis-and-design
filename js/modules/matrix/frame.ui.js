// Frames (Matrix Analysis): module definition, tables, interactive drawing and result cards.
import { solve as calcSolve, LOAD_TYPES, DIRECTIONS, PER } from './frame.calc.js';
import presetsFile from '../../../presets/matrix-frame.js';
import { h } from '../../ui/dom.js';
import { unitsField, qf, solveWith, resultCards, reportSections, listTables, SIGNS, sectionHelper, saveCard } from './mxui.js';
import { drawModel, interactive, newCanvasState } from './modelCanvas.js';
import { signsFigureCard } from './signs.js';
import { SUPPORT_LABELS, RELEASE_LABELS } from './analysis.js';

const KIND = 'frame';
const state = newCanvasState(KIND);
const opts = (o, num) => Object.entries(o).map(([value, label], k) => ({ value, label: num ? (k + 1) + ' ' + label : label }));
const SUP = opts(SUPPORT_LABELS.frame), REL = opts(RELEASE_LABELS.frame), TYPES = opts(LOAD_TYPES, true), DIRS = opts(DIRECTIONS), PERS = opts(PER);
const MT = { none: 0, i: 1, j: 2, both: 3 };
const isNum = (x) => typeof x === 'number' && isFinite(x);
const jid = (r, i) => (isNum(r.id) ? r.id : i + 1);
const HOLD = { fixed: [1, 1, 1], hinge: [1, 1, 0], rollerY: [0, 1, 0], rollerX: [1, 0, 0], guidedX: [0, 1, 1], guidedY: [1, 0, 1], rotation: [0, 0, 1] };
const holds = (r, d) => !!(HOLD[r.support] && HOLD[r.support][d]);
const axial = (r) => r.type === 'axialPoint' || r.type === 'axialUniform';
const distributed = (r) => r.type === 'uniform' || r.type === 'linear' || r.type === 'axialUniform';

const newJoint = (rows, x, y) => ({ id: rows.reduce((m, r, i) => Math.max(m, jid(r, i)), 0) + 1, x: x == null ? (rows.length ? rows[rows.length - 1].x + 1 : 0) : x, y: y == null ? (rows.length ? rows[rows.length - 1].y : 0) : y,
  support: 'free', angle: '', FX: '', FY: '', M: '', settleX: '', settleY: '', rotation: '' });
const newMember = (rows, i, j) => { const last = rows[rows.length - 1] || { E: 200000, A: 8000, I: 200e6, j: 1 }; return { i: i == null ? last.j : i, j: j == null ? last.j + 1 : j, E: last.E, A: last.A, I: last.I, release: 'none' }; };

function beforeRemoveJoint(i, rows, onChange, vals) {
  const id = jid(rows[i], i), mem = (vals.members || []).map((m, k) => ({ m, k })).filter(({ m }) => m.i === id || m.j === id);
  if (!mem.length) return true;
  const ok = typeof window === 'undefined' || window.confirm('Joint ' + id + ' is used by member' + (mem.length > 1 ? 's ' : ' ') + mem.map((x) => x.k + 1).join(', ') + '. Delete the joint and ' + (mem.length > 1 ? 'those members' : 'that member') + '?');
  if (!ok) return false;
  onChange('members', (vals.members || []).filter((m) => !(m.i === id || m.j === id)), false);
  return true;
}

function fields(mode, method, val, ed) {
  const q = qf(val), cons = val.units === 'consistent';
  const J = new Map((val.joints || []).map((r, i) => [jid(r, i), r]));
  const geo = (r) => { const a = J.get(r.b != null ? r.b : r.i), b = J.get(r.j); if (!a || !b) return null; const dx = b.x - a.x, dy = b.y - a.y; return { L: Math.hypot(dx, dy), dx, dy }; };
  // Stiffness terms in the calc set: kN and m (SI: E MPa, A mm², I mm⁴) or kip and ft (English: ksi, in², in⁴).
  const EA = (r, ctx) => (cons ? r.E * r.A : ctx && ctx.sys === 'US' ? r.E * r.A : r.E * r.A / 1000);
  const EI = (r, ctx) => (cons ? r.E * r.I : ctx && ctx.sys === 'US' ? r.E * r.I / 144 : r.E * r.I * 1e-9);
  const term = (fn) => (r, rows, ctx) => { const g = geo(r); return g && g.L > 0 ? fn(g.L, r, ctx) : null; };
  const jointCols = [
    { key: 'id', label: 'Joint', title: 'Joint number (members refer to it)' },
    { key: 'x', label: 'X', quantity: q('length_m') },
    { key: 'y', label: 'Y', quantity: q('length_m') },
    { key: 'support', label: 'Support type', type: 'select', options: SUP, structural: true },
    { key: 'angle', label: 'Angle', quantity: 'angle_deg', optional: true, enabledIf: (r) => r.support === 'inclined', title: 'Slope of the rolling surface, counterclockwise from +X' },
    { key: 'settleX', label: 'Settlement X', quantity: q('disp'), optional: true, enabledIf: (r) => holds(r, 0) },
    { key: 'settleY', label: 'Settlement Y', quantity: q('disp'), optional: true, enabledIf: (r) => holds(r, 1) },
    { key: 'rotation', label: 'Prescribed rotation', quantity: 'rotation', optional: true, enabledIf: (r) => holds(r, 2), title: 'Counterclockwise +' },
    { key: 'FX', label: 'FX', quantity: q('force'), optional: true },
    { key: 'FY', label: 'FY', quantity: q('force'), optional: true },
    { key: 'M', label: 'M', quantity: q('moment'), optional: true, title: 'Counterclockwise +' }
  ];
  const sel = state.sel && state.sel.type === 'joint' ? (val.joints || []).findIndex((r, i) => jid(r, i) === state.sel.id) : -1;
  const jl = (step, view, extra) => Object.assign({ key: 'joints', type: 'list', step, label: 'Joint table', columns: jointCols, view, minRows: 0, lenient: true, scroll: true, paste: true, noReport: true,
    indexLabel: 'Row', newRow: (rows) => newJoint(rows), selectedRow: sel, onRowFocus: (i) => { state.sel = { type: 'joint', id: jid((val.joints || [])[i] || {}, i) }; },
    beforeRemove: (i, rows, onChange) => beforeRemoveJoint(i, rows, onChange, val), default: DEFAULT.joints }, extra || {});
  return [
    unitsField(),
    jl('Geometry', ['id', 'x', 'y'], { hint: 'Type the joints here or place them on the drawing with Add joint. The joint number is what members refer to.' }),
    { key: 'clear', type: 'action', step: 'Geometry', label: 'Clear all joints, members and loads', run: () => ((typeof window === 'undefined' || window.confirm('Clear the joint, member and load tables?')) ? { joints: [], members: [], memberLoads: [] } : null) },
    { key: 'members', type: 'list', step: 'Members', label: 'Member table', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Member', newRow: (rows) => newMember(rows), default: DEFAULT.members,
      selectedRow: state.sel && state.sel.type === 'member' ? state.sel.id - 1 : -1, onRowFocus: (i) => { state.sel = { type: 'member', id: i + 1 }; },
      hint: 'b and e are joint numbers: local x runs from b to e. E, A and I of a new member are copied from the member above.',
      columns: [
        { key: 'i', label: 'b' }, { key: 'j', label: 'e' },
        { key: 'E', label: 'E', quantity: q('stress') }, { key: 'A', label: 'A', quantity: q('area') }, { key: 'I', label: 'I', quantity: q('inertia') },
        { key: 'release', label: 'Release', type: 'select', options: REL },
        { key: 'MT', label: 'MT', readonly: true, compute: (r) => MT[r.release || 'none'] },
        { key: 'L', label: 'L', readonly: true, quantity: q('length_m'), compute: term((L) => L) },
        { key: 'cos', label: 'cos θ', readonly: true, compute: (r) => { const g = geo(r); return g && g.L ? g.dx / g.L : null; } },
        { key: 'sin', label: 'sin θ', readonly: true, compute: (r) => { const g = geo(r); return g && g.L ? g.dy / g.L : null; } },
        { key: 'th', label: 'θ', readonly: true, quantity: 'angle_deg', compute: (r) => { const g = geo(r); return g ? Math.atan2(g.dy, g.dx) * 180 / Math.PI : null; } },
        { key: 'kA', label: 'EA/L', readonly: true, compute: term((L, r, ctx) => EA(r, ctx) / L) },
        { key: 'k12', label: '12EI/L³', readonly: true, compute: term((L, r, ctx) => 12 * EI(r, ctx) / L ** 3) },
        { key: 'k6', label: '6EI/L²', readonly: true, compute: term((L, r, ctx) => 6 * EI(r, ctx) / L ** 2) },
        { key: 'k4', label: '4EI/L', readonly: true, compute: term((L, r, ctx) => 4 * EI(r, ctx) / L) },
        { key: 'k2', label: '2EI/L', readonly: true, compute: term((L, r, ctx) => 2 * EI(r, ctx) / L) }
      ] },
    ...(ed ? sectionHelper(val, ed, { listKey: 'members', needA: true, needI: true, rowWord: 'Member' }) : []),
    jl('Supports', ['id', 'support', 'angle', 'settleX', 'settleY', 'rotation'], { hint: 'Angle: slope of the rolling surface of an inclined roller, counterclockwise from +X. Settlements and prescribed rotations only where the support holds that DOF.' }),
    jl('Loads', ['id', 'FX', 'FY', 'M'], { label: 'Joint loads', hint: 'FX + right, FY + up, M + counterclockwise. Blank means 0.' }),
    { key: 'memberLoads', type: 'list', step: 'Loads', label: 'Member loads', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Row', default: DEFAULT.memberLoads,
      newRow: (rows) => Object.assign({ member: 1, type: 'uniform', direction: 'globalY', per: 'member', value: -10, w2: '', l1: '', l2: '' }, rows.length ? { member: rows[rows.length - 1].member } : {}),
      hint: 'Local loads keep the book\'s signs: perpendicular + toward −y, axial + toward −x, couple + clockwise. Global loads: + along +X or +Y (gravity negative), global couple + counterclockwise. Point loads and couples act at l1 (from b); distributed loads run from l1 to L − l2.',
      columns: [
        { key: 'member', label: 'Member' }, { key: 'type', label: 'Type', type: 'select', options: TYPES, structural: true },
        { key: 'direction', label: 'Direction', type: 'select', options: DIRS, enabledIf: (r) => !axial(r), structural: true },
        { key: 'per', label: 'Distributed load per', type: 'select', options: PERS, enabledIf: (r) => (r.type === 'uniform' || r.type === 'linear') && r.direction && r.direction !== 'local' },
        { key: 'value', label: 'W, M or w1', quantity: (r) => q(r.type === 'point' || r.type === 'axialPoint' ? 'force' : r.type === 'couple' ? 'moment' : 'lineload'),
          unitHint: (sys) => (cons ? '' : sys === 'US' ? 'kip, kip·ft or kip/ft' : 'kN, kN·m or kN/m') },
        { key: 'w2', label: 'w2', quantity: q('lineload'), optional: true, enabledIf: (r) => r.type === 'linear' },
        { key: 'l1', label: 'l1 (from b)', quantity: q('length_m'), optional: true },
        { key: 'l2', label: 'l2 (from e)', quantity: q('length_m'), optional: true, enabledIf: distributed }
      ] }
  ];
}

// Default model in SI display units: a portal frame with a pinned base and a fixed base.
const DEFAULT = {
  joints: [
    { id: 1, x: 0, y: 0, support: 'fixed', angle: '', FX: '', FY: '', M: '', settleX: '', settleY: '', rotation: '' },
    { id: 2, x: 0, y: 4, support: 'free', angle: '', FX: 20, FY: '', M: '', settleX: '', settleY: '', rotation: '' },
    { id: 3, x: 6, y: 4, support: 'free', angle: '', FX: '', FY: '', M: '', settleX: '', settleY: '', rotation: '' },
    { id: 4, x: 6, y: 0, support: 'hinge', angle: '', FX: '', FY: '', M: '', settleX: '', settleY: '', rotation: '' }
  ],
  members: [{ i: 1, j: 2, E: 200000, A: 8000, I: 200e6, release: 'none' }, { i: 2, j: 3, E: 200000, A: 8000, I: 300e6, release: 'none' }, { i: 4, j: 3, E: 200000, A: 8000, I: 200e6, release: 'none' }],
  memberLoads: [{ member: 2, type: 'uniform', direction: 'globalY', per: 'member', value: -25, w2: '', l1: '', l2: '' }]
};
const example = {
  id: 'fr-si', name: 'Example: gable frame with a hinged rafter and wind on one column (kN, m, steel)', mode: 'joints', inputs: { units: 'site',
    joints: [{ id: 1, x: 0, y: 0, support: 'fixed' }, { id: 2, x: 0, y: 5, support: 'free' }, { id: 3, x: 6, y: 7, support: 'free' }, { id: 4, x: 12, y: 5, support: 'free' }, { id: 5, x: 12, y: 0, support: 'hinge' }],
    members: [{ i: 1, j: 2, E: 200000, A: 9000, I: 250e6 }, { i: 2, j: 3, E: 200000, A: 7000, I: 180e6 }, { i: 3, j: 4, E: 200000, A: 7000, I: 180e6, release: 'i' }, { i: 5, j: 4, E: 200000, A: 9000, I: 250e6 }],
    memberLoads: [{ member: 2, type: 'uniform', direction: 'globalY', per: 'projected', value: -12 }, { member: 3, type: 'uniform', direction: 'globalY', per: 'projected', value: -12 },
      { member: 1, type: 'uniform', direction: 'globalX', per: 'member', value: 6 }, { member: 3, type: 'point', direction: 'local', value: 15, l1: 3 }] }
};

const cfg = { kind: KIND, state, jointsKey: 'joints', membersKey: 'members', newJoint, newMember };

export default {
  id: 'matrix/frame', group: 'matrix', title: 'Frames',
  methods: [],
  modes: [{ id: 'joints', label: 'By joints', icon: 'frame' }],
  steps: ['Setup', 'Geometry', 'Members', 'Supports', 'Loads', 'Results'],
  fields: (mode, method, val, ed) => fields(mode, method, val, ed),
  presets: presetsFile.concat([example]),
  solve: (input, ctx) => solveWith(calcSolve, input, ctx),
  draw: (result, o) => drawModel(result, o, state, KIND),
  drawInteractive: (svg, ctx) => interactive(svg, ctx, Object.assign({}, cfg, { beforeRemoveJoint: (i, rows, onChange) => beforeRemoveJoint(i, rows, onChange, ctx.vals) })),
  drawOptions: [{ key: 'loads', label: 'Loads' }, { key: 'reactions', label: 'Reactions' }],
  extraCards: (r, ctx) => resultCards(r, ctx, KIND, state),
  reportExtra: (r, ctx, vals) => reportSections(r, ctx, listTables(fields('joints', null, vals || {}), vals || {}, ctx.sys), state),
  setupExtra: (ctx) => h('div', { style: 'margin-top:12px' }, signsFigureCard(KIND), saveCard('matrix/frame', ctx)),
  signNote: SIGNS.frame,
  setupNote: 'Direct stiffness method, Kassimali Ch. 6 (frames). Results update as you type. Use Consistent units for book problems given with E = A = 1 or EI constant.',
  stepHelp: (step) => (step === 'Geometry' ? 'Add joint places a joint on the grid (hold Alt for no snap); Add member joins two joints. Select a joint or member to find its row; Delete removes it.' : '')
};
