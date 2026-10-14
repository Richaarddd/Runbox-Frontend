"use client";

type Props = {
  files: string[];
  active: string;
  canAdd: boolean;
  onSelect: (name: string) => void;
  onAdd: () => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
};

export default function FileTabs({ files, active, canAdd, onSelect, onAdd, onRename, onDelete }: Props) {
  return (
    <div
      role="tablist"
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {files.map((name, i) => {
        const isActive = name === active;
        return (
          <div
            key={name}
            className={`flex shrink-0 items-center rounded-full border text-sm transition ${
              isActive ? "border-accent bg-accent text-on-accent" : "border-line hover:border-mute"
            }`}
          >
            <button
              role="tab"
              aria-selected={isActive}
              title={i === 0 ? "Main file (runs first)" : "Double-click to rename"}
              onClick={() => onSelect(name)}
              onDoubleClick={() => i > 0 && onRename(name)}
              className={`py-1 pl-3 ${i > 0 ? "pr-1.5" : "pr-3"}`}
            >
              {name}
            </button>
            {i > 0 && (
              <button
                aria-label={`Delete ${name}`}
                onClick={() => onDelete(name)}
                className="pr-2.5 opacity-60 transition hover:opacity-100"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {canAdd && (
        <button
          aria-label="New file"
          onClick={onAdd}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-base transition hover:border-mute active:scale-90"
        >
          +
        </button>
      )}
    </div>
  );
}