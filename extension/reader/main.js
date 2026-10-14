import { Book } from "./book.js";
import { sanitize } from "./sanitize.js";
import { pdfToArticle, ScannedPdfError } from "./pdf-text.js";
import { COVERS, renderCover } from "./covers.js";
import { FONTS, PAPERS, loadSettings, saveSettings, loadPlace, savePlace, forgetPlace } from "./settings.js";
import { playTurn, setAmbience, setVolume } from "./audio.js";
import { setupDesk } from "./desk.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LAYOUT_KEYS = ["font", "fontSize", "lineHeight", "margins"];

let settings = await loadSettings();
let article = null;
let resumed = false;

const book = new Book({
  book: $("book"),
  stage: $("stage"),
  measure: $("measure"),
  onChange: bookChanged,
  onTurn: (kind) => {
    if (kind === "open" && resumed) {
      toast(`Picking up where you left off, page ${book.current + 1}`);
      resumed = false;
    }
    playTurn(kind === "open" && settings.turnSound !== "off" ? "hardcover" : settings.turnSound);
  },
});
const desk = setupDesk({ onRecordUrl: (recordUrl) => update({ recordUrl }), toast });

buildPanel();
applyLook();
desk.update(settings);
bindControls();
open(await loadArticle());

async function loadArticle() {
  if (params.has("id")) {
    const key = `article:${params.get("id")}`;
    const { [key]: saved } = await chrome.storage.session.get(key);
    if (saved) return { ...saved, key: saved.url };
    return failed("This book was put away", "Books are only kept until Chrome closes. Open the article again and click the petty: Reader button.");
  }
  if (params.has("pdf")) return loadPdf(params.get("pdf"));
  if (params.has("file")) return askForFile("Read a PDF as a book", "Pick a PDF with selectable text. It stays on your computer.");
  return failed("Nothing to read here", params.get("error") || "Open an article, then click the petty: Reader button.", params.get("from"));
}

async function loadPdf(url) {
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "Document");
  showStatus("Opening PDF…", name);
  let data;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(response.statusText);
    data = await response.arrayBuffer();
  } catch {
    const { origin, protocol, hostname } = new URL(url);
    if (protocol === "file:") {
      return askForFile("Choose the PDF", "Chrome doesn't let extensions open files from your computer on their own. Pick it here and it stays on your machine.");
    }
    return new Promise((resolve) => {
      showStatus("Let petty: Reader open this PDF", `Chrome needs your OK to download PDFs from ${hostname}. You can also pick the file from your computer.`, [
        {
          label: "Allow access",
          primary: true,
          onClick: async () => {
            if (await chrome.permissions.request({ origins: [`${origin}/*`] })) resolve(loadPdf(url));
          },
        },
        { label: "Choose a file", onClick: () => pickFile().then(resolve) },
      ]);
    });
  }
  return readPdf(data, { url, key: url, siteName: new URL(url).hostname.replace(/^www\./, ""), name });
}

function askForFile(title, text) {
  return new Promise((resolve) => {
    showStatus(title, text, [{ label: "Choose a PDF", primary: true, onClick: () => pickFile().then(resolve) }]);
  });
}

function pickFile() {
  const input = $("file-input");
  input.value = "";
  return new Promise((resolve) => {
    input.onchange = async () => {
      const [file] = input.files;
      if (!file) return;
      showStatus("Opening PDF…", file.name);
      const name = file.name.replace(/\.pdf$/i, "");
      resolve(readPdf(await file.arrayBuffer(), { key: `file:${file.name}:${file.size}`, name }));
    };
    input.click();
  });
}

async function readPdf(data, meta) {
  try {
    const pdf = await pdfToArticle(data, meta.name);
    return { url: meta.url ?? "", key: meta.key, siteName: meta.siteName ?? "", leadImage: "", ...pdf };
  } catch (error) {
    const scanned = error instanceof ScannedPdfError;
    return askForFile(
      scanned ? "This PDF is a scan" : "petty: Reader couldn't open this PDF",
      scanned
        ? "It has no selectable text, so there's nothing to set in type. Scanned PDFs need OCR, which isn't supported yet."
        : "The file may be damaged or password-protected. Try another PDF.",
    );
  }
}

function failed(title, text, from) {
  const actions = [{ label: "Open a PDF instead", onClick: () => pickFile().then(open) }];
  if (from && /^https?:/.test(from)) actions.unshift({ label: "Back to the page", href: from });
  showStatus(title, text, actions);
  return new Promise(() => {});
}

async function open(next) {
  article = next;
  document.title = `${article.title} · petty: Reader`;
  $("bar-title").textContent = article.title;
  const source = $("source-link");
  source.hidden = !/^https?:/.test(article.url);
  source.href = article.url;

  book.setContent(buildContent(article), { left: article.byline || article.siteName, right: article.title });
  renderCover($("cover-art"), article, settings.cover);
  $("status").hidden = true;
  $("book").hidden = false;
  $("nav").hidden = false;
  await book.layout(settings);
  fitProps();

  const place = settings.savePlace ? await loadPlace(article.key) : null;
  resumed = Boolean(place?.page);
  if (resumed) book.goTo(book.pageOfBlock(place.block));
  document.querySelector(".cover").focus({ preventScroll: true });
}

function buildContent({ html, url, title, byline, siteName, publishedTime }) {
  const holder = sanitize(html, url);
  const first = holder.querySelector("p");
  if (byline && first && first.textContent.trim().replace(/^by\s+/i, "") === byline.replace(/^by\s+/i, "")) first.remove();
  const words = holder.textContent.trim().split(/\s+/).length;
  holder.querySelector(":scope > p, :scope > div > p")?.classList.add("opening");

  const date = publishedTime ? new Date(publishedTime) : null;
  const meta = [
    date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { dateStyle: "long" }) : "",
    `${Math.max(1, Math.round(words / 230))} min read`,
  ];
  holder.prepend(
    el("section", "title-page", [
      siteName && el("div", "tp-site", siteName),
      el("h1", "tp-title", title),
      el("div", "tp-ornament", "❦"),
      byline && el("div", "tp-byline", byline),
      el("div", "tp-meta", meta.filter(Boolean).join(" · ")),
    ]),
  );

  const end = el("section", "colophon", [el("div", "tp-ornament", "❧"), el("p", null, "The end.")]);
  if (/^https?:/.test(url)) {
    const link = Object.assign(el("a", null, new URL(url).hostname.replace(/^www\./, "")), { href: url, target: "_blank", rel: "noopener noreferrer" });
    end.append(el("p", null, ["Originally published at ", link]));
  }
  end.append(el("p", "colophon-petty", "Set by petty: Reader, free and open source"));
  holder.append(end);
  return holder;
}

function el(tag, className, children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (children != null) node.append(...[children].flat().filter(Boolean));
  return node;
}

function bookChanged() {
  const slider = $("slider");
  slider.max = book.count - 1;
  slider.value = book.current;
  if (book.state === "closed") {
    $("page-label").textContent = `Cover · ${book.count} pages`;
    return;
  }
  const visible = book.pagesOf(book.spread).filter((p) => p != null && p >= 0 && p < book.count);
  $("page-label").textContent = `${visible.map((p) => p + 1).join("–")} of ${book.count}`;
  if (book.state === "open" && settings.savePlace && article) rememberPlace();
}

let placeTimer;
function rememberPlace() {
  clearTimeout(placeTimer);
  placeTimer = setTimeout(() => savePlace(article.key, { block: book.blockAt(book.current), page: book.current }), 400);
}

function showStatus(title, text, actions = []) {
  $("book").hidden = true;
  $("nav").hidden = true;
  $("status").hidden = false;
  $("status-title").textContent = title;
  $("status-text").textContent = text ?? "";
  $("status-actions").replaceChildren(
    ...actions.map(({ label, primary, onClick, href }) => {
      const node = el(href ? "a" : "button", primary ? "btn primary" : "btn", label);
      if (href) node.href = href;
      else node.type = "button";
      if (onClick) node.addEventListener("click", onClick);
      return node;
    }),
  );
}

let toastTimer;
function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
}

function applyLook() {
  const paper = PAPERS[settings.paper] ?? PAPERS.cream;
  const root = document.documentElement.style;
  root.setProperty("--paper", paper.paper);
  root.setProperty("--ink", paper.ink);
  root.setProperty("--paper-edge", paper.edge);
  root.setProperty("--link", ["dusk", "night"].includes(settings.paper) ? "#7FD3D9" : "#0B6776");
  $("night").style.opacity = settings.nightLight ? settings.warmth * 0.5 : 0;
  $("night-btn").setAttribute("aria-pressed", settings.nightLight);
}

let layoutTimer;
function update(patch) {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  reflectPanel();
  applyLook();
  desk.update(settings);
  if ("cover" in patch && article) renderCover($("cover-art"), article, settings.cover);
  if ("ambience" in patch) setAmbience(settings.ambience);
  if ("volume" in patch) setVolume(settings.volume);
  if ("turnSound" in patch) playTurn(settings.turnSound);
  if (article && LAYOUT_KEYS.some((key) => key in patch)) {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => book.layout(settings), 90);
  }
}

function buildPanel() {
  const options = {
    covers: Object.entries(COVERS).map(([value, label]) => ({ value, label })),
    papers: Object.entries(PAPERS).map(([value, p]) => ({ value, label: "Aa", title: p.label, style: `background:${p.paper};color:${p.ink}` })),
    fonts: Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label, style: `font-family:${f.stack}` })),
  };
  for (const group of document.querySelectorAll("[data-options]")) {
    group.replaceChildren(
      ...options[group.dataset.options].map(({ value, label, title, style }) => {
        const button = el("button", null, label);
        button.type = "button";
        button.dataset.value = value;
        if (title) button.title = title;
        if (style) button.style.cssText = style;
        return button;
      }),
    );
  }

  for (const control of document.querySelectorAll("#panel [data-setting]")) {
    const key = control.dataset.setting;
    if (control.matches("input[type=range]")) control.addEventListener("input", () => update({ [key]: Number(control.value) }));
    else if (control.matches("input[type=checkbox]")) control.addEventListener("change", () => update({ [key]: control.checked }));
    else if (control.matches("input")) control.addEventListener("change", () => update({ [key]: control.value.trim() }));
    else {
      control.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-value]");
        if (button) update({ [key]: button.dataset.value });
      });
    }
  }
  reflectPanel();
}

function reflectPanel() {
  for (const control of document.querySelectorAll("#panel [data-setting]")) {
    const value = settings[control.dataset.setting];
    if (control.matches("input[type=checkbox]")) control.checked = value;
    else if (control.matches("input")) {
      if (document.activeElement !== control) control.value = value;
    } else {
      for (const button of control.querySelectorAll("button[data-value]")) button.setAttribute("aria-pressed", button.dataset.value === String(value));
    }
  }
  $("font-size-out").textContent = `${settings.fontSize}`;
  $("line-height-out").textContent = settings.lineHeight.toFixed(2);
}

function togglePanel(force) {
  const panel = $("panel");
  panel.hidden = force === undefined ? !panel.hidden : !force;
  $("settings-btn").setAttribute("aria-expanded", !panel.hidden);
}

function bindControls() {
  const unlock = () => {
    setVolume(settings.volume);
    setAmbience(settings.ambience);
  };
  addEventListener("pointerdown", unlock, { once: true, capture: true });
  addEventListener("keydown", unlock, { once: true, capture: true });

  $("settings-btn").addEventListener("click", () => togglePanel());
  $("panel-close").addEventListener("click", () => togglePanel(false));
  $("night-btn").addEventListener("click", () => update({ nightLight: !settings.nightLight }));
  $("pdf-btn").addEventListener("click", () => pickFile().then(open));
  $("prev-btn").addEventListener("click", () => book.prev());
  $("next-btn").addEventListener("click", () => book.next());
  $("forget-place").addEventListener("click", async () => {
    if (!article) return;
    await forgetPlace(article.key);
    toast("Forgot your place in this book");
  });

  $("slider").addEventListener("input", (event) => {
    book.goTo(Number(event.target.value));
    if (book.state === "closed") book.open();
  });

  const stage = $("stage");
  let swipe = null;
  let swiped = false;
  stage.addEventListener("pointerdown", (event) => {
    swipe = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener("pointerup", (event) => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x;
    swiped = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(event.clientY - swipe.y);
    if (swiped) dx < 0 ? book.next() : book.prev();
    swipe = null;
  });
  stage.addEventListener("click", (event) => {
    if (swiped) return (swiped = false);
    if (getSelection().toString()) return;
    const link = event.target.closest("a");
    if (link?.dataset.jump) {
      event.preventDefault();
      const target = book.pageOfAnchor(link.dataset.jump);
      if (target != null) book.goTo(target);
      return;
    }
    if (link) return;
    if (event.target.closest(".cover")) book.open();
    else if (event.target.closest(".page-left")) book.prev();
    else if (event.target.closest(".page-right")) book.next();
  });

  addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest("input, textarea, select")) return;
    if ((event.key === " " || event.key === "Enter") && event.target.closest("button, a:not(.cover)")) return;
    const actions = {
      ArrowRight: () => book.next(),
      ArrowDown: () => book.next(),
      PageDown: () => book.next(),
      " ": () => (event.shiftKey ? book.prev() : book.next()),
      Enter: () => book.open(),
      ArrowLeft: () => book.prev(),
      ArrowUp: () => book.prev(),
      PageUp: () => book.prev(),
      Home: () => book.goTo(0),
      End: () => book.goTo(book.count - 1),
      n: () => update({ nightLight: !settings.nightLight }),
      s: () => togglePanel(),
      Escape: () => togglePanel(false),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });

  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      if (!article) return;
      await book.layout(settings);
      fitProps();
    }, 120);
  }).observe(stage);
}

function fitProps() {
  const bookWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-w")) * (book.twoUp ? 2 : 1);
  document.querySelector(".room").classList.toggle("tight", (innerWidth - bookWidth) / 2 < 190);
}
