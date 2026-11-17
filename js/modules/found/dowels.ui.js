// Column-to-footing bearing and dowels: module definition and live drawing.
import { solve } from './dowels.calc.js';
import presets from '../../../presets/found-dowels.js';
import { fcField, fyField, num, bar } from '../rc/fields.js';
import { canvas, rect, line, text, cap, dimV, poly } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const f = [num('c1', 'column size along L', 'c1', 'length_mm', 'Column', 400), num('c2', 'column size along B', 'c2', 'length_mm', 'Column', 400),
    fcField(ed, 'Column', { key: 'fcCol', label: 'column concrete strength', symbol: "f'c,col" }), num('Pu', 'factored column load', 'Pu', 'force', 'Column', 2500),
    num('B', 'footing width', 'B', 'length_m', 'Footing', 2.5), num('L', 'footing length', 'L', 'length_m', 'Footing', 2.5), num('h', 'footing thickness', 'h', 'length_mm', 'Footing', 600),
    fcField(ed, 'Footing', { key: 'fcFtg', label: 'footing concrete strength', symbol: "f'c,ftg", default: 21 })];
  if (mode === 'dowels') f.push(fyField(ed, 'Bars'), bar('dbCol', 'column bar size', 'Bars', 25), bar('dbDowel', 'dowel bar size', 'Bars', 16), bar('dbFtg', 'footing bar size', 'Bars', 20));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 262, 'Column on the footing with the bearing frustum and dowels', o);
  if (!(D.h > 0)) return svg;
  const x0 = 60, x1 = 420, yt = 110, k = 110 / Math.max(D.h, 1), hb = D.h * k, cw = Math.min(90, (x1 - x0) * D.c1 / (D.L * 1000)) || 60, cx = 260;
  svg.add(rect(x0, yt, x1 - x0, hb, 'conc'), rect(cx - cw / 2, 20, cw, yt - 20, 'conc'));
  svg.add(poly([[cx - cw / 2, yt], [cx + cw / 2, yt], [Math.min(cx + cw / 2 + 2 * hb, x1), yt + hb], [Math.max(cx - cw / 2 - 2 * hb, x0), yt + hb]], 'comp'));
  if (D.dowel) {
    const emb = Math.min(D.avail, D.ldc) * k, lap = Math.min(D.lap * k, yt - 26);
    [cx - cw / 2 + 10, cx + cw / 2 - 10].forEach((x) => svg.add(line(x, yt - lap, x, yt + emb, 'barline')));
    svg.add(line(x0 + 6, yt + hb - 75 * k, x1 - 6, yt + hb - 75 * k, 'thin'), text(cx + cw / 2 + 8, yt - lap / 2, 'lap ' + o.fq(D.lap, 'length_mm')), text(cx + cw / 2 + 8, yt + emb - 4, 'ℓdc ' + o.fq(D.ldc, 'length_mm')));
  }
  svg.add(dimV(x1 + 12, yt, yt + hb, 'h = ' + o.fq(D.h, 'length_mm', false), true), text(x0 + 6, yt + hb - 6, 'A2 frustum (1 : 2)'), cap(cx, 254, 'Section through the column and footing'));
  return svg;
}

export default {
  id: 'found/dowels', group: 'found', title: 'Column-to-footing bearing and dowels',
  methods: [],
  modes: [{ id: 'bearing', label: 'Bearing', icon: 'column' }, { id: 'dowels', label: 'Dowels', icon: 'column' }],
  steps: (mode) => (mode === 'dowels' ? ['Setup', 'Column', 'Footing', 'Bars', 'Results'] : ['Setup', 'Column', 'Footing', 'Results']),
  fields, presets, solve, draw,
  stepHelp: (step) => (step === 'Column' ? 'The factored column load can arrive from Isolated footings.' : '')
};
