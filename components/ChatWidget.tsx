"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Diff, diffRows } from "@/components/AiPanel";
import { streamChat, type ChatMessage } from "@/lib/aiChat";

type Props = {
  language: string;
  fileName: string;
  code: string;
  errorText: string; // the last run's error, or the errors the editor shows
  onApply: (fileName: string, fixedCode: string, sourceCode: string) => Promise<boolean>;
};

type Turn = {
  id: number;
  question: string;
  answer: string;
  status: "waiting" | "streaming" | "done" | "stopped" | "error";
  error?: string;
  read: string[]; // what the assistant was allowed to see
  fileName: string;
  sourceCode?: string; // the file as it was when the question was asked
};

/* ---------- reading the answer: text and ``` code blocks ---------- */

type Block =
  | { kind: "text"; text: string }
  | { kind: "code"; info: string; text: string; closed: boolean };

// Works on half-finished answers too, so code blocks can appear while it streams
function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let text: string[] = [];
  let code: string[] | null = null;
  let info = "";
  const flush = () => {
    const t = text.join("\n").trim();
    if (t) blocks.push({ kind: "text", text: t });
    text = [];
  };
  for (const line of src.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      if (code === null) {
        flush();
        code = [];
        info = line.trim().slice(3).trim();
      } else {
        blocks.push({ kind: "code", info, text: code.join("\n"), closed: true });
        code = null;
      }
    } else if (code !== null) {
      code.push(line);
    } else {
      text.push(line);
    }
  }
  if (code !== null) blocks.push({ kind: "code", info, text: code.join("\n"), closed: false });
  else flush();
  return blocks;
}

// Draws `inline code` in a small box. Nothing here is rendered as HTML.
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`\n]+`)/g).map((part, i) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="rounded bg-term px-1 py-0.5 font-mono text-[13px]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        )
      )}
    </>
  );
}

const btn =
  "rounded-full border border-line px-3.5 py-1 text-[13px] transition hover:border-mute active:scale-95 disabled:cursor-default disabled:opacity-50";

function CodeBlock({
  block,
  fileName,
  sourceCode,
  applied,
  onApply,
}: {
  block: Extract<Block, { kind: "code" }>;
  fileName: string;
  sourceCode?: string;
  applied: boolean;
  onApply: (after: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const wantsFile = /\bfile\b/i.test(block.info);
  const after = block.text.replace(/\s+$/, "") + "\n";
  const before = sourceCode !== undefined ? sourceCode.replace(/\s+$/, "") + "\n" : undefined;

  // A whole-file rewrite is shown as a comparison with the current file
  const rows = useMemo(
    () => (wantsFile && block.closed && before !== undefined ? diffRows(before, after) : null),
    [wantsFile, block.closed, before, after]
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(wantsFile ? after : block.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (rows && before !== undefined) {
    const added = rows.filter((r) => r.t === "+").length;
    const removed = rows.filter((r) => r.t === "-").length;
    return (
      <motion.div
        className="mt-2.5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-1 flex justify-between font-mono text-xs text-mute">
          <span>{fileName}</span>
          <span>
            <span className="text-emerald-500">+{added}</span>{" "}
            <span className="text-red-500">-{removed}</span>
          </span>
        </div>
        <Diff before={before} after={after} />
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={copy} className={btn}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => onApply(after)}
            disabled={applied || added + removed === 0}
            className="rounded-full bg-foreground px-3.5 py-1 text-[13px] font-semibold text-background transition active:scale-95 disabled:cursor-default disabled:opacity-50"
          >
            {applied ? "Applied" : `Apply to ${fileName}`}
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="mt-2.5 overflow-hidden rounded-xl border border-line"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 font-mono text-xs text-mute">
        <span>{block.info.split(/\s+/)[0] || "code"}</span>
        {block.closed && (
          <button onClick={copy} className="transition hover:text-foreground">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[12.5px] leading-[1.7]">
        {block.text}
      </pre>
    </motion.div>
  );
}

/* ---------- the steps shown while waiting for the first word ---------- */

function Steps({ items }: { items: string[] }) {
  const [n, setN] = useState(0); // how many steps are finished
  useEffect(() => {
    if (n >= items.length) return;
    const id = setTimeout(() => setN(n + 1), 500);
    return () => clearTimeout(id);
  }, [n, items.length]);

  const row = (key: string, done: boolean, label: React.ReactNode) => (
    <motion.div
      key={key}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2"
    >
      {done ? (
        <span className="text-emerald-500">✓</span>
      ) : (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-mute border-t-transparent" />
      )}
      <span>{label}</span>
    </motion.div>
  );

  return (
    <div className="my-2.5 font-mono text-xs leading-[1.9] text-mute">
      {items.slice(0, n + 1).map((label, i) => (i < n ? row(label, true, label) : null))}
      {n < items.length
        ? row(items[n], false, items[n])
        : row("thinking", false, <>Thinking<span className="animate-pulse">...</span></>)}
    </div>
  );
}

/* ---------- small pieces ---------- */

function Tag({
  on,
  disabled,
  label,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs transition ${
        disabled
          ? "border-line text-mute opacity-40"
          : on
            ? "border-foreground/35"
            : "border-line text-mute line-through"
      }`}
    >
      <span
        className={`grid h-2.5 w-2.5 place-items-center rounded-[3px] border text-[8px] leading-none ${
          on && !disabled ? "border-foreground bg-foreground text-background" : "border-mute"
        }`}
      >
        {on && !disabled ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

/* ---------- the widget ---------- */

export default function ChatWidget({ language, fileName, code, errorText, onApply }: Props) {
  const reduce = useReducedMotion();
  const t = reduce ? 0 : 1;

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [useFile, setUseFile] = useState(true);
  const [useRun, setUseRun] = useState(true);
  const [alertDot, setAlertDot] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hadError = useRef(false);

  const hasError = !!errorText;

  // A red dot on the button when a new error appears while the chat is closed
  useEffect(() => {
    if (hasError && !hadError.current && !open) setAlertDot(true);
    if (!hasError) setUseRun(true);
    hadError.current = hasError;
  }, [hasError, open]);

  // Closing the chat stops an answer that is still coming in
  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function toggle() {
    setOpen((o) => !o);
    setAlertDot(false);
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clear() {
    abortRef.current?.abort();
    setTurns([]);
    setApplied(new Set());
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    const sendFile = useFile && code.trim().length > 0;
    const sendRun = useRun && hasError;
    const read: string[] = [];
    if (sendFile) read.push(`Reading ${fileName}`);
    if (sendRun) read.push("Reading the last run");

    const id = nextId.current++;
    const turn: Turn = {
      id,
      question,
      answer: "",
      status: "waiting",
      read,
      fileName,
      sourceCode: sendFile ? code : undefined,
    };

    // Earlier finished answers are sent back so the AI remembers the conversation
    const history: ChatMessage[] = turns
      .filter((x) => x.answer && (x.status === "done" || x.status === "stopped"))
      .flatMap((x) => [
        { role: "user" as const, content: x.question },
        { role: "assistant" as const, content: x.answer },
      ]);

    setTurns((ts) => [...ts, turn]);
    setInput("");
    if (areaRef.current) areaRef.current.style.height = "";

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);

    const update = (patch: (x: Turn) => Turn) =>
      setTurns((ts) => ts.map((x) => (x.id === id ? patch(x) : x)));

    try {
      await streamChat(
        {
          language,
          fileName,
          code: sendFile ? code : undefined,
          error: sendRun ? errorText : undefined,
          messages: [...history, { role: "user", content: question }],
        },
        controller.signal,
        (piece) => update((x) => ({ ...x, answer: x.answer + piece, status: "streaming" }))
      );
      update((x) => ({ ...x, status: "done" }));
    } catch (err) {
      if (controller.signal.aborted) {
        update((x) => ({ ...x, status: "stopped" }));
      } else {
        update((x) => ({
          ...x,
          status: "error",
          error: err instanceof Error ? err.message : "Something went wrong.",
        }));
      }
    } finally {
      setBusy(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function apply(turn: Turn, blockIndex: number, after: string) {
    if (turn.sourceCode === undefined) return;
    const ok = await onApply(turn.fileName, after, turn.sourceCode);
    if (ok) setApplied((s) => new Set(s).add(`${turn.id}:${blockIndex}`));
  }

  const suggestions: { text: string; hot?: boolean }[] = [
    ...(hasError ? [{ text: "Why did my run fail?", hot: true }] : []),
    { text: "Explain this file" },
    { text: "Find the bug" },
  ];

  return (
    <>
      {/* The button: a circle that widens into "Ask AI" on hover */}
      <button
        onClick={toggle}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        className="group absolute bottom-4 right-4 z-10 flex h-12 min-w-12 items-center justify-center rounded-full bg-foreground px-4 text-background shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] transition-transform active:scale-95"
      >
        <motion.span
          key={open ? "close" : "prompt"}
          initial={{ opacity: 0, scale: 0.5, rotate: -60 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.35 * t, ease: [0.2, 0.7, 0.2, 1] }}
          className="font-mono text-[15px] font-semibold tracking-tighter"
        >
          {open ? "✕" : ">_"}
        </motion.span>
        {!open && (
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover:ml-2 group-hover:max-w-16 group-hover:opacity-100">
            Ask AI
          </span>
        )}
        {alertDot && !open && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-term bg-red-500" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Assistant"
            className="absolute bottom-[76px] right-4 z-10 flex flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_28px_70px_-14px_rgba(0,0,0,0.45)]"
            style={{
              width: "min(390px, calc(100% - 32px))",
              height: "min(470px, calc(100% - 92px))",
              transformOrigin: "bottom right",
            }}
            initial={{ opacity: 0, scale: 0.9, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ duration: 0.45 * t, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {busy && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
                <div className="h-full w-[30%] animate-slide bg-accent" />
              </div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * t, duration: 0.35 * t }}
              className="border-b border-line"
            >
              <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-3">
                <b className="text-sm">Assistant</b>
                <span className="flex-1" />
                <button
                  onClick={clear}
                  disabled={turns.length === 0}
                  className="rounded-md px-1.5 py-0.5 text-[13px] text-mute transition hover:bg-term hover:text-foreground disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-md px-1.5 py-0.5 text-[13px] text-mute transition hover:bg-term hover:text-foreground"
                >
                  Esc
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-2.5">
                <span className="mr-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wider text-mute">
                  Sees
                </span>
                <Tag on={useFile} label={fileName} onClick={() => setUseFile((v) => !v)} />
                <Tag
                  on={useRun && hasError}
                  disabled={!hasError}
                  label="Last run"
                  onClick={() => setUseRun((v) => !v)}
                />
              </div>
            </motion.div>

            <motion.div
              ref={bodyRef}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 * t, duration: 0.35 * t }}
              className="min-h-0 flex-1 overflow-y-auto p-3.5"
            >
              {turns.length === 0 ? (
                <div>
                  <h2 className="mb-1 mt-1.5 text-[22px] font-semibold tracking-tight">
                    Ask about {fileName}
                  </h2>
                  <p className="mb-3.5 text-[13.5px] text-mute">
                    It only reads what is checked above. AI can be wrong.
                  </p>
                  {suggestions.map((s, i) => (
                    <button
                      key={s.text}
                      onClick={() => ask(s.text)}
                      className={`flex w-full items-center justify-between border-t border-line px-1 py-2.5 text-left text-[14.5px] transition-all hover:bg-term hover:pl-2.5 ${
                        i === suggestions.length - 1 ? "border-b" : ""
                      }`}
                    >
                      <span>
                        {s.hot && (
                          <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                        )}
                        {s.text}
                      </span>
                      <span className="font-mono text-mute">→</span>
                    </button>
                  ))}
                </div>
              ) : (
                turns.map((turn) => (
                  <motion.div
                    key={turn.id}
                    className="mb-5"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 * t }}
                  >
                    <div className="flex gap-2 font-mono text-[13.5px] leading-snug">
                      <span className="font-semibold text-accent">›</span>
                      <span className="whitespace-pre-wrap break-words">{turn.question}</span>
                    </div>

                    {turn.status === "waiting" ? (
                      <Steps items={turn.read.length ? turn.read : ["No context attached"]} />
                    ) : (
                      <div className="my-2.5 font-mono text-xs text-mute">
                        <span className="text-emerald-500">✓</span>{" "}
                        {turn.read.length
                          ? turn.read.map((r) => r.replace(/^Reading/, "Read")).join(", ")
                          : "No context attached"}
                      </div>
                    )}

                    {turn.answer && (
                      <div className="mt-2 space-y-2.5 text-[14.5px] leading-[1.65]">
                        {parseBlocks(turn.answer).map((b, i) =>
                          b.kind === "text" ? (
                            <p key={i} className="whitespace-pre-wrap">
                              <Inline text={b.text} />
                            </p>
                          ) : (
                            <CodeBlock
                              key={i}
                              block={b}
                              fileName={turn.fileName}
                              sourceCode={turn.sourceCode}
                              applied={applied.has(`${turn.id}:${i}`)}
                              onApply={(after) => apply(turn, i, after)}
                            />
                          )
                        )}
                        {turn.status === "streaming" && (
                          <span className="ml-0.5 inline-block h-[1.05em] w-2 animate-blink bg-foreground align-text-bottom" />
                        )}
                      </div>
                    )}

                    {turn.status === "stopped" && (
                      <p className="mt-1.5 font-mono text-xs text-mute">Stopped</p>
                    )}
                    {turn.status === "error" && (
                      <p className="mt-2 text-sm text-red-500">{turn.error}</p>
                    )}
                  </motion.div>
                ))
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 * t, duration: 0.35 * t }}
              className="border-t border-line px-3 pb-2 pt-2.5"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={areaRef}
                  value={input}
                  rows={1}
                  placeholder="Ask about your code"
                  aria-label="Message"
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 88) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(input);
                    }
                  }}
                  className="h-9 max-h-[88px] flex-1 resize-none rounded-[10px] border border-line bg-background px-3 py-2 text-sm leading-snug outline-none transition focus:border-foreground"
                />
                <button
                  onClick={() => (busy ? stop() : ask(input))}
                  aria-label={busy ? "Stop" : "Send"}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background transition active:scale-90"
                >
                  {busy ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1.5 px-0.5 font-mono text-[11px] text-mute">
                Enter to send, Shift+Enter for a new line
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}