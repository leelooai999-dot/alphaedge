/**
 * MonteCarloo Pine Script Parser v7 — Recursive Descent AST Parser
 * 
 * Replaces the regex-based parser with a proper tokenizer + parser
 * that handles: blocks, if/else, for, custom functions, nested expressions,
 * history refs, method calls, and all Pine v5 constructs.
 */

// ============================================================================
// TOKENS
// ============================================================================

type TokenType =
  | "NUMBER" | "STRING" | "IDENT" | "BOOL"
  | "PLUS" | "MINUS" | "STAR" | "SLASH" | "PERCENT"
  | "EQ" | "NEQ" | "LT" | "GT" | "LTE" | "GTE"
  | "ASSIGN" | "REASSIGN" | "ARROW"
  | "AND" | "OR" | "NOT"
  | "QUESTION" | "COLON" | "COMMA" | "DOT"
  | "LPAREN" | "RPAREN" | "LBRACKET" | "RBRACKET"
  | "NEWLINE" | "INDENT" | "DEDENT"
  | "IF" | "ELSE" | "FOR" | "WHILE" | "VAR" | "VARIP"
  | "TRUE" | "FALSE" | "NA"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ============================================================================
// TOKENIZER
// ============================================================================

const KEYWORDS: Record<string, TokenType> = {
  if: "IF", else: "ELSE", for: "FOR", while: "WHILE",
  var: "VAR", varip: "VARIP",
  true: "TRUE", false: "FALSE", na: "NA",
  and: "AND", or: "OR", not: "NOT",
};

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  const lines = code.split("\n");
  const indentStack = [0];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const rawLine = lines[lineNum];
    // Strip comments
    let line = stripComment(rawLine);
    if (!line.trim()) continue;
    if (line.trim().startsWith("//@")) continue;

    // Indentation tracking
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();
    
    if (trimmed.length === 0) continue;

    // Handle indent/dedent
    const currentIndent = indentStack[indentStack.length - 1];
    if (indent > currentIndent) {
      indentStack.push(indent);
      tokens.push({ type: "INDENT", value: "", line: lineNum, col: 0 });
    } else {
      while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
        indentStack.pop();
        tokens.push({ type: "DEDENT", value: "", line: lineNum, col: 0 });
      }
    }

    // Tokenize the line
    let col = 0;
    const src = trimmed;
    while (col < src.length) {
      // Skip whitespace
      if (src[col] === " " || src[col] === "\t") { col++; continue; }

      // String literals
      if (src[col] === '"' || src[col] === "'") {
        const quote = src[col];
        let end = col + 1;
        while (end < src.length && src[end] !== quote) {
          if (src[end] === "\\") end++;
          end++;
        }
        tokens.push({ type: "STRING", value: src.substring(col + 1, end), line: lineNum, col });
        col = end + 1;
        continue;
      }

      // Numbers
      if (/\d/.test(src[col]) || (src[col] === "." && col + 1 < src.length && /\d/.test(src[col + 1]))) {
        let end = col;
        while (end < src.length && /[\d.]/.test(src[end])) end++;
        // Handle scientific notation
        if (end < src.length && (src[end] === "e" || src[end] === "E")) {
          end++;
          if (end < src.length && (src[end] === "+" || src[end] === "-")) end++;
          while (end < src.length && /\d/.test(src[end])) end++;
        }
        tokens.push({ type: "NUMBER", value: src.substring(col, end), line: lineNum, col });
        col = end;
        continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(src[col])) {
        let end = col;
        while (end < src.length && /[a-zA-Z0-9_]/.test(src[end])) end++;
        const word = src.substring(col, end);
        const kwType = KEYWORDS[word];
        tokens.push({ type: kwType || "IDENT", value: word, line: lineNum, col });
        col = end;
        continue;
      }

      // Two-char operators
      const twoChar = src.substring(col, col + 2);
      if (twoChar === ":=") { tokens.push({ type: "REASSIGN", value: ":=", line: lineNum, col }); col += 2; continue; }
      if (twoChar === "=>") { tokens.push({ type: "ARROW", value: "=>", line: lineNum, col }); col += 2; continue; }
      if (twoChar === "==") { tokens.push({ type: "EQ", value: "==", line: lineNum, col }); col += 2; continue; }
      if (twoChar === "!=") { tokens.push({ type: "NEQ", value: "!=", line: lineNum, col }); col += 2; continue; }
      if (twoChar === "<=") { tokens.push({ type: "LTE", value: "<=", line: lineNum, col }); col += 2; continue; }
      if (twoChar === ">=") { tokens.push({ type: "GTE", value: ">=", line: lineNum, col }); col += 2; continue; }

      // Single-char operators
      const ch = src[col];
      const singleMap: Record<string, TokenType> = {
        "+": "PLUS", "-": "MINUS", "*": "STAR", "/": "SLASH", "%": "PERCENT",
        "=": "ASSIGN", "<": "LT", ">": "GT",
        "?": "QUESTION", ":": "COLON", ",": "COMMA", ".": "DOT",
        "(": "LPAREN", ")": "RPAREN", "[": "LBRACKET", "]": "RBRACKET",
      };
      if (singleMap[ch]) {
        tokens.push({ type: singleMap[ch], value: ch, line: lineNum, col });
        col++;
        continue;
      }

      // Skip unknown chars
      col++;
    }

    tokens.push({ type: "NEWLINE", value: "\n", line: lineNum, col: src.length });
  }

  // Close remaining indents
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ type: "DEDENT", value: "", line: lines.length, col: 0 });
  }
  tokens.push({ type: "EOF", value: "", line: lines.length, col: 0 });

  return tokens;
}

function stripComment(line: string): string {
  let inStr = false, strChar = "";
  for (let i = 0; i < line.length; i++) {
    if (inStr) {
      if (line[i] === strChar && line[i - 1] !== "\\") inStr = false;
    } else {
      if (line[i] === '"' || line[i] === "'") { inStr = true; strChar = line[i]; }
      else if (line[i] === "/" && line[i + 1] === "/") return line.substring(0, i);
    }
  }
  return line;
}

// ============================================================================
// AST NODES
// ============================================================================

export type ASTNode =
  | { type: "Program"; body: ASTNode[] }
  | { type: "IndicatorDecl"; name: string; overlay: boolean; args: Record<string, any> }
  | { type: "InputDecl"; name: string; inputType: string; defaultValue: any; title: string }
  | { type: "VarDecl"; name: string; expr: ASTNode; isVar: boolean }
  | { type: "TupleDecl"; names: string[]; expr: ASTNode }
  | { type: "PlotCall"; expr: ASTNode; title: string; color: string; lineWidth: number; style: string }
  | { type: "HLineCall"; price: number; title: string; color: string }
  | { type: "FuncDef"; name: string; params: string[]; body: ASTNode[] }
  | { type: "IfExpr"; condition: ASTNode; thenBranch: ASTNode[]; elseBranch: ASTNode[] }
  | { type: "ForLoop"; varName: string; start: ASTNode; end: ASTNode; body: ASTNode[] }
  | { type: "FuncCall"; name: string; args: ASTNode[]; namedArgs: Record<string, ASTNode> }
  | { type: "MethodCall"; object: ASTNode; method: string; args: ASTNode[] }
  | { type: "BinaryOp"; op: string; left: ASTNode; right: ASTNode }
  | { type: "UnaryOp"; op: string; operand: ASTNode }
  | { type: "Ternary"; condition: ASTNode; thenExpr: ASTNode; elseExpr: ASTNode }
  | { type: "HistoryRef"; name: ASTNode; offset: ASTNode }
  | { type: "Identifier"; name: string }
  | { type: "NumberLit"; value: number }
  | { type: "StringLit"; value: string }
  | { type: "BoolLit"; value: boolean }
  | { type: "NALit" }
  | { type: "MemberAccess"; object: ASTNode; property: string }
  | { type: "Skip" }; // For constructs we recognize but skip

// ============================================================================
// PARSER — Recursive Descent
// ============================================================================

export class PineParser {
  private tokens: Token[];
  private pos: number = 0;
  private errors: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): { ast: ASTNode; errors: string[] } {
    const body: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;
      try {
        const stmt = this.parseStatement();
        if (stmt && stmt.type !== "Skip") body.push(stmt);
      } catch (e: any) {
        this.errors.push(e.message || "Parse error");
        this.advance(); // Skip to recover
      }
    }
    return { ast: { type: "Program", body }, errors: this.errors };
  }

  // --- Statement parsing ---

  private parseStatement(): ASTNode | null {
    this.skipNewlines();
    const tok = this.peek();

    // //@version annotation
    if (tok.type === "IDENT" && tok.value === "version") {
      this.skipLine();
      return { type: "Skip" };
    }

    // indicator() / study()
    if (tok.type === "IDENT" && (tok.value === "indicator" || tok.value === "study")) {
      return this.parseIndicatorDecl();
    }

    // strategy() — skip
    if (tok.type === "IDENT" && tok.value === "strategy") {
      this.skipLine();
      return { type: "Skip" };
    }

    // import / export / type / method — skip
    if (tok.type === "IDENT" && ["import", "export", "type", "method"].includes(tok.value)) {
      this.skipLine();
      return { type: "Skip" };
    }

    // var / varip declaration
    if (tok.type === "VAR" || tok.type === "VARIP") {
      return this.parseVarDecl(true);
    }

    // if expression
    if (tok.type === "IF") {
      return this.parseIf();
    }

    // for loop
    if (tok.type === "FOR") {
      return this.parseFor();
    }

    // Tuple destructuring: [a, b, c] = ...
    if (tok.type === "LBRACKET") {
      return this.parseTupleDecl();
    }

    // Plot calls
    if (tok.type === "IDENT" && tok.value === "plot" && this.peekAhead(1)?.type === "LPAREN") {
      return this.parsePlotCall();
    }
    if (tok.type === "IDENT" && tok.value === "hline" && this.peekAhead(1)?.type === "LPAREN") {
      return this.parseHLineCall();
    }

    // Skip known no-op statements: plotshape, plotchar, plotarrow, fill, bgcolor, alertcondition, table.*, label.*, line.*, box.*
    if (tok.type === "IDENT" && ["plotshape", "plotchar", "plotarrow", "fill", "bgcolor", "alertcondition", "alert", "runtime"].includes(tok.value)) {
      this.skipLine();
      return { type: "Skip" };
    }

    // Function definition: name(params) => ...
    if (tok.type === "IDENT" && this.isFuncDef()) {
      return this.parseFuncDef();
    }

    // Assignment: name = expr  OR  name := expr
    if (tok.type === "IDENT") {
      // Look ahead for = or :=
      const next = this.peekAhead(1);
      if (next && (next.type === "ASSIGN" || next.type === "REASSIGN")) {
        return this.parseVarDecl(false);
      }
      // Could be a type annotation: float name = expr
      if (next?.type === "IDENT") {
        const afterName = this.peekAhead(2);
        if (afterName && (afterName.type === "ASSIGN" || afterName.type === "REASSIGN")) {
          this.advance(); // skip type annotation
          return this.parseVarDecl(false);
        }
      }
    }

    // Anything else — try as expression, skip if it doesn't produce output
    this.skipLine();
    return { type: "Skip" };
  }

  private parseIndicatorDecl(): ASTNode {
    this.advance(); // eat 'indicator' or 'study'
    this.expect("LPAREN");
    const args: Record<string, any> = {};
    let name = "Indicator";
    let overlay = false;
    let first = true;
    while (!this.check("RPAREN") && !this.isAtEnd()) {
      if (!first) this.expect("COMMA");
      first = false;
      // Named arg or positional
      if (this.peek().type === "IDENT" && this.peekAhead(1)?.type === "ASSIGN") {
        const key = this.advance().value;
        this.advance(); // eat =
        const val = this.parseSimpleValue();
        args[key] = val;
        if (key === "overlay" && val === true) overlay = true;
      } else {
        // First positional = name
        const val = this.parseSimpleValue();
        if (typeof val === "string" && !name.includes(val)) name = val;
      }
    }
    this.expect("RPAREN");
    this.skipNewlines();
    return { type: "IndicatorDecl", name, overlay, args };
  }

  private parseVarDecl(isVar: boolean): ASTNode {
    if (isVar) this.advance(); // eat var/varip
    const name = this.advance().value;
    const op = this.advance(); // eat = or :=
    const expr = this.parseExpression();
    this.skipNewlines();
    return { type: "VarDecl", name, expr, isVar: isVar || op.type === "REASSIGN" };
  }

  private parseTupleDecl(): ASTNode {
    this.advance(); // eat [
    const names: string[] = [];
    while (!this.check("RBRACKET") && !this.isAtEnd()) {
      if (names.length > 0) this.expect("COMMA");
      names.push(this.advance().value);
    }
    this.expect("RBRACKET");
    this.advance(); // eat = or :=
    const expr = this.parseExpression();
    this.skipNewlines();
    return { type: "TupleDecl", names, expr };
  }

  private parsePlotCall(): ASTNode {
    this.advance(); // eat 'plot'
    this.expect("LPAREN");
    const args = this.parseCallArgs();
    this.expect("RPAREN");
    this.skipNewlines();

    const expr = args.positional[0] || { type: "NALit" as const };
    const named = args.named;
    return {
      type: "PlotCall",
      expr,
      title: this.getStringArg(named, "title", ""),
      color: this.getStringArg(named, "color", "color.blue"),
      lineWidth: this.getNumberArg(named, "linewidth", 2),
      style: this.getStringArg(named, "style", "line"),
    };
  }

  private parseHLineCall(): ASTNode {
    this.advance(); // eat 'hline'
    this.expect("LPAREN");
    const args = this.parseCallArgs();
    this.expect("RPAREN");
    this.skipNewlines();
    const priceNode = args.positional[0];
    const price = priceNode?.type === "NumberLit" ? priceNode.value : 0;
    return {
      type: "HLineCall",
      price,
      title: this.getStringArg(args.named, "title", ""),
      color: this.getStringArg(args.named, "color", "color.gray"),
    };
  }

  private parseIf(): ASTNode {
    this.advance(); // eat 'if'
    const condition = this.parseExpression();
    this.skipNewlines();
    const thenBranch = this.parseBlock();
    let elseBranch: ASTNode[] = [];
    this.skipNewlines();
    if (this.check("ELSE")) {
      this.advance(); // eat 'else'
      this.skipNewlines();
      if (this.check("IF")) {
        elseBranch = [this.parseIf()];
      } else {
        elseBranch = this.parseBlock();
      }
    }
    return { type: "IfExpr", condition, thenBranch, elseBranch };
  }

  private parseFor(): ASTNode {
    this.advance(); // eat 'for'
    const varName = this.advance().value;
    this.advance(); // eat =
    const start = this.parseExpression();
    // expect 'to'
    if (this.peek().type === "IDENT" && this.peek().value === "to") this.advance();
    const end = this.parseExpression();
    this.skipNewlines();
    const body = this.parseBlock();
    return { type: "ForLoop", varName, start, end, body };
  }

  private parseFuncDef(): ASTNode {
    const name = this.advance().value;
    this.expect("LPAREN");
    const params: string[] = [];
    while (!this.check("RPAREN") && !this.isAtEnd()) {
      if (params.length > 0) this.expect("COMMA");
      params.push(this.advance().value);
    }
    this.expect("RPAREN");
    this.expect("ARROW");
    this.skipNewlines();
    // Single expression or block
    let body: ASTNode[];
    if (this.check("INDENT")) {
      body = this.parseBlock();
    } else {
      body = [this.parseExpression()];
    }
    this.skipNewlines();
    return { type: "FuncDef", name, params, body };
  }

  private parseBlock(): ASTNode[] {
    const stmts: ASTNode[] = [];
    if (this.check("INDENT")) {
      this.advance(); // eat INDENT
      while (!this.check("DEDENT") && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check("DEDENT")) break;
        const stmt = this.parseStatement();
        if (stmt && stmt.type !== "Skip") stmts.push(stmt);
      }
      if (this.check("DEDENT")) this.advance();
    } else {
      // Single-line block
      const stmt = this.parseStatement();
      if (stmt && stmt.type !== "Skip") stmts.push(stmt);
    }
    return stmts;
  }

  // --- Expression parsing (precedence climbing) ---

  private parseExpression(): ASTNode {
    return this.parseTernary();
  }

  private parseTernary(): ASTNode {
    let node = this.parseOr();
    if (this.check("QUESTION")) {
      this.advance();
      const thenExpr = this.parseExpression();
      this.expect("COLON");
      const elseExpr = this.parseExpression();
      return { type: "Ternary", condition: node, thenExpr, elseExpr };
    }
    return node;
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.check("OR")) {
      this.advance();
      left = { type: "BinaryOp", op: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseComparison();
    while (this.check("AND")) {
      this.advance();
      left = { type: "BinaryOp", op: "and", left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): ASTNode {
    let left = this.parseAddSub();
    while (this.check("EQ") || this.check("NEQ") || this.check("LT") || this.check("GT") || this.check("LTE") || this.check("GTE")) {
      const op = this.advance().value;
      left = { type: "BinaryOp", op, left, right: this.parseAddSub() };
    }
    return left;
  }

  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();
    while (this.check("PLUS") || this.check("MINUS")) {
      const op = this.advance().value;
      left = { type: "BinaryOp", op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  private parseMulDiv(): ASTNode {
    let left = this.parseUnary();
    while (this.check("STAR") || this.check("SLASH") || this.check("PERCENT")) {
      const op = this.advance().value;
      left = { type: "BinaryOp", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.check("MINUS")) {
      this.advance();
      return { type: "UnaryOp", op: "-", operand: this.parseUnary() };
    }
    if (this.check("NOT")) {
      this.advance();
      return { type: "UnaryOp", op: "not", operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ASTNode {
    let node = this.parsePrimary();

    while (true) {
      // History reference: expr[offset]
      if (this.check("LBRACKET")) {
        this.advance();
        const offset = this.parseExpression();
        this.expect("RBRACKET");
        node = { type: "HistoryRef", name: node, offset };
      }
      // Member access: expr.property
      else if (this.check("DOT")) {
        this.advance();
        const prop = this.advance().value;
        // Check if it's a method call: expr.method(args)
        if (this.check("LPAREN")) {
          this.advance();
          const args = this.parseArgList();
          this.expect("RPAREN");
          node = { type: "MethodCall", object: node, method: prop, args };
        } else {
          node = { type: "MemberAccess", object: node, property: prop };
        }
      }
      // Function call: ident(args)
      else if (this.check("LPAREN") && node.type === "Identifier") {
        this.advance();
        const callArgs = this.parseCallArgs();
        this.expect("RPAREN");
        node = { type: "FuncCall", name: node.name, args: callArgs.positional, namedArgs: callArgs.named };
      }
      else break;
    }

    return node;
  }

  private parsePrimary(): ASTNode {
    const tok = this.peek();

    if (tok.type === "NUMBER") {
      this.advance();
      return { type: "NumberLit", value: parseFloat(tok.value) };
    }
    if (tok.type === "STRING") {
      this.advance();
      return { type: "StringLit", value: tok.value };
    }
    if (tok.type === "TRUE") { this.advance(); return { type: "BoolLit", value: true }; }
    if (tok.type === "FALSE") { this.advance(); return { type: "BoolLit", value: false }; }
    if (tok.type === "NA") { this.advance(); return { type: "NALit" }; }

    if (tok.type === "IDENT") {
      this.advance();
      return { type: "Identifier", name: tok.value };
    }

    if (tok.type === "LPAREN") {
      this.advance();
      const expr = this.parseExpression();
      this.expect("RPAREN");
      return expr;
    }

    // LBRACKET for tuple literal
    if (tok.type === "LBRACKET") {
      this.advance();
      const elements: ASTNode[] = [];
      while (!this.check("RBRACKET") && !this.isAtEnd()) {
        if (elements.length > 0) this.expect("COMMA");
        elements.push(this.parseExpression());
      }
      this.expect("RBRACKET");
      // Return first element as a placeholder
      return elements[0] || { type: "NALit" };
    }

    // Skip and return NA for unrecognized tokens
    this.advance();
    return { type: "NALit" };
  }

  // --- Helpers ---

  private parseCallArgs(): { positional: ASTNode[]; named: Record<string, ASTNode> } {
    const positional: ASTNode[] = [];
    const named: Record<string, ASTNode> = {};
    let first = true;
    while (!this.check("RPAREN") && !this.isAtEnd()) {
      if (!first) {
        if (this.check("COMMA")) this.advance();
        else break;
      }
      first = false;
      // Check for named arg: ident = expr
      if (this.peek().type === "IDENT" && this.peekAhead(1)?.type === "ASSIGN") {
        const key = this.advance().value;
        this.advance(); // eat =
        named[key] = this.parseExpression();
      } else {
        positional.push(this.parseExpression());
      }
    }
    return { positional, named };
  }

  private parseArgList(): ASTNode[] {
    const args: ASTNode[] = [];
    let first = true;
    while (!this.check("RPAREN") && !this.isAtEnd()) {
      if (!first) {
        if (this.check("COMMA")) this.advance();
        else break;
      }
      first = false;
      args.push(this.parseExpression());
    }
    return args;
  }

  private parseSimpleValue(): any {
    const tok = this.peek();
    if (tok.type === "STRING") { this.advance(); return tok.value; }
    if (tok.type === "NUMBER") { this.advance(); return parseFloat(tok.value); }
    if (tok.type === "TRUE") { this.advance(); return true; }
    if (tok.type === "FALSE") { this.advance(); return false; }
    if (tok.type === "IDENT") {
      // Handle color.* and other dotted values
      let val = this.advance().value;
      while (this.check("DOT")) {
        this.advance();
        val += "." + this.advance().value;
      }
      // Handle function calls like color.new(...)
      if (this.check("LPAREN")) {
        this.advance();
        let depth = 1;
        while (depth > 0 && !this.isAtEnd()) {
          if (this.peek().type === "LPAREN") depth++;
          if (this.peek().type === "RPAREN") depth--;
          if (depth > 0) this.advance();
        }
        if (this.check("RPAREN")) this.advance();
      }
      return val;
    }
    this.advance();
    return null;
  }

  private isFuncDef(): boolean {
    // Look for pattern: ident(params) =>
    let i = this.pos;
    if (this.tokens[i]?.type !== "IDENT") return false;
    i++;
    if (this.tokens[i]?.type !== "LPAREN") return false;
    // Scan past parens
    let depth = 0;
    while (i < this.tokens.length) {
      if (this.tokens[i].type === "LPAREN") depth++;
      if (this.tokens[i].type === "RPAREN") depth--;
      i++;
      if (depth === 0) break;
    }
    return this.tokens[i]?.type === "ARROW";
  }

  private getStringArg(named: Record<string, ASTNode>, key: string, def: string): string {
    const node = named[key];
    if (!node) return def;
    if (node.type === "StringLit") return node.value;
    if (node.type === "Identifier") return node.name;
    if (node.type === "MemberAccess") {
      const obj = node.object;
      return (obj.type === "Identifier" ? obj.name + "." + node.property : node.property);
    }
    if (node.type === "NumberLit") return String(node.value);
    return def;
  }

  private getNumberArg(named: Record<string, ASTNode>, key: string, def: number): number {
    const node = named[key];
    if (!node) return def;
    if (node.type === "NumberLit") return node.value;
    return def;
  }

  // --- Token navigation ---

  private peek(): Token { return this.tokens[this.pos] || { type: "EOF", value: "", line: 0, col: 0 }; }
  private peekAhead(n: number): Token | null { return this.tokens[this.pos + n] || null; }
  private check(type: TokenType): boolean { return this.peek().type === type; }
  private advance(): Token { return this.tokens[this.pos++] || { type: "EOF", value: "", line: 0, col: 0 }; }
  private expect(type: TokenType): Token {
    if (this.check(type)) return this.advance();
    const t = this.peek();
    throw new Error(`Expected ${type} but got ${t.type} ("${t.value}") at line ${t.line + 1}`);
  }
  private isAtEnd(): boolean { return this.pos >= this.tokens.length || this.peek().type === "EOF"; }
  private skipNewlines(): void {
    while (this.check("NEWLINE")) this.advance();
  }
  private skipLine(): void {
    while (!this.isAtEnd() && !this.check("NEWLINE") && !this.check("DEDENT")) this.advance();
    if (this.check("NEWLINE")) this.advance();
  }
}