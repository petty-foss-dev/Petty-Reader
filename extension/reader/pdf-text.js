import * as pdfjs from "../vendor/pdfjs/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

export class ScannedPdfError extends Error {}

// Rebuilds a text PDF as flowing article HTML: lines become paragraphs, large type becomes headings,
// running heads and page numbers are dropped, and URI link annotations stay clickable.
export async function pdfToArticle(data, fallbackTitle) {
  const pdf = await pdfjs.getDocument({
    data,
    cMapUrl: new URL("../vendor/pdfjs/cmaps/", import.meta.url).href,
    cMapPacked: true,
    isEvalSupported: false,
  }).promise;

  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const [content, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
    const links = annotations.filter((a) => a.subtype === "Link" && a.url).map((a) => ({ rect: a.rect, url: a.url }));
    pages.push(toLines(content.items, links));
    page.cleanup();
  }

  const lines = dropRunningHeads(pages);
  if (lines.reduce((sum, line) => sum + line.text.length, 0) < 40) throw new ScannedPdfError();

  const { info } = await pdf.getMetadata().catch(() => ({ info: {} }));
  await pdf.destroy();

  return {
    title: info?.Title?.trim() || fallbackTitle,
    byline: info?.Author?.trim() || "",
    html: toHtml(lines),
  };
}

function toLines(items, links) {
  const lines = [];
  let line = null;
  for (const item of items) {
    if (!("str" in item)) continue;
    const [, , c, d, x, y] = item.transform;
    const size = Math.hypot(c, d) || item.height || 10;
    if (item.str.length && (!line || Math.abs(y - line.y) > size * 0.5)) {
      line = { y, x, size, right: x, parts: [] };
      lines.push(line);
    }
    if (!line) continue;
    if (item.str.length) {
      const gap = x - line.right;
      const prev = line.parts.at(-1);
      if (prev && gap > size * 0.15 && !/\s$/.test(prev.text) && !/^\s/.test(item.str)) line.parts.push({ text: " " });
      const link = links.find((l) => overlaps(l.rect, x, y, item.width, item.height || size));
      line.parts.push({ text: item.str, url: link?.url });
      line.size = Math.max(line.size, size);
      line.right = Math.max(line.right, x + item.width);
    }
    if (item.hasEOL) line = null;
  }
  for (const l of lines) l.text = l.parts.map((p) => p.text).join("").trim();
  return lines.filter((l) => l.text);
}

function overlaps([x1, y1, x2, y2], x, y, w, h) {
  return x < Math.max(x1, x2) && x + w > Math.min(x1, x2) && y < Math.max(y1, y2) && y + h > Math.min(y1, y2);
}

function dropRunningHeads(pages) {
  const key = (line) => line.text.replace(/\d+/g, "#").toLowerCase();
  const counts = new Map();
  for (const lines of pages) {
    for (const line of new Set([...lines.slice(0, 2), ...lines.slice(-2)])) {
      counts.set(key(line), (counts.get(key(line)) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, pages.length * 0.5);
  return pages.flatMap((lines) =>
    lines.filter((line, i) => {
      const edge = i < 2 || i >= lines.length - 2;
      if (!edge) return true;
      if (/^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(line.text)) return false;
      return counts.get(key(line)) < threshold;
    }),
  );
}

function toHtml(lines) {
  const sizes = lines.map((l) => Math.round(l.size)).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)];
  const widths = lines.map((l) => l.right - l.x).sort((a, b) => a - b);
  const fullWidth = widths[Math.floor(widths.length * 0.9)];

  const blocks = [];
  let block = null;
  let prev = null;
  for (const line of lines) {
    const ratio = line.size / body;
    const tag = ratio >= 1.6 ? "h2" : ratio >= 1.2 && line.text.length < 120 ? "h3" : "p";
    const gap = prev ? Math.abs(prev.y - line.y) : 0;
    const startsNew =
      !block ||
      block.tag !== tag ||
      (tag === "p" &&
        (gap > prev.size * 1.9 ||
          (prev.right - prev.x < fullWidth * 0.8 && /[.!?:"”)]$/.test(prev.text)) ||
          line.x - prev.x > prev.size * 1.2));
    if (startsNew) {
      block = { tag, parts: [] };
      blocks.push(block);
    } else {
      const last = block.parts.at(-1);
      if (last && /[A-Za-z]-$/.test(last.text) && /^[a-z]/.test(line.text)) last.text = last.text.slice(0, -1);
      else block.parts.push({ text: " " });
    }
    block.parts.push(...line.parts);
    prev = line;
  }

  return blocks
    .map(({ tag, parts }) => `<${tag}>${merge(parts).map(render).join("").trim()}</${tag}>`)
    .join("\n");
}

function merge(parts) {
  const out = [];
  for (const part of parts) {
    const last = out.at(-1);
    if (last && last.url === part.url) last.text += part.text;
    else out.push({ ...part });
  }
  return out;
}

function render({ text, url }) {
  const safe = text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  return url ? `<a href="${url.replace(/"/g, "&quot;")}">${safe}</a>` : safe;
}
