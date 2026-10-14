"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

export type TerminalHandle = {
  write: (text: string) => void;
  clear: () => void;
  focus: () => void;
};

type Props = {
  active: boolean;
  onLine: (line: string) => void;
  onInterrupt: () => void;
  dark: boolean;
};

const WELCOME =
  "\x1b[90mClick Run to start. When your program asks for input, type here and press Enter.\x1b[0m";

  const DARK_THEME = {
  background: "#0A0D11",
  foreground: "#E8ECF1",
  cursor: "#6F7DFF",
  cursorAccent: "#0A0D11",
  selectionBackground: "#6F7DFF40",
  black: "#0A0D11",
  red: "#FF7A7A",
  green: "#5FD3A6",
  yellow: "#F0B45B",
  blue: "#7B8CFF",
  magenta: "#C58BFF",
  cyan: "#5CD0E0",
  white: "#C5CCD5",
  brightBlack: "#8791A0",
  brightRed: "#FF9A9A",
  brightGreen: "#7DE3BD",
  brightYellow: "#F5C57A",
  brightBlue: "#9AA6FF",
  brightMagenta: "#D6A8FF",
  brightCyan: "#7FE0EE",
  brightWhite: "#FFFFFF",
};

// Matches the Runbox palette in globals.css. Red is used for errors and
// brightBlack (gray) for info and exit messages, so both stay readable on light.
const LIGHT_THEME = {
  background: "#F1F4F8",
  foreground: "#12161C",
  cursor: "#3347FF",
  cursorAccent: "#F1F4F8",
  selectionBackground: "#3347FF33",
  black: "#12161C",
  red: "#C62828",
  green: "#0B7A55",
  yellow: "#B4530A",
  blue: "#3347FF",
  magenta: "#8E3FD1",
  cyan: "#0A7C8C",
  white: "#5E6875",
  brightBlack: "#7A8594",
  brightRed: "#D64545",
  brightGreen: "#12936A",
  brightYellow: "#C96A12",
  brightBlue: "#5568FF",
  brightMagenta: "#A55CE0",
  brightCyan: "#1496A8",
  brightWhite: "#12161C",
};

const Terminal = forwardRef<TerminalHandle, Props>(function Terminal(
  { active, onLine, onInterrupt, dark },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const bufferRef = useRef(""); // the line currently being typed
  const posRef = useRef({ abs: 0, x: 0 }); // where the cursor ended after the last write

  // Keep the latest props in refs so the terminal's key handler
  // (created once) never uses stale values.
  const activeRef = useRef(active);
  const onLineRef = useRef(onLine);
  const onInterruptRef = useRef(onInterrupt);
  useEffect(() => {
    activeRef.current = active;
    onLineRef.current = onLine;
    onInterruptRef.current = onInterrupt;
  });
    // Terminal colors follow the page theme
  const darkRef = useRef(dark);
  useEffect(() => {
    darkRef.current = dark;
    if (termRef.current) {
      termRef.current.options.theme = dark ? DARK_THEME : LIGHT_THEME;
    }
  }, [dark]);

  // Writes text to the terminal. When `animate` is true, every line the text
  // starts or reaches slides in from the left. Typing (animate = false) never does.
  function emit(text: string, animate: boolean) {
    const term = termRef.current;
    if (!term) return;
    term.write(text, () => {
      const b = term.buffer.active;
      const abs = b.baseY + b.cursorY;
      const prev = posRef.current;
      posRef.current = { abs, x: b.cursorX };
      if (!animate) return;

      // Text that continues the current line doesn't slide; new lines do
      const first = prev.x === 0 ? prev.abs : prev.abs + 1;
      const rows = containerRef.current?.querySelectorAll<HTMLElement>(
        ".xterm-rows > div"
      );
      if (!rows) return;
      for (let line = first; line <= abs; line++) {
        const el = rows[line - b.viewportY];
        if (!el) continue;
        el.classList.remove("row-in");
        void el.offsetWidth; // restart the animation
        el.classList.add("row-in");
        el.addEventListener("animationend", () => el.classList.remove("row-in"), {
          once: true,
        });
      }
    });
  }

  useImperativeHandle(
    ref,
    () => ({
      write: (text) => emit(text, true),
      clear: () => {
        bufferRef.current = "";
        posRef.current = { abs: 0, x: 0 };
        termRef.current?.reset();
      },
      focus: () => termRef.current?.focus(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const { Terminal: XTermClass } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      if (disposed || !containerRef.current) return;

      // next/font stores the real (hashed) font name in this CSS variable
      const loaded = getComputedStyle(document.documentElement)
        .getPropertyValue("--font-jetbrains")
        .trim();
      const fontFamily = `${loaded ? loaded + ", " : ""}Menlo, Consolas, "Courier New", monospace`;

      const term = new XTermClass({
        fontSize: 14,
        fontFamily,
        lineHeight: 1.6,
        cursorBlink: true,
        cursorStyle: "bar",
        cursorWidth: 2,
        convertEol: true,
        theme: darkRef.current ? DARK_THEME : LIGHT_THEME,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      termRef.current = term;
      emit(WELCOME, false);

      // Re-measure once the web font has loaded, so the cursor lines up with the text
      document.fonts.ready.then(() => {
        if (disposed) return;
        term.options.fontFamily = fontFamily;
        fit.fit();
      });

      term.onData((data) => {
        if (!activeRef.current) return;
        if (data.startsWith("\x1b")) return; // arrow keys, etc.

        for (const ch of data) {
          if (ch === "\r" || ch === "\n") {
            emit("\r\n", false);
            onLineRef.current(bufferRef.current + "\n");
            bufferRef.current = "";
          } else if (ch === "\x7f") {
            // Backspace
            if (bufferRef.current.length > 0) {
              bufferRef.current = bufferRef.current.slice(0, -1);
              emit("\b \b", false);
            }
          } else if (ch === "\x03") {
            // Ctrl+C
            onInterruptRef.current();
          } else if (ch >= " ") {
            bufferRef.current += ch;
            emit(ch, false);
          }
        }
      });

      const observer = new ResizeObserver(() => fit.fit());
      observer.observe(containerRef.current);

      cleanup = () => {
        observer.disconnect();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
      termRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-3" />;
});

export default Terminal;