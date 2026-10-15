export type Diagnostic = {
  line: number; // 1-based
  column: number; // 1-based
  endLine?: number; // optional: if omitted, the editor underlines the word at line/column
  endColumn?: number;
  severity: "error" | "warning";
  message: string;
};