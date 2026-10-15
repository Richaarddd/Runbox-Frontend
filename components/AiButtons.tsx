"use client";

import { motion } from "motion/react";
import Sparkle from "@/components/Sparkle";

type Props = {
  ready: boolean; // true when there is an error the AI can look at
  onExplain: () => void;
  onFix: () => void;
};

const base =
  "group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 disabled:pointer-events-none disabled:opacity-40";
const icon =
  "text-accent transition-transform duration-500 group-hover:rotate-90 group-hover:scale-110";

// A soft light that sweeps across the button once when it becomes ready
function Shine({ delay }: { delay: number }) {
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_30%,color-mix(in_srgb,var(--accent)_35%,transparent)_50%,transparent_70%)]"
      initial={{ x: "-100%" }}
      animate={{ x: "100%" }}
      transition={{ duration: 0.9, delay, ease: [0.2, 0.7, 0.2, 1] }}
    />
  );
}

export default function AiButtons({ ready, onExplain, onFix }: Props) {
  return (
    <div className="ml-auto flex items-center gap-1.5">
      <button
        onClick={onExplain}
        disabled={!ready}
        className={`${base} border-line bg-panel hover:border-accent`}
      >
        <Sparkle className={icon} />
        Explain error
        {ready && <Shine delay={0} />}
      </button>
      <button
        onClick={onFix}
        disabled={!ready}
        className={`${base} border-accent/45 bg-accent/10 hover:border-accent`}
      >
        <Sparkle className={icon} />
        Fix with AI
        {ready && <Shine delay={0.14} />}
      </button>
    </div>
  );
}