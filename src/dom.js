// app/src/dom.js — tiny DOM helpers shared by the screen modules.

// Build an element from a trusted HTML string (static markup only, never user
// input). Returns the first element node.
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}
