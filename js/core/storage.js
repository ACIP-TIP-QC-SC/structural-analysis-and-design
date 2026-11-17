// Safe localStorage and share-link encoding. The site must work when storage is unavailable.
const PREFIX = 'sadc.';
const mem = {};

export function get(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? (key in mem ? mem[key] : fallback) : JSON.parse(raw);
  } catch (e) { return key in mem ? mem[key] : fallback; }
}
export function set(key, value) {
  mem[key] = value;
  try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}
export function remove(key) {
  delete mem[key];
  try { window.localStorage.removeItem(PREFIX + key); } catch (e) { /* storage unavailable */ }
}

// URL-safe base64 of JSON.
export function encodeInputs(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeInputs(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) { return null; }
}

export function pushRecent(id) {
  const list = (get('recent', []) || []).filter((x) => x !== id);
  list.unshift(id);
  set('recent', list.slice(0, 5));
}
