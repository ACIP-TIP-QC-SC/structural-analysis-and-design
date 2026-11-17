// Small thumbnail drawings for mode tiles and hub popovers (44 x 44).
const c = 'style="fill:var(--conc);stroke:var(--ink)"';
const k = 'style="fill:var(--ink)"';
const l = 'style="fill:none;stroke:var(--ink);stroke-width:1.5"';
const a = 'style="fill:none;stroke:var(--accent);stroke-width:1.5"';
const ICONS = {
  singly: `<rect x="12" y="4" width="20" height="36" ${c}/><circle cx="17" cy="35" r="2" ${k}/><circle cx="27" cy="35" r="2" ${k}/>`,
  doubly: `<rect x="12" y="4" width="20" height="36" ${c}/><circle cx="17" cy="35" r="2" ${k}/><circle cx="27" cy="35" r="2" ${k}/><circle cx="17" cy="9" r="2" ${k}/><circle cx="27" cy="9" r="2" ${k}/>`,
  tbeam: `<path d="M3 4h38v9H29v27H15V13H3z" ${c}/><circle cx="19" cy="35" r="2" ${k}/><circle cx="25" cy="35" r="2" ${k}/>`,
  beam: `<rect x="12" y="4" width="20" height="36" ${c}/><circle cx="17" cy="35" r="2" ${k}/><circle cx="22" cy="35" r="2" ${k}/><circle cx="27" cy="35" r="2" ${k}/>`,
  stirrup: `<rect x="10" y="4" width="24" height="36" ${c}/><rect x="14" y="8" width="16" height="28" rx="3" ${l}/><circle cx="18" cy="32" r="2" ${k}/><circle cx="26" cy="32" r="2" ${k}/>`,
  torsion: `<rect x="10" y="4" width="24" height="36" ${c}/><path d="M15 22a7 7 0 1 1 7 7" ${a}/><path d="M22 26l-3 3 3 3" ${a}/>`,
  slab: `<rect x="2" y="16" width="40" height="12" ${c}/><circle cx="8" cy="24" r="1.6" ${k}/><circle cx="17" cy="24" r="1.6" ${k}/><circle cx="26" cy="24" r="1.6" ${k}/><circle cx="35" cy="24" r="1.6" ${k}/>`,
  column: `<rect x="10" y="10" width="24" height="24" ${c}/><circle cx="15" cy="15" r="2" ${k}/><circle cx="29" cy="15" r="2" ${k}/><circle cx="15" cy="29" r="2" ${k}/><circle cx="29" cy="29" r="2" ${k}/>`,
  bar: `<path d="M4 30h30a6 6 0 0 0 6-6v-12" ${l}/>`,
  wall: `<rect x="16" y="4" width="10" height="30" ${c}/><rect x="6" y="34" width="32" height="6" ${c}/>`,
  tension: `<rect x="4" y="16" width="36" height="12" ${c}/><circle cx="12" cy="22" r="2" ${k}/><circle cx="20" cy="22" r="2" ${k}/><path d="M30 22h10M36 18l4 4-4 4" ${a}/>`,
  block: `<rect x="4" y="10" width="36" height="24" ${c}/><circle cx="14" cy="17" r="2" ${k}/><circle cx="24" cy="17" r="2" ${k}/><circle cx="14" cy="27" r="2" ${k}/><circle cx="24" cy="27" r="2" ${k}/><path d="M4 17h20v10H4" ${a}/>`,
  ishape: `<path d="M8 4h28v5H25v26h11v5H8v-5h11V9H8z" ${c}/>`,
  shearI: `<path d="M8 4h28v5H25v26h11v5H8v-5h11V9H8z" ${c}/><path d="M22 12v20M19 29l3 3 3-3" ${a}/>`,
  deflect: `<path d="M4 14h36" ${l}/><path d="M4 14q18 22 36 0" ${a}/><path d="M2 20l4-6 4 6zM34 20l4-6 4 6z" ${k}/>`,
  bolts: `<rect x="6" y="6" width="32" height="32" ${c}/><circle cx="15" cy="15" r="2.5" ${k}/><circle cx="29" cy="15" r="2.5" ${k}/><circle cx="15" cy="29" r="2.5" ${k}/><circle cx="29" cy="29" r="2.5" ${k}/>`,
  soil: `<path d="M2 14h40" ${l}/><rect x="12" y="20" width="20" height="6" ${c}/><rect x="19" y="8" width="6" height="12" ${c}/><path d="M12 26q10 16 20 0" ${a}/>`,
  soilg: `<path d="M2 14h40" ${l}/><rect x="10" y="20" width="24" height="6" ${c}/><rect x="19" y="8" width="6" height="12" ${c}/><path d="M4 32h36" ${a}/><path d="M10 26q12 14 24 0" ${a}/>`,
  footing: `<rect x="17" y="4" width="10" height="20" ${c}/><rect x="4" y="24" width="36" height="10" ${c}/><path d="M8 38v-3M16 38v-3M24 38v-3M32 38v-3" ${a}/>`,
  footplan: `<rect x="4" y="4" width="36" height="36" ${c}/><rect x="17" y="17" width="10" height="10" ${k}/><rect x="12" y="12" width="20" height="20" ${a} stroke-dasharray="3 2"/>`,
  panel: `<rect x="4" y="8" width="36" height="28" ${c}/><path d="M4 8l14 14L4 36M40 8L26 22l14 14M18 22h8" ${a}/>`,
  takeoff: `<path d="M6 8h32M6 20h32M6 32h32" ${l}/><path d="M10 8v32M34 8v32" ${l}/><path d="M22 2v6M19 5l3 3 3-3" ${a}/>`,
  combo: `<path d="M6 36V8M6 36h32" ${l}/><rect x="10" y="20" width="6" height="16" ${c}/><rect x="19" y="12" width="6" height="24" ${c}/><rect x="28" y="24" width="6" height="12" ${c}/>`
};
export function iconMarkup(name) {
  return `<svg viewBox="0 0 44 44" aria-hidden="true">${ICONS[name] || ICONS.beam}</svg>`;
}
