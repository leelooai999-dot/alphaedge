/**
 * AlphaEdge Pine Script Import Engine (v5.1)
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
  const lines = code.split("\n");
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

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("//@")) continue;

    // indicator() or study()
    const indicatorMatch = line.match(/(?:indicator|study)\s*\(\s*["'](.+?)["']/);
    if (indicatorMatch) {
      meta.name = indicatorMatch[1];
      meta.shortName = indicatorMatch[1].substring(0, 20);
      meta.overlay = /overlay\s*=\s*true/.test(line);
      continue;
    }

    // input.int / input.float / input.bool / input.string or input()
    const inputMatch = line.match(
      /(\w+)\s*=\s*input(?:\.(int|float|bool|string))?\s*\(\s*(?:defval\s*=\s*)?([^,)]+)(?:,\s*(?:title\s*=\s*)?["'](.+?)["'])?/
    );
    if (inputMatch) {
      const [, varName, typeStr, defValRaw, titleRaw] = inputMatch;
      const type = (typeStr || "float") as PineInput["type"];
      let defaultValue: number | boolean | string;
      const dvTrimmed = defValRaw.trim();
      if (type === "bool") {
        defaultValue = dvTrimmed === "true";
      } else if (type === "string") {
        defaultValue = dvTrimmed.replace(/['"]/g, "");
      } else {
        defaultValue = parseFloat(dvTrimmed) || 0;
      }
      inputs.push({
        name: varName,
        type,
        defaultValue,
        title: titleRaw || varName,
      });
      continue;
    }

    // plot()
    const plotMatch = line.match(
      /plot\s*\(\s*(\w+)(?:,\s*(?:title\s*=\s*)?["'](.+?)["'])?(?:,\s*color\s*=\s*(.+?))?(?:,\s*linewidth\s*=\s*(\d+))?\s*\)/
    );
    if (plotMatch) {
      plotCalls.push({
        varName: plotMatch[1],
        title: plotMatch[2] || plotMatch[1],
        color: parsePineColor(plotMatch[3] || "color.blue"),
        lineWidth: parseInt(plotMatch[4] || "1"),
        style: "line",
      });
      continue;
    }

    // hline()
    const hlineMatch = line.match(
      /hline\s*\(\s*([\d.]+)(?:,\s*(?:title\s*=\s*)?["'](.+?)["'])?(?:,\s*color\s*=\s*(.+?))?/
    );
    if (hlineMatch) {
      hlineCalls.push({
        price: parseFloat(hlineMatch[1]),
        title: hlineMatch[2] || "",
        color: parsePineColor(hlineMatch[3] || "color.gray"),
        lineStyle: "dashed",
      });
      continue;
    }

    // Variable assignment: name = expression
    const assignMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (assignMatch && !line.includes("input") && !line.includes("plot") && !line.includes("hline")) {
      assignments.push({ name: assignMatch[1], expr: assignMatch[2].trim() });
    }
  }

  return { meta, inputs, plotCalls, hlineCalls, assignments, errors };
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

  // ta.sma(source, length)
  const smaMatch = fnCall.match(/ta\.sma\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (smaMatch) {
    const src = getSeriesOrVar(smaMatch[1], data, vars);
    const period = resolveNumber(smaMatch[2], inputValues);
    if (!src || !period) return null;
    const result = SMA.calculate({ period, values: src });
    return padFront(result, len);
  }

  // ta.ema(source, length)
  const emaMatch = fnCall.match(/ta\.ema\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (emaMatch) {
    const src = getSeriesOrVar(emaMatch[1], data, vars);
    const period = resolveNumber(emaMatch[2], inputValues);
    if (!src || !period) return null;
    const result = EMA.calculate({ period, values: src });
    return padFront(result, len);
  }

  // ta.rsi(source, length)
  const rsiMatch = fnCall.match(/ta\.rsi\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (rsiMatch) {
    const src = getSeriesOrVar(rsiMatch[1], data, vars);
    const period = resolveNumber(rsiMatch[2], inputValues);
    if (!src || !period) return null;
    const result = RSI.calculate({ period, values: src });
    return padFront(result, len);
  }

  // ta.macd(source, fast, slow, signal)
  const macdMatch = fnCall.match(/ta\.macd\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
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
    // Return MACD line (histogram = MACD - signal)
    return padFront(result.map((r) => r.MACD ?? 0), len);
  }

  // ta.bb(source, length, mult) — returns middle band
  const bbMatch = fnCall.match(/ta\.bb\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (bbMatch) {
    const src = getSeriesOrVar(bbMatch[1], data, vars);
    const period = resolveNumber(bbMatch[2], inputValues);
    const stdDev = resolveNumber(bbMatch[3], inputValues);
    if (!src || !period || !stdDev) return null;
    const result = BollingerBands.calculate({ period, values: src, stdDev });
    return padFront(result.map((r) => r.middle), len);
  }

  // ta.atr(length)
  const atrMatch = fnCall.match(/ta\.atr\s*\(\s*(\w+)\s*\)/);
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

  // ta.stoch(close, high, low, length)
  const stochMatch = fnCall.match(/ta\.stoch\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*(\w+)\s*\)/);
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
    return padFront(result.map((r) => r.k), len);
  }

  // ta.crossover(a, b) — returns 1 or 0
  const crossMatch = fnCall.match(/ta\.(crossover|crossunder)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
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
  const hlMatch = fnCall.match(/ta\.(highest|lowest)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
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
  for (const pc of parsed.plotCalls) {
    const values = vars[pc.varName];
    if (values) {
      plots.push({
        title: pc.title,
        color: pc.color,
        lineWidth: pc.lineWidth,
        values,
        style: pc.style as PinePlotLine["style"],
      });
    } else {
      errors.push(`plot(): variable "${pc.varName}" not found`);
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
    errors.push("Missing indicator() or study() declaration");
  }
  if (code.includes("strategy")) {
    errors.push("Strategy scripts are not supported — only indicators");
  }
  if (parsed.plotCalls.length === 0) {
    errors.push("No plot() calls found — nothing to display");
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
