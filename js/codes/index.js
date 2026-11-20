// Edition registry. NSCP 2025 is built from NSCP 2015 by js/codes/nscp2025.js and stays disabled until its values
// are entered. Draft editions can be picked only in preview (the ?edition-preview=1 address flag, read by app.js).
import nscp2015 from './nscp2015.js';
import nscp2025 from './nscp2025.js';

export const editions = [nscp2015, nscp2025];

let preview = false;
export function setPreview(on) { preview = !!on; }
// True when the edition may be picked: enabled, or a draft while previewing.
export const selectable = (ed) => !!ed && (ed.enabled || (preview && ed.status === 'draft'));

export function getEdition(id) {
  return editions.find((e) => e.id === id && selectable(e)) || nscp2015;
}

// Clause chip text. display: 'both' | 'nscp' | 'source'. Sections print as "Sec." ("Secs." for a list),
// tables and equations print as they are. A no-break space keeps the prefix on the same line as its number.
export function clauseText(edition, key, display = 'both') {
  const c = edition.clauses[key];
  if (!c) return key || '';
  if (c.text) return c.text;
  const ref = (s) => (/^(Tables?|Eqs?\.) /.test(s) ? s : (/,| and /.test(s.split('(')[0]) ? 'Secs.' : 'Sec.') + '\u00a0' + s);
  const a = edition.short + ' ' + ref(c.nscp);
  const b = c.src ? c.code + ' ' + ref(c.src) : '';
  if (display === 'nscp' || !b) return a;
  if (display === 'source') return b;
  return a + ' · ' + b;
}
