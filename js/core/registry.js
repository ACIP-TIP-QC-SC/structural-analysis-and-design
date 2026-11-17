// Module list (hand-off Section 1.1) and lazy loaders.
export const GROUPS = [
  { id: 'rc', label: 'Reinforced concrete', abbr: 'RC', methods: ['USD', 'WSD'], stateKey: 'rcMethod' },
  { id: 'steel', label: 'Steel', abbr: 'ST', methods: ['LRFD', 'ASD'], stateKey: 'steelMethod' },
  { id: 'found', label: 'Foundations', abbr: 'FD', methods: [], stateKey: null },
  { id: 'shared', label: 'Shared tools', abbr: 'SH', methods: [], stateKey: null }
];

const m = (id, title, modes, phase, desc, about, thumb) => ({ id, group: id.split('/')[0], title, modes, phase, desc, about, thumb });

export const MODULES = [
  m('rc/beam-flexure', 'Beam flexure', ['Singly', 'Doubly', 'T and L'], 1, 'Flexural strength and steel design of rectangular and flanged beams.', 'Analyze a beam with given bars or design the steel for a factored moment. Covers singly and doubly reinforced sections and T and L beams, with a WSD reference mode.', 'beam'),
  m('rc/shear-torsion', 'Shear and torsion', ['Beam shear', 'Torsion'], 1, 'Stirrup design for shear, and torsion in solid rectangular beams.', 'Find the stirrup spacing for a factored shear, or check a spacing you already have. The torsion mode gives the closed stirrups and longitudinal steel.', 'stirrup'),
  m('rc/one-way-slab', 'One-way slabs', ['Design strip'], 1, 'Thickness, main steel and temperature steel for a one metre strip.', 'Design a one metre strip of a one-way slab. Gives the minimum thickness, bar spacings and the shear check.', 'slab'),
  m('rc/two-way-slab', 'Two-way slabs (DDM)', ['Thickness', 'Moments', 'Punching shear'], 2, 'Direct design method: thickness, strip moments and punching shear.', 'Minimum thickness, static moment and its distribution to column and middle strips, and punching shear at columns.', 'slab'),
  m('rc/columns', 'Columns', ['Axial', 'Interaction diagram', 'Ties and spirals', 'Slenderness'], 2, 'Axial strength, interaction diagram, ties, spirals and slenderness.', 'Short column strength, the axial and moment interaction diagram, tie and spiral detailing, and moment magnification for braced columns.', 'column'),
  m('rc/development', 'Development and splices', ['Tension', 'Compression', 'Hooks', 'Lap splices'], 2, 'Development lengths, standard hooks and lap splices.', 'Development length of bars in tension and compression, hooked bars, and lap splice lengths.', 'bar'),
  m('rc/serviceability', 'Deflection and crack control', ['Deflection', 'Bar spacing'], 2, 'Immediate and long-term deflection, and bar spacing for crack control.', 'Effective moment of inertia, immediate and long-term deflections against the code limits, and the maximum bar spacing.', 'beam'),
  m('rc/shear-walls', 'Shear walls (basic)', ['In-plane shear', 'Axial and flexure', 'Minimum steel'], 3, 'In-plane shear, axial load and minimum steel of ordinary walls.', 'In-plane shear strength, the simplified axial method and the minimum wall reinforcement.', 'wall'),
  m('rc/prestressed', 'Prestressed', [], 'Later', 'Prestressed concrete members.', 'Planned for a later release.', 'beam'),
  m('steel/tension', 'Tension members', ['Yielding and rupture', 'Block shear'], 1, 'Gross yielding, net section rupture with shear lag, and block shear.', 'Available tensile strength of a rolled shape or plate by LRFD or ASD, with the net area and shear lag factor. A second mode checks block shear.', 'tension'),
  m('steel/compression', 'Compression members', ['Flexural buckling'], 1, 'Flexural buckling strength of rolled columns.', 'Available compressive strength of a W or S shape about both axes, with the local buckling classification.', 'ishape'),
  m('steel/beams', 'Beams', ['Flexure', 'Shear', 'Deflection'], 1, 'Flexure with lateral-torsional buckling, shear and deflection.', 'Available flexural strength for any unbraced length, with a chart of strength against length. Separate modes give shear strength and deflection.', 'ishape'),
  m('steel/beam-columns', 'Beam-columns', ['Interaction', 'B1 and B2'], 2, 'Combined axial force and flexure, and second-order amplification.', 'Interaction equations for combined axial load and bending, and the B1 and B2 amplifiers.', 'ishape'),
  m('steel/bolted', 'Bolted connections', ['Bearing-type', 'Slip-critical', 'Eccentric group'], 2, 'Bolt shear, bearing, slip resistance and eccentric bolt groups.', 'Bearing-type and slip-critical bolts, and the elastic analysis of an eccentrically loaded bolt group.', 'bolts'),
  m('steel/welded', 'Welded connections', ['Fillet', 'Groove', 'Eccentric group'], 2, 'Fillet and groove welds, and eccentric weld groups.', 'Strength of fillet and groove welds and the elastic analysis of an eccentrically loaded weld group.', 'bolts'),
  m('steel/base-plates', 'Base plates and anchor rods', ['Bearing', 'Plate thickness', 'Anchors'], 3, 'Bearing on concrete, plate thickness and anchor rod strength.', 'Axially loaded column base plates: concrete bearing, plate thickness and the steel strength of anchor rods.', 'footing'),
  m('steel/composite', 'Composite', [], 'Later', 'Composite steel and concrete members.', 'Planned for a later release.', 'ishape'),
  m('found/bearing', 'Bearing capacity', ['Terzaghi', 'General equation'], 1, 'Ultimate and allowable bearing capacity of shallow footings.', 'Bearing capacity by the Terzaghi equations or the general equation with shape, depth and inclination factors. Handles a water table and eccentric load.', 'soil'),
  m('found/isolated', 'Isolated footings', ['Design', 'Analyze'], 1, 'Size, shear and flexure of a footing under one column.', 'Size a square or rectangular footing from service loads, then check one-way shear, two-way shear and flexure with factored loads.', 'footing'),
  m('found/wall', 'Wall footings', ['Design'], 1, 'Width, shear and flexure of a strip footing per metre of wall.', 'Design a footing under a concrete or masonry wall for one metre of length.', 'footing'),
  m('found/combined', 'Combined and strap footings', ['Rectangular', 'Trapezoidal', 'Strap'], 2, 'Footings that carry two columns.', 'Proportion rectangular, trapezoidal and strap footings and draw their shear and moment diagrams.', 'footing'),
  m('found/dowels', 'Column-to-footing bearing and dowels', ['Bearing', 'Dowels'], 2, 'Bearing at the column base and the dowels across it.', 'Bearing strength of the column and footing concrete, dowel area and embedment.', 'column'),
  m('found/retaining', 'Retaining walls', ['Stability', 'Stem and base'], 2, 'Overturning, sliding, bearing and the design of the stem and base.', 'Stability of a cantilever retaining wall and the strength design of its stem, heel and toe.', 'wall'),
  m('found/mat', 'Mat foundations', ['Rigid method'], 3, 'Soil pressure under a rigid mat and strip design loads.', 'Conventional rigid method: pressures under the mat and the adjusted loads on a design strip.', 'footing'),
  m('found/pile-capacity', 'Pile capacity', ['Point', 'Skin', 'Group'], 3, 'Point and skin resistance of single piles and pile groups.', 'Static formulas for the point and skin resistance of a pile and the efficiency of a group.', 'soil'),
  m('found/pile-caps', 'Pile caps', ['Reactions', 'Shear', 'Flexure'], 3, 'Pile reactions, shear and flexure of a rigid cap.', 'Reactions of the piles under a rigid cap and the shear and flexure design of the cap.', 'footing'),
  m('found/settlement', 'Settlement', [], 'Optional', 'Elastic and consolidation settlement.', 'Optional module, planned for a later release.', 'soil'),
  m('shared/load-transfer', 'Load transfer', ['Panel distribution', 'Load takeoff'], 1, 'Slab loads to beams, columns and footings.', 'Distribute a floor panel load to its edge beams by one-way or two-way action, or take off loads down to a column and its footing.', 'panel'),
  m('shared/load-combos', 'Load combinations', ['Strength', 'Allowable'], 1, 'NSCP Section 203 strength and allowable combinations.', 'Evaluate every load combination of Section 203 for your loads and mark the governing maximum and minimum.', 'combo'),
  m('shared/wind', 'Wind loads', [], 'Later', 'Wind loads on buildings.', 'Planned for a later release.', 'combo'),
  m('shared/seismic', 'Seismic loads', [], 'Later', 'Seismic loads on buildings.', 'Planned for a later release.', 'combo')
];

const LOADERS = {
  'rc/beam-flexure': () => import('../modules/rc/beam-flexure.ui.js'),
  'rc/shear-torsion': () => import('../modules/rc/shear-torsion.ui.js'),
  'rc/one-way-slab': () => import('../modules/rc/one-way-slab.ui.js'),
  'steel/tension': () => import('../modules/steel/tension.ui.js'),
  'steel/compression': () => import('../modules/steel/compression.ui.js'),
  'steel/beams': () => import('../modules/steel/beams.ui.js'),
  'found/bearing': () => import('../modules/found/bearing.ui.js'),
  'found/isolated': () => import('../modules/found/isolated.ui.js'),
  'found/wall': () => import('../modules/found/wall.ui.js'),
  'shared/load-transfer': () => import('../modules/shared/load-transfer.ui.js'),
  'shared/load-combos': () => import('../modules/shared/load-combos.ui.js'),
  'rc/columns': () => import('../modules/rc/columns.ui.js'),
  'rc/development': () => import('../modules/rc/development.ui.js'),
  'rc/serviceability': () => import('../modules/rc/serviceability.ui.js'),
  'rc/two-way-slab': () => import('../modules/rc/two-way-slab.ui.js'),
  'steel/beam-columns': () => import('../modules/steel/beam-columns.ui.js'),
  'steel/bolted': () => import('../modules/steel/bolted.ui.js'),
  'steel/welded': () => import('../modules/steel/welded.ui.js'),
  'found/dowels': () => import('../modules/found/dowels.ui.js'),
  'found/combined': () => import('../modules/found/combined.ui.js'),
  'found/retaining': () => import('../modules/found/retaining.ui.js'),
  'rc/shear-walls': () => import('../modules/rc/shear-walls.ui.js'),
  'steel/base-plates': () => import('../modules/steel/base-plates.ui.js'),
  'found/mat': () => import('../modules/found/mat.ui.js'),
  'found/pile-capacity': () => import('../modules/found/pile-capacity.ui.js'),
  'found/pile-caps': () => import('../modules/found/pile-caps.ui.js')
};

export const getModule = (id) => MODULES.find((x) => x.id === id) || null;
export const getGroup = (id) => GROUPS.find((g) => g.id === id) || null;
export const isBuilt = (id) => !!LOADERS[id];
export const tagOf = (mod) => (typeof mod.phase === 'string' ? mod.phase : (isBuilt(mod.id) ? '' : 'Planned'));
export async function loadModule(id) {
  if (!LOADERS[id]) return null;
  const file = await LOADERS[id]();
  return file.default;
}
