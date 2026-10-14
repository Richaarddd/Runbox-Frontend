"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import CodeEditor from "@/components/CodeEditor";
import { useDialog } from "@/components/Dialog";
import LanguageSelect from "@/components/LanguageSelect";
import Landing from "@/components/Landing";
import RunButton from "@/components/RunButton";
import SettingsPanel from "@/components/SettingsPanel";
import Terminal, { type TerminalHandle } from "@/components/Terminal";
import FileTabs from "@/components/FileTabs";
import { DEFAULT_CODE, LANGUAGES } from "@/constants/defaultCode";
import { startRun, type RunHandle, type ServerMessage } from "@/lib/runCode";
import { decodeShare, encodeShare } from "@/lib/share";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type EditorSettings,
  type Theme,
} from "@/lib/settings";
import {
  defaultProject,
  loadProject,
  saveProject,
  sanitizeFiles,
  validateName,
  MAX_FILES,
  MAX_FILE_LENGTH,
  type Project,
} from "@/lib/project";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { flushSync } from "react-dom";

const RED = "\x1b[31m";
const GRAY = "\x1b[90m";
const RESET = "\x1b[0m";

const FULL = "inset(0px 0px 0px 0px round 0px)";
const ghost =
  "rounded-full border border-line bg-panel px-4 py-1.5 text-sm transition hover:border-mute active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";

function exitText(msg: Extract<ServerMessage, { type: "exit" }>) {
  if (msg.reason === "timeout") return "Time limit exceeded. Program stopped.";
  if (msg.reason === "output") return "Output limit exceeded. Program stopped.";
  if (msg.reason === "stopped") return "Program stopped.";
  if (msg.reason === "compile_error") return "Compilation failed.";
  return `Process exited with code ${msg.exitCode}`;
}

const KEY_LANG = "compiler:language";
const MAX_UPLOAD_BYTES = 100 * 1024;
const MAX_SHARE_URL = 8000; // longer links break in many chat apps
const MAX_STDIN = 20000;
const STDIN_DELAY_MS = 600; // raise this if compiled languages miss their input
const keyStdin = (lang: string) => `compiler:stdin:${lang}`;

function loadStdin(lang: string): string {
  try {
    return localStorage.getItem(keyStdin(lang)) ?? "";
  } catch {
    return "";
  }
}

function saveStdin(lang: string, text: string) {
  try {
    localStorage.setItem(keyStdin(lang), text);
  } catch {}
}

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function Home() {
  const [view, setView] = useState<"landing" | "editor">("landing");
  const [origin, setOrigin] = useState(FULL);
  const reduce = useReducedMotion();
  const t = reduce ? 0 : 1;
  const dialog = useDialog();

  // Header controls drop in one after another once the editor has opened
  const controls: Variants = {
    hidden: {},
    show: { transition: { delayChildren: 0.4 * t, staggerChildren: 0.06 * t } },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: -10, scale: 0.92 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring" as const, stiffness: 420, damping: 28 },
    },
  };

  const [language, setLanguage] = useState("python");
  const mainName = (lang: string) =>
    LANGUAGES.find((l) => l.id === lang)?.filename ?? "main.txt";
  const [project, setProject] = useState<Project>(() =>
    defaultProject(mainName("python"), DEFAULT_CODE["python"])
  );
  const activeFile =
    project.files.find((f) => f.name === project.active) ?? project.files[0];
  const code = activeFile.code;
  const setCode = (c: string) =>
    setProject((p) => ({
      ...p,
      files: p.files.map((f) => (f.name === p.active ? { ...f, code: c } : f)),
    }));
  const exts = LANGUAGES.find((l) => l.id === language)?.exts ?? [];

  const [running, setRunning] = useState(false);
  const [stdin, setStdin] = useState("");
  const [stdinOpen, setStdinOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const termRef = useRef<TerminalHandle>(null);
  const wide = useIsWide();
  const runRef = useRef<RunHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function showToast(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  // Close any open connection when leaving the page
  useEffect(() => () => runRef.current?.close(), []);

  // Load the saved language, project and settings once, after the page mounts
  useEffect(() => {
    let lang = "python";
    try {
      const saved = localStorage.getItem(KEY_LANG);
      if (saved && LANGUAGES.some((l) => l.id === saved)) lang = saved;
    } catch {}
    setLanguage(lang);
    setProject(loadProject(lang, mainName(lang), DEFAULT_CODE[lang] ?? ""));
    setStdin(loadStdin(lang));
    setSettings(loadSettings());
    setLoaded(true);

    // Opened from a share link? Load the shared code and go straight to the editor
    const hash = window.location.hash;
    if (hash.startsWith("#share=")) {
      const payload = hash.slice("#share=".length);
      history.replaceState(null, "", window.location.pathname + window.location.search);
      decodeShare(payload).then(async (shared) => {
        const sharedLang = shared && LANGUAGES.find((l) => l.id === shared.language);
        const files =
          shared && sharedLang
            ? sanitizeFiles(
                shared.files ?? [{ name: sharedLang.filename, code: shared.code }],
                sharedLang.exts
              )
            : null;
        if (!sharedLang || !files) {
          showToast("That share link could not be opened");
          return;
        }
        // Don't silently overwrite the visitor's own work
        const starter = DEFAULT_CODE[sharedLang.id] ?? "";
        const mine = loadProject(sharedLang.id, sharedLang.filename, starter);
        const hasOwnWork = mine.files.length > 1 || mine.files[0].code !== starter;
        const same = JSON.stringify(mine.files) === JSON.stringify(files);
        if (hasOwnWork && !same) {
          const ok = await dialog.confirm({
            title: "Open the shared code?",
            message: "Your current code for this language will be replaced.",
            confirmLabel: "Open",
            danger: true,
          });
          if (!ok) return;
        }
        setLanguage(sharedLang.id);
        setStdin(loadStdin(sharedLang.id));
        setProject({ files, active: files[0].name });
        setView("editor");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on every change (the code is small, so no debounce is needed)
  useEffect(() => {
    if (!loaded) return;
    saveProject(language, project);
    try {
      localStorage.setItem(KEY_LANG, language);
    } catch {}
  }, [project, language, loaded]);

  useEffect(() => {
    if (loaded) saveStdin(language, stdin);
  }, [stdin, language, loaded]);

  useEffect(() => {
    if (loaded) saveSettings(settings);
  }, [settings, loaded]);

  // Keep the page's color theme in sync with the setting
  useEffect(() => {
    if (loaded) document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme, loaded]);

  // Switching theme: a circle of the new theme grows out of the clicked button
  function changeTheme(next: Theme, origin: { x: number; y: number }) {
    if (next === settings.theme) return;
    const root = document.documentElement;
    const apply = () => {
      flushSync(() => setSettings((s) => ({ ...s, theme: next })));
      root.dataset.theme = next;
    };

    type VTDocument = Document & {
      startViewTransition?: (update: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
      };
    };
    const doc = document as VTDocument;

    if (reduce) return apply();

    if (!doc.startViewTransition) {
      // Older browsers: fade the colors instead
      root.classList.add("theme-fade");
      apply();
      setTimeout(() => root.classList.remove("theme-fade"), 450);
      return;
    }

    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y)
    );

    root.classList.add("theme-switching");
    const vt = doc.startViewTransition(apply);
    vt.ready
      .then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: 650,
            easing: "cubic-bezier(0.7, 0, 0.2, 1)",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {});
    vt.finished.finally(() => root.classList.remove("theme-switching"));
  }

  // The editor grows out of whatever was clicked: the demo window (rounded
  // corners) or the Open editor button (pill shape)
  function openEditor(rect: DOMRect, radius = 16) {
    setOrigin(
      `inset(${rect.top}px ${window.innerWidth - rect.right}px ${
        window.innerHeight - rect.bottom
      }px ${rect.left}px round ${radius}px)`
    );
    setView("editor");
  }

  function closeEditor() {
    runRef.current?.stop();
    setSettingsOpen(false);
    setView("landing");
  }

  function handleLanguageChange(next: string) {
    runRef.current?.stop();
    setLanguage(next);
    setStdin(loadStdin(next));
    setProject(loadProject(next, mainName(next), DEFAULT_CODE[next] ?? ""));
    termRef.current?.clear();
  }

  async function handleShare() {
    const payload = await encodeShare(language, project.files);
    const url = `${window.location.origin}${window.location.pathname}#share=${payload}`;
    if (url.length > MAX_SHARE_URL) {
      showToast("This code is too long to share as a link");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      await dialog.prompt({
        title: "Copy this link",
        initial: url,
        confirmLabel: "Done",
      });
    }
  }

  // Downloads the file you're looking at
  function handleDownload() {
    const filename = project.active;
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // free the memory
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets you pick the same file again later
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      await dialog.alert({ title: "File too large", message: "The maximum size is 100 KB." });
      return;
    }

    const name = file.name.toLowerCase();
    const match = LANGUAGES.find((l) => l.exts.some((x) => name.endsWith(x)));
    if (!match) {
      const allowed = LANGUAGES.flatMap((l) => l.exts).join(", ");
      await dialog.alert({ title: "Unsupported file type", message: `Use one of: ${allowed}` });
      return;
    }

    const text = await file.text();
    if (text.length > MAX_FILE_LENGTH) {
      await dialog.alert({
        title: "File too long",
        message: `The maximum is ${MAX_FILE_LENGTH} characters.`,
      });
      return;
    }

    // Uploads are added as a new tab (or replace the tab with the same name)
    const base =
      match.id === language
        ? project
        : loadProject(match.id, mainName(match.id), DEFAULT_CODE[match.id] ?? "");
    const safeName = file.name.replace(/[^A-Za-z0-9_.-]/g, "_");
    const exists = base.files.some((f) => f.name === safeName);
    if (exists) {
      const ok = await dialog.confirm({
        title: `Replace "${safeName}"?`,
        message: "Its current code will be lost.",
        confirmLabel: "Replace",
        danger: true,
      });
      if (!ok) return;
    } else if (base.files.length >= MAX_FILES) {
      await dialog.alert({
        title: "Too many files",
        message: `A project can have at most ${MAX_FILES} files.`,
      });
      return;
    }

    runRef.current?.stop();
    setLanguage(match.id);
    setStdin(loadStdin(match.id));
    setProject({
      files: exists
        ? base.files.map((f) => (f.name === safeName ? { ...f, code: text } : f))
        : [...base.files, { name: safeName, code: text }],
      active: safeName,
    });
    termRef.current?.clear();
  }

  async function handleReset() {
    const ok = await dialog.confirm({
      title: "Reset to the starter code?",
      message: "All files in this project will be removed.",
      confirmLabel: "Reset",
      danger: true,
    });
    if (ok) setProject(defaultProject(mainName(language), DEFAULT_CODE[language] ?? ""));
  }

  async function addFile() {
    const name = await dialog.prompt({
      title: "New file",
      message: `The name must end with ${exts.join(", ")}`,
      placeholder: `utils${exts[0] ?? ""}`,
      confirmLabel: "Create",
      validate: (v) => validateName(v, project.files.map((f) => f.name), exts),
    });
    if (!name) return;
    setProject((p) => ({ files: [...p.files, { name, code: "" }], active: name }));
  }

  async function renameFile(old: string) {
    const name = await dialog.prompt({
      title: "Rename file",
      initial: old,
      confirmLabel: "Rename",
      validate: (v) =>
        validateName(v, project.files.filter((f) => f.name !== old).map((f) => f.name), exts),
    });
    if (!name || name === old) return;
    setProject((p) => ({
      files: p.files.map((f) => (f.name === old ? { ...f, name } : f)),
      active: p.active === old ? name : p.active,
    }));
  }

  async function deleteFile(name: string) {
    const ok = await dialog.confirm({
      title: `Delete ${name}?`,
      message: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setProject((p) => {
      const files = p.files.filter((f) => f.name !== name);
      return { files, active: p.active === name ? files[0].name : p.active };
    });
  }

  function handleRun() {
    if (running || runRef.current) return;
    const term = termRef.current;
    term?.clear();
    setRunning(true);

    const input = stdin;
    let sent = input.length === 0;

    // Runs the main file (first tab), not whichever tab is open
    const handle = startRun(language, project.files[0].code, {
      onMessage: (msg) => {
        if (msg.type === "stdout") {
          sendStdin(); // the program is running, so it can take input
          term?.write(msg.data);
        } else if (msg.type === "stderr") {
          sendStdin();
          term?.write(RED + msg.data + RESET);
        } else if (msg.type === "info") {
          term?.write(GRAY + msg.data + RESET);
        } else if (msg.type === "error") {
          term?.write(`${RED}${msg.message}${RESET}\n`);
          finish();
        } else if (msg.type === "exit") {
          term?.write(`\n${GRAY}${exitText(msg)}${RESET}\n`);
          finish();
        }
      },
      onClose: () => finish(),
    });

    runRef.current = handle;
    term?.focus();

    // Programs that read input before printing anything never produce output
    // first, so also send after a short delay (whichever happens first wins)
    setTimeout(sendStdin, STDIN_DELAY_MS);

    // Sends the pasted input exactly once
    function sendStdin() {
      if (sent || runRef.current !== handle) return;
      sent = true;
      handle.sendInput(input.endsWith("\n") ? input : input + "\n");
    }

    // Ends this run exactly once, even if several events fire
    function finish() {
      if (runRef.current !== handle) return;
      runRef.current = null;
      setRunning(false);
      handle.close();
    }
  }

  // Always points at the latest handleRun, so the key listener never uses stale code
  const handleRunRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleRunRef.current = handleRun;
  });

  // Ctrl+Enter (or Cmd+Enter on Mac) runs the program, only while the editor is open
  useEffect(() => {
    if (view !== "editor") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation(); // stop Monaco from inserting a new line
        if (!e.repeat) handleRunRef.current(); // ignore holding the key down
      }
    }
    window.addEventListener("keydown", onKeyDown, true); // true = capture phase
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [view]);

  const monacoLanguage =
    LANGUAGES.find((l) => l.id === language)?.monaco ?? "plaintext";

  return (
    <>
      <Landing onOpen={openEditor} paused={view === "editor"} />

      <AnimatePresence>
        {view === "editor" && (
          <motion.div
            key="editor"
            className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
            initial={{ clipPath: origin }}
            animate={{ clipPath: FULL }}
            exit={{ clipPath: origin }}
            transition={{ duration: 0.6 * t, ease: [0.7, 0, 0.2, 1] }}
          >
            <motion.header
              className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line px-3 py-3 md:flex-nowrap md:px-5"
              variants={controls}
              initial="hidden"
              animate="show"
            >
              <motion.div variants={item} className="order-1 mr-auto md:order-none">
                <button
                  onClick={closeEditor}
                  aria-label="Back to home"
                  className="text-xl font-bold tracking-tight"
                >
                  Runbox
                </button>
              </motion.div>

              {/* On phones this row sits under the title and scrolls sideways */}
              <div className="order-3 -my-1 flex w-full items-center gap-2 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] md:order-none md:w-auto md:gap-2.5 md:overflow-visible [&::-webkit-scrollbar]:hidden">
                <motion.div variants={item} className="shrink-0">
                  <LanguageSelect value={language} onChange={handleLanguageChange} />
                </motion.div>
                <motion.div variants={item} className="shrink-0">
                  <button onClick={handleReset} className={ghost}>
                    Reset
                  </button>
                </motion.div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={LANGUAGES.flatMap((l) => l.exts).join(",")}
                  onChange={handleUpload}
                  className="hidden"
                />
                <motion.div variants={item} className="shrink-0">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={ghost}
                  >
                    Upload
                  </button>
                </motion.div>
                <motion.div variants={item} className="shrink-0">
                  <button onClick={handleDownload} className={ghost}>
                    Download
                  </button>
                </motion.div>
                <motion.div variants={item} className="shrink-0">
                  <button onClick={handleShare} className={ghost}>
                    Share
                  </button>
                </motion.div>
                <motion.div variants={item} className="shrink-0">
                  <button
                    onClick={() => setSettingsOpen((o) => !o)}
                    aria-expanded={settingsOpen}
                    className={ghost}
                  >
                    Settings
                  </button>
                </motion.div>
                <motion.div variants={item} className="shrink-0">
                  <button
                    onClick={() => runRef.current?.stop()}
                    disabled={!running}
                    className={ghost}
                  >
                    ■ Stop
                  </button>
                </motion.div>
              </div>

              <motion.div variants={item} className="order-2 md:order-none">
                <RunButton onClick={handleRun} loading={running} />
              </motion.div>
            </motion.header>

            <motion.main
              className="min-h-0 flex-1 p-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 * t, duration: 0.5 * t }}
            >
              {loaded && (
                <PanelGroup
                  key={wide ? "h" : "v"}
                  direction={wide ? "horizontal" : "vertical"}
                  autoSaveId={wide ? "compiler-layout-h" : "compiler-layout-v"}
                >
                  <Panel defaultSize={50} minSize={20}>
                    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-panel">
                      <FileTabs
                        files={project.files.map((f) => f.name)}
                        active={activeFile.name}
                        canAdd={project.files.length < MAX_FILES}
                        onSelect={(name) => setProject((p) => ({ ...p, active: name }))}
                        onAdd={addFile}
                        onRename={renameFile}
                        onDelete={deleteFile}
                      />
                      <div className="min-h-0 flex-1">
                        <CodeEditor
                          path={`${language}/${activeFile.name}`}
                          language={monacoLanguage}
                          value={code}
                          onChange={setCode}
                          fontSize={settings.fontSize}
                          tabSize={settings.tabSize}
                          wordWrap={settings.wordWrap}
                          dark={settings.theme === "dark"}
                        />
                      </div>

                      <div className="shrink-0 border-t border-line">
                        <button
                          onClick={() => setStdinOpen((o) => !o)}
                          aria-expanded={stdinOpen}
                          className="flex w-full items-center justify-between px-3 py-2 text-sm text-mute transition hover:text-foreground"
                        >
                          <span>
                            Input
                            {stdin && !stdinOpen && (
                              <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
                            )}
                          </span>
                          <span
                            className={`transition-transform duration-200 ${
                              stdinOpen ? "rotate-180" : ""
                            }`}
                          >
                            ▾
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {stdinOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 * t }}
                              className="overflow-hidden"
                            >
                              <textarea
                                value={stdin}
                                onChange={(e) => setStdin(e.target.value.slice(0, MAX_STDIN))}
                                placeholder="Paste input here. It is sent to your program when you click Run."
                                spellCheck={false}
                                rows={5}
                                aria-label="Program input"
                                className="mx-3 mb-3 block w-[calc(100%-1.5rem)] resize-none rounded-xl border border-line bg-background p-2.5 font-mono text-sm outline-none transition focus:border-accent"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </section>
                  </Panel>

                  <PanelResizeHandle
                    className={`rounded transition-colors hover:bg-accent/40 data-[resize-handle-state=drag]:bg-accent ${
                      wide ? "w-2 cursor-col-resize" : "h-3 cursor-row-resize"
                    }`}
                  />

                  <Panel defaultSize={50} minSize={20}>
                    <motion.section
                      className="flex h-full min-h-0 flex-col gap-1.5"
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.7 * t,
                        duration: 0.5 * t,
                        ease: [0.2, 0.7, 0.2, 1],
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-mute">Terminal</span>
                        <span
                          className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                            running ? "animate-pulse bg-accent" : "bg-line"
                          }`}
                        />
                      </div>
                      <div
                        className={`relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-term transition-colors duration-300 ${
                          running ? "border-accent/50" : "border-line"
                        }`}
                      >
                        <div
                          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden transition-opacity duration-200 ${
                            running ? "opacity-100" : "opacity-0"
                          }`}
                        >
                          <div className="h-full w-[30%] animate-slide bg-accent" />
                        </div>
                        <Terminal
                          ref={termRef}
                          active={running}
                          onLine={(line) => runRef.current?.sendInput(line)}
                          onInterrupt={() => runRef.current?.stop()}
                          dark={settings.theme === "dark"}
                        />
                      </div>
                    </motion.section>
                  </Panel>
                </PanelGroup>
              )}
            </motion.main>

            <AnimatePresence>
              {settingsOpen && (
                <SettingsPanel
                  settings={settings}
                  onChange={setSettings}
                  onThemeChange={changeTheme}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Small confirmation message, e.g. "Link copied" */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              role="status"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2 * t }}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {dialog.element}
    </>
  );
}