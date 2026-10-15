export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatRequest = {
  language: string;
  fileName: string;
  code?: string; // left out when the user unticks the file
  error?: string; // left out when the user unticks the last run
  messages: ChatMessage[];
};

// IMPORTANT: use the same address expression that lib/ai.ts uses.
// Open lib/ai.ts, find where it builds the request address, and copy that here.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

// Sends the conversation and calls onToken with each piece of the answer as it arrives
export async function streamChat(
  request: ChatRequest,
  signal: AbortSignal,
  onToken: (text: string) => void
): Promise<void> {
  const res = await fetch(`${API_URL}/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = "Something went wrong.";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    // The server sends one event per blank line: data: {"t":"..."}
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const line = event.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;

      let msg: { t?: string; done?: boolean; error?: string };
      try {
        msg = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (msg.error) throw new Error(msg.error);
      if (msg.t) onToken(msg.t);
      if (msg.done) return;
    }
  }
}