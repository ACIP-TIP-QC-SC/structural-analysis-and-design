# Structural Analysis and Design Calculator

American Concrete Institute Philippines T.I.P. QC Student Chapter · by CEM Jumawan

A static website that solves reinforced concrete, steel and foundation design problems under
NSCP 2015 (7th Edition, Volume I) for civil engineering students. Every result shows a numbered
worked solution with the code clause on every step.

Plain HTML, CSS and JavaScript modules. No build step, no framework, no CDN, no analytics. Nothing
is sent to a server. The only library is three.js (MIT), vendored in `vendor/three/` and loaded only
when a Stress or 3D view is opened.

## Drawing views

Each module's live drawing has a Drawing / Stress / 3D switch and a Play button:

- **Stress** colors the member blue (low) to red (high) in ten bands, with a legend (compact by default;
  it can be expanded to the full table and resized, minimized, or dragged aside). Reinforcement
  has its own scale. Stresses are simple elastic distributions driven by the computed results
  (for example the cracked section under M(x), shear flow, soil pressure with a 2:1 spread).
- **3D** shows concrete translucent so the bars show; *Show reinforcement* turns them off. Steel is solid.
- **Play** loops a 10 second animation: the load rises to the design load and on to failure at
  design load ÷ governing D/C, with cracks appearing where the cracking load is passed, then the
  failure motion for the governing check (flexural hinge, diagonal shear, punching, buckling,
  bolt shear, overturning and so on). Movements are exaggerated.

The views are illustrative, not a finite element analysis. Models are built in `js/ui/viz/models.js`
(pure, testable in node) and drawn by `js/ui/viz/viz3d.js`.

## Run the site

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open http://127.0.0.1:8000/ . Any static file server works. The site is served from the
repository root (GitHub Pages: branch `main`, root folder; the empty `.nojekyll` file is required).

## Run the tests

```bash
node tests/run.mjs
```

Runs every case in `tests/cases/*.json` against the calculation files and exits non-zero on a
failure. Tolerance is 0.2% on each expected number. Add a module name to run one suite, for
example `node tests/run.mjs beam-flexure`.

Browser smoke test (needs Playwright, a development tool only):

```bash
node tests/smoke.mjs
```

It starts its own static server, loads every preset of every built module in SI and English units
and in light and dark themes, and checks the page text, the verdict and the layout widths.

Drawing views: `node tests/viz.mjs` checks every preset's 3D model in node (finite stresses and
movements). `node tests/viz-browser.mjs [module] [--shots]` opens the Stress, 3D and Play views of
every module in a browser and checks that they draw without console errors (`--shots` saves
screenshots to `tests/shots/`).

Edition layer: `node tests/edition.mjs` (also run by `node tests/run.mjs`) checks that NSCP 2025 has every
value path of NSCP 2015 and that an override changes only what it should.

Independent Python checks of the expected answers are in `tools/`.

## Layout

```
index.html              shell: top bar, sidebar, main outlet, footer
css/                    tokens.css (variables), app.css (components), print.css (A4 report)
js/app.js               boot, router, global state, theme
js/core/                registry, units, format, steps, storage, report, shapes
js/ui/                  UI kit: fields, tabs, step bar, verdict, check rows, solution, drawing kit, workspace
js/codes/               nscp2015.js (edition data), theory.js (textbook data), index.js (edition registry)
js/modules/<group>/     x.calc.js (pure formulas) and x.ui.js (module definition and drawing)
js/modules/rc/          rcSection.js (interaction engine), devLength.js (development and splices), common.js
js/modules/steel/       groupElastic.js (elastic bolt and weld groups), common.js, fields.js
js/modules/found/       common.js (net pressure, two-way shear, footing steel)
js/modules/matrix/      direct stiffness engine and the Matrix Analysis calculators (see below)
presets/                examples and test cases per module
data/                   steel-shapes.csv and the generated steel-shapes.json
js/ui/viz/              models.js (3D, stress and animation models) and viz3d.js (three.js viewer)
tests/                  run.mjs, smoke.mjs, viz.mjs, viz-browser.mjs, cases/*.json
vendor/fonts/           IBM Plex Sans and IBM Plex Mono (SIL Open Font License)
vendor/three/           three.js 0.160.1 module build and OrbitControls (MIT)
```

## Rules the code follows

- Formulas live in `*.calc.js` files: no DOM access, no globals, no rounding.
- No code factor, limit or clause number is written in a calc file. They are read from the edition
  object in `js/codes/nscp2015.js`.
- Internal math is SI. Values that cross the calc boundary use the displayed SI unit of their
  quantity (mm, mm², MPa, kN, kN·m, kPa, kN/m, m); English units are converted at the input and
  output boundary only.
- Every `solve(input, ctx)` returns the same result shape (Section 4.2 of the hand-off). The UI,
  the printed report and the copied text are all built from that one object.

## Add a module

1. Write `js/modules/<group>/<name>.calc.js` exporting `solve(input, ctx)` and `compute(input, ctx)`
   (the raw numbers the tests compare). Read every factor and clause key from `ctx.edition`.
2. Write `js/modules/<group>/<name>.ui.js` exporting the module definition: `id`, `title`,
   `methods`, `modes`, `steps`, `fields(mode, method, values, edition)`, `presets`, `solve`, `draw`.
3. Add its presets in `presets/` and its test cases in `tests/cases/`.
4. Register the loader in `js/core/registry.js` (the module row is already in the list). The smoke test
   picks up every registered module by itself.
5. Regenerate the test cases from the presets and run both suites:

```bash
node tools/sync-cases.mjs
```

```bash
node tests/run.mjs
```

```bash
node tests/smoke.mjs
```

List inputs (bar layers, bolt coordinates, weld segments) use the field type `list` with `columns`.

## Add a code edition

An edition is a data file in `js/codes/`. Build a new one from an existing edition with
`derive(base, overrides, meta)` from `js/codes/derive.js` (as `js/codes/nscp2025.js` does), register it in
`js/codes/index.js`, and set `enabled: true` when its values are complete. No calculator file changes: the
calculators read every factor, table and clause number from the edition (`node tools/audit-literals.mjs` lists the
numbers left in calculator files).

## Adding NSCP 2025

`js/codes/nscp2025.js` is in place as a draft: it is NSCP 2015 with nothing changed, it is disabled, and it can be
picked only by opening the site with `?edition-preview=1` (for example `index.html?edition-preview=1`). While it
is selected, every calculator page and printed report shows "NSCP 2025 (TBE): values to be entered. Results
repeat NSCP 2015." When the NSCP 2025 text is available:

1. Run `node tools/edition-checklist.mjs`. It writes `docs/NSCP2025_CHECKLIST.md`, one row per value and clause
   of NSCP 2015 with an empty NSCP 2025 column. Fill that column from the code.
2. Enter each changed value as an override in `nscp2025.js`, by path (`'concrete.phi.shear': 0.75`) or as nested
   objects (`steel: { compression: { phi: 0.90 } }`). Arrays are replaced whole. A few entries are functions with
   their numbers inside (for example `concrete.beta1`, `concrete.Ec`, `concrete.fr`): override the function if
   those numbers change.
3. Change clause numbers in `clauses`, per clause key: `'clauses.steel.comp.Fcr': { nscp: '505.3' }`.
4. For a provision that is new in NSCP 2025, add a new key to both editions (NSCP 2015 gets `null` or its old
   value) and read it in the calculator.
5. Run `node tests/edition.mjs` (parity of the two editions and the override test; also part of
   `node tests/run.mjs`), then the full test suite.
6. Set `enabled: true` and `status: 'final'` in `nscp2025.js` and drop "draft" from its label.

## Matrix Analysis

The group **Matrix Analysis** (Truss, Beams, Frames, Bars (axial)) solves plane trusses, beams, plane
frames and axially loaded bars by the direct stiffness method (Kassimali, *Matrix Analysis of Structures*,
SI 3rd ed.). One engine in `js/modules/matrix/` serves every calculator:

```
linalg.js       dense matrices: multiply, solve (partial pivoting), inverse for display, stability test
elements.js     member stiffness in local axes, transformation T, static condensation for releases
fef.js          fixed-end forces from the Hermite shape-function integrals (exact for partial loads)
dsm.js          the engine: validation, assembly by DOF name, partition, solve, reactions, end forces
stations.js     N, V, M and the exact deflected shape along each member; exact moment peaks
analysis.js     shared calc layer: vals for the tests, checks, warnings, notes, worked solution
truss.calc.js   beam.calc.js   frame.calc.js   bar.calc.js   beamSpans.js (the "By spans" input of Beams)
truss.ui.js     beam.ui.js     frame.ui.js     bar.ui.js
mxui.js         units choice, fixed-decimal results, tables, the Matrices card, report sections,
                the section helper (Fill A and I) and problem export / import as JSON
matrixTable.js  labelled matrices with the partition colours (Kpp yellow, Kps red, Ksp blue, Kss green)
modelCanvas.js  the model drawing after the Excel programs (truss tension/compression, FBD, frame with
                loads and reactions) and input on the drawing (add joints and members)
diagrams.js     the result diagrams after the Excel programs: beam elastic curve, SFD and BMD on the FBD's
                x scale; frame deflected shape, N, V, M; bar N, u and diagram values (no Stress or 3D view)
signs.js        the sign-convention figures of the Setup step
```

- **Units.** The matrix calc files work in one consistent set of units, an exception to the site rule
  above. In SI and English modes the UI converts every input to kN and m before calling the calc and
  converts the results back for display (`mxui.js`, `toCalc`). The Setup step also offers
  **Consistent units**: numbers are used exactly as typed, for book problems given with E = A = 1 or
  EI constant. Every matrix test case runs in Consistent units.
- **Inclined rollers** are exact: the joint's axes are turned to the rolling surface (K′ = Rᵀ K R,
  Kassimali 9.4), no stiff spring.
- **Presets and tests.** `presets/matrix-truss.js`, `matrix-beam.js` and `matrix-frame.js` come from the
  owner's Excel test tabs (generated by the hand-off bundle's `tools/make_presets.py`; do not edit them
  by hand). `presets/matrix-beam-spans.js` holds the By spans tests; the same beams typed by joints are
  in `tools/spans-cases/`. `node tools/sync-cases.mjs` copies `expect` and `expectRef` into
  `tests/cases/`, and `node tests/run.mjs` compares both (an expected 0 passes within 10⁻⁶ of the
  largest value of its kind). Engine unit tests: `node tests/matrix-engine.mjs` (also run by `run.mjs`).
  The Bars tests (`presets/matrix-bar.js`) come from the closed-form hand solutions and an independent
  numpy solver: `python3 tools/bar_reference.py` (output in `tools/bar_reference_output.txt`).
- **Saving.** Inputs are kept in the browser as they are typed. The Setup step exports a problem as a JSON
  file (the input schema in the site's SI input units, or as typed in Consistent units, plus
  `{ module, mode, units, version: 1 }`) and imports it again.

## Steel shapes

`data/steel-shapes.json` is generated by hand from the CSV and committed:

```bash
node tools/build-shapes.mjs data/steel-shapes.csv > data/steel-shapes.json
```

```bash
python3 tools/validate_shapes.py data/steel-shapes.csv
```

The shape list is used exactly as supplied. Nothing in the code depends on which shapes exist.

## Disclaimer

For study and preliminary design. Verify results against the governing code.
