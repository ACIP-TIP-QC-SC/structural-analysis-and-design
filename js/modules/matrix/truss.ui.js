// Truss (Matrix Analysis): module definition, tables, interactive drawing and result cards.
import { solve as calcSolve } from './truss.calc.js';
import presetsFile from '../../../presets/matrix-truss.js';
import { h } from '../../ui/dom.js';
import { unitsField, qf, solveWith, resultCards, reportSections, listTables, SIGNS, sectionHelper, saveCard } from './mxui.js';
import { drawModel, interactive, newCanvasState } from './modelCanvas.js';
import { signsFigureCard } from './signs.js';
import { SUPPORT_LABELS } from './analysis.js';

const KIND = 'truss';
const state = newCanvasState(KIND);
const SUP = Object.entries(SUPPORT_LABELS.truss).map(([value, label]) => ({ value, label }));
const isNum = (x) => typeof x === 'number' && isFinite(x);
const jid = (r, i) => (isNum(r.id) ? r.id : i + 1);
const holdsX = (r) => r.support === 'pin' || r.support === 'rollerX';
const holdsY = (r) => r.support === 'pin' || r.support === 'rollerY';

// Joint numbers are typed by the user (default: the next number); members refer to them.
const newJoint = (rows, x, y) => ({ id: rows.reduce((m, r, i) => Math.max(m, jid(r, i)), 0) + 1, x: x == null ? (rows.length ? rows[rows.length - 1].x + 1 : 0) : x, y: y == null ? (rows.length ? rows[rows.length - 1].y : 0) : y, support: 'free', angle: '', FX: '', FY: '', settleX: '', settleY: '' });
const newMember = (rows, i, j) => { const last = rows[rows.length - 1] || { E: 200000, A: 1000 }; return { i: i == null ? (last.j || 1) : i, j: j == null ? (last.j || 1) + 1 : j, E: last.E, A: last.A }; };

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
  const geo = (r) => { const a = J.get(r.i), b = J.get(r.j); if (!a || !b) return null; const dx = b.x - a.x, dy = b.y - a.y; return { L: Math.hypot(dx, dy), dx, dy }; };
  // k = EA/L shown in kN/m (kip/ft): E MPa × A mm² = N; English: ksi × in² = kip.
  const kOf = (r, rows, ctx) => { const g = geo(r); if (!g || !(g.L > 0)) return null; return cons || (ctx && ctx.sys === 'US') ? r.E * r.A / g.L : r.E * r.A / 1000 / g.L; };
  const jointCols = [
    { key: 'id', label: 'Joint', title: 'Joint number (members refer to it)' },
    { key: 'x', label: 'X', quantity: q('length_m') },
    { key: 'y', label: 'Y', quantity: q('length_m') },
    { key: 'support', label: 'Support type', type: 'select', options: SUP, structural: true },
    { key: 'angle', label: 'Angle', quantity: 'angle_deg', optional: true, enabledIf: (r) => r.support === 'inclined', title: 'Slope of the rolling surface, counterclockwise from +X' },
    { key: 'settleX', label: 'Settlement X', quantity: q('disp'), optional: true, enabledIf: holdsX },
    { key: 'settleY', label: 'Settlement Y', quantity: q('disp'), optional: true, enabledIf: holdsY },
    { key: 'FX', label: 'FX', quantity: q('force'), optional: true },
    { key: 'FY', label: 'FY', quantity: q('force'), optional: true }
  ];
  const sel = state.sel && state.sel.type === 'joint' ? (val.joints || []).findIndex((r, i) => jid(r, i) === state.sel.id) : -1;
  const selM = state.sel && state.sel.type === 'member' ? state.sel.id - 1 : -1;
  const jointList = (step, view, extra) => Object.assign({
    key: 'joints', type: 'list', step, label: 'Joint table', columns: jointCols, view, minRows: 0, lenient: true, scroll: true, paste: true, noReport: true,
    indexLabel: 'Row', newRow: (rows) => newJoint(rows), selectedRow: sel, onRowFocus: (i) => { state.sel = { type: 'joint', id: jid((val.joints || [])[i] || {}, i) }; },
    beforeRemove: (i, rows, onChange) => beforeRemoveJoint(i, rows, onChange, val), default: DEFAULT.joints
  }, extra || {});
  return [
    unitsField(),
    jointList('Geometry', ['id', 'x', 'y'], { hint: 'Type the joints here or place them on the drawing with Add joint. The joint number is what members refer to.' }),
    { key: 'clear', type: 'action', step: 'Geometry', label: 'Clear all joints and members', run: () => ((typeof window === 'undefined' || window.confirm('Clear the joint and member tables?')) ? { joints: [], members: [] } : null) },
    { key: 'members', type: 'list', step: 'Members', label: 'Member table', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Member',
      newRow: (rows) => newMember(rows), selectedRow: selM, onRowFocus: (i) => { state.sel = { type: 'member', id: i + 1 }; }, default: DEFAULT.members,
      hint: 'i and j are joint numbers. E and A of a new member are copied from the member above.',
      columns: [
        { key: 'i', label: 'i' }, { key: 'j', label: 'j' },
        { key: 'E', label: 'E', quantity: q('stress') }, { key: 'A', label: 'A', quantity: q('area') },
        { key: 'L', label: 'L', readonly: true, quantity: q('length_m'), compute: (r) => { const g = geo(r); return g ? g.L : null; } },
        { key: 'th', label: 'θ', readonly: true, quantity: 'angle_deg', compute: (r) => { const g = geo(r); return g ? Math.atan2(g.dy, g.dx) * 180 / Math.PI : null; } },
        { key: 'cos', label: 'cos θ', readonly: true, compute: (r) => { const g = geo(r); return g && g.L ? g.dx / g.L : null; } },
        { key: 'sin', label: 'sin θ', readonly: true, compute: (r) => { const g = geo(r); return g && g.L ? g.dy / g.L : null; } },
        { key: 'k', label: 'k = EA/L', readonly: true, quantity: q('lineload'), compute: kOf }
      ] },
    ...(ed ? sectionHelper(val, ed, { listKey: 'members', needA: true, needI: false, rowWord: 'Member' }) : []),
    jointList('Supports', ['id', 'support', 'angle', 'settleX', 'settleY'], { hint: 'Angle: slope of the rolling surface of an inclined roller, counterclockwise from +X. Settlements only where the support holds that direction.' }),
    jointList('Loads', ['id', 'FX', 'FY'], { hint: 'Joint loads: FX + to the right, FY + up (gravity loads are negative). Blank means 0.' })
  ];
}

// Default model in SI display units: a small roof truss.
const DEFAULT = {
  joints: [
    { id: 1, x: 0, y: 0, support: 'pin', angle: '', FX: '', FY: '', settleX: '', settleY: '' },
    { id: 2, x: 4, y: 0, support: 'free', angle: '', FX: '', FY: -40, settleX: '', settleY: '' },
    { id: 3, x: 8, y: 0, support: 'rollerY', angle: '', FX: '', FY: '', settleX: '', settleY: '' },
    { id: 4, x: 4, y: 3, support: 'free', angle: '', FX: 15, FY: -20, settleX: '', settleY: '' }
  ],
  members: [{ i: 1, j: 2, E: 200000, A: 2000 }, { i: 2, j: 3, E: 200000, A: 2000 }, { i: 1, j: 4, E: 200000, A: 2500 }, { i: 4, j: 3, E: 200000, A: 2500 }, { i: 2, j: 4, E: 200000, A: 1500 }]
};
const example = {
  id: 'tr-si', name: 'Example: roof truss with a settlement (kN, m, steel)', mode: 'joints',
  inputs: {
    units: 'site',
    joints: [
      { id: 1, x: 0, y: 0, support: 'pin' }, { id: 2, x: 3, y: 0, support: 'free', FY: -30 }, { id: 3, x: 6, y: 0, support: 'free', FY: -30 },
      { id: 4, x: 9, y: 0, support: 'rollerY', settleY: -5 }, { id: 5, x: 6, y: 2.5, support: 'free', FX: 10 }, { id: 6, x: 3, y: 2.5, support: 'free' }
    ],
    members: [
      { i: 1, j: 2, E: 200000, A: 1800 }, { i: 2, j: 3, E: 200000, A: 1800 }, { i: 3, j: 4, E: 200000, A: 1800 }, { i: 4, j: 5, E: 200000, A: 2400 },
      { i: 5, j: 6, E: 200000, A: 2400 }, { i: 6, j: 1, E: 200000, A: 2400 }, { i: 2, j: 6, E: 200000, A: 1200 }, { i: 3, j: 5, E: 200000, A: 1200 }, { i: 2, j: 5, E: 200000, A: 1200 }
    ]
  }
};

const cfg = { kind: KIND, state, jointsKey: 'joints', membersKey: 'members', newJoint, newMember };

export default {
  id: 'matrix/truss', group: 'matrix', title: 'Truss',
  methods: [],
  modes: [{ id: 'joints', label: 'By joints', icon: 'truss' }],
  steps: ['Setup', 'Geometry', 'Members', 'Supports', 'Loads', 'Results'],
  fields: (mode, method, val, ed) => fields(mode, method, val, ed),
  presets: presetsFile.map((p) => Object.assign({}, p)).concat([example]),
  solve: (input, ctx) => solveWith(calcSolve, input, ctx),
  draw: (result, o) => drawModel(result, o, state, KIND),
  drawInteractive: (svg, ctx) => interactive(svg, ctx, Object.assign({}, cfg, { beforeRemoveJoint: (i, rows, onChange) => beforeRemoveJoint(i, rows, onChange, ctx.vals) })),
  drawOptions: [{ key: 'loads', label: 'Loads' }, { key: 'reactions', label: 'Reactions' }],
  extraCards: (r, ctx) => resultCards(r, ctx, KIND, state),
  reportExtra: (r, ctx, vals) => reportSections(r, ctx, listTables(fields('joints', null, vals || {}), vals || {}, ctx.sys), state),
  setupExtra: (ctx) => h('div', { style: 'margin-top:12px' }, signsFigureCard(KIND), saveCard('matrix/truss', ctx)),
  signNote: SIGNS.truss,
  setupNote: 'Direct stiffness method, Kassimali Ch. 3 (trusses). Results update as you type. Use Consistent units for book problems given with E = A = 1 or EI constant.',
  stepHelp: (step) => (step === 'Geometry' ? 'Add joint places a joint on the grid (hold Alt for no snap); Add member joins two joints. Select a joint or member to find its row; Delete removes it.' : '')
};
