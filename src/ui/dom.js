// Safe DOM helper: children are always appended as text nodes, never parsed as HTML.
export const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  n.append(...kids.flat().filter((x) => x !== null && x !== undefined && x !== false));
  return n;
};
// Charts are generated from escaped strings; parse as SVG (not HTML) and import the node.
export const svgNode = (markup) => document.importNode(new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement, true);
export function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const openBlob = (text, type) => { const url = URL.createObjectURL(new Blob([text], { type })); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
