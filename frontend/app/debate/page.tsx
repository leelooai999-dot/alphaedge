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

interface DebateRound {
  round: number;
  character_id: string;
  character_name: string;
  avatar_emoji: string;
  role: string;
  stance: string;
  position: string;
  reasoning: string;
  price_target: number;
  confidence: number;
  key_factors: string[];
}

interface Consensus {
  direction: string;
  median_target: number;
  confidence: number;
  bull_count: number;
  bear_count: number;
  neutral_count: number;
  summary: string;
  key_agreements: string[];
  key_disagreements: string[];
}

interface SimResult {
  ticker: string;
  current_price: number;
  event: { id: string; name: string; description: string };
  rounds: DebateRound[];
  consensus: Consensus;
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
  const [numRounds, setNumRounds] = useState(6);
  const [selectedMain, setSelectedMain] = useState<string[]>([]);
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [visibleRounds, setVisibleRounds] = useState(0);
  const [error, setError] = useState("");
  const debateRef = useRef<HTMLDivElement>(null);

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

  // Animate rounds appearing one by one
  useEffect(() => {
    if (result && visibleRounds < result.rounds.length) {
      const timer = setTimeout(
        () => setVisibleRounds((v) => v + 1),
        600
      );
      return () => clearTimeout(timer);
    }
  }, [result, visibleRounds]);

  // Auto-scroll to latest round
  useEffect(() => {
    if (debateRef.current && visibleRounds > 0) {
      debateRef.current.scrollTop = debateRef.current.scrollHeight;
    }
  }, [visibleRounds]);

  const toggleChar = (id: string, list: string[], setter: (v: string[]) => void, max: number) => {
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
    setVisibleRounds(0);
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
          selected_characters: [...selectedMain, ...selectedAnalysts].length > 0
            ? [...selectedMain, ...selectedAnalysts]
            : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
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
          event_context: `${result.event.name}: ${result.event.description}`,
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

  const stanceColor = (stance: string) => {
    if (stance === "bullish") return "text-green-400";
    if (stance === "bearish") return "text-red-400";
    return "text-yellow-400";
  };

  const stanceBg = (stance: string) => {
    if (stance === "bullish") return "border-green-500/30 bg-green-500/5";
    if (stance === "bearish") return "border-red-500/30 bg-red-500/5";
    return "border-yellow-500/30 bg-yellow-500/5";
  };

  const presetEvents = [
    { id: "fed_rate_cut", name: "Fed Rate Cut", desc: "Federal Reserve cuts interest rates unexpectedly" },
    { id: "iran_escalation", name: "Iran Escalation", desc: "Military conflict escalation in the Middle East" },
    { id: "chip_export_control", name: "Chip Export Controls", desc: "US tightens semiconductor export restrictions to China" },
    { id: "tariff_increase", name: "Tariff Increase", desc: "Broad tariff increases on imported goods" },
    { id: "recession", name: "Recession Signal", desc: "Major economic indicators point to an imminent recession" },
    { id: "oil_disruption", name: "Oil Supply Disruption", desc: "Major oil supply disruption from key producing region" },
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
            ← Back to Simulator
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
                <label className="block text-sm text-white/60 mb-1">Stock Ticker</label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-lg font-mono focus:border-purple-500 focus:outline-none"
                  placeholder="AAPL"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Event Scenario</label>
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
                  Debate Rounds: {numRounds}
                </label>
                <input
                  type="range"
                  min={3}
                  max={12}
                  value={numRounds}
                  onChange={(e) => setNumRounds(+e.target.value)}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>

            {/* Character Selection */}
            <div>
              <h3 className="text-sm font-semibold text-white/60 mb-3 uppercase tracking-wider">
                World Leaders (pick up to 3)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {characters.main_characters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleChar(c.id, selectedMain, setSelectedMain, 3)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedMain.includes(c.id)
                        ? "border-purple-500 bg-purple-500/10"
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
                Analysts (pick up to 5)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {characters.analysts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      toggleChar(c.id, selectedAnalysts, setSelectedAnalysts, 5)
                    }
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedAnalysts.includes(c.id)
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="text-xl mb-1">{c.avatar_emoji}</div>
                    <div className="text-xs font-medium">{c.name}</div>
                    <div className="text-xs text-white/40 truncate">{c.role}</div>
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
                  Characters are debating...
                </span>
              ) : (
                "🎭 Launch Debate"
              )}
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Debate Results */}
        {result && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  {result.ticker} — {result.event.name}
                </h2>
                <p className="text-white/50 text-sm">
                  Current: ${result.current_price.toFixed(2)} ·{" "}
                  {result.rounds.length} rounds · {result.event.description}
                </p>
              </div>
              <button
                onClick={() => {
                  setResult(null);
                  setVisibleRounds(0);
                  setChatCharacter(null);
                  setChatHistory([]);
                }}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
              >
                New Debate
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Debate Feed */}
              <div className="lg:col-span-2">
                <div
                  ref={debateRef}
                  className="space-y-3 max-h-[70vh] overflow-y-auto pr-2"
                >
                  {result.rounds.slice(0, visibleRounds).map((round, i) => (
                    <div
                      key={i}
                      className={`border rounded-xl p-4 transition-all duration-500 animate-fadeIn ${stanceBg(
                        round.stance
                      )}`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => {
                            setChatCharacter(round.character_id);
                            setChatHistory([]);
                          }}
                          className="text-3xl hover:scale-110 transition-transform cursor-pointer"
                          title={`Chat with ${round.character_name}`}
                        >
                          {round.avatar_emoji}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">
                              {round.character_name}
                            </span>
                            <span className="text-xs text-white/40">
                              {round.role}
                            </span>
                            <span
                              className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                                round.stance === "bullish"
                                  ? "bg-green-500/20 text-green-400"
                                  : round.stance === "bearish"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-yellow-500/20 text-yellow-400"
                              }`}
                            >
                              {round.stance}
                            </span>
                            <span className="text-xs text-white/30 ml-auto">
                              Round {round.round}
                            </span>
                          </div>
                          <p className="text-sm text-white/80 mb-2">
                            {round.position}
                          </p>
                          {round.reasoning && (
                            <p className="text-xs text-white/50 italic mb-2">
                              {round.reasoning}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-white/40">
                            <span>
                              Target:{" "}
                              <span className={stanceColor(round.stance)}>
                                ${round.price_target?.toFixed(2)}
                              </span>
                            </span>
                            <span>
                              Confidence: {(round.confidence * 100).toFixed(0)}%
                            </span>
                            {round.key_factors?.length > 0 && (
                              <span className="hidden md:inline">
                                {round.key_factors.slice(0, 2).join(" · ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {loading && (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-pulse text-white/40 text-sm">
                        Characters are thinking...
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar: Consensus + Chat */}
              <div className="space-y-4">
                {/* Consensus */}
                {visibleRounds >= result.rounds.length && result.consensus && (
                  <div className="border border-purple-500/30 bg-purple-500/5 rounded-xl p-4 animate-fadeIn">
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <span>🤝</span> Consensus
                    </h3>
                    <div
                      className={`text-2xl font-bold mb-2 ${stanceColor(
                        result.consensus.direction
                      )}`}
                    >
                      {result.consensus.direction.toUpperCase()}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                      <div>
                        <div className="text-green-400 font-bold">
                          {result.consensus.bull_count}
                        </div>
                        <div className="text-xs text-white/40">Bulls</div>
                      </div>
                      <div>
                        <div className="text-yellow-400 font-bold">
                          {result.consensus.neutral_count}
                        </div>
                        <div className="text-xs text-white/40">Neutral</div>
                      </div>
                      <div>
                        <div className="text-red-400 font-bold">
                          {result.consensus.bear_count}
                        </div>
                        <div className="text-xs text-white/40">Bears</div>
                      </div>
                    </div>
                    <div className="text-sm mb-2">
                      <span className="text-white/50">Median Target: </span>
                      <span className="font-bold">
                        ${result.consensus.median_target?.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 mb-3">
                      {result.consensus.summary}
                    </p>
                    {result.consensus.key_agreements?.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs text-green-400/60 font-semibold mb-1">
                          Agreements:
                        </div>
                        {result.consensus.key_agreements.map((a, i) => (
                          <div
                            key={i}
                            className="text-xs text-white/50 pl-2 border-l border-green-500/20 mb-1"
                          >
                            {a}
                          </div>
                        ))}
                      </div>
                    )}
                    {result.consensus.key_disagreements?.length > 0 && (
                      <div>
                        <div className="text-xs text-red-400/60 font-semibold mb-1">
                          Disagreements:
                        </div>
                        {result.consensus.key_disagreements.map((d, i) => (
                          <div
                            key={i}
                            className="text-xs text-white/50 pl-2 border-l border-red-500/20 mb-1"
                          >
                            {d}
                          </div>
                        ))}
                      </div>
                    )}
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
                        ].find((c) => c.id === chatCharacter)?.name}
                      </h3>
                      <button
                        onClick={() => setChatCharacter(null)}
                        className="text-white/40 hover:text-white/80 text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
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

                {!chatCharacter && visibleRounds > 0 && (
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
