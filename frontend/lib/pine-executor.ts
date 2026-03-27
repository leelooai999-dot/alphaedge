/**
 * MonteCarloo Pine Script AST Executor v7
 * 
 * Walks the AST from pine-parser.ts and evaluates Pine Script
 * against OHLCV data to produce plottable indicator output.
 */

import { type ASTNode, PineParser, tokenize } from "./pine-parser";
import { SMA, EMA, RSI, MACD, BollingerBands, ATR, Stochastic, WMA } from "technicalindicators";
import type { OHLCVData, PineResult, PinePlotLine, PineHLine, PineIndicatorMeta } from "./pine-import";

// VWMA (not in library)
function computeVWMA(values: number[], volume: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    let sumPV = 0, sumV = 0;
    for (let j = i - period + 1; j <= i; j++) { sumPV += values[j] * volume[j]; sumV += volume[j]; }
    result.push(sumV !== 0 ? sumPV / sumV : values[i]);
  }
  return result;
}

function padFront(arr: number[], len: number): number[] {
  const pad = len - arr.length;
  if (pad <= 0) return arr.slice(-len);
  return [...new Array(pad).fill(NaN), ...arr];
}

// Color resolver
const COLORS: Record<string, string> = {
  "color.red": "#ef4444", "color.green": "#22c55e", "color.blue": "#3b82f6",
  "color.yellow": "#eab308", "color.orange": "#f97316", "color.purple": "#a855f7",
  "color.white": "#ffffff", "color.gray": "#9ca3af", "color.teal": "#14b8a6",
  "color.aqua": "#06b6d4", "color.lime": "#84cc16", "color.fuchsia": "#d946ef",
  "color.maroon": "#991b1b", "color.navy": "#1e3a5f", "color.silver": "#c0c0c0",
};
function resolveColor(c: string): string {
  if (COLORS[c]) return COLORS[c];
  if (c.startsWith("#")) return c.length > 7 ? c.slice(0, 7) : c;
  const m = c.match(/color\.new\s*\(\s*(color\.\w+)/);
  if (m && COLORS[m[1]]) return COLORS[m[1]];
  return "#3b82f6";
}

// ============================================================================
// EXECUTION ENVIRONMENT
// ============================================================================

interface ExecEnv {
  data: OHLCVData;
  len: number;
  // Named series (computed variables)
  vars: Record<string, number[]>;
  // Input values
  inputs: Record<string, number | boolean | string>;
  // Custom functions
  funcs: Record<string, { params: string[]; body: ASTNode[] }>;
  // Collected outputs
  plots: PinePlotLine[];
  hlines: PineHLine[];
  meta: PineIndicatorMeta;
  errors: string[];
}

// ============================================================================
// MAIN ENTRY
// ============================================================================

export function executeWithAST(code: string, data: OHLCVData): PineResult {
  // Phase 1: Tokenize + Parse
  const tokens = tokenize(code);
  const parser = new PineParser(tokens);
  const { ast, errors: parseErrors } = parser.parse();

  const env: ExecEnv = {
    data, len: data.close.length,
    vars: {},
    inputs: {},
    funcs: {},
    plots: [], hlines: [],
    meta: { name: "Indicator", shortName: "Ind", overlay: true },
    errors: [...parseErrors],
  };

  // Phase 2: Walk the AST
  if (ast.type === "Program") {
    for (const node of ast.body) {
      try {
        execStatement(node, env);
      } catch (e: any) {
        // Silently skip execution errors — many constructs are not fully supported
      }
    }
  }

  // Phase 3: If no plots were generated, auto-plot computed ta.* variables
  if (env.plots.length === 0) {
    const autoColors = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#eab308"];
    let ci = 0;
    for (const [name, values] of Object.entries(env.vars)) {
      if (values.some(v => !isNaN(v) && v !== 0)) {
        env.plots.push({
          title: name,
          color: autoColors[ci % autoColors.length],
          lineWidth: 2,
          values,
          style: "line",
        });
        ci++;
        if (ci >= 6) break;
      }
    }
  }

  if (env.plots.length === 0) {
    env.errors.push("Could not generate plottable output. The script may use unsupported Pine features.");
  }

  return {
    meta: env.meta,
    inputs: [],
    plots: env.plots,
    hlines: env.hlines,
    errors: env.errors,
  };
}

// ============================================================================
// STATEMENT EXECUTOR
// ============================================================================

function execStatement(node: ASTNode, env: ExecEnv): void {
  switch (node.type) {
    case "IndicatorDecl":
      env.meta.name = node.name;
      env.meta.shortName = node.name.substring(0, 20);
      env.meta.overlay = node.overlay;
      break;

    case "InputDecl":
      env.inputs[node.name] = node.defaultValue;
      break;

    case "VarDecl": {
      const values = evalSeries(node.expr, env);
      if (values) env.vars[node.name] = values;
      break;
    }

    case "TupleDecl": {
      // Handle ta.macd, ta.bb, ta.stoch tuples
      const result = evalTupleFunc(node.expr, env);
      if (result) {
        for (let i = 0; i < node.names.length && i < result.length; i++) {
          if (result[i]) env.vars[node.names[i]] = result[i]!;
        }
      }
      break;
    }

    case "PlotCall": {
      const values = evalSeries(node.expr, env);
      if (values && values.some(v => !isNaN(v))) {
        env.plots.push({
          title: node.title || env.plots.length.toString(),
          color: resolveColor(node.color),
          lineWidth: node.lineWidth || 2,
          values,
          style: node.style.includes("histogram") ? "histogram" : "line",
        });
      }
      break;
    }

    case "HLineCall":
      if (node.price !== 0) {
        env.hlines.push({
          price: node.price,
          title: node.title,
          color: resolveColor(node.color),
          lineStyle: "dashed",
        });
      }
      break;

    case "FuncDef":
      env.funcs[node.name] = { params: node.params, body: node.body };
      break;

    case "IfExpr": {
      // For indicator scripts, if/else blocks typically assign values
      // We evaluate both branches and merge based on condition
      const cond = evalSeries(node.condition, env);
      if (cond) {
        // Execute then branch in a sub-environment, capture vars
        const thenEnv = { ...env, vars: { ...env.vars } };
        for (const stmt of node.thenBranch) execStatement(stmt, thenEnv);
        // Execute else branch
        const elseEnv = { ...env, vars: { ...env.vars } };
        for (const stmt of node.elseBranch) execStatement(stmt, elseEnv);
        // Merge: for each new var in then/else, pick based on condition
        const allKeysArr = Array.from(new Set([
          ...Object.keys(thenEnv.vars).filter(k => !(k in env.vars)),
          ...Object.keys(elseEnv.vars).filter(k => !(k in env.vars)),
        ]));
        for (const key of allKeysArr) {
          const thenVals = thenEnv.vars[key];
          const elseVals = elseEnv.vars[key];
          if (thenVals && elseVals) {
            env.vars[key] = cond.map((c, i) => c ? thenVals[i] : elseVals[i]);
          } else if (thenVals) {
            env.vars[key] = cond.map((c, i) => c ? thenVals[i] : NaN);
          }
        }
      }
      break;
    }

    case "ForLoop":
      // For loops in indicators are rare — skip for now
      break;
  }
}

// ============================================================================
// SERIES EVALUATOR — returns number[] (one value per bar)
// ============================================================================

function evalSeries(node: ASTNode, env: ExecEnv): number[] | null {
  const { data, len, vars, inputs } = env;

  switch (node.type) {
    case "NumberLit":
      return new Array(len).fill(node.value);

    case "BoolLit":
      return new Array(len).fill(node.value ? 1 : 0);

    case "NALit":
      return new Array(len).fill(NaN);

    case "StringLit":
      // Could be a source reference
      return getBuiltinSeries(node.value, data) || null;

    case "Identifier": {
      // Check built-in series
      const builtin = getBuiltinSeries(node.name, data);
      if (builtin) return builtin;
      // Check computed vars
      if (vars[node.name]) return vars[node.name];
      // Check inputs
      if (node.name in inputs) {
        const iv = inputs[node.name];
        if (typeof iv === "number") return new Array(len).fill(iv);
        if (typeof iv === "string") return getBuiltinSeries(iv, data) || null;
      }
      return null;
    }

    case "HistoryRef": {
      const series = evalSeries(node.name, env);
      const offset = evalSeries(node.offset, env);
      if (!series || !offset) return null;
      const result = new Array(len).fill(NaN);
      for (let i = 0; i < len; i++) {
        const off = Math.round(offset[i]);
        const lookback = i - off;
        result[i] = lookback >= 0 && lookback < len ? series[lookback] : NaN;
      }
      return result;
    }

    case "BinaryOp": {
      const left = evalSeries(node.left, env);
      const right = evalSeries(node.right, env);
      if (!left || !right) return null;
      return binaryOp(node.op, left, right, len);
    }

    case "UnaryOp": {
      const operand = evalSeries(node.operand, env);
      if (!operand) return null;
      if (node.op === "-") return operand.map(v => -v);
      if (node.op === "not") return operand.map(v => v ? 0 : 1);
      return operand;
    }

    case "Ternary": {
      const cond = evalSeries(node.condition, env);
      const then_ = evalSeries(node.thenExpr, env);
      const else_ = evalSeries(node.elseExpr, env);
      if (!cond || !then_ || !else_) return null;
      return cond.map((c, i) => c ? then_[i] : else_[i]);
    }

    case "MemberAccess": {
      // Handle things like color.red (return null — not a series)
      // or ta.tr
      if (node.object.type === "Identifier" && node.object.name === "ta" && node.property === "tr") {
        // True Range
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
      return null;
    }

    case "FuncCall":
    case "MethodCall":
      return evalFuncCall(node, env);

    default:
      return null;
  }
}

// ============================================================================
// FUNCTION CALL EVALUATOR
// ============================================================================

function evalFuncCall(node: ASTNode, env: ExecEnv): number[] | null {
  const { data, len, vars, inputs } = env;

  // Resolve function name
  let funcName = "";
  let args: ASTNode[] = [];

  if (node.type === "FuncCall") {
    funcName = node.name;
    args = node.args;
  } else if (node.type === "MethodCall") {
    const objName = node.object.type === "Identifier" ? node.object.name : "";
    funcName = objName ? `${objName}.${node.method}` : node.method;
    args = node.args;
  }

  // Resolve arguments to series
  const resolveArg = (arg: ASTNode): number[] | null => evalSeries(arg, env);
  const resolveNum = (arg: ASTNode): number | null => {
    if (arg.type === "NumberLit") return arg.value;
    if (arg.type === "Identifier" && arg.name in inputs) {
      const v = inputs[arg.name];
      return typeof v === "number" ? v : null;
    }
    // Try evaluating — if it's a constant series, take first value
    const s = evalSeries(arg, env);
    if (s && s.length > 0 && !isNaN(s[0])) return s[0];
    return null;
  };

  // ---- ta.* functions ----

  if (funcName === "ta.sma" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p) return padFront(SMA.calculate({ period: p, values: src }), len);
  }
  if (funcName === "ta.ema" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p) return padFront(EMA.calculate({ period: p, values: src }), len);
  }
  if (funcName === "ta.wma" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p) return padFront(WMA.calculate({ period: p, values: src }), len);
  }
  if (funcName === "ta.vwma" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p) return padFront(computeVWMA(src, data.volume, p), len);
  }
  if (funcName === "ta.rsi" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p) return padFront(RSI.calculate({ period: p, values: src }), len);
  }
  if (funcName === "ta.atr" && args.length >= 1) {
    const p = resolveNum(args[0]);
    if (p) return padFront(ATR.calculate({ period: p, high: data.high, low: data.low, close: data.close }), len);
  }
  if (funcName === "ta.hma" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p && p >= 2) {
      const halfP = Math.max(1, Math.floor(p / 2));
      const sqrtP = Math.max(1, Math.round(Math.sqrt(p)));
      const wma1 = WMA.calculate({ period: halfP, values: src });
      const wma2 = WMA.calculate({ period: p, values: src });
      const minLen = Math.min(wma1.length, wma2.length);
      const diff = [];
      for (let i = 0; i < minLen; i++) diff.push(2 * wma1[wma1.length - minLen + i] - wma2[wma2.length - minLen + i]);
      return padFront(WMA.calculate({ period: sqrtP, values: diff }), len);
    }
  }
  if (funcName === "ta.stdev" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p) {
      const result = new Array(len).fill(NaN);
      for (let i = p - 1; i < len; i++) {
        const w = src.slice(i - p + 1, i + 1);
        const mean = w.reduce((a, b) => a + b, 0) / p;
        result[i] = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
      }
      return result;
    }
  }
  if (funcName === "ta.change" && args.length >= 1) {
    const src = resolveArg(args[0]); const p = args.length >= 2 ? (resolveNum(args[1]) || 1) : 1;
    if (src) {
      const result = new Array(len).fill(NaN);
      for (let i = p; i < len; i++) result[i] = src[i] - src[i - p];
      return result;
    }
  }
  if (funcName === "ta.highest" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p) {
      const result = new Array(len).fill(NaN);
      for (let i = 0; i < len; i++) { const w = src.slice(Math.max(0, i - p + 1), i + 1); result[i] = Math.max(...w); }
      return result;
    }
  }
  if (funcName === "ta.lowest" && args.length >= 2) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]);
    if (src && p) {
      const result = new Array(len).fill(NaN);
      for (let i = 0; i < len; i++) { const w = src.slice(Math.max(0, i - p + 1), i + 1); result[i] = Math.min(...w); }
      return result;
    }
  }
  if (funcName === "ta.crossover" && args.length >= 2) {
    const a = resolveArg(args[0]); const b = resolveArg(args[1]);
    if (a && b) { const r = new Array(len).fill(0); for (let i = 1; i < len; i++) r[i] = (a[i] > b[i] && a[i - 1] <= b[i - 1]) ? 1 : 0; return r; }
  }
  if (funcName === "ta.crossunder" && args.length >= 2) {
    const a = resolveArg(args[0]); const b = resolveArg(args[1]);
    if (a && b) { const r = new Array(len).fill(0); for (let i = 1; i < len; i++) r[i] = (a[i] < b[i] && a[i - 1] >= b[i - 1]) ? 1 : 0; return r; }
  }
  if (funcName === "ta.cum" && args.length >= 1) {
    const src = resolveArg(args[0]);
    if (src) { const r = new Array(len).fill(0); r[0] = src[0] || 0; for (let i = 1; i < len; i++) r[i] = r[i - 1] + (src[i] || 0); return r; }
  }

  // ---- math.* functions ----
  if (funcName === "math.abs" && args.length >= 1) { const s = resolveArg(args[0]); return s ? s.map(v => Math.abs(v)) : null; }
  if (funcName === "math.max" && args.length >= 2) { const a = resolveArg(args[0]); const b = resolveArg(args[1]); return a && b ? a.map((v, i) => Math.max(v, b[i])) : null; }
  if (funcName === "math.min" && args.length >= 2) { const a = resolveArg(args[0]); const b = resolveArg(args[1]); return a && b ? a.map((v, i) => Math.min(v, b[i])) : null; }
  if (funcName === "math.sqrt" && args.length >= 1) { const s = resolveArg(args[0]); return s ? s.map(v => Math.sqrt(v)) : null; }
  if (funcName === "math.log" && args.length >= 1) { const s = resolveArg(args[0]); return s ? s.map(v => Math.log(v)) : null; }
  if (funcName === "math.round" && args.length >= 1) { const s = resolveArg(args[0]); return s ? s.map(v => Math.round(v)) : null; }
  if (funcName === "math.ceil" && args.length >= 1) { const s = resolveArg(args[0]); return s ? s.map(v => Math.ceil(v)) : null; }
  if (funcName === "math.floor" && args.length >= 1) { const s = resolveArg(args[0]); return s ? s.map(v => Math.floor(v)) : null; }
  if (funcName === "math.pow" && args.length >= 2) { const a = resolveArg(args[0]); const b = resolveArg(args[1]); return a && b ? a.map((v, i) => Math.pow(v, b[i])) : null; }
  if (funcName === "math.sign" && args.length >= 1) { const s = resolveArg(args[0]); return s ? s.map(v => Math.sign(v)) : null; }

  // ---- nz() / na() ----
  if (funcName === "nz" && args.length >= 1) {
    const s = resolveArg(args[0]);
    const def = args.length >= 2 ? resolveNum(args[1]) || 0 : 0;
    return s ? s.map(v => isNaN(v) ? def : v) : null;
  }
  if (funcName === "na" && args.length >= 1) {
    const s = resolveArg(args[0]);
    return s ? s.map(v => isNaN(v) ? 1 : 0) : null;
  }
  if (funcName === "fixnan" && args.length >= 1) {
    const s = resolveArg(args[0]);
    if (s) { const r = [...s]; for (let i = 1; i < len; i++) if (isNaN(r[i])) r[i] = r[i - 1]; return r; }
  }

  // ---- Custom user-defined functions ----
  if (env.funcs[funcName]) {
    const funcDef = env.funcs[funcName];
    // Create a sub-environment with params bound
    const subEnv: ExecEnv = { ...env, vars: { ...env.vars }, inputs: { ...env.inputs } };
    for (let i = 0; i < funcDef.params.length && i < args.length; i++) {
      const argValues = evalSeries(args[i], env);
      if (argValues) subEnv.vars[funcDef.params[i]] = argValues;
    }
    // Execute body, return last expression
    let lastResult: number[] | null = null;
    for (const stmt of funcDef.body) {
      if (stmt.type === "VarDecl") {
        execStatement(stmt, subEnv);
      } else {
        // Treat as expression — evaluate it
        lastResult = evalSeries(stmt, subEnv);
      }
    }
    return lastResult;
  }

  return null;
}

// ============================================================================
// TUPLE FUNCTION EVALUATOR (ta.macd, ta.bb, ta.stoch)
// ============================================================================

function evalTupleFunc(node: ASTNode, env: ExecEnv): (number[] | null)[] {
  const { data, len } = env;

  if (node.type !== "FuncCall" && node.type !== "MethodCall") return [];

  let funcName = "";
  let args: ASTNode[] = [];
  if (node.type === "FuncCall") { funcName = node.name; args = node.args; }
  else if (node.type === "MethodCall") {
    const objName = node.object.type === "Identifier" ? node.object.name : "";
    funcName = `${objName}.${node.method}`; args = node.args;
  }

  const resolveArg = (a: ASTNode) => evalSeries(a, env);
  const resolveNum = (a: ASTNode): number | null => {
    if (a.type === "NumberLit") return a.value;
    if (a.type === "Identifier" && a.name in env.inputs) { const v = env.inputs[a.name]; return typeof v === "number" ? v : null; }
    const s = evalSeries(a, env);
    if (s && s.length > 0 && !isNaN(s[0])) return s[0];
    return null;
  };

  if (funcName === "ta.macd" && args.length >= 4) {
    const src = resolveArg(args[0]); const fast = resolveNum(args[1]); const slow = resolveNum(args[2]); const sig = resolveNum(args[3]);
    if (src && fast && slow && sig) {
      const result = MACD.calculate({ values: src, fastPeriod: fast, slowPeriod: slow, signalPeriod: sig, SimpleMAOscillator: false, SimpleMASignal: false });
      return [
        padFront(result.map(r => r.MACD ?? NaN), len),
        padFront(result.map(r => r.signal ?? NaN), len),
        padFront(result.map(r => (r.MACD ?? 0) - (r.signal ?? 0)), len),
      ];
    }
  }

  if (funcName === "ta.bb" && args.length >= 3) {
    const src = resolveArg(args[0]); const p = resolveNum(args[1]); const sd = resolveNum(args[2]);
    if (src && p && sd) {
      const result = BollingerBands.calculate({ period: p, values: src, stdDev: sd });
      return [
        padFront(result.map(r => r.middle), len),
        padFront(result.map(r => r.upper), len),
        padFront(result.map(r => r.lower), len),
      ];
    }
  }

  if (funcName === "ta.stoch" && args.length >= 4) {
    const p = resolveNum(args[3]);
    if (p) {
      const result = Stochastic.calculate({ high: data.high, low: data.low, close: data.close, period: p, signalPeriod: 3 });
      return [
        padFront(result.map(r => r.k), len),
        padFront(result.map(r => r.d), len),
      ];
    }
  }

  return [];
}

// ============================================================================
// HELPERS
// ============================================================================

function getBuiltinSeries(name: string, data: OHLCVData): number[] | null {
  if (name === "close") return data.close;
  if (name === "open") return data.open;
  if (name === "high") return data.high;
  if (name === "low") return data.low;
  if (name === "volume") return data.volume;
  if (name === "hl2") return data.high.map((h, i) => (h + data.low[i]) / 2);
  if (name === "hlc3") return data.high.map((h, i) => (h + data.low[i] + data.close[i]) / 3);
  if (name === "ohlc4") return data.open.map((o, i) => (o + data.high[i] + data.low[i] + data.close[i]) / 4);
  if (name === "bar_index") return data.close.map((_, i) => i);
  return null;
}

function binaryOp(op: string, left: number[], right: number[], len: number): number[] {
  const r = new Array(len);
  for (let i = 0; i < len; i++) {
    const a = left[i], b = right[i];
    switch (op) {
      case "+": r[i] = a + b; break;
      case "-": r[i] = a - b; break;
      case "*": r[i] = a * b; break;
      case "/": r[i] = b !== 0 ? a / b : NaN; break;
      case "%": r[i] = b !== 0 ? a % b : NaN; break;
      case "==": r[i] = a === b ? 1 : 0; break;
      case "!=": r[i] = a !== b ? 1 : 0; break;
      case "<": r[i] = a < b ? 1 : 0; break;
      case ">": r[i] = a > b ? 1 : 0; break;
      case "<=": r[i] = a <= b ? 1 : 0; break;
      case ">=": r[i] = a >= b ? 1 : 0; break;
      case "and": r[i] = (a && b) ? 1 : 0; break;
      case "or": r[i] = (a || b) ? 1 : 0; break;
      default: r[i] = NaN;
    }
  }
  return r;
}