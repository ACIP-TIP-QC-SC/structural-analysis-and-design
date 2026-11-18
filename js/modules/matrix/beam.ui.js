// Beams (Matrix Analysis): By spans and By joints inputs, drawing, result cards.
import { solve as calcSolve, LOAD_TYPES } from './beam.calc.js';
import presetsFile from '../../../presets/matrix-beam.js';
import spanPresets from '../../../presets/matrix-beam-spans.js';
import { h } from '../../ui/dom.js';
import * as store from '../../core/storage.js';
import { unitsField, qf, solveWith, resultCards, reportSections, listTables, SIGNS, toCalc, sectionHelper, saveCard } from './mxui.js';
import { drawModel, interactive, newCanvasState } from './modelCanvas.js';
import { signsFigureCard } from './signs.js';
import { SUPPORT_LABELS, RELEASE_LABELS } from './analysis.js';
import { generate } from './beamSpans.js';

const KIND = 'beam';
const state = newCanvasState(KIND);
const SUP = Object.entries(SUPPORT_LABELS.beam).map(([value, label]) => ({ value, label }));
const REL = Object.entries(RELEASE_LABELS.beam).map(([value, label]) => ({ value, label }));
const MT = { none: 0, i: 1, j: 2, both: 3 };
const TYPES = Object.entries(LOAD_TYPES).map(([value, label], k) => ({ value, label: (k + 1) + ' ' + label }));
const isNum = (x) => typeof x === 'number' && isFinite(x);
const jid = (r, i) => (isNum(r.id) ? r.id : i + 1);
const holdsV = (r) => r.support === 'fixed' || r.support === 'pin';
const holdsD = (r) => r.support === 'fixed' || r.support === 'guided';
const dist = (r) => r.type === 'uniform' || r.type === 'linear';

// The load value is a force, a moment or a line load depending on its type.
const valueCol = (q, cons) => ({ key: 'value', label: 'Value', quantity: (r) => q(r.type === 'point' ? 'force' : r.type === 'couple' ? 'moment' : 'lineload'),
  unitHint: (sys) => (cons ? '' : sys === 'US' ? 'kip, kip·ft or kip/ft' : 'kN, kN·m or kN/m'), title: 'P, M, w or w1: + up, couples + counterclockwise' });

const newJoint = (rows) => ({ id: rows.reduce((m, r, i) => Math.max(m, jid(r, i)), 0) + 1, x: rows.length ? rows[rows.length - 1].x + 1 : 0, support: 'free', settle: '', rotation: '', FY: '', M: '' });
const newMember = (rows) => { const last = rows[rows.length - 1] || { E: 200000, I: 300e6, j: 1 }; return { i: last.j, j: last.j + 1, E: last.E, I: last.I, release: 'none' }; };

function beforeRemoveJoint(i, rows, onChange, vals) {
  const id = jid(rows[i], i), mem = (vals.members || []).map((m, k) => ({ m, k })).filter(({ m }) => m.i === id || m.j === id);
  if (!mem.length) return true;
  const ok = typeof window === 'undefined' || window.confirm('Joint ' + id + ' is used by element' + (mem.length > 1 ? 's ' : ' ') + mem.map((x) => x.k + 1).join(', ') + '. Delete the joint and ' + (mem.length > 1 ? 'those elements' : 'that element') + '?');
  if (!ok) return false;
  onChange('members', (vals.members || []).filter((m) => !(m.i === id || m.j === id)), false);
  return true;
}

function jointsFields(val, q, cons) {
  const J = new Map((val.joints || []).map((r, i) => [jid(r, i), r]));
  const Lof = (r) => { const a = J.get(r.i), b = J.get(r.j); return a && b ? b.x - a.x : null; };
  // EI in the calc set: kN·m² (SI: MPa × mm⁴ × 10⁻⁹) or kip·ft² (English: ksi × in⁴ / 144)
  const EI = (r, ctx) => (cons ? r.E * r.I : ctx && ctx.sys === 'US' ? r.E * r.I / 144 : r.E * r.I * 1e-9);
  const sel = state.sel && state.sel.type === 'joint' ? (val.joints || []).findIndex((r, i) => jid(r, i) === state.sel.id) : -1;
  const jointCols = [
    { key: 'id', label: 'Joint', title: 'Joint number (elements refer to it)' },
    { key: 'x', label: 'X', quantity: q('length_m') },
    { key: 'support', label: 'Support type', type: 'select', options: SUP, structural: true },
    { key: 'settle', label: 'Settlement', quantity: q('disp'), optional: true, enabledIf: holdsV, title: 'Vertical support movement, + up' },
    { key: 'rotation', label: 'Prescribed rotation', quantity: 'rotation', optional: true, enabledIf: holdsD, title: 'Counterclockwise +' },
    { key: 'FY', label: 'FY', quantity: q('force'), optional: true },
    { key: 'M', label: 'M', quantity: q('moment'), optional: true, title: 'Counterclockwise +' }
  ];
  const jl = (step, view, extra) => Object.assign({ key: 'joints', type: 'list', step, label: 'Joint table', columns: jointCols, view, minRows: 0, lenient: true, scroll: true, paste: true, noReport: true,
    indexLabel: 'Row', newRow: newJoint, selectedRow: sel, onRowFocus: (i) => { state.sel = { type: 'joint', id: jid((val.joints || [])[i] || {}, i) }; },
    beforeRemove: (i, rows, onChange) => beforeRemoveJoint(i, rows, onChange, val), default: DEFAULT.joints }, extra || {});
  return [
    jl('Geometry', ['id', 'x'], { hint: 'X positions of the joints, left to right. The first joint of an element is its left end.' }),
    { key: 'clear', type: 'action', step: 'Geometry', label: 'Clear all joints, elements and loads', run: () => ((typeof window === 'undefined' || window.confirm('Clear the joint, element and load tables?')) ? { joints: [], members: [], memberLoads: [] } : null) },
    { key: 'members', type: 'list', step: 'Members', label: 'Element table', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Element', newRow: newMember, default: DEFAULT.members,
      selectedRow: state.sel && state.sel.type === 'member' ? state.sel.id - 1 : -1, onRowFocus: (i) => { state.sel = { type: 'member', id: i + 1 }; },
      hint: 'i is the left joint, j the right joint.',
      columns: [
        { key: 'i', label: 'i (left)' }, { key: 'j', label: 'j (right)' },
        { key: 'E', label: 'E', quantity: q('stress') }, { key: 'I', label: 'I', quantity: q('inertia') },
        { key: 'release', label: 'Release', type: 'select', options: REL },
        { key: 'MT', label: 'MT', readonly: true, compute: (r) => MT[r.release || 'none'] },
        { key: 'L', label: 'L', readonly: true, quantity: q('length_m'), compute: Lof },
        { key: 'EI', label: 'EI', readonly: true, title: 'kN·m² (kip·ft²)', compute: EI },
        { key: 'k12', label: '12EI/L³', readonly: true, compute: (r, rows, ctx) => { const L = Lof(r); return L > 0 ? 12 * EI(r, ctx) / L ** 3 : null; } },
        { key: 'k6', label: '6EI/L²', readonly: true, compute: (r, rows, ctx) => { const L = Lof(r); return L > 0 ? 6 * EI(r, ctx) / L ** 2 : null; } },
        { key: 'k4', label: '4EI/L', readonly: true, compute: (r, rows, ctx) => { const L = Lof(r); return L > 0 ? 4 * EI(r, ctx) / L : null; } },
        { key: 'k2', label: '2EI/L', readonly: true, compute: (r, rows, ctx) => { const L = Lof(r); return L > 0 ? 2 * EI(r, ctx) / L : null; } }
      ] },
    jl('Supports', ['id', 'support', 'settle', 'rotation'], { hint: 'Settlement (+ up) and prescribed rotation (counterclockwise +) only where the support holds that DOF.' }),
    jl('Loads', ['id', 'FY', 'M'], { label: 'Joint loads', hint: 'FY + up (a downward load is negative); M + counterclockwise. Blank means 0.' }),
    { key: 'memberLoads', type: 'list', step: 'Loads', label: 'Member load list', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Row', default: DEFAULT.memberLoads,
      newRow: (rows) => Object.assign({ member: 1, type: 'uniform', value: -10, w2: '', a: '', b: '' }, rows.length ? { member: rows[rows.length - 1].member } : {}),
      hint: 'Loads + up and couples + counterclockwise: a downward 20 kN/m load is typed −20. a and b are measured from the element\'s left joint; blank a = 0, blank b = the element end.',
      columns: [
        { key: 'member', label: 'Element' }, { key: 'type', label: 'Type', type: 'select', options: TYPES, structural: true }, valueCol(q, cons),
        { key: 'w2', label: 'w2', quantity: q('lineload'), optional: true, enabledIf: (r) => r.type === 'linear' },
        { key: 'a', label: 'Start a', quantity: q('length_m'), optional: true },
        { key: 'b', label: 'End b', quantity: q('length_m'), optional: true, enabledIf: dist }
      ] }
  ];
}

function spansFields(val, q, cons) {
  return [
    { key: 'leftX', step: 'Geometry', label: 'Left end X', quantity: q('length_m'), default: 0 },
    { key: 'rightX', step: 'Geometry', label: 'Right end X', quantity: q('length_m'), default: 12 },
    { key: 'spanSupports', type: 'list', step: 'Geometry', label: 'Supports', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Row', default: DEFAULT_SPANS.spanSupports,
      newRow: (rows) => ({ x: rows.length ? rows[rows.length - 1].x : 0, support: 'pin', settle: '', rotation: '' }),
      hint: 'A support row with type Free only puts a joint there.',
      columns: [{ key: 'x', label: 'X', quantity: q('length_m') }, { key: 'support', label: 'Type', type: 'select', options: SUP, structural: true },
        { key: 'settle', label: 'Settlement', quantity: q('disp'), optional: true, enabledIf: holdsV }, { key: 'rotation', label: 'Rotation', quantity: 'rotation', optional: true, enabledIf: holdsD }] },
    { key: 'hinges', type: 'list', step: 'Geometry', label: 'Hinges', minRows: 0, lenient: true, noReport: true, indexLabel: 'Row', default: [],
      newRow: () => ({ x: 0 }), hint: 'A hinge becomes "Hinge at 2nd joint" on the element to its left.', columns: [{ key: 'x', label: 'X', quantity: q('length_m') }] },
    { key: 'show', type: 'action', step: 'Geometry', label: 'Show the joint table', hint: 'Opens By joints with the joint, element and load tables made from this description.', run: showJointTable },
    { key: 'stretches', type: 'list', step: 'Members', label: 'EI stretches', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Row', default: DEFAULT_SPANS.stretches,
      newRow: (rows) => { const last = rows[rows.length - 1] || { to: 0, E: 200000, I: 300e6 }; return { from: last.to, to: last.to, E: last.E, I: last.I }; },
      hint: 'The stretches must cover the beam from end to end with no gap or overlap.',
      columns: [{ key: 'from', label: 'From X', quantity: q('length_m') }, { key: 'to', label: 'To X', quantity: q('length_m') }, { key: 'E', label: 'E', quantity: q('stress') }, { key: 'I', label: 'I', quantity: q('inertia') }] },
    { key: 'spanLoads', type: 'list', step: 'Loads', label: 'Loads', minRows: 0, lenient: true, scroll: true, paste: true, noReport: true, indexLabel: 'Row', default: DEFAULT_SPANS.spanLoads,
      newRow: () => ({ type: 'point', value: -10, w2: '', start: 0, end: '' }),
      hint: 'Loads + up and couples + counterclockwise. Point loads and couples act at the start X; distributed loads run from the start X to the end X.',
      columns: [{ key: 'type', label: 'Type', type: 'select', options: TYPES, structural: true }, valueCol(q, cons),
        { key: 'w2', label: 'w2', quantity: q('lineload'), optional: true, enabledIf: (r) => r.type === 'linear' },
        { key: 'start', label: 'Start X', quantity: q('length_m') }, { key: 'end', label: 'End X', quantity: q('length_m'), optional: true, enabledIf: dist }] },
    { key: 'addAtLoads', type: 'check', step: 'Loads', label: 'Add joints at point loads and couples', default: false }
  ];
}

// "Show the joint table": hand the generated tables to By joints (through the site's send mechanism).
function showJointTable(input) {
  const gen = generate(toCalc(input, 'consistent'));
  if (gen.errors.length) { if (typeof window !== 'undefined') window.alert(gen.errors.join('\n')); return null; }
  const blank = (x) => (x ? x : '');
  store.set('send.matrix/beam', { mode: 'joints', from: 'By spans (generated tables)', values: {
    units: input.units, joints: gen.joints.map((j) => ({ id: j.id, x: j.x, support: j.support, settle: blank(j.settle), rotation: blank(j.rotation), FY: blank(j.FY), M: blank(j.M) })),
    members: gen.members.map((m) => ({ i: m.i, j: m.j, E: m.E, I: m.I, release: m.release })),
    memberLoads: gen.memberLoads.map((l) => ({ member: l.member, type: l.type, value: l.value, w2: l.w2 == null ? '' : l.w2, a: l.a, b: l.b == null ? '' : l.b })) } });
  if (typeof location !== 'undefined') location.hash = '#matrix/beam/joints';
  return null;
}

function fields(mode, method, val, ed) {
  const q = qf(val), cons = val.units === 'consistent';
  const helper = ed ? sectionHelper(val, ed, mode === 'spans' ? { listKey: 'stretches', needA: false, needI: true, rowWord: 'EI stretch row' } : { listKey: 'members', needA: false, needI: true, rowWord: 'Element' }) : [];
  return [unitsField()].concat(mode === 'spans' ? spansFields(val, q, cons) : jointsFields(val, q, cons), helper);
}

// Defaults in SI display units: a two-span beam on three supports.
const DEFAULT = {
  joints: [{ id: 1, x: 0, support: 'pin', settle: '', rotation: '', FY: '', M: '' }, { id: 2, x: 6, support: 'pin', settle: '', rotation: '', FY: '', M: '' }, { id: 3, x: 12, support: 'pin', settle: '', rotation: '', FY: '', M: '' }],
  members: [{ i: 1, j: 2, E: 200000, I: 300e6, release: 'none' }, { i: 2, j: 3, E: 200000, I: 300e6, release: 'none' }],
  memberLoads: [{ member: 1, type: 'uniform', value: -20, w2: '', a: '', b: '' }, { member: 2, type: 'uniform', value: -20, w2: '', a: '', b: '' }, { member: 1, type: 'point', value: -50, w2: '', a: 3, b: '' }]
};
const DEFAULT_SPANS = {
  spanSupports: [{ x: 0, support: 'pin', settle: '', rotation: '' }, { x: 6, support: 'pin', settle: '', rotation: '' }, { x: 12, support: 'pin', settle: '', rotation: '' }],
  stretches: [{ from: 0, to: 12, E: 200000, I: 300e6 }],
  spanLoads: [{ type: 'uniform', value: -20, w2: '', start: 0, end: 12 }, { type: 'point', value: -50, w2: '', start: 3, end: '' }]
};
const examples = [
  { id: 'bm-si', name: 'Example: propped cantilever with an overhang and a settlement (kN, m, steel)', mode: 'joints', inputs: { units: 'site',
    joints: [{ id: 1, x: 0, support: 'fixed' }, { id: 2, x: 7, support: 'pin', settle: -10 }, { id: 3, x: 9.5, support: 'free', FY: -15 }],
    members: [{ i: 1, j: 2, E: 200000, I: 400e6, release: 'none' }, { i: 2, j: 3, E: 200000, I: 250e6, release: 'none' }],
    memberLoads: [{ member: 1, type: 'linear', value: -10, w2: -25 }, { member: 1, type: 'couple', value: 30, a: 3.5 }, { member: 2, type: 'uniform', value: -8 }] } },
  { id: 'sp-si', name: 'Example: three-span beam with a hinge (kN, m, steel)', mode: 'spans', inputs: { units: 'site', leftX: 0, rightX: 20,
    spanSupports: [{ x: 0, support: 'fixed' }, { x: 7, support: 'pin' }, { x: 14, support: 'pin' }, { x: 20, support: 'pin' }], hinges: [{ x: 9 }],
    stretches: [{ from: 0, to: 14, E: 200000, I: 500e6 }, { from: 14, to: 20, E: 200000, I: 350e6 }],
    spanLoads: [{ type: 'uniform', value: -18, start: 0, end: 20 }, { type: 'point', value: -60, start: 17 }], addAtLoads: false } }
];

const cfg = { kind: KIND, state, jointsKey: 'joints', membersKey: 'members', canEdit: false };

export default {
  id: 'matrix/beam', group: 'matrix', title: 'Beams',
  methods: [],
  modes: [{ id: 'spans', label: 'By spans', icon: 'beam' }, { id: 'joints', label: 'By joints', icon: 'beam' }],
  modeHeading: 'Input',
  steps: (mode) => (mode === 'spans' ? ['Setup', 'Geometry', 'Members', 'Loads', 'Results'] : ['Setup', 'Geometry', 'Members', 'Supports', 'Loads', 'Results']),
  fields: (mode, method, val, ed) => fields(mode, method, val, ed),
  presets: presetsFile.concat(spanPresets, examples),
  solve: (input, ctx) => solveWith(calcSolve, input, ctx),
  draw: (result, o) => drawModel(result, o, state, KIND),
  drawInteractive: (svg, ctx) => interactive(svg, ctx, Object.assign({}, cfg, { noSelect: ctx.vals && !Array.isArray(ctx.vals.joints) })),
  drawOptions: [{ key: 'loads', label: 'Loads' }, { key: 'reactions', label: 'Reactions' }],
  extraCards: (r, ctx) => resultCards(r, ctx, KIND, state),
  reportExtra: (r, ctx, vals) => reportSections(r, ctx, listTables(fields(vals && Array.isArray(vals.spanSupports) && !Array.isArray(vals.joints) ? 'spans' : 'joints', null, vals || {}), vals || {}, ctx.sys), state),
  setupExtra: (ctx) => h('div', { style: 'margin-top:12px' }, signsFigureCard(KIND), saveCard('matrix/beam', ctx)),
  signNote: SIGNS.beam,
  setupNote: 'Direct stiffness method, Kassimali Ch. 5 (beams). Results update as you type. Use Consistent units for book problems given with E = A = 1 or EI constant.',
  stepHelp: (step, mode) => (mode === 'spans' && step === 'Geometry' ? 'Joints are made at both ends, every support, every hinge and every end of an EI stretch, numbered left to right.' : '')
};
