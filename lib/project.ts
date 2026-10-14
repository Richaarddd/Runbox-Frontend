export type ProjectFile = { name: string; code: string };
export type Project = { files: ProjectFile[]; active: string };

export const MAX_FILES = 8;
export const MAX_FILE_LENGTH = 20000;

const keyProject = (lang: string) => `compiler:project:${lang}`;
const keyOldCode = (lang: string) => `compiler:code:${lang}`; // before tabs existed

export function defaultProject(mainName: string, starter: string): Project {
  return { files: [{ name: mainName, code: starter }], active: mainName };
}

export function loadProject(lang: string, mainName: string, starter: string): Project {
  try {
    const raw = localStorage.getItem(keyProject(lang));
    if (raw) {
      const p = JSON.parse(raw);
      const ok =
        Array.isArray(p.files) &&
        p.files.length > 0 &&
        p.files.every(
          (f: ProjectFile) => typeof f?.name === "string" && typeof f?.code === "string"
        );
      if (ok) {
        const files: ProjectFile[] = p.files.slice(0, MAX_FILES);
        const active = files.some((f) => f.name === p.active) ? p.active : files[0].name;
        return { files, active };
      }
    }
    const old = localStorage.getItem(keyOldCode(lang)); // migrate single-file code
    if (old !== null) return defaultProject(mainName, old);
  } catch {}
  return defaultProject(mainName, starter);
}

export function saveProject(lang: string, project: Project) {
  try {
    localStorage.setItem(keyProject(lang), JSON.stringify(project));
  } catch {}
}

// Returns an error message, or null when the name is fine
export function validateName(name: string, existing: string[], exts: string[]): string | null {
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(name))
    return "Use only letters, numbers, _ . and - (max 40 characters).";
  if (!exts.some((x) => name.toLowerCase().endsWith(x)))
    return `The file name must end with ${exts.join(", ")}.`;
  if (existing.some((n) => n.toLowerCase() === name.toLowerCase()))
    return "A file with that name already exists.";
  return null;
}

// For untrusted input such as share links
export function sanitizeFiles(files: unknown, exts: string[]): ProjectFile[] | null {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) return null;
  const out: ProjectFile[] = [];
  for (const f of files) {
    if (typeof f?.name !== "string" || typeof f?.code !== "string") return null;
    if (f.code.length > MAX_FILE_LENGTH) return null;
    if (validateName(f.name, out.map((o) => o.name), exts)) return null;
    out.push({ name: f.name, code: f.code });
  }
  return out;
}