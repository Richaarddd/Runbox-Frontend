"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const DEMOS = [
  {
    file: "main.py",
    code: 'name = input("Name: ")\nprint(f"Hello, {name}!")',
    out: "Name: Ada\nHello, Ada!",
  },
  {
    file: "Main.java",
    code: 'Scanner in = new Scanner(System.in);\nSystem.out.print("Name: ");\nString name = in.nextLine();\nSystem.out.println("Hello, " + name + "!");',
    out: "Name: Ada\nHello, Ada!",
  },
  {
    file: "main.cpp",
    code: 'std::string name;\nstd::cout << "Name: ";\nstd::getline(std::cin, name);\nstd::cout << "Hello, " << name << "!\\n";',
    out: "Name: Ada\nHello, Ada!",
  },
];

export default function Landing({
  onOpen,
  paused,
}: {
  onOpen: (rect: DOMRect, radius?: number) => void;
  paused: boolean;
}) {
  const winRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [output, setOutput] = useState(false);
  const [hit, setHit] = useState(false);
  const [pulse, setPulse] = useState(0);
  const reduce = useReducedMotion();
  const demo = DEMOS[idx % DEMOS.length];

  // The demo loops forever: type, run, show output, then the next language
  useEffect(() => {
    if (paused) return;
    setTyped(0);
    setOutput(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };
    let i = 0;
    const type = () => {
      i++;
      setTyped(i);
      if (i < demo.code.length) {
        later(type, 38);
      } else {
        later(() => {
          setHit(true);
          later(() => setHit(false), 400);
          later(() => {
            setOutput(true);
            later(() => setIdx((n) => n + 1), 3200);
          }, 500);
        }, 500);
      }
    };
    later(type, 700);
    return () => timers.forEach(clearTimeout);
  }, [idx, paused, demo.code.length]);

  // Clicking the demo window: the editor grows out of the window
  function open() {
    if (winRef.current) onOpen(winRef.current.getBoundingClientRect(), 16);
  }

  // Clicking the button: it presses in, a ring pulses out,
  // then the editor grows out of the button itself
  function openFromButton() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (reduce) return onOpen(rect, rect.height / 2);
    setPulse((n) => n + 1);
    setTimeout(() => onOpen(rect, rect.height / 2), 160);
  }

  return (
    <div className="mx-auto w-full max-w-[1040px] px-6 pb-16 pt-7">
      <span className="text-xl font-bold tracking-tight">Runbox</span>

      <h1 className="mb-5 mt-[12vh] max-w-[12ch] text-[clamp(2.5rem,8vw,5.5rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
        Write it. Run it. Right here.
      </h1>
      <p className="mb-10 max-w-[34ch] text-[clamp(1.05rem,2.2vw,1.3rem)] leading-snug text-mute">
        Python, C++ and Java in your browser. Nothing to install.
      </p>

      <motion.button
        ref={btnRef}
        onClick={openFromButton}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="relative isolate rounded-full bg-foreground px-6 py-3.5 font-semibold text-background"
      >
        {pulse > 0 && (
          <motion.span
            key={pulse}
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-foreground"
            initial={{ scale: 1, opacity: 0.35 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        )}
        Open editor
      </motion.button>

      <div
        ref={winRef}
        role="button"
        tabIndex={0}
        aria-label="Open the editor"
        onClick={open}
        onKeyDown={(e) => e.key === "Enter" && open()}
        className="mt-16 cursor-pointer overflow-hidden rounded-2xl border border-line bg-panel"
      >
        <div className="flex justify-between border-b border-line px-[18px] py-3 text-sm text-mute">
          <span>{demo.file}</span>
          <span className={`transition duration-300 ${hit ? "scale-110 text-accent" : ""}`}>
            Run
          </span>
        </div>
        <pre className="m-0 min-h-[6.5em] whitespace-pre-wrap px-[22px] py-[18px] font-mono text-sm leading-[1.7]">
          {demo.code.slice(0, typed)}
          <span className="inline-block h-[1.1em] w-0.5 animate-blink bg-accent align-text-bottom" />
        </pre>
        <pre className="m-0 min-h-[6.5em] whitespace-pre-wrap bg-term px-[22px] py-[18px] font-mono text-sm leading-[1.7]">
          {output && (
            <>
              {demo.out}
              {"\n"}
              <span className="text-term-mute">exited with code 0</span>
            </>
          )}
        </pre>
      </div>
    </div>
  );
}