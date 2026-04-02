"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface Character {
  id: string;
  name: string;
  role: string;
  avatar_emoji: string;
  expertise: string[];
}

interface Reaction {
  character_id: string;
  character_name: string;
  display_name: string;
  avatar_emoji: string;
  tier: string;
  round_num: number;
  action: string;
  prediction: { direction: string; target_price: number; confidence: number } | null;
  stock_impact: string | null;
  responding_to: string | null;
}

interface Round {
  round_num: number;
  phase: string;
  reactions: Reaction[];
  consensus: any;
}

interface CharacterInfo {
  id: string;
  name: string;
  role: string;
  tier: string;
  avatar_emoji: string;
}

interface SimResult {
  ticker: string;
  current_price: number;
  event: string;
  event_id: string;
  probability: number;
  num_rounds: number;
  rounds: Round[];
  consensus: {
    target_price: number;
    confidence: number;
    bull_pct: number;
    bear_pct: number;
    neutral_pct: number;
    num_predictions: number;
  } | null;
  character_predictions: any[];
  characters: CharacterInfo[];
  debate_highlights: string[];
}

export default function DebatePage() {
  const [characters, setCharacters] = useState<{
    main_characters: Character[];
    analysts: Character[];
  }>({ main_characters: [], analysts: [] });
  const [ticker, setTicker] = useState("AAPL");
  const [eventId, setEventId] = useState("fed_rate_cut");
  const [eventName, setEventName] = useState("Federal Reserve Rate Cut");
  const [eventDesc, setEventDesc] = useState(
    "The Federal Reserve announces an unexpected interest rate cut"
  );
  const [probability, setProbability] = useState(70);
  const [duration, setDuration] = useState(30);
  const [numRounds, setNumRounds] = useState(4);
  const [selectedMain, setSelectedMain] = useState<string[]>([]);
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [visibleReactions, setVisibleReactions] = useState(0);
  const [error, setError] = useState("");
  const debateRef = useRef<HTMLDivElement>(null);

  // Flatten all reactions for animation
  const allReactions: (Reaction & { phase: string })[] = result
    ? result.rounds.flatMap((r) =>
        r.reactions.map((rx) => ({ ...rx, phase: r.phase }))
      )
    : [];

  // Chat state
  const [chatCharacter, setChatCharacter] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<
    { role: string; content: string; name?: string; emoji?: string }[]
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/characters`)
      .then((r) => r.json())
      .then(setCharacters)
      .catch(() => {});
  }, []);

  // Animate reactions appearing one by one
  useEffect(() => {
    if (result && visibleReactions < allReactions.length) {
      const timer = setTimeout(
        () => setVisibleReactions((v) => v + 1),
        500
      );
      return () => clearTimeout(timer);
    }
  }, [result, visibleReactions, allReactions.length]);

  // Auto-scroll to latest reaction
  useEffect(() => {
    if (debateRef.current && visibleReactions > 0) {
      debateRef.current.scrollTop = debateRef.current.scrollHeight;
    }
  }, [visibleReactions]);

  const toggleChar = (
    id: string,
    list: string[],
    setter: (v: string[]) => void,
    max: number
  ) => {
    if (list.includes(id)) {
      setter(list.filter((c) => c !== id));
    } else if (list.length < max) {
      setter([...list, id]);
    }
  };

  const runDebate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setVisibleReactions(0);
    setChatCharacter(null);
    setChatHistory([]);

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("alphaedge_token")
          : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/characters/simulate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ticker,
          event_id: eventId,
          event_name: eventName,
          event_description: eventDesc,
          probability: probability / 100,
          duration_days: duration,
          num_rounds: numRounds,
          max_main_characters: Math.min(selectedMain.length || 3, 3),
          max_analysts: Math.min(selectedAnalysts.length || 5, 5),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === "string"
            ? err.detail
            : JSON.stringify(err.detail || err)
        );
      }

      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !chatCharacter || !result) return;
    setChatLoading(true);
    const userMsg = chatInput;
    setChatInput("");
    setChatHistory((h) => [...h, { role: "user", content: userMsg }]);

    try {
      const res = await fetch(`${API_BASE}/api/characters/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: chatCharacter,
          message: userMsg,
          ticker: result.ticker,
          current_price: result.current_price,
          event_context: `${result.event}: probability ${(result.probability * 100).toFixed(0)}%`,
          history: chatHistory.slice(-10),
        }),
      });
      const data = await res.json();
      const char = [...characters.main_characters, ...characters.analysts].find(
        (c) => c.id === chatCharacter
      );
      setChatHistory((h) => [
        ...h,
        {
          role: "assistant",
          content: data.response || data.detail || "...",
          name: char?.name,
          emoji: char?.avatar_emoji,
        },
      ]);
    } catch {
      setChatHistory((h) => [
        ...h,
        { role: "assistant", content: "Connection error. Try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const tierBadge = (tier: string) => {
    if (tier === "main_character")
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 uppercase font-bold">
          Leader
        </span>
      );
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase font-bold">
        Analyst
      </span>
    );
  };

  const stanceFromPrediction = (pred: Reaction["prediction"]) => {
    if (!pred) return "neutral";
    return pred.direction || "neutral";
  };

  const stanceBg = (stance: string) => {
    if (stance === "bullish" || stance === "up")
      return "border-green-500/30 bg-green-500/5";
    if (stance === "bearish" || stance === "down")
      return "border-red-500/30 bg-red-500/5";
    return "border-white/10 bg-white/[0.02]";
  };

  const presetEvents = [
    {
      id: "fed_rate_cut",
      name: "Fed Rate Cut",
      desc: "Federal Reserve cuts interest rates unexpectedly",
    },
    {
      id: "iran_escalation",
      name: "Iran Escalation",
      desc: "Military conflict escalation in the Middle East",
    },
    {
      id: "chip_export_control",
      name: "Chip Export Controls",
      desc: "US tightens semiconductor export restrictions to China",
    },
    {
      id: "tariff_increase",
      name: "Tariff Increase",
      desc: "Broad tariff increases on imported goods",
    },
    {
      id: "recession",
      name: "Recession Signal",
      desc: "Major economic indicators point to an imminent recession",
    },
    {
      id: "oil_disruption",
      name: "Oil Supply Disruption",
      desc: "Major oil supply disruption from key producing region",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              MonteCarloo
            </span>
          </Link>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <span>🎭</span> Character Debate
          </h1>
          <Link
            href="/sim/AAPL"
            className="text-sm text-white/50 hover:text-white/80"
          >
            ← Simulator
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Setup Panel */}
        {!result && (
          <div className="space-y-6">
            {/* Ticker + Event */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Stock Ticker
                </label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-lg font-mono focus:border-purple-500 focus:outline-none"
                  placeholder="AAPL"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Event Scenario
                </label>
                <select
                  value={eventId}
                  onChange={(e) => {
                    const ev = presetEvents.find((p) => p.id === e.target.value);
                    if (ev) {
                      setEventId(ev.id);
                      setEventName(ev.name);
                      setEventDesc(ev.desc);
                    }
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none"
                >
                  {presetEvents.map((ev) => (
                    <option key={ev.id} value={ev.id} className="bg-[#1a1a2e]">
                      {ev.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Event Description */}
            <div>
              <label className="block text-sm text-white/60 mb-1">
                Scenario Description
              </label>
              <input
                value={eventDesc}
                onChange={(e) => setEventDesc(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Probability: {probability}%
                </label>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={probability}
                  onChange={(e) => setProbability(+e.target.value)}
                  className="w-full accent-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Duration: {duration} days
                </label>
                <input
                  type="range"
                  min={7}
                  max={180}
                  value={duration}
                  onChange={(e) => setDuration(+e.target.value)}
                  className="w-full accent-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Rounds: {numRounds}
                </label>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={numRounds}
                  onChange={(e) => setNumRounds(+e.target.value)}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>

            {/* Character Selection */}
            <div>
              <h3 className="text-sm font-semibold text-white/60 mb-3 uppercase tracking-wider">
                🌍 World Leaders (pick up to 3)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {characters.main_characters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      toggleChar(c.id, selectedMain, setSelectedMain, 3)
                    }
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedMain.includes(c.id)
                        ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/50"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="text-2xl mb-1">{c.avatar_emoji}</div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-white/40">{c.role}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white/60 mb-3 uppercase tracking-wider">
                📊 Analysts (pick up to 5)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {characters.analysts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      toggleChar(
                        c.id,
                        selectedAnalysts,
                        setSelectedAnalysts,
                        5
                      )
                    }
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedAnalysts.includes(c.id)
                        ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="text-xl mb-1">{c.avatar_emoji}</div>
                    <div className="text-xs font-medium">{c.name}</div>
                    <div className="text-xs text-white/40 truncate">
                      {c.role}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Launch */}
            <button
              onClick={runDebate}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Characters are debating... (this takes ~30s)
                </span>
              ) : (
                "🎭 Launch Debate"
              )}
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Debate Results */}
        {result && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-bold">
                  {result.ticker} — {result.event}
                </h2>
                <p className="text-white/50 text-sm">
                  Current: ${result.current_price.toFixed(2)} · Probability:{" "}
                  {(result.probability * 100).toFixed(0)}% ·{" "}
                  {result.characters.length} characters ·{" "}
                  {result.num_rounds} rounds
                </p>
              </div>
              <button
                onClick={() => {
                  setResult(null);
                  setVisibleReactions(0);
                  setChatCharacter(null);
                  setChatHistory([]);
                }}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
              >
                New Debate
              </button>
            </div>

            {/* Participants */}
            <div className="flex flex-wrap gap-2">
              {result.characters.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-xs"
                >
                  <span>{c.avatar_emoji}</span>
                  <span>{c.name}</span>
                  {tierBadge(c.tier)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Debate Feed */}
              <div className="lg:col-span-2">
                <div
                  ref={debateRef}
                  className="space-y-3 max-h-[70vh] overflow-y-auto pr-2 scroll-smooth"
                >
                  {allReactions
                    .slice(0, visibleReactions)
                    .map((rx, i) => {
                      const stance = stanceFromPrediction(rx.prediction);
                      return (
                        <div
                          key={i}
                          className={`border rounded-xl p-4 transition-all duration-500 animate-fadeIn ${stanceBg(
                            stance
                          )}`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => {
                                setChatCharacter(rx.character_id);
                                setChatHistory([]);
                              }}
                              className="text-3xl hover:scale-110 transition-transform cursor-pointer flex-shrink-0"
                              title={`Chat with ${rx.display_name}`}
                            >
                              {rx.avatar_emoji}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-sm">
                                  {rx.display_name}
                                </span>
                                {tierBadge(rx.tier)}
                                {rx.prediction && (
                                  <span
                                    className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                                      stance === "bullish" || stance === "up"
                                        ? "bg-green-500/20 text-green-400"
                                        : stance === "bearish" ||
                                          stance === "down"
                                        ? "bg-red-500/20 text-red-400"
                                        : "bg-yellow-500/20 text-yellow-400"
                                    }`}
                                  >
                                    {stance}
                                  </span>
                                )}
                                <span className="text-xs text-white/30 ml-auto">
                                  R{rx.round_num} · {rx.phase.replace(/_/g, " ")}
                                </span>
                              </div>

                              {/* Main action/response text */}
                              <p className="text-sm text-white/80 whitespace-pre-line leading-relaxed">
                                {rx.action}
                              </p>

                              {/* Prediction + Impact */}
                              {(rx.prediction || rx.stock_impact) && (
                                <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                                  {rx.prediction?.target_price && (
                                    <span>
                                      Target:{" "}
                                      <span
                                        className={
                                          stance === "bullish" || stance === "up"
                                            ? "text-green-400"
                                            : stance === "bearish" ||
                                              stance === "down"
                                            ? "text-red-400"
                                            : "text-yellow-400"
                                        }
                                      >
                                        $
                                        {rx.prediction.target_price.toFixed(2)}
                                      </span>
                                    </span>
                                  )}
                                  {rx.prediction?.confidence && (
                                    <span>
                                      Confidence:{" "}
                                      {(rx.prediction.confidence * 100).toFixed(
                                        0
                                      )}
                                      %
                                    </span>
                                  )}
                                  {rx.stock_impact && (
                                    <span className="hidden md:inline">
                                      Impact: {rx.stock_impact}
                                    </span>
                                  )}
                                </div>
                              )}

                              {rx.responding_to && (
                                <div className="mt-1 text-xs text-white/30 italic">
                                  → responding to {rx.responding_to}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                  {loading && (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-pulse text-white/40 text-sm">
                        Characters are thinking...
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Consensus */}
                {visibleReactions >= allReactions.length &&
                  result.consensus && (
                    <div className="border border-purple-500/30 bg-purple-500/5 rounded-xl p-4 animate-fadeIn">
                      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        <span>🤝</span> Consensus
                      </h3>
                      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                        <div>
                          <div className="text-green-400 font-bold text-lg">
                            {result.consensus.bull_pct}%
                          </div>
                          <div className="text-xs text-white/40">Bullish</div>
                        </div>
                        <div>
                          <div className="text-yellow-400 font-bold text-lg">
                            {result.consensus.neutral_pct}%
                          </div>
                          <div className="text-xs text-white/40">Neutral</div>
                        </div>
                        <div>
                          <div className="text-red-400 font-bold text-lg">
                            {result.consensus.bear_pct}%
                          </div>
                          <div className="text-xs text-white/40">Bearish</div>
                        </div>
                      </div>
                      {result.consensus.target_price > 0 && (
                        <div className="text-sm mb-2">
                          <span className="text-white/50">
                            Consensus Target:{" "}
                          </span>
                          <span className="font-bold text-lg">
                            ${result.consensus.target_price.toFixed(2)}
                          </span>
                          <span className="text-xs text-white/40 ml-2">
                            (
                            {(
                              ((result.consensus.target_price -
                                result.current_price) /
                                result.current_price) *
                              100
                            ).toFixed(1)}
                            %)
                          </span>
                        </div>
                      )}
                      <div className="text-xs text-white/40">
                        Based on {result.consensus.num_predictions} predictions
                        · Confidence: {result.consensus.confidence}%
                      </div>
                    </div>
                  )}

                {/* Character Predictions */}
                {visibleReactions >= allReactions.length &&
                  result.character_predictions?.length > 0 && (
                    <div className="border border-white/10 rounded-xl p-4">
                      <h3 className="font-semibold text-sm mb-3">
                        📊 Price Targets
                      </h3>
                      <div className="space-y-2">
                        {result.character_predictions.map((cp: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-white/60">
                              {cp.avatar_emoji} {cp.character_name}
                            </span>
                            <span
                              className={`font-mono ${
                                cp.direction === "up" || cp.direction === "bullish"
                                  ? "text-green-400"
                                  : cp.direction === "down" || cp.direction === "bearish"
                                  ? "text-red-400"
                                  : "text-yellow-400"
                              }`}
                            >
                              ${cp.target_price?.toFixed(2) || "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Debate Highlights */}
                {result.debate_highlights?.length > 0 && (
                  <div className="border border-white/10 rounded-xl p-4">
                    <h3 className="font-semibold text-sm mb-2">⚡ Highlights</h3>
                    <div className="space-y-1">
                      {result.debate_highlights.map((h, i) => (
                        <p key={i} className="text-xs text-white/50">
                          • {h}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat Panel */}
                {chatCharacter && (
                  <div className="border border-blue-500/30 bg-blue-500/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <span>💬</span> Chat with{" "}
                        {[
                          ...characters.main_characters,
                          ...characters.analysts,
                        ].find((c) => c.id === chatCharacter)?.name ||
                          chatCharacter}
                      </h3>
                      <button
                        onClick={() => setChatCharacter(null)}
                        className="text-white/40 hover:text-white/80 text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                      {chatHistory.length === 0 && (
                        <p className="text-xs text-white/30 text-center py-4">
                          Ask anything about their position...
                        </p>
                      )}
                      {chatHistory.map((msg, i) => (
                        <div
                          key={i}
                          className={`text-xs p-2 rounded-lg ${
                            msg.role === "user"
                              ? "bg-white/10 text-white/80 ml-8"
                              : "bg-blue-500/10 text-white/70 mr-4"
                          }`}
                        >
                          {msg.role === "assistant" && msg.emoji && (
                            <span className="mr-1">{msg.emoji}</span>
                          )}
                          {msg.content}
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="text-xs text-white/30 animate-pulse">
                          typing...
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendChat()}
                        placeholder="Ask a follow-up..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={sendChat}
                        disabled={chatLoading}
                        className="px-3 py-2 bg-blue-600 rounded-lg text-xs hover:bg-blue-500 disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}

                {!chatCharacter && visibleReactions > 0 && (
                  <div className="text-xs text-white/30 text-center p-4 border border-white/5 rounded-xl">
                    👆 Click any character&apos;s emoji to start a private chat
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}