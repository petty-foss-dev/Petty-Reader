export const COVERS = {
  auto: "Automatic",
  cloth: "Clothbound",
  classic: "Leather",
  paperback: "Paperback",
  modern: "Modern",
  sunburst: "Sunburst",
  photo: "Photo",
};

const CLOTHS = [
  ["#6B1F24", "#D9B46A"],
  ["#24432F", "#D8C38A"],
  ["#1F2D4A", "#D6BE7E"],
  ["#0F5560", "#E3D3A2"],
  ["#4A2440", "#D9B98A"],
  ["#7A3A1D", "#EED6A4"],
  ["#2F3439", "#CDB57C"],
  ["#5B5A2A", "#EFE2B8"],
];
const BRIGHTS = ["#0F7A8A", "#D9572B", "#E0A526", "#3F6FB5", "#B83A57", "#4C8C4A", "#7A4BA8"];

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

export function resolveCover(style, book) {
  if (style === "auto") return book.leadImage ? "photo" : "cloth";
  if (style === "photo" && !book.leadImage) return "cloth";
  return style;
}

export function renderCover(el, book, style) {
  const resolved = resolveCover(style, book);
  const seed = hash(book.title);
  const [cloth, foil] = CLOTHS[seed % CLOTHS.length];
  const bright = BRIGHTS[(seed >>> 4) % BRIGHTS.length];
  const length = book.title.length;
  const titleSize = length > 110 ? 0.62 : length > 70 ? 0.74 : length > 40 ? 0.88 : 1;

  el.className = `cover-art cover-${resolved}`;
  const vars = el.closest(".book").style;
  vars.setProperty("--cloth", cloth);
  vars.setProperty("--foil", foil);
  vars.setProperty("--bright", bright);
  vars.setProperty("--title-scale", titleSize);
  vars.setProperty("--angle", `${seed % 360}deg`);
  el.replaceChildren();

  if (resolved === "photo") {
    const img = new Image();
    img.className = "cover-image";
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.src = book.leadImage;
    img.onerror = () => renderCover(el, { ...book, leadImage: "" }, "cloth");
    el.append(img);
  }
  if (resolved === "modern") el.append(div("cover-shape"));

  const frame = div("cover-frame");
  if (book.siteName) frame.append(div("cover-site", book.siteName));
  frame.append(div("cover-title", book.title), div("cover-rule"));
  if (book.byline) frame.append(div("cover-author", book.byline));
  el.append(frame, div("cover-imprint", "p:"));
}

function div(className, text) {
  const el = document.createElement("div");
  el.className = className;
  if (text) el.textContent = text;
  return el;
}
