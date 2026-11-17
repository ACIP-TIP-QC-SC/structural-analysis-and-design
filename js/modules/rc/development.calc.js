// Development length and splices of deformed bars. Pure calculation; the formulas are in devLength.js.
// Units: mm, MPa.
import { S, v, u, si, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { ldSimplified, ldGeneral, ldTension, ldHook, hookGeometry, ldCompression, lapTension, lapCompression, lapCompressionMixed, devSqrtFc } from './devLength.js';
import { materialWarnings } from './common.js';

const L = 'length_mm', ST = 'stress';

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, D = ed.concrete.dev, mode = input.mode || 'tension';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  if (!positive(input, ['db', 'fc', 'fy', 'lambda'])) return stop('The bar size, strengths and λ need positive numbers.');
  const { db, fc, fy, lambda } = input, p = { db, fc, fy, lambda };
  out.warnings.push(...materialWarnings(fc, fy, ed));
  const rt = devSqrtFc(fc, ed);
  rec.add('Square root of concrete strength', S`√f'c ≤ ${si(D.sqrtFcMax, ST)}`, S`√(${si(fc, ST)}) = ${Math.sqrt(fc)}`, S`√f'c used = ${si(rt, ST)}`, 'dev.sqrtFc');
  const available = input.available > 0 ? input.available : null;
  const finish = (required, name, clause) => {
    if (available) out.checks.push(check(name, ['required', required, L], ['available', available, L], required / available, clause));
    else out.notes.push('Enter the available length to check it against the required length.');
    out.steps = rec.steps; out.verdict = verdictOf(out.checks);
    return { vals, result: out };
  };
  const tf = { top: !!input.top, coating: input.coating || 'none' };

  // Straight bars in tension, both methods.
  const tensionSteps = (withMin) => {
    const good = ldSimplified(Object.assign({}, p, tf, { favourable: true }), ed), other = ldSimplified(Object.assign({}, p, tf, { favourable: false }), ed);
    rec.add('Modification factors', S`ψt = ${D.psiT.top} for more than 300 mm of fresh concrete below the bar, else ${D.psiT.other};  ψe for coating;  ψt ψe ≤ ${D.psiTEMax};  ψs = ${D.psiS.small} for ${u(D.smallBarMax, L)} and smaller bars, else ${D.psiS.large}`,
      S`ψt = ${good.psiT}, ψe = ${good.psiE}, ψt ψe = ${good.psiTE}, ψs = ${good.psiS}`, null, 'dev.tension.factors');
    rec.add('Simplified method', S`ℓd = fy ψt ψe / (X λ √f'c) · db`,
      S`favourable spacing and cover: X = ${good.X} → ℓd = ${v(fy, ST)} · ${good.psiTE} / (${good.X} · ${lambda} · ${si(rt, ST)}) · ${v(db, L)} = ${u(good.ld, L)};  other cases: X = ${other.X} → ${u(other.ld, L)}`,
      S`ℓd = ${u(input.favourable === false ? other.ld : good.ld, L)} (${input.favourable === false ? 'other cases' : 'favourable case'})`, 'dev.tension.simple',
      'Favourable: clear spacing ≥ db, clear cover ≥ db and at least minimum stirrups along ℓd, or clear spacing ≥ 2db and clear cover ≥ db.');
    Object.assign(vals, { ldSimpleGood: good.ld, ldSimpleOther: other.ld, psiTE: good.psiTE, psiS: good.psiS });
    let gen = null;
    if (input.cb > 0) {
      gen = ldGeneral(Object.assign({}, p, tf, { cb: input.cb, Atr: input.Atr, s: input.sTr, n: input.nSpliced }), ed);
      if (gen.Ktr > 0) rec.add('Transverse reinforcement index', S`Ktr = ${D.general.ktr} Atr / (s n)`, S`Ktr = ${D.general.ktr} · ${v(input.Atr, 'area')} / (${v(input.sTr, L)} · ${input.nSpliced})`, S`Ktr = ${u(gen.Ktr, L)}`, 'dev.tension.ktr');
      rec.add('General equation', S`ℓd = (fy / (${D.general.k} λ √f'c)) · (ψt ψe ψs / ((cb + Ktr) / db)) · db,  (cb + Ktr) / db ≤ ${D.general.confMax}`,
        S`(cb + Ktr) / db = (${v(input.cb, L)} + ${v(gen.Ktr, L)}) / ${v(db, L)} = ${gen.confRaw}${gen.confRaw > gen.conf ? ', use ' + D.general.confMax : ''}`,
        S`ℓd = ${u(gen.ld, L)}`, 'dev.tension.general');
      vals.ldGeneral = gen.ld; vals.conf = gen.conf; vals.Ktr = gen.Ktr;
    }
    const useGeneral = input.method !== 'simplified' && gen;
    const raw = useGeneral ? gen.ld : (input.favourable === false ? other.ld : good.ld);
    if (!withMin) return { raw, useGeneral };
    const t = ldTension(raw, input.excess, ed);
    rec.add('Development length', S`ℓd = ${useGeneral ? 'general equation' : 'simplified method'}${t.factor < 1 ? S` × (As required / As provided) = × ${t.factor}` : ''};  not less than ${u(D.ldMin, L)}`, S`ℓd = ${u(t.reduced, L)}`, S`ℓd = ${u(t.ld, L)}`, 'dev.tension.min',
      t.factor < 1 ? 'The excess reinforcement factor is not allowed for lap splices, at supports for positive moment bars, or in seismic systems (' + ed.clauses['dev.excess'].nscp + ').' : '');
    if (!gen) out.notes.push('Enter cb (the smaller of the cover to the bar centre and half the bar spacing) to see the general equation.');
    return { raw, ld: t.ld, useGeneral };
  };

  if (mode === 'tension') {
    const t = tensionSteps(true);
    vals.ld = t.ld;
    out.results = [res('ℓd, simplified favourable', vals.ldSimpleGood, L), res('ℓd, simplified other cases', vals.ldSimpleOther, L)];
    if (vals.ldGeneral) out.results.push(res('ℓd, general equation', vals.ldGeneral, L));
    out.results.push(res('ℓd to use', t.ld, L));
    out.diagram = { kind: 'straight', db, length: t.ld, label: 'ℓd', chips: [S`${db} mm bar`, [t.useGeneral ? 'general equation' : 'simplified method']] };
    return finish(t.ld, 'Development length', 'dev.tension.general');
  }

  if (mode === 'hooks') {
    const hk = ldHook(Object.assign({}, p, { epoxy: input.coating !== 'none', psiC: input.psiC, psiR: input.psiR }), ed), H = D.hook;
    rec.add('Hook factors', S`ψe = ${H.psiE} epoxy-coated, else 1.0;  ψc = ${H.psiC} with side cover ≥ 65 mm (and ≥ 50 mm on the extension of a 90° hook);  ψr = ${H.psiR} when enclosed by ties at ≤ 3db`, S`ψe = ${hk.psiE}, ψc = ${hk.psiC}, ψr = ${hk.psiR}`, null, 'dev.hook.factors',
      db > H.maxBar ? 'ψc and ψr apply only to bars of ' + H.maxBar + ' mm and smaller.' : '');
    rec.add('Development length of a standard hook', S`ℓdh = greatest of (${H.k} fy ψe ψc ψr / (λ √f'c)) db, ${H.minDb} db and ${u(H.min, L)}`,
      S`(${H.k} · ${v(fy, ST)} · ${hk.psiE} · ${hk.psiC} · ${hk.psiR} / (${lambda} · ${si(rt, ST)})) · ${v(db, L)} = ${u(hk.basic, L)};  ${H.minDb} db = ${u(hk.minDb, L)}`, S`ℓdh = ${u(hk.ldh, L)}`, 'dev.hook');
    const gm = hookGeometry(db, ed);
    rec.add('Standard hook geometry', S`90° hook: extension ${ed.concrete.dev.hookGeometry.ext90} db;  180° hook: greater of ${ed.concrete.dev.hookGeometry.ext180Db} db and ${u(ed.concrete.dev.hookGeometry.ext180Min, L)};  inside bend diameter ${gm.bendDb} db`,
      null, S`90° extension ${u(gm.ext90, L)};  180° extension ${u(gm.ext180, L)};  bend diameter ${u(gm.bendDia, L)}`, 'dev.hook.geometry');
    Object.assign(vals, { ldh: hk.ldh, basic: hk.basic, min8db: hk.minDb, ext90: gm.ext90, ext180: gm.ext180, bendDia: gm.bendDia });
    out.results = [res('ℓdh', hk.ldh, L), res('90° extension', gm.ext90, L), res('180° extension', gm.ext180, L), res('Bend diameter', gm.bendDia, L)];
    out.diagram = { kind: 'hook', db, length: hk.ldh, ext: gm.ext90, bend: gm.bendDia, label: 'ℓdh', chips: [S`${db} mm bar, standard hook`] };
    return finish(hk.ldh, 'Hook development length', 'dev.hook');
  }

  if (mode === 'compression') {
    const c = ldCompression(Object.assign({}, p, { confined: !!input.confined }), ed), K = D.comp;
    rec.add('Development length in compression', S`ℓdc = greater of (${K.k} fy ψr / (λ √f'c)) db and ${K.k2} fy ψr db;  not less than ${u(K.min, L)}`,
      S`(${K.k} · ${v(fy, ST)} · ${c.psiR} / (${lambda} · ${si(rt, ST)})) · ${v(db, L)} = ${u(c.a, L)};  ${K.k2} · ${v(fy, ST)} · ${c.psiR} · ${v(db, L)} = ${u(c.b, L)}`, S`ℓdc = ${u(c.ldc, L)}`, 'dev.comp',
      c.psiR < 1 ? 'ψr = ' + K.psiR + ' for bars enclosed by a spiral or the ties described in ' + ed.clauses['dev.comp.factors'].nscp + '.' : '');
    Object.assign(vals, { ldcA: c.a, ldcB: c.b, ldc: c.ldc });
    out.results = [res('(0.24 fy ψr / λ√f\'c) db', c.a, L), res('0.043 fy ψr db', c.b, L), res('ℓdc', c.ldc, L)];
    out.diagram = { kind: 'straight', db, length: c.ldc, label: 'ℓdc', comp: true, chips: [S`${db} mm bar in compression`] };
    return finish(c.ldc, 'Development length in compression', 'dev.comp');
  }

  // Lap splices
  const t = tensionSteps(false), T = D.lapT;
  const classB = !(input.ratio2 && input.half);
  const A = lapTension(t.raw, false, ed), B = lapTension(t.raw, true, ed), lapT = classB ? B : A;
  rec.add('Tension lap splice', S`Class A = ${T.A} ℓd when As provided / As required ≥ ${T.ratio} and not more than ${T.maxSpliced * 100}% of the bars are spliced;  otherwise Class B = ${T.B} ℓd;  not less than ${u(T.min, L)}`,
    S`ℓd (without the ${u(D.ldMin, L)} minimum and the excess factor) = ${u(t.raw, L)};  Class A = ${u(A.lap, L)}, Class B = ${u(B.lap, L)}`, S`Class ${lapT.cls}: lap = ${u(lapT.lap, L)}`, 'dev.lap.tension', 'ℓd for a splice is taken without the minimum length and without the excess reinforcement factor (' + ed.clauses['dev.lap.ld'].nscp + ').');
  const K = D.lapC, cl = lapCompression({ db, fy, fc }, ed);
  rec.add('Compression lap splice', cl.highFy ? S`fy > ${u(K.fyBreak, ST)}: lap = (${K.b} fy − ${K.c}) db, not less than ${u(K.min, L)}` : S`fy ≤ ${u(K.fyBreak, ST)}: lap = ${K.a} fy db, not less than ${u(K.min, L)}`,
    cl.highFy ? S`(${K.b} · ${si(fy, ST)} − ${K.c}) · ${v(db, L)} = ${u(cl.base, L)}` : S`${K.a} · ${si(fy, ST)} · ${v(db, L)} = ${u(cl.base, L)}`, S`lap = ${u(cl.lap, L)}`, 'dev.lap.comp', cl.low ? 'Multiplied by 4/3 because f\'c is below ' + K.fcLow + ' MPa.' : '');
  Object.assign(vals, { ldRaw: t.raw, classA: A.lap, classB: B.lap, lapTension: lapT.lap, lapClass: lapT.cls, lapComp: cl.lap });
  let compLap = cl.lap;
  if (input.db2 > 0 && input.db2 !== db) {
    const mx = lapCompressionMixed({ db1: db, db2: input.db2, fy, fc, lambda, confined: false }, ed);
    rec.add('Compression lap of bars of different sizes', S`greater of ℓdc of the larger bar and the compression lap of the smaller bar`, S`ℓdc (${mx.big} mm) = ${u(mx.ldcBig, L)};  lap (${mx.little} mm) = ${u(mx.lapSmall, L)}`, S`lap = ${u(mx.lap, L)}`, 'dev.lap.compSizes');
    compLap = mx.lap; vals.lapMixed = mx.lap;
  }
  out.results = [res('ℓd for the splice', t.raw, L), res('Class A', A.lap, L), res('Class B', B.lap, L), res('Tension lap (Class ' + lapT.cls + ')', lapT.lap, L), res('Compression lap', compLap, L)];
  out.diagram = { kind: 'lap', db, length: input.lapType === 'compression' ? compLap : lapT.lap, label: 'lap', chips: [S`${db} mm bars`, ['Class ' + lapT.cls + ' tension lap']] };
  return finish(input.lapType === 'compression' ? compLap : lapT.lap, input.lapType === 'compression' ? 'Compression lap length' : 'Tension lap length', input.lapType === 'compression' ? 'dev.lap.comp' : 'dev.lap.tension');
}
