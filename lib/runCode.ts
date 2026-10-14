export type ServerMessage =
  | { type: "stdout" | "stderr" | "info"; data: string }
  | {
      type: "exit";
      exitCode: number | null;
      reason: "timeout" | "output" | "stopped" | "compile_error" | null;
    }
  | { type: "error"; message: string };

export type RunHandle = {
  sendInput: (data: string) => void;
  stop: () => void;
  close: () => void;
};

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:5000/ws";

export function startRun(
  language: string,
  code: string,
  handlers: { onMessage: (msg: ServerMessage) => void; onClose: () => void }
): RunHandle {
  const ws = new WebSocket(WS_URL);

  const send = (obj: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  ws.onopen = () => send({ type: "run", language, code });

  ws.onmessage = (event) => {
    try {
      handlers.onMessage(JSON.parse(event.data));
    } catch {
      // ignore malformed messages
    }
  };

  ws.onerror = () =>
    handlers.onMessage({
      type: "error",
      message: `Cannot connect to ${WS_URL}. Is the backend running?`,
    });

  ws.onclose = () => handlers.onClose();

  return {
    sendInput: (data) => send({ type: "stdin", data }),
    stop: () => send({ type: "kill" }),
    close: () => ws.close(),
  };
}