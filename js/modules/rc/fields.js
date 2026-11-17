// Field definitions shared by the reinforced concrete and foundation UI files.
export const fcField = (ed, step, extra) => Object.assign({ key: 'fc', label: 'concrete strength', symbol: "f'c", quantity: 'stress', step, default: ed.concrete.defaults.fc, choices: ed.concrete.fcChoices, min: ed.concrete.fcRange[0], max: ed.concrete.fcRange[1] }, extra);
export const fyField = (ed, step, extra) => Object.assign({ key: 'fy', label: 'steel yield strength', symbol: 'fy', quantity: 'stress', step, default: ed.concrete.defaults.fy, choices: ed.concrete.fyChoices, min: ed.concrete.fyRange[0], max: ed.concrete.fyRange[1] }, extra);
export const num = (key, label, symbol, quantity, step, def, extra) => Object.assign({ key, label, symbol, quantity, step, default: def }, extra);
export const bar = (key, label, step, def, extra) => Object.assign({ key, label, type: 'bar', step, default: def }, extra);
export const sel = (key, label, step, def, options, extra) => Object.assign({ key, label, type: 'select', step, default: def, options }, extra);
