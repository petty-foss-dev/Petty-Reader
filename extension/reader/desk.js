import { playPour, playSip } from "./audio.js";

const SIPS = 6;
const YOUTUBE = "https://www.youtube-nocookie.com/*";
const HOME = "https://github.com/petty-foss-dev/Petty-Reader";

export function setupDesk({ onRecordUrl, toast }) {
  const coffee = document.getElementById("coffee");
  const level = document.getElementById("coffee-level");
  const coffeeLabel = document.getElementById("coffee-label");
  const turntable = document.getElementById("turntable");
  const card = document.getElementById("record-card");
  const video = document.getElementById("record-video");
  const form = document.getElementById("record-form");
  const input = document.getElementById("record-input");
  let cup = 1;
  let recordUrl = "";
  let youtubeAllowed = false;
  chrome.permissions.contains({ origins: [YOUTUBE] }).then((granted) => (youtubeAllowed = granted));

  chrome.storage.local.get("coffee").then(({ coffee: saved }) => {
    if (typeof saved === "number") cup = saved;
    drawCup();
  });

  function drawCup() {
    level.style.transform = `translateY(${(1 - cup) * 11}px)`;
    level.style.opacity = cup > 0.01 ? 1 : 0;
    coffee.classList.toggle("empty", cup <= 0.01);
    coffeeLabel.textContent = cup <= 0.01 ? "Refill" : "Sip";
    coffee.title = cup <= 0.01 ? "Pour another cup" : "Take a sip";
  }

  coffee.addEventListener("click", () => {
    if (cup <= 0.01) {
      playPour();
      cup = 1;
    } else {
      playSip();
      cup = Math.max(0, cup - 1 / SIPS);
      coffee.classList.remove("sipping");
      void coffee.offsetWidth;
      coffee.classList.add("sipping");
    }
    drawCup();
    chrome.storage.local.set({ coffee: cup });
  });

  async function play(url) {
    const embed = youtubeEmbed(url);
    if (!embed) {
      toast("That doesn't look like a YouTube link.");
      return;
    }
    youtubeAllowed ||= await chrome.permissions.request({ origins: [YOUTUBE] });
    if (!youtubeAllowed) {
      toast("The record player needs your OK to load YouTube.");
      return;
    }
    // YouTube refuses embeds without a web Referer, and extension pages don't send one.
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          action: { type: "modifyHeaders", requestHeaders: [{ header: "referer", operation: "set", value: HOME }] },
          condition: { requestDomains: ["youtube-nocookie.com"], initiatorDomains: [chrome.runtime.id], resourceTypes: ["sub_frame"] },
        },
      ],
    });
    const frame = document.createElement("iframe");
    frame.src = embed;
    frame.title = "Record player";
    frame.allow = "autoplay; encrypted-media; picture-in-picture";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    video.replaceChildren(frame);
    turntable.classList.add("playing");
    card.hidden = false;
  }

  function stop() {
    video.replaceChildren();
    turntable.classList.remove("playing");
    card.hidden = true;
  }

  document.getElementById("turntable-btn").addEventListener("click", () => {
    if (turntable.classList.contains("playing")) return stop();
    if (recordUrl) return play(recordUrl);
    card.hidden = !card.hidden;
    if (!card.hidden) input.focus();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = input.value.trim();
    if (!youtubeEmbed(url)) return toast("That doesn't look like a YouTube link.");
    onRecordUrl(url);
    play(url);
  });

  return {
    update(settings) {
      coffee.hidden = !settings.coffee;
      if (settings.recordUrl !== recordUrl) {
        recordUrl = settings.recordUrl;
        input.value = recordUrl;
        if (turntable.classList.contains("playing")) recordUrl ? play(recordUrl) : stop();
      }
    },
  };
}

export function youtubeEmbed(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  const list = url.searchParams.get("list");
  let id = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1];
  } else return null;

  const base = "https://www.youtube-nocookie.com/embed/";
  if (id && /^[\w-]{11}$/.test(id)) {
    const query = new URLSearchParams({ autoplay: "1", rel: "0" });
    if (list) {
      query.set("list", list);
    } else {
      query.set("loop", "1");
      query.set("playlist", id);
    }
    return `${base}${id}?${query}`;
  }
  if (list) return `${base}videoseries?${new URLSearchParams({ list, autoplay: "1" })}`;
  return null;
}
