/**
 * MonteCarloo Pine Script Import Engine (v5.1)
 * 
 * Parses a subset of Pine Script v5 and executes indicator logic
 * on OHLCV price data (both historical and simulated future).
 * 
 * Supported constructs:
 * - indicator() / study() declarations  
 * - input.int(), input.float(), input.bool(), input.string()
 * - ta.sma(), ta.ema(), ta.rsi(), ta.macd(), ta.bb(), ta.atr(), ta.stoch()
 * - ta.crossover(), ta.crossunder(), ta.highest(), ta.lowest()
 * - plot(), hline(), plotshape()
 * - close, open, high, low, volume series
 * - Basic math: +, -, *, /, math.abs, math.max, math.min, math.sqrt
 * - Ternary: condition ? a : b
 * - Variable assignment: x = expr
 */

import { SMA, EMA, RSI, MACD, BollingerBands, ATR, Stochastic } from "technicalindicators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PineIndicatorMeta {
  name: string;
  shortName: string;
  overlay: boolean;
  author?: string;
  sourceUrl?: string;
  license?: string;
}

export interface PineInput {
  name: string;
  type: "int" | "float" | "bool" | "string";
  defaultValue: number | boolean | string;
  title: string;
  minval?: number;
  maxval?: number;
}

export interface PinePlotLine {
  title: string;
  color: string;
  lineWidth: number;
  values: number[];
  style: "line" | "stepline" | "histogram" | "cross" | "circles";
}

export interface PineHLine {
  price: number;
  title: string;
  color: string;
  lineStyle: "solid" | "dashed" | "dotted";
}

export interface PineResult {
  meta: PineIndicatorMeta;
  inputs: PineInput[];
  plots: PinePlotLine[];
  hlines: PineHLine[];
  errors: string[];
}

export interface OHLCVData {
  close: number[];
  open: number[];
  high: number[];
  low: number[];
  volume: number[];
  dates: string[];
}

// ---------------------------------------------------------------------------
// Parser — extracts metadata, inputs, and logic from Pine Script text
// ---------------------------------------------------------------------------

interface ParsedPine {
  meta: PineIndicatorMeta;
  inputs: PineInput[];
  plotCalls: { varName: string; title: string; color: string; lineWidth: number; style: string }[];
  hlineCalls: PineHLine[];
  assignments: { name: string; expr: string }[];
  errors: string[];
}

function parsePineScript(code: string): ParsedPine {
  const errors: string[] = [];

  // Defaults
  const meta: PineIndicatorMeta = {
    name: "Imported Indicator",
    shortName: "Import",
    overlay: true,
  };
  const inputs: PineInput[] = [];
  const plotCalls: ParsedPine["plotCalls"] = [];
  const hlineCalls: PineHLine[] = [];
  const assignments: ParsedPine["assignments"] = [];

  // Step 1: Normalize — join continuation lines and strip inline comments
  const rawLines = code.split("\n");
  const normalizedLines: string[] = [];
  let buffer = "";
  for (const rawLine of rawLines) {
    // Strip inline comments but preserve strings
    let stripped = rawLine;
    let inStr = false;
    let strChar = "";
    let commentPos = -1;
    for (let i = 0; i < stripped.length; i++) {
      if (inStr) {
        if (stripped[i] === strChar && stripped[i - 1] !== "\\") inStr = false;
      } else {
        if (stripped[i] === '"' || stripped[i] === "'") {
          inStr = true;
          strChar = stripped[i];
        } else if (stripped[i] === "/" && stripped[i + 1] === "/") {
          commentPos = i;
          break;
        }
      }
    }
    if (commentPos >= 0) stripped = stripped.substring(0, commentPos);

    const trimmed = stripped.trimEnd();

    // Join lines that are clearly continuations (open paren, comma at end, etc.)
    if (buffer) {
      buffer += " " + trimmed.trimStart();
      // Check if parens are balanced
      const opens = (buffer.match(/\(/g) || []).length;
      const closes = (buffer.match(/\)/g) || []).length;
      if (opens <= closes) {
        normalizedLines.push(buffer);
        buffer = "";
      }
    } else if (trimmed && !trimmed.startsWith("//")) {
      const opens = (trimmed.match(/\(/g) || []).length;
      const closes = (trimmed.match(/\)/g) || []).length;
      if (opens > closes) {
        buffer = trimmed;
      } else {
        normalizedLines.push(trimmed);
      }
    }
  }
  if (buffer) normalizedLines.push(buffer);

  for (const rawLine of normalizedLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("//@")) continue;

    // indicator() or study()
    const indicatorMatch = line.match(/(?:indicator|study)\s*\(/);
    if (indicatorMatch) {
      const nameMatch = line.match(/["'](.+?)["']/);
      if (nameMatch) {
        meta.name = nameMatch[1];
        meta.shortName = nameMatch[1].substring(0, 20);
      }
      meta.overlay = /overlay\s*=\s*true/.test(line);
      continue;
    }

    // Skip strategy declarations
    if (/^strategy\s*\(/.test(line)) continue;
    // Skip pure version annotations
    if (/^\/\/@version/.test(line)) continue;

    // input.int / input.float / input.bool / input.string / input() / input.source()
    const inputMatch = line.match(
      /(\w+)\s*=\s*input(?:\.(int|float|bool|string|source))?\s*\(/
    );
    if (inputMatch) {
      const [, varName, typeStr] = inputMatch;
      // Extract everything inside parens
      const parenContent = extractParens(line, line.indexOf("input"));
      const type = (typeStr === "source" ? "string" : typeStr || "float") as PineInput["type"];

      // Find defval — first positional arg or defval= named arg
      let defaultValue: number | boolean | string = type === "bool" ? false : type === "string" ? "close" : 14;
      const defvalMatch = parenContent.match(/defval\s*=\s*([^,)]+)/);
      const firstArg = parenContent.match(/^\s*([^,)]+)/);
      const dvRaw = defvalMatch ? defvalMatch[1].trim() : firstArg ? firstArg[1].trim() : "";
      if (dvRaw) {
        if (type === "bool") defaultValue = dvRaw === "true";
        else if (type === "string" || typeStr === "source") defaultValue = dvRaw.replace(/['"]/g, "");
        else { const n = parseFloat(dvRaw); if (!isNaN(n)) defaultValue = n; }
      }

      const titleMatch = parenContent.match(/title\s*=\s*["'](.+?)["']/);
      inputs.push({
        name: varName,
        type,
        defaultValue,
        title: titleMatch ? titleMatch[1] : varName,
      });
      continue;
    }

    // plot() — flexible matching
    const plotIdx = findTopLevelCall(line, "plot");
    if (plotIdx >= 0) {
      const parenContent = extractParens(line, plotIdx);
      if (parenContent) {
        // First arg is the variable/expression to plot
        const args = splitPineArgs(parenContent);
        const firstArg = args[0]?.trim();
        if (firstArg) {
          const namedArgs = parseNamedArgs(args.slice(1));
          plotCalls.push({
            varName: firstArg,
            title: namedArgs["title"]?.replace(/['"]/g, "") || firstArg,
            color: parsePineColor(namedArgs["color"] || "color.blue"),
            lineWidth: parseInt(namedArgs["linewidth"] || "1"),
            style: namedArgs["style"]?.includes("histogram") ? "histogram" : "line",
          });
        }
      }
      continue;
    }

    // hline()
    const hlineIdx = findTopLevelCall(line, "hline");
    if (hlineIdx >= 0) {
      const parenContent = extractParens(line, hlineIdx);
      if (parenContent) {
        const args = splitPineArgs(parenContent);
        const price = parseFloat(args[0]?.trim() || "0");
        if (!isNaN(price)) {
          const namedArgs = parseNamedArgs(args.slice(1));
          hlineCalls.push({
            price,
            title: namedArgs["title"]?.replace(/['"]/g, "") || "",
            color: parsePineColor(namedArgs["color"] || "color.gray"),
            lineStyle: "dashed",
          });
        }
      }
      continue;
    }

    // Tuple destructuring: [a, b, c] = ta.macd(...)
    const tupleMatch = line.match(/^\[(.+?)\]\s*=\s*(.+)$/);
    if (tupleMatch) {
      const names = tupleMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      const expr = tupleMatch[2].trim();
      // Handle ta.macd specially — it returns [macdLine, signalLine, histogram]
      if (expr.includes("ta.macd")) {
        assignments.push({ name: names[0] || "_macd", expr: expr + ".__macd" });
        if (names[1]) assignments.push({ name: names[1], expr: expr + ".__signal" });
        if (names[2]) assignments.push({ name: names[2], expr: expr + ".__hist" });
      } else if (expr.includes("ta.bb")) {
        assignments.push({ name: names[0] || "_middle", expr: expr + ".__middle" });
        if (names[1]) assignments.push({ name: names[1], expr: expr + ".__upper" });
        if (names[2]) assignments.push({ name: names[2], expr: expr + ".__lower" });
      } else if (expr.includes("ta.stoch")) {
        assignments.push({ name: names[0] || "_k", expr: expr + ".__k" });
        if (names[1]) assignments.push({ name: names[1], expr: expr + ".__d" });
      } else {
        // Generic: assign first name only
        assignments.push({ name: names[0], expr });
      }
      continue;
    }

    // Variable assignment: [var] name = expression
    const assignMatch = line.match(/^(?:var\s+)?(\w+)\s*(?::=|=)\s*(.+)$/);
    if (assignMatch && !line.includes("input(") && !line.includes("input.") 
        && plotIdx < 0 && hlineIdx < 0) {
      const varName = assignMatch[1];
      const expr = assignMatch[2].trim();
      // Skip if/else/for/while/switch keywords
      if (["if", "else", "for", "while", "switch", "import", "export", "type", "method"].includes(varName)) continue;
      assignments.push({ name: varName, expr });
    }
  }

  return { meta, inputs, plotCalls, hlineCalls, assignments, errors };
}

/** Extract content inside matching parentheses starting from a function call position */
function extractParens(line: string, startIdx: number): string {
  const openIdx = line.indexOf("(", startIdx);
  if (openIdx < 0) return "";
  let depth = 0;
  let i = openIdx;
  for (; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") { depth--; if (depth === 0) break; }
  }
  return line.substring(openIdx + 1, i);
}

/** Find a top-level function call (not inside a string or nested call) */
function findTopLevelCall(line: string, fnName: string): number {
  // Match `plot(` or `plotshape(` etc. but NOT `plotCalls` or `hline_plot`
  const regex = new RegExp(`(?:^|[^\\w.])${fnName}\\s*\\(`);
  const m = line.match(regex);
  if (!m) return -1;
  return m.index! + m[0].indexOf(fnName);
}

/** Split Pine arguments respecting parentheses and strings */
function splitPineArgs(content: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  let inStr = false;
  let strChar = "";
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inStr) {
      current += ch;
      if (ch === strChar && content[i - 1] !== "\\") inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true;
      strChar = ch;
      current += ch;
    } else if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current);
  return args;
}

/** Parse named arguments like title="X", color=color.red */
function parseNamedArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of args) {
    const m = arg.match(/^\s*(\w+)\s*=\s*(.+)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

function parsePineColor(raw: string): string {
  const colorMap: Record<string, string> = {
    "color.red": "#ef4444",
    "color.green": "#22c55e",
    "color.blue": "#3b82f6",
    "color.yellow": "#eab308",
    "color.orange": "#f97316",
    "color.purple": "#a855f7",
    "color.white": "#ffffff",
    "color.gray": "#9ca3af",
    "color.teal": "#14b8a6",
    "color.aqua": "#06b6d4",
    "color.lime": "#84cc16",
    "color.fuchsia": "#d946ef",
    "color.maroon": "#991b1b",
    "color.navy": "#1e3a5f",
    "color.silver": "#c0c0c0",
    "color.black": "#000000",
  };
  const trimmed = raw.trim();
  if (colorMap[trimmed]) return colorMap[trimmed];
  if (trimmed.startsWith("#")) return trimmed;
  // color.new(color.red, 50) → just return base color
  const newMatch = trimmed.match(/color\.new\s*\(\s*(color\.\w+)/);
  if (newMatch && colorMap[newMatch[1]]) return colorMap[newMatch[1]];
  return "#3b82f6"; // default blue
}

// ---------------------------------------------------------------------------
// Evaluator — executes parsed Pine logic against OHLCV data
// ---------------------------------------------------------------------------

function evaluateExpression(
  expr: string,
  vars: Record<string, number[]>,
  idx: number,
  data: OHLCVData,
  inputValues: Record<string, number | boolean | string>
): number {
  // Replace series references with values at current index
  let e = expr
    .replace(/\bclose\b/g, `__close`)
    .replace(/\bhigh\b/g, `__high`)
    .replace(/\blow\b/g, `__low`)
    .replace(/\bopen\b/g, `__open`)
    .replace(/\bvolume\b/g, `__volume`);

  // Resolve variable references
  for (const [name, values] of Object.entries(vars)) {
    const regex = new RegExp(`\\b${name}\\b`, "g");
    e = e.replace(regex, String(values[idx] ?? 0));
  }

  // Resolve input references
  for (const [name, value] of Object.entries(inputValues)) {
    const regex = new RegExp(`\\b${name}\\b`, "g");
    e = e.replace(regex, String(value));
  }

  // Replace series placeholders
  e = e
    .replace(/__close/g, String(data.close[idx] ?? 0))
    .replace(/__high/g, String(data.high[idx] ?? 0))
    .replace(/__low/g, String(data.low[idx] ?? 0))
    .replace(/__open/g, String(data.open[idx] ?? 0))
    .replace(/__volume/g, String(data.volume[idx] ?? 0));

  // math functions
  e = e.replace(/math\.abs\s*\(([^)]+)\)/g, "Math.abs($1)");
  e = e.replace(/math\.max\s*\(([^)]+)\)/g, "Math.max($1)");
  e = e.replace(/math\.min\s*\(([^)]+)\)/g, "Math.min($1)");
  e = e.replace(/math\.sqrt\s*\(([^)]+)\)/g, "Math.sqrt($1)");
  e = e.replace(/math\.log\s*\(([^)]+)\)/g, "Math.log($1)");
  e = e.replace(/nz\s*\(([^)]+)\)/g, "($1||0)");

  try {
    // Safe eval with limited scope
    const fn = new Function("Math", `"use strict"; return (${e});`);
    const result = fn(Math);
    return typeof result === "number" && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

function computeTaFunction(
  fnCall: string,
  data: OHLCVData,
  vars: Record<string, number[]>,
  inputValues: Record<string, number | boolean | string>
): number[] | null {
  const len = data.close.length;
  
  // Strip tuple suffix for matching, keep it for extraction  
  const tupleSuffix = fnCall.match(/\.__(\w+)$/)?.[0] || "";
  const baseFnCall = tupleSuffix ? fnCall.replace(tupleSuffix, "") : fnCall;
  // For tuple-aware functions, we pass the full fnCall so they can check suffix
  
  // ta.sma(source, length)
  const smaMatch = baseFnCall.match(/ta\.sma\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (smaMatch) {
    const src = getSeriesOrVar(smaMatch[1], data, vars);
    const period = resolveNumber(smaMatch[2], inputValues);
    if (!src || !period) return null;
    const result = SMA.calculate({ period, values: src });
    return padFront(result, len);
  }

  // ta.ema(source, length)
  const emaMatch = baseFnCall.match(/ta\.ema\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (emaMatch) {
    const src = getSeriesOrVar(emaMatch[1], data, vars);
    const period = resolveNumber(emaMatch[2], inputValues);
    if (!src || !period) return null;
    const result = EMA.calculate({ period, values: src });
    return padFront(result, len);
  }

  // ta.rsi(source, length)
  const rsiMatch = baseFnCall.match(/ta\.rsi\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (rsiMatch) {
    const src = getSeriesOrVar(rsiMatch[1], data, vars);
    const period = resolveNumber(rsiMatch[2], inputValues);
    if (!src || !period) return null;
    const result = RSI.calculate({ period, values: src });
    return padFront(result, len);
  }

  // ta.macd(source, fast, slow, signal) — with tuple support
  const macdMatch = baseFnCall.match(/ta\.macd\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (macdMatch) {
    const src = getSeriesOrVar(macdMatch[1], data, vars);
    const fast = resolveNumber(macdMatch[2], inputValues);
    const slow = resolveNumber(macdMatch[3], inputValues);
    const signal = resolveNumber(macdMatch[4], inputValues);
    if (!src || !fast || !slow || !signal) return null;
    const result = MACD.calculate({
      values: src,
      fastPeriod: fast,
      slowPeriod: slow,
      signalPeriod: signal,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    // Check if this is a tuple extraction (__macd, __signal, __hist)
    if (fnCall.endsWith(".__macd")) return padFront(result.map((r) => r.MACD ?? 0), len);
    if (fnCall.endsWith(".__signal")) return padFront(result.map((r) => r.signal ?? 0), len);
    if (fnCall.endsWith(".__hist")) return padFront(result.map((r) => (r.MACD ?? 0) - (r.signal ?? 0)), len);
    // Default: return MACD line
    return padFront(result.map((r) => r.MACD ?? 0), len);
  }

  // ta.bb(source, length, mult) — with tuple support
  const bbMatch = baseFnCall.match(/ta\.bb\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (bbMatch) {
    const src = getSeriesOrVar(bbMatch[1], data, vars);
    const period = resolveNumber(bbMatch[2], inputValues);
    const stdDev = resolveNumber(bbMatch[3], inputValues);
    if (!src || !period || !stdDev) return null;
    const result = BollingerBands.calculate({ period, values: src, stdDev });
    if (fnCall.endsWith(".__middle")) return padFront(result.map((r) => r.middle), len);
    if (fnCall.endsWith(".__upper")) return padFront(result.map((r) => r.upper), len);
    if (fnCall.endsWith(".__lower")) return padFront(result.map((r) => r.lower), len);
    return padFront(result.map((r) => r.middle), len);
  }

  // ta.atr(length)
  const atrMatch = baseFnCall.match(/ta\.atr\s*\(\s*(\w+)\s*\)/);
  if (atrMatch) {
    const period = resolveNumber(atrMatch[1], inputValues);
    if (!period) return null;
    const result = ATR.calculate({
      period,
      high: data.high,
      low: data.low,
      close: data.close,
    });
    return padFront(result, len);
  }

  // ta.stoch(close, high, low, length) — with tuple support
  const stochMatch = baseFnCall.match(/ta\.stoch\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*(\w+)\s*\)/);
  if (stochMatch) {
    const period = resolveNumber(stochMatch[1], inputValues);
    if (!period) return null;
    const result = Stochastic.calculate({
      high: data.high,
      low: data.low,
      close: data.close,
      period,
      signalPeriod: 3,
    });
    if (fnCall.endsWith(".__k")) return padFront(result.map((r) => r.k), len);
    if (fnCall.endsWith(".__d")) return padFront(result.map((r) => r.d), len);
    return padFront(result.map((r) => r.k), len);
  }

  // ta.crossover(a, b) — returns 1 or 0
  const crossMatch = baseFnCall.match(/ta\.(crossover|crossunder)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (crossMatch) {
    const isOver = crossMatch[1] === "crossover";
    const a = getSeriesOrVar(crossMatch[2], data, vars);
    const b = getSeriesOrVar(crossMatch[3], data, vars);
    if (!a || !b) return null;
    const result = new Array(len).fill(0);
    for (let i = 1; i < len; i++) {
      if (isOver) {
        result[i] = a[i] > b[i] && a[i - 1] <= b[i - 1] ? 1 : 0;
      } else {
        result[i] = a[i] < b[i] && a[i - 1] >= b[i - 1] ? 1 : 0;
      }
    }
    return result;
  }

  // ta.highest(source, length) / ta.lowest(source, length)
  const hlMatch = baseFnCall.match(/ta\.(highest|lowest)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (hlMatch) {
    const isHighest = hlMatch[1] === "highest";
    const src = getSeriesOrVar(hlMatch[2], data, vars);
    const period = resolveNumber(hlMatch[3], inputValues);
    if (!src || !period) return null;
    const result = new Array(len).fill(0);
    for (let i = 0; i < len; i++) {
      const window = src.slice(Math.max(0, i - period + 1), i + 1);
      result[i] = isHighest ? Math.max(...window) : Math.min(...window);
    }
    return result;
  }

  return null;
}

function getSeriesOrVar(
  name: string,
  data: OHLCVData,
  vars: Record<string, number[]>
): number[] | null {
  if (name === "close") return data.close;
  if (name === "open") return data.open;
  if (name === "high") return data.high;
  if (name === "low") return data.low;
  if (name === "volume") return data.volume;
  if (vars[name]) return vars[name];
  return null;
}

function resolveNumber(
  raw: string,
  inputValues: Record<string, number | boolean | string>
): number | null {
  const num = Number(raw);
  if (!isNaN(num)) return num;
  const iv = inputValues[raw];
  if (typeof iv === "number") return iv;
  return null;
}

function padFront(arr: number[], targetLen: number): number[] {
  const padding = targetLen - arr.length;
  if (padding <= 0) return arr.slice(-targetLen);
  return [...new Array(padding).fill(NaN), ...arr];
}

// ---------------------------------------------------------------------------
// Main execution function
// ---------------------------------------------------------------------------

export function executePineScript(
  code: string,
  data: OHLCVData,
  inputOverrides?: Record<string, number | boolean | string>
): PineResult {
  const parsed = parsePineScript(code);
  const errors = [...parsed.errors];
  const len = data.close.length;

  // Build input values
  const inputValues: Record<string, number | boolean | string> = {};
  for (const inp of parsed.inputs) {
    inputValues[inp.name] = inputOverrides?.[inp.name] ?? inp.defaultValue;
  }

  // Compute variables
  const vars: Record<string, number[]> = {};

  for (const { name, expr } of parsed.assignments) {
    // Check if it's a ta.* function call
    const taResult = computeTaFunction(expr, data, vars, inputValues);
    if (taResult) {
      vars[name] = taResult;
      continue;
    }

    // Check for [tuple] destructuring: [a, b, c] = ta.macd(...)
    // Not supported in v1 — skip

    // Simple expression evaluation (per-bar)
    try {
      const values = new Array(len);
      for (let i = 0; i < len; i++) {
        values[i] = evaluateExpression(expr, vars, i, data, inputValues);
      }
      vars[name] = values;
    } catch (e) {
      errors.push(`Failed to evaluate: ${name} = ${expr}`);
    }
  }

  // Generate plot outputs
  const plots: PinePlotLine[] = [];
  const plottedVars = new Set<string>();
  for (const pc of parsed.plotCalls) {
    let values = vars[pc.varName];
    
    // If variable not found, try computing as a direct ta.* call
    if (!values && pc.varName.includes("ta.")) {
      const computed = computeTaFunction(pc.varName, data, vars, inputValues);
      if (computed) {
        values = computed;
        vars[pc.varName] = computed; // Cache for potential reuse
      }
    }
    // Also try resolving series references (close, high, low, open, volume)
    if (!values) {
      const series = getSeriesOrVar(pc.varName, data, vars);
      if (series) values = series;
    }
    
    if (values) {
      plots.push({
        title: pc.title,
        color: pc.color,
        lineWidth: pc.lineWidth,
        values,
        style: pc.style as PinePlotLine["style"],
      });
      plottedVars.add(pc.varName);
    } else {
      errors.push(`plot(): variable "${pc.varName}" not found — it may use unsupported Pine syntax`);
    }
  }

  // Auto-plot ta.* computed variables that weren't explicitly plotted
  if (plots.length === 0) {
    const autoColors = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#eab308", "#14b8a6", "#d946ef"];
    let colorIdx = 0;
    for (const { name } of parsed.assignments) {
      if (plottedVars.has(name)) continue;
      const values = vars[name];
      if (values && values.some(v => !isNaN(v) && v !== 0)) {
        plots.push({
          title: name,
          color: autoColors[colorIdx % autoColors.length],
          lineWidth: 1,
          values,
          style: "line",
        });
        colorIdx++;
        plottedVars.add(name);
        // Limit auto-plots to 8 to avoid chart clutter
        if (colorIdx >= 8) break;
      }
    }
  }

  return {
    meta: parsed.meta,
    inputs: parsed.inputs,
    plots,
    hlines: parsed.hlineCalls,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Validation — quick check if Pine Script is importable
// ---------------------------------------------------------------------------

export function validatePineScript(code: string): { valid: boolean; errors: string[]; meta: PineIndicatorMeta } {
  const parsed = parsePineScript(code);
  const errors = [...parsed.errors];

  if (!code.includes("indicator") && !code.includes("study")) {
    // Not a hard error — many Pine scripts from TradingView work without
    // We just note it as a warning, not a blocker
  }
  if (/^strategy\s*\(/m.test(code)) {
    errors.push("Strategy scripts are not supported — only indicators. Remove strategy() and replace with indicator().");
  }
  
  // Count plottable items: explicit plot() calls OR ta.* assignments we can auto-plot
  const hasTaAssignments = parsed.assignments.some(a => a.expr.includes("ta."));
  if (parsed.plotCalls.length === 0 && !hasTaAssignments) {
    errors.push("No plot() calls or ta.* functions found — nothing to display. Make sure your script uses plot() to render output.");
  }

  return {
    valid: errors.length === 0,
    errors,
    meta: parsed.meta,
  };
}

// ---------------------------------------------------------------------------
// Example Pine Scripts for testing
// ---------------------------------------------------------------------------

export const EXAMPLE_PINE_SCRIPTS = {
  "RSI": `//@version=5
indicator("RSI", overlay=false)
length = input.int(14, "RSI Length")
src = close
rsiValue = ta.rsi(src, length)
plot(rsiValue, "RSI", color=color.blue, linewidth=2)
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)`,

  "SMA Cross": `//@version=5
indicator("SMA Crossover", overlay=true)
fast_len = input.int(9, "Fast SMA")
slow_len = input.int(21, "Slow SMA")
fast_sma = ta.sma(close, fast_len)
slow_sma = ta.sma(close, slow_len)
plot(fast_sma, "Fast SMA", color=color.blue, linewidth=2)
plot(slow_sma, "Slow SMA", color=color.red, linewidth=2)`,

  "Bollinger Bands": `//@version=5
indicator("Bollinger Bands", overlay=true)
length = input.int(20, "Length")
mult = input.float(2.0, "Multiplier")
basis = ta.sma(close, length)
plot(basis, "Basis", color=color.orange, linewidth=1)`,

  "EMA Ribbon": `//@version=5
indicator("EMA Ribbon", overlay=true)
ema8 = ta.ema(close, 8)
ema13 = ta.ema(close, 13)
ema21 = ta.ema(close, 21)
ema55 = ta.ema(close, 55)
plot(ema8, "EMA 8", color=color.green, linewidth=1)
plot(ema13, "EMA 13", color=color.lime, linewidth=1)
plot(ema21, "EMA 21", color=color.orange, linewidth=1)
plot(ema55, "EMA 55", color=color.red, linewidth=2)`,
};
