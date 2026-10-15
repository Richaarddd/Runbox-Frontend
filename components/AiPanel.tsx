"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Sparkle from "@/components/Sparkle";

export type AiView = {
  mode: "explain" | "fix";
  status: "loading" | "done" | "error";
  text: string; // the explanation, or the error message when status is "error"
  fixedCode?: string;
  sourceCode?: string; // the file as it was when the AI looked at it
  fileName: string;
};

type Props = {
  view: AiView;
  errorText: string; // the error the AI is answering, shown at the top
  onClose: () => void;
  onApply: () => void;
  onFix: () => void; // "Fix it for me" on the explain answer
};

/* ---------- typing the answer word by word ---------- */

function wordCount(s: string) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

// The first k words of a text, keeping the original spacing and line breaks
function firstWords(text: string, k: number) {
  let out = "";
  let words = 0;
  for (const tok of text.trim().split(/(\s+)/)) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) {
      out += tok;
      continue;
    }
    if (words >= k) break;
    out += tok;
    words++;
  }
  return out.trimEnd();
}

// ``` code blocks are odd entries; each one counts as a single step
function splitParts(text: string) {
  return text.split(/```[^\n`]*\n?([\s\S]*?)```/g);
}

function unitCount(text: string) {
  return splitParts(text).reduce(
    (sum, part, i) => sum + (i % 2 === 1 ? 1 : wordCount(part)),
    0
  );
}

// Shows text with ``` code blocks drawn in a box. Nothing here is rendered as HTML.
function Rich({ text, n }: { text: string; n: number }) {
  const parts = splitParts(text);
  let offset = 0;
  const locals = parts.map((part, i) => {
    const size = i % 2 === 1 ? 1 : wordCount(part);
    const local = Math.max(0, Math.min(size, n - offset));
    offset += size;
    return local;
  });
  const typing = n < offset;
  let lastShown = -1;
  locals.forEach((l, i) => {
    if (l > 0) lastShown = i;
  });

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {parts.map((part, i) => {
        if (locals[i] === 0) return null;
        if (i % 2 === 1) {
          return (
            <motion.pre
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-x-auto rounded-xl border border-line bg-background p-3 font-mono text-[13px]"
            >
              {part.replace(/\s+$/, "")}
            </motion.pre>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {firstWords(part, locals[i])}
            {typing && i === lastShown && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-accent align-text-bottom" />
            )}
          </p>
        );
      })}
    </div>
  );
}

/* ---------- showing only the changed lines of a fix ---------- */

const CONTEXT = 2; // unchanged lines shown around each change

type Row = { t: " " | "-" | "+"; text: string };
type Shown = Row | { t: "gap" };

export function diffRows(a: string, b: string): Row[] {
  const x = a.split("\n");
  const y = b.split("\n");

  // Lines that are the same at the start and end don't need comparing
  let s = 0;
  while (s < x.length && s < y.length && x[s] === y[s]) s++;
  let e = 0;
  while (
    e < x.length - s &&
    e < y.length - s &&
    x[x.length - 1 - e] === y[y.length - 1 - e]
  ) {
    e++;
  }
  const xm = x.slice(s, x.length - e);
  const ym = y.slice(s, y.length - e);

  const mid: Row[] = [];
  if (xm.length * ym.length > 250000) {
    // Too big to compare line by line: show the middle as removed and added
    xm.forEach((text) => mid.push({ t: "-", text }));
    ym.forEach((text) => mid.push({ t: "+", text }));
  } else {
    const w = ym.length + 1;
    const L = new Uint16Array((xm.length + 1) * w);
    for (let i = xm.length - 1; i >= 0; i--) {
      for (let j = ym.length - 1; j >= 0; j--) {
        L[i * w + j] =
          xm[i] === ym[j]
            ? L[(i + 1) * w + j + 1] + 1
            : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < xm.length && j < ym.length) {
      if (xm[i] === ym[j]) {
        mid.push({ t: " ", text: xm[i] });
        i++;
        j++;
      } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) {
        mid.push({ t: "-", text: xm[i++] });
      } else {
        mid.push({ t: "+", text: ym[j++] });
      }
    }
    while (i < xm.length) mid.push({ t: "-", text: xm[i++] });
    while (j < ym.length) mid.push({ t: "+", text: ym[j++] });
  }

  const same = (text: string): Row => ({ t: " ", text });
  return [...x.slice(0, s).map(same), ...mid, ...x.slice(x.length - e).map(same)];
}

// Keeps changed lines plus a little context, and marks skipped stretches with a gap
function collapse(rows: Row[]): Shown[] {
  const changed = rows.map((r) => r.t !== " ");
  const near = changed.map((_, i) => {
    for (let d = -CONTEXT; d <= CONTEXT; d++) if (changed[i + d]) return true;
    return false;
  });
  const out: Shown[] = [];
  rows.forEach((r, i) => {
    if (near[i]) out.push(r);
    else if (out.length && out[out.length - 1].t !== "gap") out.push({ t: "gap" });
  });
  return out;
}

export function Diff({ before, after }: { before: string; after: string }) {
  const rows = useMemo(() => diffRows(before, after), [before, after]);
  const shown = useMemo(() => collapse(rows), [rows]);

  if (!rows.some((r) => r.t !== " ")) {
    return <p className="text-sm text-mute">The AI did not suggest any changes.</p>;
  }

  return (
    <div className="max-h-56 overflow-auto rounded-xl border border-line bg-background font-mono text-[12.5px] leading-[1.7]">
      {shown.map((r, i) =>
        r.t === "gap" ? (
          <div key={i} className="px-3 text-mute">
            ...
          </div>
        ) : (
          <div
            key={i}
            className={`flex whitespace-pre px-3 ${
              r.t === "-"
                ? "bg-red-500/10 text-red-500"
                : r.t === "+"
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "text-mute"
            }`}
          >
            <span className="w-4 shrink-0 select-none">{r.t === " " ? "" : r.t}</span>
            {r.text}
          </div>
        )
      )}
    </div>
  );
}

/* ---------- the panel ---------- */

export default function AiPanel({ view, errorText, onClose, onApply, onFix }: Props) {
  const reduce = useReducedMotion();
  const t = reduce ? 0 : 1;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // How many words of the answer are visible so far
  const text = view.status === "done" ? view.text : "";
  const total = useMemo(() => unitCount(text), [text]);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (view.status !== "done") {
      setN(0);
      return;
    }
    if (reduce) {
      setN(total);
      return;
    }
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(i);
      if (i >= total) clearInterval(id);
    }, 35);
    return () => clearInterval(id);
  }, [view.status, view.mode, text, total, reduce]);

  const finished = view.status === "done" && n >= total;
  const title = view.mode === "fix" ? "Fix with AI" : "Explain error";
  const canApply = view.mode === "fix" && view.status === "done" && !!view.fixedCode;
  const firstErrorLine = errorText.split("\n").find((l) => l.trim()) ?? "";

  async function copyFix() {
    if (!view.fixedCode) return;
    try {
      await navigator.clipboard.writeText(view.fixedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <>
      {/* Dims the terminal; clicking it closes the panel */}
      <motion.div
        className="absolute inset-x-0 bottom-0 top-[34px] z-10 rounded-xl bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 * t }}
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 z-20 flex max-h-[88%] flex-col rounded-2xl border border-line bg-panel shadow-[0_-12px_40px_rgba(0,0,0,0.25)]"
        initial={{ y: "105%" }}
        animate={{ y: 0 }}
        exit={{ y: "105%" }}
        transition={{ duration: 0.45 * t, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-3.5">
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
            <Sparkle
              size={15}
              className={view.status === "loading" ? "animate-spin" : ""}
            />
          </span>
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-mute">
            {view.fileName}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-7 w-7 place-items-center rounded-full text-mute transition hover:bg-term hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-1">
          {firstErrorLine && (
            <p className="mb-3 truncate rounded-r-lg border-l-[3px] border-red-500 bg-red-500/10 px-2.5 py-1.5 font-mono text-[12.5px] text-red-500">
              {firstErrorLine}
            </p>
          )}

          {view.status === "loading" && (
            <div className="grid gap-2 pb-2 pt-1" aria-label="Thinking">
              <span className="ai-skel" />
              <span className="ai-skel" style={{ width: "88%" }} />
              <span className="ai-skel" style={{ width: "62%" }} />
            </div>
          )}

          {view.status === "error" && <p className="text-sm text-red-500">{view.text}</p>}

          {view.status === "done" && (
            <>
              <Rich text={view.text} n={n} />
              {canApply && finished && view.sourceCode !== undefined && (
                <motion.div
                  className="mt-3"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 * t }}
                >
                  <Diff before={view.sourceCode} after={view.fixedCode ?? ""} />
                </motion.div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3.5 pt-2.5">
          <p className="max-w-[30ch] text-xs leading-snug text-mute">
            Your code and the error are sent to an AI service. AI can be wrong, so check its
            answer.
          </p>
          <div className="ml-auto flex gap-2">
            {finished && view.mode === "explain" && (
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 * t }}
                onClick={onFix}
                className="rounded-full border border-line px-4 py-1.5 text-sm transition hover:border-mute active:scale-95"
              >
                Fix it for me
              </motion.button>
            )}
            {finished && canApply && (
              <motion.div
                className="flex gap-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 * t }}
              >
                <button
                  onClick={copyFix}
                  className="rounded-full border border-line px-4 py-1.5 text-sm transition hover:border-mute active:scale-95"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={onApply}
                  className="rounded-full bg-accent px-5 py-1.5 text-sm font-semibold text-on-accent transition hover:opacity-90 active:scale-95"
                >
                  Apply fix
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}