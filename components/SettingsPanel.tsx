"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import {
  DEFAULT_SETTINGS,
  FONT_MAX,
  FONT_MIN,
  type EditorSettings,
  type Theme,
} from "@/lib/settings";

type Props = {
  settings: EditorSettings;
  onChange: (settings: EditorSettings) => void;
  onThemeChange: (theme: Theme, origin: { x: number; y: number }) => void;
  onClose: () => void;
};

const step =
  "flex h-8 w-8 items-center justify-center rounded-full border border-line text-base transition hover:border-mute active:scale-90 disabled:cursor-not-allowed disabled:opacity-40";

export default function SettingsPanel({
  settings,
  onChange,
  onThemeChange,
  onClose,
}: Props) {
  const set = (patch: Partial<EditorSettings>) => onChange({ ...settings, ...patch });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Clicking anywhere outside closes the panel */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />

      <motion.div
        role="dialog"
        aria-label="Editor settings"
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        style={{ transformOrigin: "top right" }}
        className="fixed right-3 top-16 z-[70] w-72 rounded-2xl border border-line bg-panel p-4 shadow-lg md:right-5"
      >
        <div className="flex items-center justify-between py-2">
          <span className="text-sm">Theme</span>
          <div className="flex rounded-full border border-line p-0.5">
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={settings.theme === mode}
                onClick={(e) => {
                  // The color reveal grows out of the center of this button
                  const r = e.currentTarget.getBoundingClientRect();
                  onThemeChange(mode, {
                    x: r.left + r.width / 2,
                    y: r.top + r.height / 2,
                  });
                }}
                className={`relative z-10 w-[4.5rem] rounded-full py-1 text-sm transition-colors ${
                  settings.theme === mode ? "text-on-accent" : "text-mute"
                }`}
              >
                {settings.theme === mode && (
                  <motion.span
                    layoutId="theme-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                {mode === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm">Font size</span>
          <div className="flex items-center gap-3">
            <button
              aria-label="Smaller font"
              className={step}
              disabled={settings.fontSize <= FONT_MIN}
              onClick={() => set({ fontSize: settings.fontSize - 1 })}
            >
              −
            </button>
            <span className="w-6 text-center text-sm tabular-nums">
              {settings.fontSize}
            </span>
            <button
              aria-label="Larger font"
              className={step}
              disabled={settings.fontSize >= FONT_MAX}
              onClick={() => set({ fontSize: settings.fontSize + 1 })}
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm">Tab size</span>
          <div className="flex gap-1.5">
            {[2, 4, 8].map((n) => (
              <button
                key={n}
                aria-pressed={settings.tabSize === n}
                onClick={() => set({ tabSize: n })}
                className={`h-8 w-9 rounded-full border text-sm transition active:scale-90 ${
                  settings.tabSize === n
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line hover:border-mute"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm">Word wrap</span>
          <button
            role="switch"
            aria-checked={settings.wordWrap}
            aria-label="Word wrap"
            onClick={() => set({ wordWrap: !settings.wordWrap })}
            className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
              settings.wordWrap ? "bg-accent" : "bg-line"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                settings.wordWrap ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        {/* Resets the editor options but keeps your current theme */}
        <button
          onClick={() => onChange({ ...DEFAULT_SETTINGS, theme: settings.theme })}
          className="mt-2 text-sm text-mute transition hover:text-foreground"
        >
          Reset to defaults
        </button>
      </motion.div>
    </>
  );
}