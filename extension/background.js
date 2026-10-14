import { extractArticle } from "./extract.js";

const READER = "reader/reader.html";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "open-pdf", title: "Open a PDF file…", contexts: ["action"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-pdf") openReader({ file: "1" }, tab);
});

chrome.action.onClicked.addListener(readTab);

async function readTab(tab) {
  if (looksLikePdf(tab.url)) return openReader({ pdf: tab.url }, tab);

  try {
    const target = { tabId: tab.id };
    await chrome.scripting.executeScript({ target, files: ["vendor/readability/Readability.js"] });
    const [{ result }] = await chrome.scripting.executeScript({ target, func: extractArticle });
    if (result.pdf) return openReader({ pdf: result.pdf }, tab);
    if (result.error) return openReader({ error: result.error, from: tab.url }, tab);

    const id = crypto.randomUUID();
    await chrome.storage.session.set({ [`article:${id}`]: result });
    openReader({ id }, tab);
  } catch {
    openReader({ error: "petty: Reader can't read this kind of page.", from: tab.url ?? "" }, tab);
  }
}

function looksLikePdf(url = "") {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function openReader(params, tab) {
  const url = chrome.runtime.getURL(`${READER}?${new URLSearchParams(params)}`);
  chrome.tabs.create({ url, index: tab ? tab.index + 1 : undefined, openerTabId: tab?.id });
}
