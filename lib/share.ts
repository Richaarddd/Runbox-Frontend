import type { ProjectFile } from "@/lib/project";

const MAX_DECODED_BYTES = 100 * 1024;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// "python.<compressed code>" - small enough to fit in a link.
// One file keeps the old format (plain code), several files use a JSON wrapper.
export async function encodeShare(language: string, files: ProjectFile[]): Promise<string> {
  const text = files.length === 1 ? files[0].code : JSON.stringify({ v: 2, files });
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `${language}.${toBase64Url(bytes)}`;
}

// Returns null for anything broken or suspiciously large.
// `files` is untrusted: the caller must pass it through sanitizeFiles.
export async function decodeShare(
  payload: string
): Promise<{ language: string; code: string; files?: unknown } | null> {
  try {
    const dot = payload.indexOf(".");
    if (dot < 1) return null;
    const language = payload.slice(0, dot);
    const bytes = fromBase64Url(payload.slice(dot + 1));

    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_DECODED_BYTES) {
        await reader.cancel(); // guards against a tiny link that expands hugely
        return null;
      }
      chunks.push(value);
    }

    const all = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }

    const text = new TextDecoder().decode(all);
    if (text.startsWith('{"v":2')) {
      return { language, code: "", files: JSON.parse(text).files };
    }
    return { language, code: text };
  } catch {
    return null;
  }
}