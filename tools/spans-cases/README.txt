By spans tests of matrix/beam (presets/matrix-beam-spans.js, SP-1 to SP-3).

Each file is the same beam as the By spans preset, typed by hand by joints (joint table, element
table and load list) in the format of the hand-off bundle's cases/*.json. The expected values in
the presets come from the bundle's independent solver:

    python3 tools/matrix_reference.py tools/spans-cases --json spans-reference.json

(run from the hand-off bundle folder, where tools/matrix_reference.py lives).
