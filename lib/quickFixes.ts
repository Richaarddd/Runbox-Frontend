export type FixEdit = {
  line: number; // 1-based
  column: number; // 1-based
  endLine?: number; // leave the end values out to insert without replacing
  endColumn?: number;
  text: string;
};

export type Fix = { title: string; edits: FixEdit[] };

export type FixInput = {
  language: string; // Monaco language id: "python" | "cpp" | "java"
  message: string;
  line: number;
  column: number; // start of the squiggle
  endColumn: number; // end of the squiggle
  lines: string[]; // the whole file, one entry per line
};

const PY_KEYWORDS = [
  "for", "while", "def", "class", "import", "from", "return", "if", "elif",
  "else", "try", "except", "finally", "with", "lambda", "pass", "break",
  "continue", "print",
];

const JAVA_IMPORTS: Record<string, string> = {
  Scanner: "java.util.Scanner",
  ArrayList: "java.util.ArrayList",
  List: "java.util.List",
  HashMap: "java.util.HashMap",
  Map: "java.util.Map",
  HashSet: "java.util.HashSet",
  Set: "java.util.Set",
  Arrays: "java.util.Arrays",
  Random: "java.util.Random",
  LinkedList: "java.util.LinkedList",
  Collections: "java.util.Collections",
  Queue: "java.util.Queue",
  Stack: "java.util.Stack",
  Deque: "java.util.Deque",
};

// Edit distance that also counts swapped neighbours as one mistake ("fro" -> "for")
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function closest(word: string, options: string[]): string | null {
  if (word.length < 3) return null;
  const maxDistance = word.length <= 4 ? 1 : 2;
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const option of options) {
    const dist = distance(word.toLowerCase(), option);
    if (dist < bestDistance) {
      best = option;
      bestDistance = dist;
    }
  }
  return best;
}

// Column just after the last real character of the line (ignores trailing spaces)
const endOfCode = (text: string) => text.replace(/\s+$/, "").length + 1;

function appendToLine(title: string, lines: string[], line: number, text: string): Fix {
  return { title, edits: [{ line, column: endOfCode(lines[line - 1]), text }] };
}

// Position of the first lone "=" (not ==, <=, >=, !=, :=, +=, ...), or -1
function findSingleEquals(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "=") continue;
    const prev = text[i - 1] ?? "";
    const next = text[i + 1] ?? "";
    if ((prev && "=!<>:+-*/%&|^".includes(prev)) || next === "=") continue;
    return i;
  }
  return -1;
}

export function getFixes(input: FixInput): Fix[] {
  const { language, message, line, column, endColumn, lines } = input;
  if (line < 1 || line > lines.length) return []; // the error is out of date
  const text = lines[line - 1];
  const msg = message.toLowerCase();
  const fixes: Fix[] = [];

  // The compiler already knows the answer: "did you mean 'cout'?"
  const didYouMean = message.match(/did you mean[:\s]+['"‘“]([\w:.]+)['"’”]/i);
  if (didYouMean) {
    fixes.push({
      title: `Change to '${didYouMean[1]}'`,
      edits: [{ line, column, endColumn, text: didYouMean[1] }],
    });
  }

  if (language === "python") {
    if (msg.includes("expected ':'")) {
      fixes.push(appendToLine("Add ':' at the end of the line", lines, line, ":"));
    }

    const unclosed = message.match(/'([(\[{])' was never closed/);
    if (unclosed) {
      const close = ({ "(": ")", "[": "]", "{": "}" } as Record<string, string>)[unclosed[1]];
      fixes.push(appendToLine(`Add '${close}' at the end of the line`, lines, line, close));
    }

    if (msg.includes("unterminated string literal")) {
      const quote = text.slice(column - 1).match(/["']/)?.[0];
      if (quote) fixes.push(appendToLine(`Close the string with ${quote}`, lines, line, quote));
    }

    if (msg.includes("expected an indented block")) {
      fixes.push({ title: "Indent this line", edits: [{ line, column: 1, text: "    " }] });
    }

    if (msg.includes("missing parentheses in call to 'print'")) {
      const m = text.match(/^(\s*)print\s+(.*?)\s*$/);
      if (m) {
        fixes.push({
          title: "Add parentheses to print",
          edits: [{ line, column: 1, endColumn: text.length + 1, text: `${m[1]}print(${m[2]})` }],
        });
      }
    }

    if (msg.includes("maybe you meant '=='")) {
      const i = findSingleEquals(text);
      if (i >= 0) {
        fixes.push({
          title: "Use '==' to compare",
          edits: [{ line, column: i + 1, endColumn: i + 2, text: "==" }],
        });
      }
    }

    if (msg.includes("invalid syntax")) {
      const m = text.match(/^(\s*)([A-Za-z_]+)/);
      if (m && !PY_KEYWORDS.includes(m[2])) {
        const best = closest(m[2], PY_KEYWORDS);
        if (best) {
          fixes.push({
            title: `Change '${m[2]}' to '${best}'`,
            edits: [{ line, column: m[1].length + 1, endColumn: m[1].length + 1 + m[2].length, text: best }],
          });
        }
      }
    }
  }

  if (language === "cpp" || language === "java") {
    // g++: expected ';' before ...      javac: ';' expected
    if (msg.includes("expected ';'") || msg.includes("';' expected")) {
      fixes.push(appendToLine("Add ';' at the end of the line", lines, line, ";"));
    }

    const endOfFile =
      msg.includes("expected '}' at end of input") ||
      msg.includes("reached end of file while parsing");
    if (endOfFile) {
      const last = lines.length;
      fixes.push({
        title: "Add a closing '}'",
        edits: [{ line: last, column: lines[last - 1].length + 1, text: "\n}" }],
      });
    } else {
      const closer = (
        /expected '([)\]])'/.exec(message) ?? /'([)\]])'(?: or ',')? expected/.exec(message)
      )?.[1];
      if (closer) {
        // Put it before a trailing ";" if there is one: foo(1; -> foo(1);
        const trimmed = text.replace(/\s+$/, "");
        const col = trimmed.endsWith(";") ? trimmed.length : trimmed.length + 1;
        fixes.push({
          title: `Add '${closer}'`,
          edits: [{ line, column: col, text: closer }],
        });
      }
    }
  }

  if (language === "cpp") {
    // g++ notes: "... this is probably fixable by adding '#include <iostream>'"
    const include = message.match(/#include\s*<([\w./]+)>/);
    if (include) {
      fixes.push({
        title: `Add #include <${include[1]}>`,
        edits: [{ line: 1, column: 1, text: `#include <${include[1]}>\n` }],
      });
    }
  }

  if (language === "java") {
    // javac: "symbol:   class Scanner"
    const symbol = message.match(/symbol:\s+class\s+(\w+)/);
    const pkg = symbol ? JAVA_IMPORTS[symbol[1]] : undefined;
    if (pkg) {
      fixes.push({
        title: `Add import ${pkg}`,
        edits: [{ line: 1, column: 1, text: `import ${pkg};\n` }],
      });
    }
  }

  return fixes;
}