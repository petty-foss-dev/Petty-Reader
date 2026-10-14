// Runs inside the page via chrome.scripting.executeScript, so it must stay self-contained.
export function extractArticle() {
  if (document.contentType === "application/pdf") return { pdf: location.href };

  const meta = (...names) => {
    for (const name of names) {
      const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      if (el?.content) return el.content.trim();
    }
    return "";
  };
  const absolute = (url) => {
    try {
      return new URL(url, document.baseURI).href;
    } catch {
      return "";
    }
  };

  const doc = document.cloneNode(true);
  for (const img of doc.querySelectorAll("img")) {
    const lazy = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
    if (lazy) img.setAttribute("src", lazy);
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset) {
      const best = srcset
        .split(",")
        .map((part) => part.trim().split(/\s+/))
        .map(([url, size = "1x"]) => ({ url, weight: parseFloat(size) || 1 }))
        .sort((a, b) => b.weight - a.weight)[0];
      if (best?.url) img.setAttribute("src", best.url);
    }
  }

  const article = new Readability(doc, { charThreshold: 300 }).parse();
  if (!article?.content) return { error: "petty: Reader couldn't find an article on this page." };

  const leadImage = meta("og:image", "twitter:image", "twitter:image:src");
  const siteName = article.siteName || meta("og:site_name") || location.hostname.replace(/^www\./, "");
  const title = (article.title || document.title).trim();
  const suffix = title.lastIndexOf(siteName);
  return {
    url: location.href,
    title: suffix > 0 && suffix + siteName.length === title.length ? title.slice(0, suffix).replace(/\s*[|\-–—:·•]\s*$/, "") : title,
    byline: article.byline || meta("author", "article:author"),
    siteName,
    lang: article.lang || document.documentElement.lang || "",
    publishedTime: article.publishedTime || meta("article:published_time", "date"),
    excerpt: article.excerpt || "",
    leadImage: leadImage ? absolute(leadImage) : "",
    html: article.content,
  };
}
