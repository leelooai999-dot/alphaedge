"use client";

import { useState, useMemo } from "react";
import {
  executePineScript,
  validatePineScript,
  EXAMPLE_PINE_SCRIPTS,
  type PineResult,
  type OHLCVData,
} from "@/lib/pine-import";

interface Props {
  ohlcvData: OHLCVData | null;
  onIndicatorResult: (result: PineResult | null) => void;
}

export default function PineImport({ ohlcvData, onIndicatorResult }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [indicatorName, setIndicatorName] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const handleImport = () => {
    if (!code.trim()) {
      setErrors(["Paste a Pine Script indicator to import"]);
      return;
    }

    // Validate first
    const validation = validatePineScript(code);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    if (!ohlcvData || ohlcvData.close.length === 0) {
      setErrors(["No price data available — load a stock first"]);
      return;
    }

    setIsRunning(true);
    setErrors([]);

    try {
      const result = executePineScript(code, ohlcvData);
      if (result.errors.length > 0) {
        setErrors(result.errors);
      }
      if (result.plots.length > 0) {
        setIndicatorName(result.meta.name);
        onIndicatorResult(result);
        setIsOpen(false);
      } else {
        setErrors(["No plottable output generated"]);
      }
    } catch (e: any) {
      setErrors([`Runtime error: ${e.message}`]);
    }

    setIsRunning(false);
  };

  const handleExample = (key: string) => {
    setCode(EXAMPLE_PINE_SCRIPTS[key as keyof typeof EXAMPLE_PINE_SCRIPTS] || "");
    setErrors([]);
  };

  const handleClear = () => {
    setCode("");
    setErrors([]);
    setIndicatorName("");
    onIndicatorResult(null);
  };

  if (!isOpen) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(true)}
          className="px-3 py-1.5 bg-purple-500/10 text-purple-400 text-xs font-medium rounded-lg hover:bg-purple-500/20 transition-colors flex items-center gap-1.5"
          title="Import Pine Script indicator"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import Pine Script
        </button>
        {indicatorName && (
          <span className="text-xs text-purple-400/70 flex items-center gap-1">
            📊 {indicatorName}
            <button
              onClick={handleClear}
              className="text-red-400/60 hover:text-red-400 ml-1"
              title="Remove indicator"
            >
              ✕
            </button>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold text-sm">Import Pine Script</h3>
            <p className="text-muted text-xs mt-0.5">
              Paste a TradingView indicator to overlay on the chart
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-muted hover:text-white p-1"
          >
            ✕
          </button>
        </div>

        {/* Examples */}
        <div className="px-5 py-3 border-b border-border">
          <span className="text-xs text-muted mr-2">Examples:</span>
          {Object.keys(EXAMPLE_PINE_SCRIPTS).map((key) => (
            <button
              key={key}
              onClick={() => handleExample(key)}
              className="text-xs px-2 py-0.5 mr-1.5 mb-1 bg-border/50 text-muted rounded hover:text-white hover:bg-border transition-colors"
            >
              {key}
            </button>
          ))}
        </div>

        {/* Code editor */}
        <div className="flex-1 overflow-auto p-5">
          <textarea
            value={code}
            onChange={(e) => { setCode(e.target.value); setErrors([]); }}
            placeholder={`//@version=5
indicator("My Indicator", overlay=true)

length = input.int(14, "Length")
sma_val = ta.sma(close, length)
plot(sma_val, "SMA", color=color.blue, linewidth=2)`}
            className="w-full h-64 bg-bg border border-border rounded-xl p-3 text-xs font-mono text-white placeholder:text-muted/40 resize-none focus:outline-none focus:border-purple-500/50"
            spellCheck={false}
          />

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-red-400">⚠ {err}</p>
              ))}
            </div>
          )}

          {/* Attribution notice */}
          <div className="mt-3 p-3 bg-purple-500/5 border border-purple-500/10 rounded-lg">
            <p className="text-xs text-purple-300/70">
              📝 If importing from TradingView, the original author will be credited.
              We do not store or redistribute Pine Scripts — they run locally in your browser.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted">
            Supports: ta.sma, ta.ema, ta.rsi, ta.macd, ta.bb, ta.atr, ta.stoch
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-xs text-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isRunning || !code.trim()}
              className="px-4 py-1.5 bg-purple-500 text-white text-xs font-medium rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              {isRunning ? "Running..." : "Import & Run"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
