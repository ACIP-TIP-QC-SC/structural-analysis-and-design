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

- **Stress** colors the member blue (low) to red (high) in ten bands, with a legend. Reinforcement
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

1. Copy `js/codes/nscp2015.js` to a new file and change the values and clause numbers.
2. Register it in `js/codes/index.js` with `enabled: true`.

No calculator file changes.

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
