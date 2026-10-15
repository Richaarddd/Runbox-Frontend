import type { Diagnostic } from "@/lib/diagnostics";
import type { ProjectFile } from "@/lib/project";

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

export type FileDiagnostic = Diagnostic & { file: string }; // file = the tab's name
export type CheckHandle = { cancel: () => void };

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:5000/ws";

// Runs the project. The first file is the entry point.
export function startRun(
  language: string,
  files: ProjectFile[],
  handlers: { onMessage: (msg: ServerMessage) => void; onClose: () => void }
): RunHandle {
  const ws = new WebSocket(WS_URL);

  const send = (obj: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  ws.onopen = () => send({ type: "run", language, files });

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

// Asks the backend to syntax-check every file, without running anything.
// Each check uses its own short-lived connection, so it never collides with a running program.
export function checkProject(
  language: string,
  files: ProjectFile[],
  onResult: (diagnostics: FileDiagnostic[]) => void,
  onFail?: (message: string) => void
): CheckHandle {
  const ws = new WebSocket(WS_URL);
  let finished = false; // true once we have an answer, or when the check is cancelled

  ws.onopen = () => {
    if (finished) {
      ws.close(); // cancelled while still connecting
      return;
    }
    ws.send(JSON.stringify({ type: "check", language, files }));
  };

  ws.onmessage = (event) => {
    if (finished) return;
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "diagnostics") onResult(msg.diagnostics);
      else if (msg.type === "error") onFail?.(msg.message);
      else return;
    } catch {
      return; // ignore malformed messages
    }
    finished = true;
    ws.close();
  };

  const fail = () => {
    if (finished) return;
    finished = true;
    onFail?.("Could not check the code");
  };
  ws.onerror = fail;
  ws.onclose = fail;

  return {
    cancel: () => {
      finished = true;
      if (ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}