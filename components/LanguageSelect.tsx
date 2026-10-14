"use client";

import { LANGUAGES } from "@/constants/defaultCode";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function LanguageSelect({ value, onChange }: Props) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Language"
        className="cursor-pointer appearance-none rounded-full border border-line bg-panel py-1.5 pl-4 pr-9 text-sm text-foreground outline-none transition hover:border-mute focus-visible:border-accent"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.id} value={lang.id}>
            {lang.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 10 6"
        className="pointer-events-none absolute right-3.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-mute"
      >
        <path
          d="M1 1l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}