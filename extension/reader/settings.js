export const DEFAULTS = {
  cover: "auto",
  font: "literata",
  fontSize: 18,
  lineHeight: 1.55,
  margins: "normal",
  paper: "cream",
  nightLight: false,
  warmth: 0.45,
  turnSound: "paper",
  ambience: "off",
  volume: 0.6,
  coffee: true,
  recordUrl: "",
  savePlace: true,
};

export const FONTS = {
  literata: { label: "Literata", stack: '"Literata", Georgia, serif' },
  garamond: { label: "EB Garamond", stack: '"EB Garamond", Garamond, serif', scale: 1.12 },
  lora: { label: "Lora", stack: '"Lora", Georgia, serif' },
  atkinson: { label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible Next", system-ui, sans-serif' },
  georgia: { label: "Georgia", stack: "Georgia, serif" },
  system: { label: "System sans", stack: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif" },
};

export const PAPERS = {
  white: { label: "White", paper: "#FCFCFA", ink: "#1E1E1C", edge: "#E9E7E1" },
  cream: { label: "Cream", paper: "#F8F1E3", ink: "#2B2620", edge: "#E6DAC2" },
  sepia: { label: "Sepia", paper: "#EFE0C4", ink: "#3A2E22", edge: "#D9C49E" },
  sage: { label: "Sage", paper: "#E6EBDD", ink: "#24291F", edge: "#CBD3BE" },
  dusk: { label: "Dusk", paper: "#2C2A28", ink: "#DCD3C4", edge: "#1F1D1B" },
  night: { label: "Night", paper: "#151617", ink: "#B9B6AE", edge: "#0C0D0D" },
};

export const MARGINS = { narrow: 0.075, normal: 0.11, wide: 0.15 };

const KEY = "settings";

export async function loadSettings() {
  const { [KEY]: saved } = await chrome.storage.sync.get(KEY);
  return { ...DEFAULTS, ...saved };
}

export function saveSettings(settings) {
  return chrome.storage.sync.set({ [KEY]: settings });
}

const placeKey = (source) => `place:${source}`;

export async function loadPlace(source) {
  const key = placeKey(source);
  const { [key]: place } = await chrome.storage.local.get(key);
  return place ?? null;
}

export function savePlace(source, place) {
  return chrome.storage.local.set({ [placeKey(source)]: { ...place, at: Date.now() } });
}

export function forgetPlace(source) {
  return chrome.storage.local.remove(placeKey(source));
}
