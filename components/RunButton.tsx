"use client";

type Props = {
  onClick: () => void;
  loading: boolean;
};

export default function RunButton({ onClick, loading }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="Run (Ctrl+Enter)"
      className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-1.5 text-sm font-semibold text-on-accent transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-on-accent" />
      )}
      {loading ? "Running..." : "▶ Run"}
    </button>
  );
}