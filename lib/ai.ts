const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:5000/ws";

// The backend's http address: NEXT_PUBLIC_API_URL if you set it, otherwise taken from the WebSocket address
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? WS_URL.replace(/^ws/, "http").replace(/\/ws$/, "")
).replace(/\/+$/, "");

export type AiRequest = {
  language: string;
  fileName: string;
  code: string;
  error: string;
};

export type AiResult = {
  explanation: string;
  fixedCode?: string; // only for "fix"
};

async function post(path: string, body: AiRequest, signal: AbortSignal): Promise<AiResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Can't reach the server. Is the backend running?");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "The AI request failed.");
  return data as AiResult;
}

export const explainError = (body: AiRequest, signal: AbortSignal) =>
  post("/ai/explain", body, signal);

export const fixCode = (body: AiRequest, signal: AbortSignal) =>
  post("/ai/fix", body, signal);