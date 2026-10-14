"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Base = { title: string; message?: string; confirmLabel?: string };

type PromptOpts = Base & {
  initial?: string;
  placeholder?: string;
  validate?: (value: string) => string | null; // return an error message or null
};
type ConfirmOpts = Base & { danger?: boolean };
type AlertOpts = Base;

type Req =
  | ({ kind: "prompt"; resolve: (v: string | null) => void } & PromptOpts)
  | ({ kind: "confirm"; resolve: (v: boolean) => void } & ConfirmOpts)
  | ({ kind: "alert"; resolve: () => void } & AlertOpts);

const btn =
  "rounded-full px-4 py-1.5 text-sm transition active:scale-95 disabled:opacity-40";

function DialogHost({ req, onDone }: { req: Req | null; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the input each time a new dialog opens
  useEffect(() => {
    if (!req) return;
    setValue(req.kind === "prompt" ? req.initial ?? "" : "");
    setError(null);
    if (req.kind === "prompt") {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [req]);

  function cancel() {
    if (!req) return;
    if (req.kind === "prompt") req.resolve(null);
    else if (req.kind === "confirm") req.resolve(false);
    else req.resolve();
    onDone();
  }

  function submit() {
    if (!req) return;
    if (req.kind === "prompt") {
      const v = value.trim();
      const err = req.validate?.(v) ?? null;
      if (err) return setError(err); // stay open and show the problem
      req.resolve(v);
    } else if (req.kind === "confirm") {
      req.resolve(true);
    } else {
      req.resolve();
    }
    onDone();
  }

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
      if (e.key === "Enter" && req.kind !== "prompt") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const danger = req?.kind === "confirm" && req.danger;

  return (
    <AnimatePresence>
      {req && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && cancel()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={req.title}
            className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 text-foreground shadow-lg"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
          >
            <h2 className="text-base font-semibold">{req.title}</h2>
            {req.message && (
              <p className="mt-1.5 text-sm text-mute">{req.message}</p>
            )}

            {req.kind === "prompt" && (
              <form
                className="mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input
                  ref={inputRef}
                  value={value}
                  placeholder={req.placeholder}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  spellCheck={false}
                  aria-invalid={!!error}
                  className={`w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent ${
                    error ? "border-red-500" : "border-line"
                  }`}
                />
                <p
                  className={`mt-1.5 min-h-[1.25rem] text-xs text-red-500 transition-opacity ${
                    error ? "opacity-100" : "opacity-0"
                  }`}
                  role="alert"
                >
                  {error}
                </p>
              </form>
            )}

            <div className={`flex justify-end gap-2 ${req.kind === "prompt" ? "mt-1" : "mt-5"}`}>
              {req.kind !== "alert" && (
                <button
                  onClick={cancel}
                  className={`${btn} border border-line hover:border-mute`}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={submit}
                className={`${btn} ${
                  danger ? "bg-red-600 text-white" : "bg-accent text-on-accent"
                }`}
              >
                {req.confirmLabel ?? (req.kind === "alert" ? "OK" : "Confirm")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useDialog() {
  const [req, setReq] = useState<Req | null>(null);

  const prompt = useCallback(
    (o: PromptOpts) =>
      new Promise<string | null>((resolve) => setReq({ kind: "prompt", resolve, ...o })),
    []
  );
  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setReq({ kind: "confirm", resolve, ...o })),
    []
  );
  const alert = useCallback(
    (o: AlertOpts) =>
      new Promise<void>((resolve) => setReq({ kind: "alert", resolve, ...o })),
    []
  );

  const element = <DialogHost req={req} onDone={() => setReq(null)} />;
  return { prompt, confirm, alert, element };
}