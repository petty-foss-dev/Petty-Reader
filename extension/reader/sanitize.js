const KEEP = new Set([
  "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "em", "strong", "b", "i", "u",
  "s", "sub", "sup", "small", "mark", "a", "ul", "ol", "li", "dl", "dt", "dd", "figure", "figcaption", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "abbr", "cite", "q", "kbd", "var", "del",
  "ins", "time", "span", "div", "section", "article", "aside", "header", "footer", "main", "details", "summary",
]);
const DROP = new Set([
  "script", "style", "noscript", "iframe", "object", "embed", "form", "input", "button", "select", "textarea",
  "svg", "canvas", "video", "audio", "source", "track", "template", "link", "meta", "map", "dialog", "nav",
]);
const ATTRS = {
  a: ["href"],
  img: ["src", "alt"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  ol: ["start", "reversed"],
  time: ["datetime"],
  abbr: ["title"],
};
const RENAME = { section: "div", article: "div", aside: "div", header: "div", footer: "div", main: "div", details: "div", summary: "p" };
const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figure, table, dt, dd, hr";

// Turns untrusted article HTML into a fragment of a small, inert tag set. Fragment links keep their target
// as data-anchor so the book can jump to the right page.
export function sanitize(html, baseUrl) {
  const source = new DOMParser().parseFromString(html, "text/html");
  const out = document.createDocumentFragment();
  for (const child of [...source.body.childNodes]) copy(child, out, baseUrl);

  const holder = document.createElement("div");
  holder.append(out);
  for (const h1 of holder.querySelectorAll("h1")) h1.replaceWith(retag(h1, "h2"));
  for (const empty of holder.querySelectorAll("p, div, span, figure, li")) {
    if (!empty.textContent.trim() && !empty.querySelector("img, hr, br")) empty.remove();
  }
  holder.querySelectorAll(BLOCKS).forEach((el, i) => (el.dataset.b = i));
  return holder;
}

function copy(node, parent, baseUrl) {
  if (node.nodeType === Node.TEXT_NODE) {
    parent.append(node.textContent);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const tag = node.localName;
  if (DROP.has(tag)) return;
  if (!KEEP.has(tag)) {
    for (const child of node.childNodes) copy(child, parent, baseUrl);
    return;
  }

  const el = document.createElement(RENAME[tag] ?? tag);
  for (const name of ATTRS[tag] ?? []) {
    const value = node.getAttribute(name);
    if (value != null) el.setAttribute(name, value);
  }
  if (node.id) el.dataset.anchor = node.id;

  if (tag === "a" && !fixLink(el, baseUrl)) {
    for (const child of node.childNodes) copy(child, parent, baseUrl);
    return;
  }
  if (tag === "img") {
    const src = resolve(el.getAttribute("src"), baseUrl);
    if (!src || !/^(https?:|data:image\/)/.test(src)) return;
    el.src = src;
    el.loading = "eager";
    el.decoding = "async";
    el.referrerPolicy = "no-referrer";
  }

  for (const child of node.childNodes) copy(child, el, baseUrl);
  parent.append(el);
}

function fixLink(a, baseUrl) {
  const raw = a.getAttribute("href");
  if (!raw) return false;
  if (raw.startsWith("#")) {
    a.removeAttribute("href");
    a.dataset.jump = decodeURIComponent(raw.slice(1));
    return a.dataset.jump.length > 0;
  }
  const href = resolve(raw, baseUrl);
  if (!href || !/^(https?|mailto):/.test(href)) return false;
  const here = baseUrl && new URL(baseUrl);
  const there = new URL(href);
  if (here && there.hash && there.origin + there.pathname === here.origin + here.pathname) {
    a.removeAttribute("href");
    a.dataset.jump = decodeURIComponent(there.hash.slice(1));
    return true;
  }
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return true;
}

function resolve(url, base) {
  if (!url) return "";
  try {
    return new URL(url, base || undefined).href;
  } catch {
    return "";
  }
}

function retag(el, tag) {
  const next = document.createElement(tag);
  for (const { name, value } of el.attributes) next.setAttribute(name, value);
  next.append(...el.childNodes);
  return next;
}
