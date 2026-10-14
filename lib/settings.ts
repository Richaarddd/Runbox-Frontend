export type Theme = "light" | "dark";

export type EditorSettings = {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  theme: Theme;
};

export const FONT_MIN = 12;
export const FONT_MAX = 22;

export const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: false,
  theme: "light",
};

const KEY = "compiler:settings";

// localStorage can throw, so both functions are wrapped, like the code saving
export function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    const size = Math.round(Number(p.fontSize));
    return {
      fontSize:
        size >= FONT_MIN && size <= FONT_MAX ? size : DEFAULT_SETTINGS.fontSize,
      tabSize: [2, 4, 8].includes(p.tabSize) ? p.tabSize : DEFAULT_SETTINGS.tabSize,
      wordWrap: p.wordWrap === true,
      theme: p.theme === "dark" ? "dark" : "light",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: EditorSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}