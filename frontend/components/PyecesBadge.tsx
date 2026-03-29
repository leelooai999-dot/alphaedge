"use client";

import { useState } from "react";

interface AgentPrediction {
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  target_pct: number;
  confidence: number;
}

interface PyecesData {
  simulation_id?: string;
  consensus: {
    direction: string;
    probability: number;
    magnitude_pct: number;
    confidence: number;
    agent_votes?: {
      bullish?: number;
      bearish?: number;
      neutral?: number;
    };
  };
  agent_predictions: AgentPrediction[];
  report_summary?: string;
}

interface Props {
  data: PyecesData;
}

export default function PyecesBadge({ data }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { consensus, agent_predictions } = data;
  const votes = consensus.agent_votes || {};
  const totalVotes = (votes.bullish || 0) + (votes.bearish || 0) + (votes.neutral || 0);
  const agentCount = agent_predictions?.length || totalVotes || 0;

  const bullishPct = totalVotes > 0 ? ((votes.bullish || 0) / totalVotes) * 100 : 50;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Badge pill — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-semibold text-[#00d4aa]">
            Pyeces AI
          </span>
          {agentCount > 0 && (
            <span className="text-[10px] text-muted bg-white/5 px-1.5 py-0.5 rounded">
              {agentCount} agents
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Consensus meter */}
          <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00d4aa] rounded-full transition-all"
              style={{ width: `${bullishPct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted">
            {consensus.direction === "bullish" ? "🟢" : "🔴"}{" "}
            {(consensus.confidence * 100).toFixed(0)}%
          </span>
          <svg
            className={`w-3 h-3 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50">
          {/* Vote breakdown */}
          {totalVotes > 0 && (
            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="text-[#00d4aa]">🟢 {votes.bullish || 0} bullish</span>
              <span className="text-[#ff4757]">🔴 {votes.bearish || 0} bearish</span>
              {(votes.neutral || 0) > 0 && (
                <span className="text-muted">⚪ {votes.neutral} neutral</span>
              )}
            </div>
          )}

          {/* Agent predictions */}
          {agent_predictions && agent_predictions.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="text-[10px] text-muted uppercase tracking-wide">
                Agent Predictions
              </div>
              {agent_predictions.map((agent, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1 text-xs"
                >
                  <span className="text-[#94a3b8]">{agent.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono ${
                        agent.direction === "bullish"
                          ? "text-[#00d4aa]"
                          : agent.direction === "bearish"
                          ? "text-[#ff4757]"
                          : "text-muted"
                      }`}
                    >
                      {agent.target_pct >= 0 ? "+" : ""}
                      {agent.target_pct.toFixed(1)}%
                    </span>
                    <span className="text-muted text-[10px]">
                      ({(agent.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {data.report_summary && (
            <div className="mt-3 text-xs text-muted/80 leading-relaxed border-t border-border/50 pt-2">
              {data.report_summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
