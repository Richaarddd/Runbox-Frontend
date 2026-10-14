"use client";

import { useEffect, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";

type Props = {
  path: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  dark: boolean;
};

// Both themes match the Runbox palette in globals.css
const defineRunboxThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("runbox-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7A8594", fontStyle: "italic" },
      { token: "keyword", foreground: "3347FF" },
      { token: "string", foreground: "0B7A55" },
      { token: "number", foreground: "B4530A" },
      { token: "type", foreground: "12161C", fontStyle: "bold" },
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#12161C",
      "editor.lineHighlightBackground": "#F6F8FA",
      "editor.lineHighlightBorder": "#F6F8FA",
      "editor.selectionBackground": "#3347FF26",
      "editor.inactiveSelectionBackground": "#3347FF14",
      "editorCursor.foreground": "#3347FF",
      "editorLineNumber.foreground": "#A3ACB8",
      "editorLineNumber.activeForeground": "#5E6875",
      "editorIndentGuide.background1": "#E1E6EC",
      "editorIndentGuide.activeBackground1": "#C5CCD5",
      "editorWidget.background": "#FFFFFF",
      "editorWidget.border": "#E1E6EC",
      "editorSuggestWidget.selectedBackground": "#F1F4F8",
      "scrollbarSlider.background": "#12161C14",
      "scrollbarSlider.hoverBackground": "#12161C26",
    },
  });

  monaco.editor.defineTheme("runbox-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6B7685", fontStyle: "italic" },
      { token: "keyword", foreground: "8C98FF" },
      { token: "string", foreground: "5FD3A6" },
      { token: "number", foreground: "F0A15B" },
      { token: "type", foreground: "E8ECF1", fontStyle: "bold" },
    ],
    colors: {
      "editor.background": "#151A21",
      "editor.foreground": "#E8ECF1",
      "editor.lineHighlightBackground": "#1B222B",
      "editor.lineHighlightBorder": "#1B222B",
      "editor.selectionBackground": "#6F7DFF40",
      "editor.inactiveSelectionBackground": "#6F7DFF22",
      "editorCursor.foreground": "#6F7DFF",
      "editorLineNumber.foreground": "#5E6875",
      "editorLineNumber.activeForeground": "#8791A0",
      "editorIndentGuide.background1": "#242B35",
      "editorIndentGuide.activeBackground1": "#3A4452",
      "editorWidget.background": "#151A21",
      "editorWidget.border": "#242B35",
      "editorSuggestWidget.selectedBackground": "#1B222B",
      "scrollbarSlider.background": "#E8ECF114",
      "scrollbarSlider.hoverBackground": "#E8ECF126",
    },
  });
};

export default function CodeEditor({
  language,
  path,
  value,
  onChange,
  fontSize,
  tabSize,
  wordWrap,
  dark,
}: Props) {
  // next/font stores the real (hashed) font name in this CSS variable
  const [fontFamily, setFontFamily] = useState("monospace");
  useEffect(() => {
    const f = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-jetbrains")
      .trim();
    if (f) setFontFamily(`${f}, monospace`);
  }, []);

  // Monaco measures character widths once, so re-measure after the font loads
  const handleMount: OnMount = (_editor, monaco) => {
    document.fonts.ready.then(() => monaco.editor.remeasureFonts());
  };

  return (
    <Editor
      height="100%"
      path={path}
      language={language}
      theme={dark ? "runbox-dark" : "runbox-light"}
      value={value}
      beforeMount={defineRunboxThemes}
      onMount={handleMount}
      onChange={(v) => onChange(v ?? "")}
      loading={<div className="p-5 text-sm text-mute">Loading editor...</div>}
      options={{
        fontFamily,
        fontSize,
        lineHeight: Math.round(fontSize * 1.7),
        tabSize,
        insertSpaces: true,
        detectIndentation: false, // so the tab size setting always applies
        wordWrap: wordWrap ? "on" : "off",
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 16, bottom: 16 },
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}