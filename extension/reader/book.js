import { FONTS, MARGINS } from "./settings.js";

const TURN_MS = 620;
const COVER_MS = 1000;
const PAGE_RATIO = 0.68;

// Pages are columns of one CSS multi-column flow. Every visible page (and both faces of the turning leaf)
// holds its own clone of that flow and shifts it so exactly one column shows through.
export class Book {
  constructor({ book, stage, measure, onChange, onTurn }) {
    this.el = book;
    this.stage = stage;
    this.onChange = onChange;
    this.onTurn = onTurn;
    this.left = page(book.querySelector(".page-left"));
    this.right = page(book.querySelector(".page-right"));
    this.leaf = book.querySelector(".leaf");
    this.front = page(this.leaf.querySelector(".front"));
    this.back = page(this.leaf.querySelector(".back"));
    this.master = Object.assign(document.createElement("div"), { className: "flow" });
    measure.append(this.master);

    this.state = "closed";
    this.count = 1;
    this.current = 0;
    this.twoUp = true;
    this.blocks = [];
    this.pending = null;
  }

  setContent(holder, running) {
    if (this.animating) this.finish();
    this.state = "closed";
    this.el.dataset.state = "closed";
    this.current = 0;
    this.blocks = [];
    this.running = running;
    this.master.replaceChildren(...holder.cloneNode(true).childNodes);
    for (const p of [this.left, this.right, this.front, this.back]) {
      p.flow.replaceChildren(...holder.cloneNode(true).childNodes);
    }
    let timer;
    for (const img of this.master.querySelectorAll("img")) {
      if (img.complete) continue;
      const relayout = () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.relayout(), 150);
      };
      img.addEventListener("load", relayout, { once: true });
      img.addEventListener("error", relayout, { once: true });
    }
  }

  async layout(settings) {
    this.settings = settings;
    const anchor = this.blocks.length && this.current > 0 ? this.blockAt(this.current) : null;

    const box = this.stage.getBoundingClientRect();
    const availW = box.width - 40;
    const availH = box.height - 28;
    let pageH = Math.min(availH, 1000);
    let pageW = pageH * PAGE_RATIO;
    this.twoUp = availW >= 2 * pageW || availW >= 820;
    if (this.twoUp && 2 * pageW > availW) {
      pageW = availW / 2;
      pageH = Math.min(availH, pageW / PAGE_RATIO);
    } else if (!this.twoUp && pageW > availW) {
      pageW = availW;
      pageH = Math.min(availH, pageW / 0.6);
    }
    pageW = Math.floor(pageW);
    pageH = Math.floor(pageH);

    const padX = Math.round(pageW * MARGINS[settings.margins]);
    const padTop = Math.round(padX * 0.95 + pageH * 0.03);
    const padBottom = Math.round(padX * 0.9 + pageH * 0.03);
    const font = FONTS[settings.font] ?? FONTS.literata;
    const textW = pageW - 2 * padX;
    const textH = pageH - padTop - padBottom;
    this.gap = 2 * padX;
    this.stride = textW + this.gap;

    const vars = {
      "--page-w": `${pageW}px`,
      "--page-h": `${pageH}px`,
      "--pad-x": `${padX}px`,
      "--pad-top": `${padTop}px`,
      "--pad-bottom": `${padBottom}px`,
      "--text-w": `${textW}px`,
      "--text-h": `${textH}px`,
      "--gap": `${this.gap}px`,
      "--font": font.stack,
      "--font-size": `${((settings.fontSize * pageH) / 820) * (font.scale ?? 1)}px`,
      "--line-height": settings.lineHeight,
    };
    for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
    this.el.classList.toggle("two-up", this.twoUp);

    await Promise.all([document.fonts.load(`16px ${font.stack}`), document.fonts.load(`italic 16px ${font.stack}`)]);
    this.measure();
    this.current = anchor == null ? Math.min(this.current, this.count - 1) : this.pageOfBlock(anchor);
    this.render();
  }

  relayout() {
    if (this.settings) this.layout(this.settings);
  }

  measure() {
    this.count = Math.max(1, Math.round((this.master.scrollWidth + this.gap) / this.stride));
    const origin = this.master.getBoundingClientRect().left;
    this.blocks = [...this.master.querySelectorAll("[data-b]")].map((el) => {
      const rect = el.getClientRects()[0];
      return { b: Number(el.dataset.b), page: rect ? Math.floor((rect.left - origin + 1) / this.stride) : 0 };
    });
  }

  blockAt(pageIndex) {
    return this.blocks.findLast((block) => block.page <= pageIndex)?.b ?? 0;
  }

  pageOfBlock(b) {
    return this.blocks.find((block) => block.b >= b)?.page ?? 0;
  }

  pageOfAnchor(id) {
    const target = this.master.querySelector(`[data-anchor="${CSS.escape(id)}"]`);
    if (!target) return null;
    const rect = target.getClientRects()[0];
    return rect ? Math.floor((rect.left - this.master.getBoundingClientRect().left + 1) / this.stride) : null;
  }

  get spread() {
    return this.twoUp ? Math.floor((this.current + 1) / 2) : this.current;
  }

  get lastSpread() {
    return this.twoUp ? Math.floor(this.count / 2) : this.count - 1;
  }

  pagesOf(spread) {
    return this.twoUp ? [2 * spread - 1, 2 * spread] : [null, spread];
  }

  firstPageOf(spread) {
    return this.twoUp ? Math.max(0, 2 * spread - 1) : spread;
  }

  render() {
    const [l, r] = this.pagesOf(this.spread);
    if (l != null) this.show(this.left, l);
    this.show(this.right, r);
    const progress = this.count > 1 ? this.current / (this.count - 1) : 0;
    this.el.style.setProperty("--read", this.state === "open" ? progress : 0);
    this.el.style.setProperty("--unread", this.state === "open" ? 1 - progress : 1);
    this.onChange?.(this);
  }

  show(p, index) {
    const kind = index < 0 ? "endpaper" : index >= this.count ? "blank" : "text";
    p.el.dataset.kind = kind;
    if (kind !== "text") return;
    p.flow.style.transform = `translateX(${-index * this.stride}px)`;
    const plain = index === 0 || index === this.count - 1;
    const verso = this.twoUp && index % 2 === 1;
    p.head.textContent = plain ? "" : verso ? this.running.left : this.running.right;
    p.foot.textContent = index === 0 ? "" : String(index + 1);
  }

  open() {
    if (this.state !== "closed") return;
    this.state = "opening";
    this.render();
    this.onTurn?.("open");
    this.el.dataset.state = "opening";
    setTimeout(() => {
      this.state = "open";
      this.el.dataset.state = "open";
      this.render();
    }, COVER_MS);
  }

  close() {
    if (this.state !== "open") return;
    this.state = "closing";
    this.el.dataset.state = "closed";
    this.onTurn?.("open");
    setTimeout(() => {
      this.state = "closed";
      this.render();
    }, COVER_MS);
  }

  next() {
    this.turn(1);
  }

  prev() {
    this.turn(-1);
  }

  turn(direction) {
    if (this.state === "closed") return direction > 0 && this.open();
    if (this.state !== "open") return;
    if (this.animating) {
      this.pending = direction;
      return;
    }
    const target = this.spread + direction;
    if (target < 0) return this.close();
    if (target > this.lastSpread) return;
    this.animateTo(target, direction);
  }

  goTo(pageIndex) {
    if (this.animating) this.finish();
    this.current = Math.max(0, Math.min(this.count - 1, pageIndex));
    this.current = this.firstPageOf(this.spread);
    this.render();
  }

  animateTo(spread, direction) {
    const [l, r] = this.pagesOf(this.spread);
    const [nl, nr] = this.pagesOf(spread);
    const leaf = this.leaf;
    this.onTurn?.("turn");

    if (this.twoUp && direction > 0) {
      this.show(this.front, r);
      this.show(this.back, nl);
      this.show(this.right, nr);
    } else if (this.twoUp) {
      this.show(this.front, l);
      this.show(this.back, nr);
      this.show(this.left, nl);
    } else if (direction > 0) {
      this.show(this.front, r);
      this.show(this.back, this.count);
      this.show(this.right, nr);
    } else {
      this.show(this.front, nr);
      this.show(this.back, this.count);
    }

    leaf.dataset.dir = direction > 0 ? "next" : "prev";
    leaf.dataset.mode = this.twoUp ? "spread" : "single";
    leaf.classList.remove("turning");
    leaf.hidden = false;
    void leaf.offsetWidth;
    leaf.classList.add("turning");

    this.animating = { spread, done: setTimeout(() => this.finish(), TURN_MS) };
  }

  finish() {
    const { spread, done } = this.animating;
    clearTimeout(done);
    this.animating = null;
    this.leaf.hidden = true;
    this.leaf.classList.remove("turning");
    this.current = this.firstPageOf(spread);
    this.render();
    if (this.pending != null) {
      const direction = this.pending;
      this.pending = null;
      this.turn(direction);
    }
  }
}

function page(el) {
  el.innerHTML = `<div class="page-head"></div><div class="page-body"><div class="flow"></div></div><div class="page-foot"></div>`;
  return {
    el,
    head: el.querySelector(".page-head"),
    flow: el.querySelector(".flow"),
    foot: el.querySelector(".page-foot"),
  };
}
