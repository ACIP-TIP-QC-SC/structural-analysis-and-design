// Small DOM helpers.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, kids);
  return el;
}
const NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  setAttrs(el, attrs);
  append(el, kids);
  return el;
}
function setAttrs(el, attrs) {
  if (!attrs) return;
  Object.keys(attrs).forEach((k) => {
    const val = attrs[k];
    if (val == null || val === false) return;
    if (k.slice(0, 2) === 'on' && typeof val === 'function') el.addEventListener(k.slice(2).toLowerCase(), val);
    else if (k === 'class') el.setAttribute('class', val);
    else if (k === 'text') el.textContent = val;
    else if (k === 'html') el.innerHTML = val;
    else if (val === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(val));
  });
}
function append(el, kids) {
  kids.forEach((k) => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  });
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Formula text to nodes: "0.658^(Fy / Fe)" prints the bracketed exponent as a superscript.
export function mathNodes(text) {
  const str = String(text == null ? '' : text), out = [];
  let i = 0, from = 0;
  while ((i = str.indexOf('^(', from)) !== -1) {
    let depth = 0, j = i + 1;
    for (; j < str.length; j++) { if (str[j] === '(') depth++; else if (str[j] === ')' && --depth === 0) break; }
    if (j >= str.length) break;
    out.push(str.slice(from, i));
    const sup = document.createElement('sup');
    sup.textContent = str.slice(i + 2, j);
    out.push(sup);
    from = j + 1;
  }
  out.push(str.slice(from));
  return out.filter((x) => x !== '');
}
