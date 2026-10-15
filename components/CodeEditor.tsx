"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor, {
  type BeforeMount,
  type Monaco,
  type OnMount,
} from "@monaco-editor/react";
import type { Diagnostic } from "@/lib/diagnostics";
import { getFixes } from "@/lib/quickFixes";

type Props = {
  path: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  dark: boolean;
  diagnostics?: Diagnostic[];
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

type EditorInstance = Parameters<OnMount>[0];
type Model = NonNullable<ReturnType<EditorInstance["getModel"]>>;

const MARKER_OWNER = "runbox-check";
const MARKER_SOURCE = "compiler"; // the quick fix provider only reacts to markers with this source
const NO_DIAGNOSTICS: Diagnostic[] = [];

// Turns one error from the backend into a Monaco marker (a squiggle)
function toMarker(monaco: Monaco, model: Model, d: Diagnostic) {
  const line = Math.min(Math.max(d.line, 1), model.getLineCount());
  const max = model.getLineMaxColumn(line);
  let start = Math.min(Math.max(d.column, 1), max);
  let endLine = line;
  let end: number;

  if (d.endColumn) {
    endLine = Math.min(Math.max(d.endLine ?? line, line), model.getLineCount());
    end = Math.min(d.endColumn, model.getLineMaxColumn(endLine));
  } else {
    // No end given: underline the word at that spot
    const word = model.getWordAtPosition({ lineNumber: line, column: start });
    if (word) {
      start = word.startColumn;
      end = word.endColumn;
    } else if (start >= max) {
      // The error is at the end of the line (like a missing ";"): underline the last character
      start = Math.max(1, max - 1);
      end = max;
    } else {
      end = start + 1;
    }
  }

  return {
    severity:
      d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
    message: d.message,
    source: MARKER_SOURCE,
    startLineNumber: line,
    startColumn: start,
    endLineNumber: endLine,
    endColumn: end,
  };
}

// What Monaco passes to the provider, described by hand. TypeScript can't see
// Monaco's own definitions in this project, so it can't infer these itself.
type MarkerLike = {
  message: string;
  source?: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};
type ModelLike = {
  uri: unknown;
  getLinesContent(): string[];
  getVersionId(): number;
};

// Adds the lightbulb / Ctrl+. suggestions. Registered once for the whole page.
let quickFixesRegistered = false;
function registerQuickFixes(monaco: Monaco) {
  if (quickFixesRegistered) return;
  quickFixesRegistered = true;

  for (const language of ["python", "cpp", "java"]) {
    monaco.languages.registerCodeActionProvider(
      language,
      {
        provideCodeActions(
          model: ModelLike,
          _range: unknown,
          context: { markers: MarkerLike[] }
        ) {
          const lines = model.getLinesContent();
          const actions = context.markers
            .filter((marker) => marker.source === MARKER_SOURCE)
            .flatMap((marker) => {
              const fixes = getFixes({
                language,
                message: marker.message,
                line: marker.startLineNumber,
                column: marker.startColumn,
                endColumn: marker.endColumn,
                lines,
              });
              return fixes.map((fix, i) => ({
                title: fix.title,
                kind: "quickfix",
                diagnostics: [marker],
                isPreferred: i === 0,
                edit: {
                  edits: fix.edits.map((e) => ({
                    resource: model.uri,
                    versionId: model.getVersionId(),
                    textEdit: {
                      range: new monaco.Range(
                        e.line,
                        e.column,
                        e.endLine ?? e.line,
                        e.endColumn ?? e.column
                      ),
                      text: e.text,
                    },
                  })),
                },
              }));
            });
          return { actions, dispose: () => {} };
        },
      },
      { providedCodeActionKinds: ["quickfix"] }
    );
  }
}

export default function CodeEditor({
  language,
  path,
  value,
  onChange,
  fontSize,
  tabSize,
  wordWrap,
  dark,
  diagnostics = NO_DIAGNOSTICS,
}: Props) {
  // next/font stores the real (hashed) font name in this CSS variable
  const [fontFamily, setFontFamily] = useState("monospace");
  useEffect(() => {
    const f = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-jetbrains")
      .trim();
    if (f) setFontFamily(`${f}, monospace`);
  }, []);

  const editorRef = useRef<EditorInstance | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  // Draws the squiggles on whichever file is showing right now
  const applyMarkers = useCallback(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      diagnostics.map((d) => toMarker(monaco, model, d))
    );
  }, [diagnostics]);

  // The editor's listener is created once, so it calls the newest version through a ref
  const applyRef = useRef(applyMarkers);
  useEffect(() => {
    applyRef.current = applyMarkers;
    applyMarkers();
  }, [applyMarkers, path]);

  useEffect(() => () => {
    editorRef.current = null;
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerQuickFixes(monaco);
    editor.onDidChangeModel(() => applyRef.current()); // switching tabs swaps the model
    applyRef.current();
    // Monaco measures character widths once, so re-measure after the font loads
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
