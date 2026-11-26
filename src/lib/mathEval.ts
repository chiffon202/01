// ============================================================================
// Safe Arithmetic Expression Evaluator (No eval / Function)
// Supports +, -, *, /, parentheses (), decimals, commas, ×, ÷
// ============================================================================

export interface MathEvalSuccess {
  ok: true;
  value: number;
  isFormula: boolean;
  normalizedExpr: string;
}

export interface MathEvalFailure {
  ok: false;
  error: string;
}

export type MathEvalResult = MathEvalSuccess | MathEvalFailure;

type Token =
  | { kind: "num"; value: number }
  | { kind: "op"; op: "+" | "-" | "*" | "/" }
  | { kind: "paren"; paren: "(" | ")" };

export function roundAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeMathInput(raw: string): string {
  return raw
    .trim()
    .replaceAll(",", "")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replace(/[xX]/g, "*")
    .replace(/\s+/g, "");
}

export function hasMathOperator(raw: string): boolean {
  const norm = normalizeMathInput(raw);
  if (!norm) return false;
  // Strip a single leading '+' if any, then check if any operator or paren remains
  const body = norm.startsWith("+") ? norm.slice(1) : norm;
  return /[+\-*/()]/.test(body);
}

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let numStr = "";
      let dotCount = 0;
      while (
        i < expr.length &&
        ((expr[i] >= "0" && expr[i] <= "9") || expr[i] === ".")
      ) {
        if (expr[i] === ".") {
          dotCount += 1;
          if (dotCount > 1) return null;
        }
        numStr += expr[i];
        i += 1;
      }
      if (numStr === ".") return null;
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) return null;
      tokens.push({ kind: "num", value: parsed });
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", op: ch });
      i += 1;
      continue;
    }

    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", paren: ch });
      i += 1;
      continue;
    }

    return null;
  }

  return tokens;
}

/**
 * Evaluates a math expression safely using recursive-descent parsing.
 * Grammar:
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/') unary)*
 *   unary  := ('+' | '-') unary | primary
 *   primary := NUMBER | '(' expr ')'
 */
export function evaluateMathExpression(raw: string): MathEvalResult {
  const normalizedExpr = normalizeMathInput(raw);
  if (!normalizedExpr) {
    return { ok: false, error: "กรุณากรอกจำนวนเงิน" };
  }

  const tokens = tokenize(normalizedExpr);
  if (!tokens || tokens.length === 0) {
    return { ok: false, error: "รูปแบบตัวเลขหรือสูตรไม่ถูกต้อง" };
  }

  let pos = 0;

  function peek(): Token | undefined {
    return tokens![pos];
  }

  function consume(): Token {
    const tok = tokens![pos];
    pos += 1;
    return tok;
  }

  function parseExpr(): number {
    let left = parseTerm();
    while (true) {
      const tok = peek();
      if (tok && tok.kind === "op" && (tok.op === "+" || tok.op === "-")) {
        consume();
        const right = parseTerm();
        left = tok.op === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseUnary();
    while (true) {
      const tok = peek();
      if (tok && tok.kind === "op" && (tok.op === "*" || tok.op === "/")) {
        consume();
        const right = parseUnary();
        if (tok.op === "/") {
          if (right === 0) {
            throw new Error("DIV_ZERO");
          }
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  }

  function parseUnary(): number {
    const tok = peek();
    if (tok && tok.kind === "op" && (tok.op === "+" || tok.op === "-")) {
      consume();
      const val = parseUnary();
      return tok.op === "-" ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const tok = peek();
    if (!tok) throw new Error("UNEXPECTED_END");

    if (tok.kind === "num") {
      consume();
      return tok.value;
    }

    if (tok.kind === "paren" && tok.paren === "(") {
      consume();
      const val = parseExpr();
      const closing = peek();
      if (!closing || closing.kind !== "paren" || closing.paren !== ")") {
        throw new Error("UNCLOSED_PAREN");
      }
      consume();
      return val;
    }

    throw new Error("SYNTAX");
  }

  try {
    const result = parseExpr();
    if (pos !== tokens.length) {
      return { ok: false, error: "สูตรคำนวณไม่สมบูรณ์" };
    }
    if (!Number.isFinite(result)) {
      return { ok: false, error: "ผลลัพธ์คำนวณไม่ถูกต้อง" };
    }
    return {
      ok: true,
      value: roundAmount(result),
      isFormula: hasMathOperator(raw),
      normalizedExpr,
    };
  } catch (err) {
    if (err instanceof Error && err.message === "DIV_ZERO") {
      return { ok: false, error: "ห้ามหารด้วย 0" };
    }
    if (err instanceof Error && err.message === "UNCLOSED_PAREN") {
      return { ok: false, error: "วงเล็บยังไม่ปิดครบ" };
    }
    return { ok: false, error: "สูตรคำนวณไม่สมบูรณ์" };
  }
}
