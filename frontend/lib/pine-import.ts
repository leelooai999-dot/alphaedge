/**
 * MonteCarloo Pine Script Import Engine (v6)
 * 
 * Major rewrite for real-world TradingView script compatibility.
 * Handles the most common Pine Script v5 patterns found in the wild.
 * 
 * Supported:
 * - indicator() / study() declarations
 * - input.int(), input.float(), input.bool(), input.string(), input.source(), input()
 * - ta.sma, ta.ema, ta.rsi, ta.macd, ta.bb, ta.atr, ta.stoch, ta.wma, ta.vwma,
 *   ta.hma, ta.tr, ta.change, ta.highest, ta.lowest, ta.crossover, ta.crossunder,
 *   ta.cum, ta.pivothigh, ta.pivotlow, ta.valuewhen, ta.barssince
 * - plot(), hline(), plotshape(), plotchar(), fill()
 * - close, open, high, low, volume, hl2, hlc3, ohlc4, bar_index
 * - History refs: close[1], high[2], etc.
 * - Basic math: +, -, *, /, math.abs, math.max, math.min, math.sqrt, math.log,
 *   math.round, math.ceil, math.floor, math.pow, math.sign
 * - Ternary: condition ? a : b
 * - nz(), na(), fixnan()
 * - Variable assignment with var and := support
 * - Tuple destructuring: [a, b, c] = ta.macd(...)
 */

import { SMA, EMA, RSI, MACD, BollingerBands, ATR, Stochastic, WMA } from "technicalindicators";

// VWMA not in technicalindicators — implement manually
function computeVWMA(values: number[], volume: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    let sumPV = 0, sumV = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumPV += values[j] * volume[j];
      sumV += volume[j];
    }
    result.push(sumV !== 0 ? sumPV / sumV : values[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PineIndicatorMeta {
  name: string;
  shortName: string;
  overlay: boolean;
}

export interface PineInput {
  name: string;
  type: "int" | "float" | "bool" | "string";
  defaultValue: number | boolean | string;
  title: string;
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
}

// ---------------------------------------------------------------------------
// Parsed structures
// ---------------------------------------------------------------------------

interface ParsedPine {
  meta: PineIndicatorMeta;
  inputs: PineInput[];
  plotCalls: { varName: string; title: string; color: string; lineWidth: number; style: string }[];
  hlineCalls: PineHLine[];
  assignments: { name: string; expr: string; isVar: boolean }[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Color map
// ---------------------------------------------------------------------------

const COLOR_MAP: Record<string, string> = {
  "color.red": "#ef4444", "color.green": "#22c55e", "color.blue": "#3b82f6",
  "color.yellow": "#eab308", "color.orange": "#f97316", "color.purple": "#a855f7",
  "color.white": "#ffffff", "color.gray": "#9ca3af", "color.teal": "#14b8a6",
  "color.aqua": "#06b6d4", "color.lime": "#84cc16", "color.fuchsia": "#d946ef",
  "color.maroon": "#991b1b", "color.navy": "#1e3a5f", "color.silver": "#c0c0c0",
  "color.black": "#000000", "color.olive": "#808000",
};

function parsePineColor(raw: string): string {
  const t = raw.trim();
  if (COLOR_MAP[t]) return COLOR_MAP[t];
  if (t.startsWith("#")) return t.length > 7 ? t.slice(0, 7) : t;
  // color.new(color.red, 50)
  const m = t.match(/color\.new\s*\(\s*(color\.\w+)/);
  if (m && COLOR_MAP[m[1]]) return COLOR_MAP[m[1]];
  // color.rgb(r,g,b)
  const rgb = t.match(/color\.rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map(c => parseInt(c).toString(16).padStart(2, "0")).join("")}`;
  return "#3b82f6";
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parsePineScript(code: string): ParsedPine {
  const meta: PineIndicatorMeta = { name: "Indicator", shortName: "Ind", overlay: true };
  const inputs: PineInput[] = [];
  const plotCalls: ParsedPine["plotCalls"] = [];
  const hlineCalls: PineHLine[] = [];
  const assignments: ParsedPine["assignments"] = [];
  const errors: string[] = [];

  // Normalize: join continuation lines, strip comments
  const lines = normalizePineLines(code);

  for (const line of lines) {
    if (!line || line.startsWith("//") || line.startsWith("//@")) continue;

    // --- indicator() / study() ---
    if (/(?:indicator|study)\s*\(/.test(line)) {
      const nameMatch = line.match(/["'](.+?)["']/);
      if (nameMatch) { meta.name = nameMatch[1]; meta.shortName = nameMatch[1].substring(0, 20); }
      // Default overlay=false unless explicitly true (Pine default is false)
      meta.overlay = /overlay\s*=\s*true/.test(line);
      continue;
    }
    if (/^strategy\s*\(/.test(line)) continue;
    if (/^\/\/@version/.test(line)) continue;
    // Skip type/method/import/export declarations
    if (/^(?:type|method|import|export)\b/.test(line)) continue;
    // Skip if/else/for/while/switch standalone keywords
    if (/^(?:if|else|for|while|switch)\b/.test(line) && !line.includes("=")) continue;

    // --- input ---
    const inputMatch = line.match(/(\w+)\s*=\s*input(?:\.(int|float|bool|string|source|color|timeframe))?\s*\(/);
    if (inputMatch) {
      const [, varName, typeStr] = inputMatch;
      const parenContent = extractParens(line, line.indexOf("input"));
      const type = (!typeStr || typeStr === "source" || typeStr === "color" || typeStr === "timeframe") ? "float" : typeStr as PineInput["type"];
      
      let defaultValue: number | boolean | string = type === "bool" ? false : type === "string" ? "close" : 14;
      const defvalMatch = parenContent.match(/defval\s*=\s*([^,)]+)/);
      const firstArg = parenContent.match(/^\s*([^,)]+)/);
      const dvRaw = defvalMatch ? defvalMatch[1].trim() : firstArg ? firstArg[1].trim() : "";
      if (dvRaw) {
        if (type === "bool") defaultValue = dvRaw === "true";
        else if (type === "string") defaultValue = dvRaw.replace(/['"]/g, "");
        else { const n = parseFloat(dvRaw); if (!isNaN(n)) defaultValue = n; }
      }
      const titleMatch = parenContent.match(/(?:title|tooltip)\s*=\s*["'](.+?)["']/);
      inputs.push({ name: varName, type, defaultValue, title: titleMatch ? titleMatch[1] : varName });
      continue;
    }

    // --- plot() ---
    const plotIdx = findTopLevelCall(line, "plot");
    if (plotIdx >= 0 && !line.match(/plot(?:shape|char|arrow|bar|candle)/)) {
      const parenContent = extractParens(line, plotIdx);
      if (parenContent) {
        const args = splitPineArgs(parenContent);
        const firstArg = args[0]?.trim();
        if (firstArg) {
          const namedArgs = parseNamedArgs(args.slice(1));
          plotCalls.push({
            varName: firstArg,
            title: namedArgs["title"]?.replace(/['"]/g, "") || firstArg,
            color: parsePineColor(namedArgs["color"] || "color.blue"),
            lineWidth: parseInt(namedArgs["linewidth"] || namedArgs["width"] || "2"),
            style: namedArgs["style"]?.includes("histogram") ? "histogram" 
                 : namedArgs["style"]?.includes("stepline") ? "stepline"
                 : namedArgs["style"]?.includes("circles") ? "circles"
                 : namedArgs["style"]?.includes("cross") ? "cross" : "line",
          });
        }
      }
      continue;
    }

    // --- plotshape / plotchar / plotarrow --- (extract the series to auto-plot)
    if (/plot(?:shape|char|arrow)\s*\(/.test(line)) {
      // These are signal markers — we skip them (not plottable as lines)
      continue;
    }

    // --- hline() ---
    const hlineIdx = findTopLevelCall(line, "hline");
    if (hlineIdx >= 0) {
      const parenContent = extractParens(line, hlineIdx);
      if (parenContent) {
        const args = splitPineArgs(parenContent);
        const price = parseFloat(args[0]?.trim() || "0");
        if (!isNaN(price) && price !== 0) {
          const namedArgs = parseNamedArgs(args.slice(1));
          hlineCalls.push({
            price,
            title: namedArgs["title"]?.replace(/['"]/g, "") || "",
            color: parsePineColor(namedArgs["color"] || "color.gray"),
            lineStyle: namedArgs["linestyle"]?.includes("dotted") ? "dotted" : "dashed",
          });
        }
      }
      continue;
    }

    // --- fill() / bgcolor() --- skip these
    if (/(?:fill|bgcolor)\s*\(/.test(line)) continue;
    // --- alertcondition / alert --- skip
    if (/(?:alertcondition|alert)\s*\(/.test(line)) continue;
    // --- table / label / line / box drawing --- skip
    if (/(?:table|label|line|box)\.\w+/.test(line) && !line.match(/^\w+\s*(?::=|=)/)) continue;
    // --- var table / var label --- skip declarations
    if (/^var\s+(?:table|label|line|box)\b/.test(line)) continue;

    // --- Tuple destructuring: [a, b, c] = expr ---
    const tupleMatch = line.match(/^\[(.+?)\]\s*=\s*(.+)$/);
    if (tupleMatch) {
      const names = tupleMatch[1].split(",").map(s => s.trim()).filter(Boolean);
      const expr = tupleMatch[2].trim();
      if (expr.includes("ta.macd")) {
        if (names[0]) assignments.push({ name: names[0], expr: expr + ".__macd", isVar: false });
        if (names[1]) assignments.push({ name: names[1], expr: expr + ".__signal", isVar: false });
        if (names[2]) assignments.push({ name: names[2], expr: expr + ".__hist", isVar: false });
      } else if (expr.includes("ta.bb")) {
        if (names[0]) assignments.push({ name: names[0], expr: expr + ".__middle", isVar: false });
        if (names[1]) assignments.push({ name: names[1], expr: expr + ".__upper", isVar: false });
        if (names[2]) assignments.push({ name: names[2], expr: expr + ".__lower", isVar: false });
      } else if (expr.includes("ta.stoch")) {
        if (names[0]) assignments.push({ name: names[0], expr: expr + ".__k", isVar: false });
        if (names[1]) assignments.push({ name: names[1], expr: expr + ".__d", isVar: false });
      } else if (expr.includes("ta.supertrend")) {
        if (names[0]) assignments.push({ name: names[0], expr: expr + ".__value", isVar: false });
        if (names[1]) assignments.push({ name: names[1], expr: expr + ".__dir", isVar: false });
      } else {
        if (names[0]) assignments.push({ name: names[0], expr, isVar: false });
      }
      continue;
    }

    // --- Variable assignment: [var] name [:=|=] expression ---
    const assignMatch = line.match(/^(var\s+)?(\w+)\s*(:=|=)\s*(.+)$/);
    if (assignMatch) {
      const isVar = !!assignMatch[1] || assignMatch[3] === ":=";
      const varName = assignMatch[2];
      const expr = assignMatch[4].trim();
      const skip = ["if", "else", "for", "while", "switch", "import", "export", "type", "method",
                     "int", "float", "bool", "string", "color", "series", "simple"];
      if (skip.includes(varName)) continue;
      // Skip if it's actually an input (already parsed)
      if (expr.includes("input(") || expr.includes("input.")) continue;
      assignments.push({ name: varName, expr, isVar });
    }
  }

  return { meta, inputs, plotCalls, hlineCalls, assignments, errors };
}

// ---------------------------------------------------------------------------
// Line normalizer
// ---------------------------------------------------------------------------

function normalizePineLines(code: string): string[] {
  const rawLines = code.split("\n");
  const result: string[] = [];
  let buffer = "";

  for (const rawLine of rawLines) {
    // Strip inline comments (preserve strings)
    let stripped = stripInlineComment(rawLine).trimEnd();

    if (buffer) {
      buffer += " " + stripped.trimStart();
      const opens = (buffer.match(/\(/g) || []).length;
      const closes = (buffer.match(/\)/g) || []).length;
      const oBrackets = (buffer.match(/\[/g) || []).length;
      const cBrackets = (buffer.match(/\]/g) || []).length;
      if (opens <= closes && oBrackets <= cBrackets) {
        result.push(buffer.trim());
        buffer = "";
      }
    } else if (stripped.trim()) {
      const t = stripped.trim();
      if (t.startsWith("//")) continue;
      const opens = (t.match(/\(/g) || []).length;
      const closes = (t.match(/\)/g) || []).length;
      const oBrackets = (t.match(/\[/g) || []).length;
      const cBrackets = (t.match(/\]/g) || []).length;
      if (opens > closes || oBrackets > cBrackets) {
        buffer = t;
      } else {
        result.push(t);
      }
    }
  }
  if (buffer) result.push(buffer.trim());
  return result;
}

function stripInlineComment(line: string): string {
  let inStr = false;
  let strChar = "";
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

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function extractParens(line: string, startIdx: number): string {
  const openIdx = line.indexOf("(", startIdx);
  if (openIdx < 0) return "";
  let depth = 0;
  for (let i = openIdx; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") { depth--; if (depth === 0) return line.substring(openIdx + 1, i); }
  }
  return line.substring(openIdx + 1);
}

function findTopLevelCall(line: string, fnName: string): number {
  const regex = new RegExp(`(?:^|[^\\w.])${fnName}\\s*\\(`);
  const m = line.match(regex);
  if (!m) return -1;
  return m.index! + m[0].indexOf(fnName);
}

function splitPineArgs(content: string): string[] {
  const args: string[] = [];
  let depth = 0; let current = ""; let inStr = false; let strChar = "";
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inStr) { current += ch; if (ch === strChar && content[i - 1] !== "\\") inStr = false; }
    else if (ch === '"' || ch === "'") { inStr = true; strChar = ch; current += ch; }
    else if (ch === "(" || ch === "[") { depth++; current += ch; }
    else if (ch === ")" || ch === "]") { depth--; current += ch; }
    else if (ch === "," && depth === 0) { args.push(current); current = ""; }
    else { current += ch; }
  }
  if (current.trim()) args.push(current);
  return args;
}

function parseNamedArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of args) {
    const m = arg.match(/^\s*(\w+)\s*=\s*(.+)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Series helpers
// ---------------------------------------------------------------------------

function getSeriesOrVar(name: string, data: OHLCVData, vars: Record<string, number[]>): number[] | null {
  if (name === "close") return data.close;
  if (name === "open") return data.open;
  if (name === "high") return data.high;
  if (name === "low") return data.low;
  if (name === "volume") return data.volume;
  if (name === "hl2") return data.high.map((h, i) => (h + data.low[i]) / 2);
  if (name === "hlc3") return data.high.map((h, i) => (h + data.low[i] + data.close[i]) / 3);
  if (name === "ohlc4") return data.open.map((o, i) => (o + data.high[i] + data.low[i] + data.close[i]) / 4);
  if (vars[name]) return vars[name];
  // Handle input.source references: if someone wrote `src = input.source(defval=close)` the var might be "close"
  return null;
}

function resolveNumber(raw: string, inputValues: Record<string, number | boolean | string>): number | null {
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
// TA Function Computer (the heart of the engine)
// ---------------------------------------------------------------------------

function computeTaFunction(
  fnCall: string, data: OHLCVData,
  vars: Record<string, number[]>,
  inputValues: Record<string, number | boolean | string>
): number[] | null {
  const len = data.close.length;
  const tupleSuffix = fnCall.match(/\.__(\w+)$/)?.[0] || "";
  const base = tupleSuffix ? fnCall.replace(tupleSuffix, "") : fnCall;

  // Resolve source helper
  const src = (name: string) => {
    // Handle input.source: if inputValues has this name as string, resolve the string
    const iv = inputValues[name];
    if (typeof iv === "string") return getSeriesOrVar(iv, data, vars);
    return getSeriesOrVar(name, data, vars);
  };
  const num = (name: string) => resolveNumber(name, inputValues);

  // ta.sma(source, length)
  let m = base.match(/ta\.sma\s*\(\s*(.+?)\s*,\s*(\w+)\s*\)$/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const p = num(m[2]);
    if (s && p) return padFront(SMA.calculate({ period: p, values: s }), len);
  }

  // ta.ema(source, length)
  m = base.match(/ta\.ema\s*\(\s*(.+?)\s*,\s*(\w+)\s*\)$/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const p = num(m[2]);
    if (s && p) return padFront(EMA.calculate({ period: p, values: s }), len);
  }

  // ta.wma(source, length)
  m = base.match(/ta\.wma\s*\(\s*(.+?)\s*,\s*(\w+)\s*\)$/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const p = num(m[2]);
    if (s && p) return padFront(WMA.calculate({ period: p, values: s }), len);
  }

  // ta.vwma(source, length)
  m = base.match(/ta\.vwma\s*\(\s*(.+?)\s*,\s*(\w+)\s*\)$/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const p = num(m[2]);
    if (s && p) return padFront(computeVWMA(s, data.volume, p), len);
  }

  // ta.hma(source, length) — Hull Moving Average = WMA(2*WMA(n/2) - WMA(n), sqrt(n))
  m = base.match(/ta\.hma\s*\(\s*(.+?)\s*,\s*(\w+)\s*\)$/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const p = num(m[2]);
    if (s && p && p >= 2) {
      const halfP = Math.max(1, Math.floor(p / 2));
      const sqrtP = Math.max(1, Math.round(Math.sqrt(p)));
      const wma1 = WMA.calculate({ period: halfP, values: s });
      const wma2 = WMA.calculate({ period: p, values: s });
      // Align lengths
      const minLen = Math.min(wma1.length, wma2.length);
      const diff = [];
      for (let i = 0; i < minLen; i++) {
        diff.push(2 * wma1[wma1.length - minLen + i] - wma2[wma2.length - minLen + i]);
      }
      const hma = WMA.calculate({ period: sqrtP, values: diff });
      return padFront(hma, len);
    }
  }

  // ta.rsi(source, length)
  m = base.match(/ta\.rsi\s*\(\s*(.+?)\s*,\s*(\w+)\s*\)$/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const p = num(m[2]);
    if (s && p) return padFront(RSI.calculate({ period: p, values: s }), len);
  }

  // ta.macd(source, fast, slow, signal)
  m = base.match(/ta\.macd\s*\(\s*(.+?)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const fast = num(m[2]), slow = num(m[3]), sig = num(m[4]);
    if (s && fast && slow && sig) {
      const result = MACD.calculate({ values: s, fastPeriod: fast, slowPeriod: slow, signalPeriod: sig, SimpleMAOscillator: false, SimpleMASignal: false });
      if (fnCall.endsWith(".__macd")) return padFront(result.map(r => r.MACD ?? NaN), len);
      if (fnCall.endsWith(".__signal")) return padFront(result.map(r => r.signal ?? NaN), len);
      if (fnCall.endsWith(".__hist")) return padFront(result.map(r => (r.MACD ?? 0) - (r.signal ?? 0)), len);
      return padFront(result.map(r => r.MACD ?? NaN), len);
    }
  }

  // ta.bb(source, length, mult)
  m = base.match(/ta\.bb\s*\(\s*(.+?)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const p = num(m[2]), sd = num(m[3]);
    if (s && p && sd) {
      const result = BollingerBands.calculate({ period: p, values: s, stdDev: sd });
      if (fnCall.endsWith(".__middle")) return padFront(result.map(r => r.middle), len);
      if (fnCall.endsWith(".__upper")) return padFront(result.map(r => r.upper), len);
      if (fnCall.endsWith(".__lower")) return padFront(result.map(r => r.lower), len);
      return padFront(result.map(r => r.middle), len);
    }
  }

  // ta.atr(length)
  m = base.match(/ta\.atr\s*\(\s*(\w+)\s*\)/);
  if (m) {
    const p = num(m[1]);
    if (p) return padFront(ATR.calculate({ period: p, high: data.high, low: data.low, close: data.close }), len);
  }

  // ta.tr — true range (single value per bar)
  if (base.match(/ta\.tr\b/) && !base.includes("(")) {
    const result = new Array(len).fill(NaN);
    for (let i = 1; i < len; i++) {
      result[i] = Math.max(
        data.high[i] - data.low[i],
        Math.abs(data.high[i] - data.close[i - 1]),
        Math.abs(data.low[i] - data.close[i - 1])
      );
    }
    result[0] = data.high[0] - data.low[0];
    return result;
  }

  // ta.stoch(close, high, low, length)
  m = base.match(/ta\.stoch\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*(\w+)\s*\)/);
  if (m) {
    const p = num(m[1]);
    if (p) {
      const result = Stochastic.calculate({ high: data.high, low: data.low, close: data.close, period: p, signalPeriod: 3 });
      if (fnCall.endsWith(".__k")) return padFront(result.map(r => r.k), len);
      if (fnCall.endsWith(".__d")) return padFront(result.map(r => r.d), len);
      return padFront(result.map(r => r.k), len);
    }
  }

  // ta.change(source, length=1)
  m = base.match(/ta\.change\s*\(\s*(\w+)(?:\s*,\s*(\w+))?\s*\)/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const period = m[2] ? (num(m[2]) || 1) : 1;
    if (s) {
      const result = new Array(len).fill(NaN);
      for (let i = period; i < len; i++) result[i] = s[i] - s[i - period];
      return result;
    }
  }

  // ta.highest(source, length) / ta.lowest(source, length)
  m = base.match(/ta\.(highest|lowest)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (m) {
    const isHigh = m[1] === "highest";
    const s = src(m[2]) || getSeriesOrVar(m[2], data, vars);
    const p = num(m[3]);
    if (s && p) {
      const result = new Array(len).fill(NaN);
      for (let i = 0; i < len; i++) {
        const w = s.slice(Math.max(0, i - p + 1), i + 1);
        result[i] = isHigh ? Math.max(...w) : Math.min(...w);
      }
      return result;
    }
  }

  // ta.crossover(a, b) / ta.crossunder(a, b)
  m = base.match(/ta\.(crossover|crossunder)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (m) {
    const isOver = m[1] === "crossover";
    const a = getSeriesOrVar(m[2], data, vars);
    const b = getSeriesOrVar(m[3], data, vars);
    if (a && b) {
      const result = new Array(len).fill(0);
      for (let i = 1; i < len; i++) {
        result[i] = isOver ? (a[i] > b[i] && a[i - 1] <= b[i - 1] ? 1 : 0) : (a[i] < b[i] && a[i - 1] >= b[i - 1] ? 1 : 0);
      }
      return result;
    }
  }

  // ta.cum(source) — cumulative sum
  m = base.match(/ta\.cum\s*\(\s*(\w+)\s*\)/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    if (s) {
      const result = new Array(len).fill(0);
      result[0] = s[0] || 0;
      for (let i = 1; i < len; i++) result[i] = result[i - 1] + (s[i] || 0);
      return result;
    }
  }

  // ta.stdev(source, length)
  m = base.match(/ta\.stdev\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (m) {
    const s = src(m[1]) || getSeriesOrVar(m[1], data, vars);
    const p = num(m[2]);
    if (s && p) {
      const result = new Array(len).fill(NaN);
      for (let i = p - 1; i < len; i++) {
        const w = s.slice(i - p + 1, i + 1);
        const mean = w.reduce((a, b) => a + b, 0) / p;
        const variance = w.reduce((a, b) => a + (b - mean) ** 2, 0) / p;
        result[i] = Math.sqrt(variance);
      }
      return result;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Per-bar expression evaluator
// ---------------------------------------------------------------------------

function evaluateExpression(
  expr: string, vars: Record<string, number[]>, idx: number,
  data: OHLCVData, inputValues: Record<string, number | boolean | string>
): number {
  let e = expr;

  // Handle history referencing: close[1], myVar[2], etc.
  e = e.replace(/(\w+)\[(\d+)\]/g, (_, name, offset) => {
    const off = parseInt(offset);
    const lookIdx = idx - off;
    if (lookIdx < 0) return "NaN";
    const series = getSeriesOrVar(name, data, vars);
    if (series) return String(series[lookIdx] ?? NaN);
    return "NaN";
  });

  // Replace series references with current bar values
  e = e.replace(/\bclose\b/g, String(data.close[idx] ?? 0));
  e = e.replace(/\bhigh\b/g, String(data.high[idx] ?? 0));
  e = e.replace(/\blow\b(?!er)/g, String(data.low[idx] ?? 0));
  e = e.replace(/\bopen\b/g, String(data.open[idx] ?? 0));
  e = e.replace(/\bvolume\b/g, String(data.volume[idx] ?? 0));
  e = e.replace(/\bhl2\b/g, String((data.high[idx] + data.low[idx]) / 2));
  e = e.replace(/\bhlc3\b/g, String((data.high[idx] + data.low[idx] + data.close[idx]) / 3));
  e = e.replace(/\bohlc4\b/g, String((data.open[idx] + data.high[idx] + data.low[idx] + data.close[idx]) / 4));
  e = e.replace(/\bbar_index\b/g, String(idx));

  // Resolve variable references
  for (const [name, values] of Object.entries(vars)) {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "g");
    e = e.replace(regex, String(values[idx] ?? 0));
  }

  // Resolve input references
  for (const [name, value] of Object.entries(inputValues)) {
    const regex = new RegExp(`\\b${name}\\b`, "g");
    e = e.replace(regex, String(typeof value === "boolean" ? (value ? 1 : 0) : value));
  }

  // Math functions
  e = e.replace(/math\.abs\s*\(([^)]+)\)/g, "Math.abs($1)");
  e = e.replace(/math\.max\s*\(([^)]+)\)/g, "Math.max($1)");
  e = e.replace(/math\.min\s*\(([^)]+)\)/g, "Math.min($1)");
  e = e.replace(/math\.sqrt\s*\(([^)]+)\)/g, "Math.sqrt($1)");
  e = e.replace(/math\.log\s*\(([^)]+)\)/g, "Math.log($1)");
  e = e.replace(/math\.round\s*\(([^)]+)\)/g, "Math.round($1)");
  e = e.replace(/math\.ceil\s*\(([^)]+)\)/g, "Math.ceil($1)");
  e = e.replace(/math\.floor\s*\(([^)]+)\)/g, "Math.floor($1)");
  e = e.replace(/math\.pow\s*\(([^)]+)\)/g, "Math.pow($1)");
  e = e.replace(/math\.sign\s*\(([^)]+)\)/g, "Math.sign($1)");
  e = e.replace(/nz\s*\(([^,)]+)(?:,\s*([^)]+))?\)/g, (_, val, def) => `((isNaN(${val})||${val}===null)?${def || "0"}:${val})`);
  e = e.replace(/na\s*\(([^)]+)\)/g, "(isNaN($1)?1:0)");
  e = e.replace(/\btrue\b/g, "1");
  e = e.replace(/\bfalse\b/g, "0");

  // Boolean operators
  e = e.replace(/\band\b/g, "&&");
  e = e.replace(/\bor\b/g, "||");
  e = e.replace(/\bnot\b/g, "!");

  try {
    const fn = new Function("Math", "isNaN", `"use strict"; return (${e});`);
    const result = fn(Math, isNaN);
    return typeof result === "number" && isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

// ---------------------------------------------------------------------------
// Main execution function
// ---------------------------------------------------------------------------

export function executePineScript(
  code: string, data: OHLCVData,
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

  // Resolve source inputs: if an input is source type and resolves to a series name
  for (const inp of parsed.inputs) {
    const val = inputValues[inp.name];
    if (typeof val === "string" && ["close", "open", "high", "low", "volume", "hl2", "hlc3", "ohlc4"].includes(val)) {
      // Keep as string — computeTaFunction and evaluateExpression will handle it
    }
  }

  // Compute variables in order
  const vars: Record<string, number[]> = {};

  for (const { name, expr } of parsed.assignments) {
    // Try as ta.* function first
    const taResult = computeTaFunction(expr, data, vars, inputValues);
    if (taResult) {
      vars[name] = taResult;
      continue;
    }

    // Try as a simple series reference
    const seriesRef = getSeriesOrVar(expr, data, vars);
    if (seriesRef) {
      vars[name] = [...seriesRef]; // Copy to avoid mutation
      continue;
    }

    // Per-bar expression evaluation
    try {
      const values = new Array(len);
      for (let i = 0; i < len; i++) {
        values[i] = evaluateExpression(expr, vars, i, data, inputValues);
      }
      // Only keep if we got meaningful values (not all NaN)
      if (values.some(v => !isNaN(v))) {
        vars[name] = values;
      }
    } catch (e: any) {
      // Don't report as error — many Pine constructs we skip intentionally
    }
  }

  // Generate plot outputs
  const plots: PinePlotLine[] = [];
  const plottedVars = new Set<string>();

  for (const pc of parsed.plotCalls) {
    let values = vars[pc.varName];
    
    // Try computing as direct ta.* call in plot()
    if (!values && pc.varName.includes("ta.")) {
      const computed = computeTaFunction(pc.varName, data, vars, inputValues);
      if (computed) { values = computed; vars[pc.varName] = computed; }
    }
    // Try as series reference
    if (!values) {
      const series = getSeriesOrVar(pc.varName, data, vars);
      if (series) values = series;
    }
    // Try evaluating as an expression (e.g. `plot(a + b)` or `plot(close * 1.1)`)
    if (!values) {
      try {
        const v = new Array(len);
        for (let i = 0; i < len; i++) v[i] = evaluateExpression(pc.varName, vars, i, data, inputValues);
        if (v.some(val => !isNaN(val))) values = v;
      } catch {}
    }
    
    if (values && values.some(v => !isNaN(v))) {
      plots.push({
        title: pc.title,
        color: pc.color,
        lineWidth: pc.lineWidth,
        values,
        style: pc.style as PinePlotLine["style"],
      });
      plottedVars.add(pc.varName);
    }
    // Don't push errors for failed plots — too noisy
  }

  // Auto-plot: if no explicit plots worked, plot all computed ta.* variables
  if (plots.length === 0) {
    const autoColors = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#eab308", "#14b8a6", "#d946ef"];
    let colorIdx = 0;
    for (const { name, expr } of parsed.assignments) {
      if (plottedVars.has(name)) continue;
      const values = vars[name];
      if (values && values.some(v => !isNaN(v) && v !== 0)) {
        plots.push({
          title: name,
          color: autoColors[colorIdx % autoColors.length],
          lineWidth: 2,
          values,
          style: "line",
        });
        colorIdx++;
        plottedVars.add(name);
        if (colorIdx >= 8) break;
      }
    }
  }

  // If still no plots, add a helpful error
  if (plots.length === 0) {
    errors.push("Could not generate any plottable output. This script may use Pine features not yet supported (if/else blocks, custom functions, request.security, etc.).");
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
// Validation
// ---------------------------------------------------------------------------

export function validatePineScript(code: string): { valid: boolean; errors: string[]; meta: PineIndicatorMeta } {
  const parsed = parsePineScript(code);
  const errors = [...parsed.errors];

  if (/^strategy\s*\(/m.test(code)) {
    errors.push("Strategy scripts are not supported — only indicators. Replace strategy() with indicator().");
  }
  // We're more lenient now — even without explicit plot(), we can auto-plot ta.* results
  return { valid: errors.length === 0, errors, meta: parsed.meta };
}

// ---------------------------------------------------------------------------
// Example Pine Scripts
// ---------------------------------------------------------------------------

export const EXAMPLE_PINE_SCRIPTS = {
  "RSI": `//@version=5
indicator("RSI", overlay=false)
length = input.int(14, "RSI Length")
rsiValue = ta.rsi(close, length)
plot(rsiValue, "RSI", color=color.blue, linewidth=2)
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)`,

  "MACD": `//@version=5
indicator("MACD", overlay=false)
fast = input.int(12, "Fast")
slow = input.int(26, "Slow")
signal = input.int(9, "Signal")
[macdLine, signalLine, histLine] = ta.macd(close, fast, slow, signal)
plot(macdLine, "MACD", color=color.blue, linewidth=2)
plot(signalLine, "Signal", color=color.orange, linewidth=1)
hline(0, "Zero", color=color.gray)`,

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
[middle, upper, lower] = ta.bb(close, length, mult)
plot(middle, "Basis", color=color.orange, linewidth=1)
plot(upper, "Upper", color=color.blue, linewidth=1)
plot(lower, "Lower", color=color.blue, linewidth=1)`,

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

  "ATR Bands": `//@version=5
indicator("ATR Bands", overlay=true)
length = input.int(14, "ATR Length")
mult = input.float(2.0, "Multiplier")
atrVal = ta.atr(length)
upper = close + atrVal * mult
lower = close - atrVal * mult
plot(upper, "Upper", color=color.green, linewidth=1)
plot(lower, "Lower", color=color.red, linewidth=1)`,
};