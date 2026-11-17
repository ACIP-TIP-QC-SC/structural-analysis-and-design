// Edition registry. NSCP 2025/2026 is listed now and enabled later with its own data file.
import nscp2015 from './nscp2015.js';

export const editions = [
  nscp2015,
  { id: 'nscp2025', label: 'NSCP 2025/2026 (coming)', enabled: false }
];

export function getEdition(id) {
  return editions.find((e) => e.id === id && e.enabled) || nscp2015;
}

// Clause chip text. display: 'both' | 'nscp' | 'source'. Tables print without the section sign.
export function clauseText(edition, key, display = 'both') {
  const c = edition.clauses[key];
  if (!c) return key || '';
  if (c.text) return c.text;
  const ref = (s) => (/^Tables? /.test(s) ? s : '§' + s);
  const a = edition.short + ' ' + ref(c.nscp);
  const b = c.src ? c.code + ' ' + ref(c.src) : '';
  if (display === 'nscp' || !b) return a;
  if (display === 'source') return b;
  return a + ' · ' + b;
}
