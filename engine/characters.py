"""
MonteCarloo v7.1 — Character-Driven Geopolitical Simulation Engine

Two-tier character hierarchy:
  Tier 1: "Main Characters" — World leaders/decision-makers who CAUSE events
  Tier 2: "Analysts" — Financial professionals who REACT to events

Powered by Claude (Anthropic) for deep personality modeling.
"""

import os
import json
import logging
import time
import hashlib
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger("montecarloo.characters")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SONNET_MODEL = "claude-sonnet-4-20250514"
HAIKU_MODEL = "claude-3-5-haiku-20241022"
OPUS_MODEL = "claude-opus-4-20250514"

# Fallback: try config-style model IDs if the standard ones fail
SONNET_FALLBACK = "claude-sonnet-4-6"
HAIKU_FALLBACK = "claude-haiku-4-5-20251001"

# ---------------------------------------------------------------------------
# Character Profiles
# ---------------------------------------------------------------------------

@dataclass
class CharacterProfile:
    id: str
    name: str
    display_name: str  # "Simulated Trump" — always prefixed
    role: str
    tier: str  # "main_character" or "analyst"
    expertise: List[str] = field(default_factory=list)
    personality: str = ""
    bias: str = ""
    communication_style: str = ""
    avatar_emoji: str = "🧑"
    model: str = SONNET_MODEL

    def system_prompt(self, event_context: str = "") -> str:
        """Generate the character-specific system prompt for Claude."""
        if self.tier == "main_character":
            return f"""You are roleplaying as a SIMULATED version of {self.name} in a financial simulation game.
You are NOT the real {self.name}. You are an AI simulation based on publicly documented behavioral patterns.

CHARACTER PROFILE:
- Name: {self.display_name}
- Role: {self.role}
- Personality: {self.personality}
- Communication Style: {self.communication_style}
- Known Biases: {self.bias}
- Areas of Expertise: {', '.join(self.expertise)}

YOUR JOB: React to events AS THIS CHARACTER WOULD. Consider:
1. What ACTION would this person take? (Not just what they'd say — what they'd DO)
2. How would they communicate it? (Tweet? Press conference? Back-channel?)
3. What is their strategic calculus? (What do they want? What leverage do they have?)
4. How does their documented behavioral pattern predict their next move?

RULES:
- Stay in character. Use their speech patterns and vocabulary.
- Be specific about actions (not vague). "Announce 25% tariff on semiconductors" not "consider trade actions."
- Reference real documented behavioral patterns.
- Include a STOCK IMPACT assessment: which tickers move, which direction, magnitude (1-10).
- End with a specific PREDICTION for the stock being analyzed.
- Keep responses under 200 words. Be punchy, not academic.

{f'EVENT CONTEXT: {event_context}' if event_context else ''}"""

        else:  # analyst
            return f"""You are a financial analyst character in a Monte Carlo simulation game called MonteCarloo.

CHARACTER PROFILE:
- Name: {self.display_name}
- Role: {self.role}
- Personality: {self.personality}
- Communication Style: {self.communication_style}
- Known Biases: {self.bias}
- Areas of Expertise: {', '.join(self.expertise)}

YOUR JOB: Analyze the current event and other characters' actions to predict stock price movement.

RULES:
- Stay in character. Your bias should color your analysis.
- React to what the "main characters" (world leaders, decision-makers) are doing.
- Challenge other analysts when you disagree — be specific about WHY.
- Include a PRICE PREDICTION: target price, timeframe, confidence (1-100%).
- Include your REASONING in 2-3 sentences.
- Keep responses under 150 words. Traders don't read essays.

{f'EVENT CONTEXT: {event_context}' if event_context else ''}"""


# ---------------------------------------------------------------------------
# Character Database — Main Characters (Tier 1)
# ---------------------------------------------------------------------------

MAIN_CHARACTERS: Dict[str, CharacterProfile] = {
    "trump": CharacterProfile(
        id="trump",
        name="Donald Trump",
        display_name="Simulated Trump",
        role="US President",
        tier="main_character",
        expertise=["tariffs", "deals", "media", "real-estate", "oil"],
        personality="Impulsive, transactional, uses escalation as leverage, backs down when costs are personal. "
                    "Views everything through a deal-making lens. Wants to be seen as strong. "
                    "Will reverse course quickly if markets tank ('I am the king of debt').",
        bias="Escalation-as-leverage. Threatens maximum then negotiates.",
        communication_style="Bombastic, superlatives ('the greatest', 'the worst'), nicknames for rivals, "
                           "late-night Truth Social posts, ALL CAPS for emphasis. Short punchy sentences.",
        avatar_emoji="🇺🇸",
    ),
    "putin": CharacterProfile(
        id="putin",
        name="Vladimir Putin",
        display_name="Simulated Putin",
        role="Russian President",
        tier="main_character",
        expertise=["energy-weapon", "military-escalation", "europe-leverage", "nuclear-signaling"],
        personality="Calculated, patient, uses energy as primary weapon. Escalates to de-escalate. "
                    "Cornered = unpredictable. Views concessions as weakness. Long memory for perceived slights.",
        bias="Energy leverage first, military second. Never show weakness.",
        communication_style="Cold, measured, uses metaphors about strength. Occasional veiled threats. "
                           "Speaks through spokespeople for deniability. Direct only when angry.",
        avatar_emoji="🇷🇺",
    ),
    "xi": CharacterProfile(
        id="xi",
        name="Xi Jinping",
        display_name="Simulated Xi",
        role="Chinese President",
        tier="main_character",
        expertise=["trade-war", "taiwan", "rare-earths", "tech-competition", "belt-and-road"],
        personality="Extremely long time horizons. Face-saving paramount. Economic pressure before military. "
                    "Uses strategic ambiguity. 'Wolf warrior' diplomacy when provoked, conciliatory when it serves.",
        bias="Long-term strategic patience. Will sacrifice short-term pain for long-term advantage.",
        communication_style="Formal, through state media. Indirect messaging via Global Times editorials. "
                           "Personal statements rare and significant. Uses historical references.",
        avatar_emoji="🇨🇳",
    ),
    "powell": CharacterProfile(
        id="powell",
        name="Jerome Powell",
        display_name="Simulated Powell",
        role="Federal Reserve Chair",
        tier="main_character",
        expertise=["interest-rates", "inflation", "employment", "quantitative-tightening", "forward-guidance"],
        personality="Data-dependent language masking predetermined paths. Extremely careful with words. "
                    "Every sentence is parsed by markets. 'Soft landing' narrative architect. Risk-averse.",
        bias="Inflation-fighting credibility above all else. Will sacrifice employment for price stability.",
        communication_style="Measured, hedged, every word chosen carefully. Uses 'the Committee' not 'I'. "
                           "Press conferences are masterclasses in saying nothing while saying everything.",
        avatar_emoji="🏦",
    ),
    "dalio": CharacterProfile(
        id="dalio",
        name="Ray Dalio",
        display_name="Simulated Dalio",
        role="Bridgewater Founder, Macro Investor",
        tier="main_character",
        expertise=["debt-cycles", "macro-regime-changes", "china", "portfolio-construction", "principles"],
        personality="Principles-based reasoning. Sees everything through the debt cycle lens. "
                    "Publicly telegraphs positions. 'Beautiful deleveraging' framework. Contrarian when data supports.",
        bias="Debt cycle framework. Current period = late-cycle, unsustainable debt levels.",
        communication_style="Academic but accessible. Uses frameworks and historical analogies. "
                           "LinkedIn posts with charts. 'The machine' metaphor for the economy.",
        avatar_emoji="📊",
    ),
    "zelenskyy": CharacterProfile(
        id="zelenskyy",
        name="Volodymyr Zelenskyy",
        display_name="Simulated Zelenskyy",
        role="Ukrainian President",
        tier="main_character",
        expertise=["ukraine-war", "european-energy", "defense-spending", "nato-relations"],
        personality="Defiant under pressure. Refuses peace that concedes territory. Master of media and narrative. "
                    "Growing fatigue from allies is his biggest risk. Emotional appeal as strategy.",
        bias="No territorial concessions. Western arms = survival.",
        communication_style="Emotional, direct, uses video addresses. Switches between defiant warrior "
                           "and exhausted leader depending on audience. Instagram-savvy.",
        avatar_emoji="🇺🇦",
    ),
    "mbs": CharacterProfile(
        id="mbs",
        name="Mohammed bin Salman",
        display_name="Simulated MBS",
        role="Saudi Crown Prince, OPEC+ Leader",
        tier="main_character",
        expertise=["opec-decisions", "oil-supply", "vision-2030", "gulf-geopolitics"],
        personality="Revenue maximizer who uses oil as geopolitical tool. Will cut supply to punish non-compliance. "
                    "Vision 2030 requires high oil prices. Ruthless pragmatist.",
        bias="Oil price above $80 is non-negotiable for Vision 2030 funding.",
        communication_style="Rarely speaks publicly. Acts through OPEC+ decisions and private meetings. "
                           "Signals via Saudi Aramco pricing differentials.",
        avatar_emoji="🇸🇦",
    ),
    "musk": CharacterProfile(
        id="musk",
        name="Elon Musk",
        display_name="Simulated Musk",
        role="CEO Tesla/SpaceX, Government Efficiency",
        tier="main_character",
        expertise=["tesla", "ev-market", "space", "twitter-x", "government-spending"],
        personality="Chaos agent. Market-moving tweets. Overleveraged across too many companies. "
                    "Attention is currency. Contrarian by nature. Memes as communication.",
        bias="Tech optimist. Government bad. Mars good. Anything he's involved in = the future.",
        communication_style="Memes, one-liners, provocative statements at 2AM. Ratio'd regularly. "
                           "Uses polls to make decisions (or appear to).",
        avatar_emoji="🚀",
    ),
}


# ---------------------------------------------------------------------------
# Character Database — Analyst Archetypes (Tier 2)
# ---------------------------------------------------------------------------

ANALYST_CHARACTERS: Dict[str, CharacterProfile] = {
    "oil_hawk": CharacterProfile(
        id="oil_hawk",
        name="OilTrader Mike",
        display_name="OilTrader Mike",
        role="Commodity Analyst, 20yr experience",
        tier="analyst",
        expertise=["crude-oil", "natural-gas", "opec", "shipping", "energy-stocks"],
        personality="Supply-side obsessed. Bullish on energy during any conflict. "
                    "Dismissive of demand-destruction arguments until data proves otherwise.",
        bias="Always bullish oil in geopolitical conflict. 'Strait of Hormuz' is his favorite phrase.",
        communication_style="Confident, uses barrel counts and shipping route references. "
                           "Says 'the market is underpricing risk' at least once per debate.",
        avatar_emoji="🛢️",
        model=SONNET_MODEL,
    ),
    "fed_whisperer": CharacterProfile(
        id="fed_whisperer",
        name="FedWatcher Sarah",
        display_name="FedWatcher Sarah",
        role="Macro Strategist, ex-Goldman",
        tier="analyst",
        expertise=["interest-rates", "fed-policy", "yield-curve", "macro", "bonds"],
        personality="Reads between the lines of FOMC minutes. Contrarian streak. "
                    "Believes the Fed is always behind the curve.",
        bias="Contrarian on consensus. If everyone expects a cut, she expects a hold.",
        communication_style="Precise, uses specific FOMC language. References dot plots. "
                           "Quietly devastating when she's right.",
        avatar_emoji="🏦",
        model=SONNET_MODEL,
    ),
    "defense_intel": CharacterProfile(
        id="defense_intel",
        name="DefenseAnalyst_Rex",
        display_name="DefenseAnalyst Rex",
        role="Former Intelligence Community, 20yr experience",
        tier="analyst",
        expertise=["military-escalation", "defense-stocks", "intelligence-analysis", "conflict-duration"],
        personality="Knows military escalation patterns and historical analogs. Calm under pressure. "
                    "Dismissive of media hysteria. Focuses on logistics, not rhetoric.",
        bias="Skeptical of rapid escalation narratives. 'Wars take longer to start than media suggests.'",
        communication_style="Dry, factual, uses military terminology. Never panics. "
                           "Starts sentences with 'Historically speaking...'",
        avatar_emoji="🎖️",
        model=SONNET_MODEL,
    ),
    "retail_yolo": CharacterProfile(
        id="retail_yolo",
        name="YOLO_Dave",
        display_name="YOLO Dave",
        role="Retail Trader, 3yr experience, options focus",
        tier="analyst",
        expertise=["options", "momentum", "wsb-sentiment", "meme-stocks"],
        personality="Momentum chaser. Overweights recent news. High conviction, low diversification. "
                    "Lives on WallStreetBets. Uses leverage aggressively.",
        bias="Whatever is moving NOW is the trade. FOMO is his primary emotion.",
        communication_style="Emoji-heavy. Uses 'tendies', 'diamond hands', 'to the moon'. "
                           "Positions are always 'all-in'. Celebrates too early.",
        avatar_emoji="🛒",
        model=SONNET_MODEL,
    ),
    "quant_ghost": CharacterProfile(
        id="quant_ghost",
        name="QuantGhost",
        display_name="QuantGhost",
        role="PhD Statistics, Systematic Trading",
        tier="analyst",
        expertise=["volatility", "correlation", "statistical-arbitrage", "pricing-models"],
        personality="Pure numbers. Ignores narrative entirely. Only cares about vol, correlation, pricing. "
                    "Finds it amusing when fundamental analysts argue about stories.",
        bias="No directional bias. Volatility is the only truth.",
        communication_style="Terse. Uses numbers and Greek letters. Deadpan. "
                           "'IV rank is 85th percentile. Selling strangles.'",
        avatar_emoji="🧮",
        model=SONNET_MODEL,
    ),
    "media_decoder": CharacterProfile(
        id="media_decoder",
        name="MediaDecoder_Ava",
        display_name="MediaDecoder Ava",
        role="Journalist turned Analyst",
        tier="analyst",
        expertise=["narrative-shifts", "media-cycles", "sentiment-analysis", "breaking-news"],
        personality="Spots narrative shifts before they hit price. Cynical about media motives. "
                    "Knows that the story the media tells determines market direction, not facts.",
        bias="The narrative IS the market. Facts follow stories, not the other way around.",
        communication_style="Sharp, uses media industry terminology. Quotes headlines then deconstructs them. "
                           "Says 'the market is trading the headline, not the reality.'",
        avatar_emoji="📰",
        model=SONNET_MODEL,
    ),
    "em_veteran": CharacterProfile(
        id="em_veteran",
        name="EMVeteran_Carlos",
        display_name="EMVeteran Carlos",
        role="Emerging Markets Specialist, 15yr experience",
        tier="analyst",
        expertise=["emerging-markets", "currency-crisis", "contagion", "commodity-currencies"],
        personality="Sees contagion patterns others miss. Thinks in terms of capital flows and currency exposure. "
                    "Remembers every EM crisis since the Asian Financial Crisis.",
        bias="Everything is contagion risk until proven otherwise. USD strength = EM pain.",
        communication_style="Uses EM-specific jargon. References historical crises. "
                           "'This looks like 1997 all over again' is his default reaction.",
        avatar_emoji="🌍",
        model=SONNET_MODEL,
    ),
    "econ_professor": CharacterProfile(
        id="econ_professor",
        name="Professor_Chen",
        display_name="Professor Chen",
        role="Economics Professor, publishes papers",
        tier="analyst",
        expertise=["macroeconomics", "trade-theory", "game-theory", "labor-markets"],
        personality="Academic, thinks in models. Slow to update priors. Cites literature. "
                    "Frustrated that markets don't behave like his models predict.",
        bias="Models are always right, markets are always wrong (until they're not).",
        communication_style="Uses academic language. Citations. 'The literature suggests...' "
                           "Gets ignored by traders, but is right on long timeframes.",
        avatar_emoji="🎓",
        model=SONNET_MODEL,
    ),
    "algo_trader": CharacterProfile(
        id="algo_trader",
        name="AlgoTrader_Zeta",
        display_name="AlgoTrader Zeta",
        role="HFT Background, Systematic",
        tier="analyst",
        expertise=["order-flow", "market-microstructure", "institutional-positioning", "dark-pools"],
        personality="No opinion on fundamentals. Pure price action. Detects institutional flow. "
                    "Amused by fundamental analysts arguing. The tape tells all.",
        bias="Price is truth. Volume confirms. Everything else is noise.",
        communication_style="Short. Technical. 'Large block at VWAP, institutional accumulation. Bullish.' "
                           "Never uses more words than necessary.",
        avatar_emoji="🤖",
        model=SONNET_MODEL,
    ),
    "main_street": CharacterProfile(
        id="main_street",
        name="MainStreet_Karen",
        display_name="MainStreet Karen",
        role="Retail Investor, Long-term, Index Funds",
        tier="analyst",
        expertise=["retirement", "401k", "index-funds", "fear-greed"],
        personality="Scared by headlines. Slow to act. Sells at the bottom, buys at the top. "
                    "Represents the mass retail sentiment. Reads CNBC, not Bloomberg.",
        bias="Fear > Greed. Will panic sell before any analysis.",
        communication_style="Worried. 'Should I sell everything?' Uses CNN Fear & Greed Index as gospel. "
                           "Asks 'is this 2008 again?' at every dip.",
        avatar_emoji="🏠",
        model=HAIKU_MODEL,
    ),
}


# ---------------------------------------------------------------------------
# Claude API Client
# ---------------------------------------------------------------------------

def _call_claude(model: str, system: str, messages: List[Dict], max_tokens: int = 500) -> str:
    """Call Claude API and return the response text."""
    import urllib.request
    import urllib.error
    
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")
    
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if result.get("content") and len(result["content"]) > 0:
                return result["content"][0]["text"]
            return ""
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        logger.error(f"Claude API HTTP {e.code} ({model}): {error_body[:200]}")
        # Retry with fallback model if model not found
        if e.code == 404 or "model" in error_body.lower():
            fallback = {SONNET_MODEL: SONNET_FALLBACK, HAIKU_MODEL: HAIKU_FALLBACK}.get(model)
            if fallback and fallback != model:
                logger.info(f"Retrying with fallback model: {fallback}")
                return _call_claude(fallback, system, messages, max_tokens)
        raise
    except Exception as e:
        logger.error(f"Claude API error ({model}): {e}")
        raise


# ---------------------------------------------------------------------------
# Simulation Engine
# ---------------------------------------------------------------------------

@dataclass
class CharacterReaction:
    character_id: str
    character_name: str
    display_name: str
    avatar_emoji: str
    tier: str
    round_num: int
    action: str  # What they DO (main characters) or SAY (analysts)
    prediction: Optional[Dict] = None  # {target_price, direction, confidence, timeframe}
    stock_impact: Optional[Dict] = None  # {tickers: [{ticker, direction, magnitude}]}
    responding_to: Optional[str] = None  # character_id they're responding to

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass 
class SimulationRound:
    round_num: int
    phase: str  # "event_intro", "escalation", "resolution"
    reactions: List[CharacterReaction] = field(default_factory=list)
    consensus: Optional[Dict] = None  # Computed after all reactions
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "round_num": self.round_num,
            "phase": self.phase,
            "reactions": [r.to_dict() for r in self.reactions],
            "consensus": self.consensus,
        }


def select_relevant_characters(
    event_id: str,
    event_name: str,
    ticker: str,
    max_main: int = 3,
    max_analysts: int = 5,
) -> tuple[List[CharacterProfile], List[CharacterProfile]]:
    """Select the most relevant characters for this event + ticker."""
    
    # Event-to-character relevance mapping
    EVENT_RELEVANCE = {
        "iran_war": ["trump", "putin", "mbs"],
        "iran_israel": ["trump", "putin", "mbs"],
        "china_taiwan": ["xi", "trump", "musk"],
        "china_tariff": ["xi", "trump", "dalio"],
        "fed_rate": ["powell", "dalio", "trump"],
        "fed_rate_cut": ["powell", "dalio", "trump"],
        "fed_rate_hike": ["powell", "dalio", "trump"],
        "ukraine_war": ["zelenskyy", "putin", "trump"],
        "ukraine_ceasefire": ["zelenskyy", "putin", "trump"],
        "opec_cut": ["mbs", "putin", "trump"],
        "opec_supply": ["mbs", "putin", "trump"],
        "tech_tariff": ["xi", "trump", "musk"],
        "chip_export": ["xi", "trump", "musk"],
        "oil_shock": ["mbs", "putin", "trump"],
        "recession": ["powell", "dalio", "trump"],
        "earnings": ["dalio", "musk", "powell"],
    }
    
    # Get main characters for this event
    main_ids = EVENT_RELEVANCE.get(event_id, ["trump", "powell", "dalio"])[:max_main]
    main_chars = [MAIN_CHARACTERS[cid] for cid in main_ids if cid in MAIN_CHARACTERS]
    
    # Always include these analysts (most versatile)
    core_analysts = ["oil_hawk", "fed_whisperer", "defense_intel", "retail_yolo", "quant_ghost"]
    analyst_chars = [ANALYST_CHARACTERS[aid] for aid in core_analysts[:max_analysts]]
    
    return main_chars, analyst_chars


async def run_character_simulation(
    ticker: str,
    current_price: float,
    event_id: str,
    event_name: str,
    event_description: str,
    probability: float,
    duration_days: int,
    num_rounds: int = 10,
    max_main_characters: int = 3,
    max_analysts: int = 5,
) -> Dict[str, Any]:
    """
    Run a full character-driven simulation.
    
    Returns:
        {
            "ticker": str,
            "event": str,
            "rounds": [SimulationRound],
            "consensus": {target_price, confidence, bull_pct, bear_pct, neutral_pct},
            "character_predictions": [{character_id, target_price, confidence, reasoning}],
            "debate_highlights": [str],
        }
    """
    import asyncio
    
    main_chars, analyst_chars = select_relevant_characters(
        event_id, event_name, ticker, max_main_characters, max_analysts
    )
    all_chars = main_chars + analyst_chars
    
    event_context = (
        f"STOCK: {ticker} at ${current_price:.2f}\n"
        f"EVENT: {event_name}\n"
        f"DESCRIPTION: {event_description}\n"
        f"PROBABILITY: {probability*100:.0f}%\n"
        f"EXPECTED DURATION: {duration_days} days\n"
    )
    
    rounds: List[SimulationRound] = []
    all_predictions: List[Dict] = []
    debate_log: List[str] = []
    
    for round_num in range(1, num_rounds + 1):
        # Determine phase
        if round_num <= 2:
            phase = "event_intro"
        elif round_num <= int(num_rounds * 0.7):
            phase = "escalation"
        else:
            phase = "resolution"
        
        sim_round = SimulationRound(round_num=round_num, phase=phase)
        
        # Build context from previous rounds
        prev_context = ""
        if rounds:
            last_round = rounds[-1]
            prev_actions = []
            for r in last_round.reactions[-6:]:  # Last 6 reactions
                prev_actions.append(f"[{r.display_name}]: {r.action[:200]}")
            prev_context = "\nPREVIOUS ROUND:\n" + "\n".join(prev_actions)
        
        # Phase-specific prompts
        if phase == "event_intro":
            round_prompt = f"Round {round_num}: The event has just been announced. React with your initial assessment and prediction."
        elif phase == "escalation":
            round_prompt = f"Round {round_num}: The situation is evolving. Update your position based on what other characters have said and done.{prev_context}"
        else:
            round_prompt = f"Round {round_num}: Resolution phase. Give your final prediction with confidence level. Who was right? Who was wrong?{prev_context}"
        
        # Main characters react first
        for char in main_chars:
            try:
                system = char.system_prompt(event_context)
                response = _call_claude(
                    char.model,
                    system,
                    [{"role": "user", "content": round_prompt}],
                    max_tokens=300,
                )
                
                # Parse prediction from response
                prediction = _extract_prediction(response, ticker, current_price)
                
                reaction = CharacterReaction(
                    character_id=char.id,
                    character_name=char.name,
                    display_name=char.display_name,
                    avatar_emoji=char.avatar_emoji,
                    tier=char.tier,
                    round_num=round_num,
                    action=response,
                    prediction=prediction,
                )
                sim_round.reactions.append(reaction)
                
                if prediction:
                    all_predictions.append({
                        "character_id": char.id,
                        "character_name": char.display_name,
                        "round": round_num,
                        **prediction,
                    })
                    
            except Exception as e:
                logger.warning(f"Character {char.id} failed in round {round_num}: {e}")
                sim_round.reactions.append(CharacterReaction(
                    character_id=char.id,
                    character_name=char.name,
                    display_name=char.display_name,
                    avatar_emoji=char.avatar_emoji,
                    tier=char.tier,
                    round_num=round_num,
                    action=f"[{char.display_name} is considering their response...]",
                ))
        
        # Then analysts react
        # Build context of what main characters did this round
        main_actions = "\n".join(
            f"[{r.display_name}]: {r.action[:200]}"
            for r in sim_round.reactions if r.tier == "main_character"
        )
        analyst_round_prompt = (
            f"{round_prompt}\n\n"
            f"MAIN CHARACTER ACTIONS THIS ROUND:\n{main_actions}\n\n"
            f"Provide your analysis and specific price prediction for {ticker}."
        )
        
        for char in analyst_chars:
            try:
                system = char.system_prompt(event_context)
                response = _call_claude(
                    char.model,
                    system,
                    [{"role": "user", "content": analyst_round_prompt}],
                    max_tokens=250,
                )
                
                prediction = _extract_prediction(response, ticker, current_price)
                
                reaction = CharacterReaction(
                    character_id=char.id,
                    character_name=char.name,
                    display_name=char.display_name,
                    avatar_emoji=char.avatar_emoji,
                    tier=char.tier,
                    round_num=round_num,
                    action=response,
                    prediction=prediction,
                )
                sim_round.reactions.append(reaction)
                
                if prediction:
                    all_predictions.append({
                        "character_id": char.id,
                        "character_name": char.display_name,
                        "round": round_num,
                        **prediction,
                    })
                    
            except Exception as e:
                logger.warning(f"Analyst {char.id} failed in round {round_num}: {e}")
        
        # Compute round consensus
        round_predictions = [r.prediction for r in sim_round.reactions if r.prediction]
        if round_predictions:
            sim_round.consensus = _compute_consensus(round_predictions, current_price)
        
        rounds.append(sim_round)
        debate_log.append(f"--- Round {round_num} ({phase}) ---")
        for r in sim_round.reactions:
            debate_log.append(f"{r.avatar_emoji} {r.display_name}: {r.action[:150]}")
    
    # Final consensus from last round
    final_consensus = rounds[-1].consensus if rounds else None
    
    # Compute overall character predictions (last prediction from each)
    final_char_predictions = {}
    for p in reversed(all_predictions):
        if p["character_id"] not in final_char_predictions:
            final_char_predictions[p["character_id"]] = p
    
    return {
        "ticker": ticker,
        "current_price": current_price,
        "event": event_name,
        "event_id": event_id,
        "probability": probability,
        "num_rounds": num_rounds,
        "rounds": [r.to_dict() for r in rounds],
        "consensus": final_consensus,
        "character_predictions": list(final_char_predictions.values()),
        "characters": [
            {
                "id": c.id,
                "name": c.display_name,
                "role": c.role,
                "tier": c.tier,
                "avatar_emoji": c.avatar_emoji,
            }
            for c in all_chars
        ],
        "debate_highlights": _extract_highlights(debate_log),
    }


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def _extract_prediction(response: str, ticker: str, current_price: float) -> Optional[Dict]:
    """Extract price prediction from character response text."""
    import re
    
    # Try to find a dollar amount prediction
    # Patterns: "$170", "target: $170", "CVX → $170", "price of $170"
    patterns = [
        rf'\$(\d+(?:\.\d+)?)',  # $170 or $170.50
        rf'{ticker}\s*(?:→|->|to)\s*\$?(\d+(?:\.\d+)?)',  # CVX → 170
        rf'target[:\s]+\$?(\d+(?:\.\d+)?)',  # target: 170
        rf'price[:\s]+\$?(\d+(?:\.\d+)?)',  # price: 170
    ]
    
    prices = []
    for pattern in patterns:
        matches = re.findall(pattern, response, re.IGNORECASE)
        for m in matches:
            try:
                p = float(m)
                # Sanity check: within 50% of current price
                if current_price * 0.5 <= p <= current_price * 2.0:
                    prices.append(p)
            except ValueError:
                pass
    
    if not prices:
        return None
    
    target = prices[0]  # Take first plausible price
    
    # Determine direction
    direction = "bullish" if target > current_price else "bearish" if target < current_price else "neutral"
    
    # Try to find confidence
    conf_match = re.search(r'(\d+)\s*%\s*(?:confidence|probability|chance|certain)', response, re.IGNORECASE)
    confidence = int(conf_match.group(1)) if conf_match else 65
    confidence = min(max(confidence, 10), 99)
    
    change_pct = ((target - current_price) / current_price) * 100
    
    return {
        "target_price": round(target, 2),
        "direction": direction,
        "confidence": confidence,
        "change_pct": round(change_pct, 2),
    }


def _compute_consensus(predictions: List[Dict], current_price: float) -> Dict:
    """Compute consensus from multiple predictions."""
    if not predictions:
        return {"target_price": current_price, "confidence": 50, "bull_pct": 33, "bear_pct": 33, "neutral_pct": 34}
    
    targets = [p["target_price"] for p in predictions if p and "target_price" in p]
    confidences = [p["confidence"] for p in predictions if p and "confidence" in p]
    
    if not targets:
        return {"target_price": current_price, "confidence": 50, "bull_pct": 33, "bear_pct": 33, "neutral_pct": 34}
    
    avg_target = sum(targets) / len(targets)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 50
    
    bull = sum(1 for t in targets if t > current_price * 1.01)
    bear = sum(1 for t in targets if t < current_price * 0.99)
    neutral = len(targets) - bull - bear
    total = len(targets) or 1
    
    return {
        "target_price": round(avg_target, 2),
        "confidence": round(avg_confidence),
        "bull_pct": round(bull / total * 100),
        "bear_pct": round(bear / total * 100),
        "neutral_pct": round(neutral / total * 100),
        "num_predictions": len(targets),
    }


def _extract_highlights(debate_log: List[str]) -> List[str]:
    """Extract the most interesting debate moments."""
    highlights = []
    for line in debate_log:
        if any(kw in line.lower() for kw in ["disagree", "wrong", "all-in", "panic", "historically", "selling"]):
            highlights.append(line)
    return highlights[:10]  # Top 10 highlights


# ---------------------------------------------------------------------------
# Synchronous wrapper for FastAPI
# ---------------------------------------------------------------------------

def run_simulation_sync(
    ticker: str,
    current_price: float,
    event_id: str,
    event_name: str,
    event_description: str,
    probability: float,
    duration_days: int,
    num_rounds: int = 10,
    max_main_characters: int = 3,
    max_analysts: int = 5,
) -> Dict[str, Any]:
    """Synchronous wrapper for the async simulation."""
    import asyncio
    
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an existing event loop (e.g., uvicorn)
            # Run synchronously instead
            return _run_simulation_sync_impl(
                ticker, current_price, event_id, event_name, event_description,
                probability, duration_days, num_rounds, max_main_characters, max_analysts
            )
    except RuntimeError:
        pass
    
    return asyncio.run(run_character_simulation(
        ticker, current_price, event_id, event_name, event_description,
        probability, duration_days, num_rounds, max_main_characters, max_analysts
    ))


def _run_simulation_sync_impl(
    ticker: str,
    current_price: float,
    event_id: str,
    event_name: str,
    event_description: str,
    probability: float,
    duration_days: int,
    num_rounds: int = 10,
    max_main_characters: int = 3,
    max_analysts: int = 5,
) -> Dict[str, Any]:
    """Pure synchronous implementation for use inside existing event loops."""
    
    main_chars, analyst_chars = select_relevant_characters(
        event_id, event_name, ticker, max_main_characters, max_analysts
    )
    all_chars = main_chars + analyst_chars
    
    event_context = (
        f"STOCK: {ticker} at ${current_price:.2f}\n"
        f"EVENT: {event_name}\n"
        f"DESCRIPTION: {event_description}\n"
        f"PROBABILITY: {probability*100:.0f}%\n"
        f"EXPECTED DURATION: {duration_days} days\n"
    )
    
    rounds = []
    all_predictions = []
    debate_log = []
    
    for round_num in range(1, num_rounds + 1):
        if round_num <= 2:
            phase = "event_intro"
        elif round_num <= int(num_rounds * 0.7):
            phase = "escalation"
        else:
            phase = "resolution"
        
        sim_round = SimulationRound(round_num=round_num, phase=phase)
        
        prev_context = ""
        if rounds:
            last = rounds[-1]
            prev_actions = [f"[{r.display_name}]: {r.action[:200]}" for r in last.reactions[-6:]]
            prev_context = "\nPREVIOUS ROUND:\n" + "\n".join(prev_actions)
        
        if phase == "event_intro":
            prompt = f"Round {round_num}: The event has just been announced. React with your initial assessment and prediction."
        elif phase == "escalation":
            prompt = f"Round {round_num}: The situation is evolving. Update your position.{prev_context}"
        else:
            prompt = f"Round {round_num}: Resolution phase. Final prediction with confidence.{prev_context}"
        
        # Main characters
        for char in main_chars:
            try:
                resp = _call_claude(char.model, char.system_prompt(event_context), [{"role": "user", "content": prompt}], 300)
                pred = _extract_prediction(resp, ticker, current_price)
                reaction = CharacterReaction(char.id, char.name, char.display_name, char.avatar_emoji, char.tier, round_num, resp, pred)
                sim_round.reactions.append(reaction)
                if pred:
                    all_predictions.append({"character_id": char.id, "character_name": char.display_name, "round": round_num, **pred})
            except Exception as e:
                logger.warning(f"Char {char.id} round {round_num}: {e}")
                sim_round.reactions.append(CharacterReaction(char.id, char.name, char.display_name, char.avatar_emoji, char.tier, round_num, f"[{char.display_name} is considering...]"))
        
        # Analysts
        main_actions = "\n".join(f"[{r.display_name}]: {r.action[:200]}" for r in sim_round.reactions if r.tier == "main_character")
        analyst_prompt = f"{prompt}\n\nMAIN CHARACTER ACTIONS:\n{main_actions}\n\nProvide analysis and price prediction for {ticker}."
        
        for char in analyst_chars:
            try:
                resp = _call_claude(char.model, char.system_prompt(event_context), [{"role": "user", "content": analyst_prompt}], 250)
                pred = _extract_prediction(resp, ticker, current_price)
                reaction = CharacterReaction(char.id, char.name, char.display_name, char.avatar_emoji, char.tier, round_num, resp, pred)
                sim_round.reactions.append(reaction)
                if pred:
                    all_predictions.append({"character_id": char.id, "character_name": char.display_name, "round": round_num, **pred})
            except Exception as e:
                logger.warning(f"Analyst {char.id} round {round_num}: {e}")
        
        round_preds = [r.prediction for r in sim_round.reactions if r.prediction]
        if round_preds:
            sim_round.consensus = _compute_consensus(round_preds, current_price)
        
        rounds.append(sim_round)
        debate_log.append(f"--- Round {round_num} ({phase}) ---")
        for r in sim_round.reactions:
            debate_log.append(f"{r.avatar_emoji} {r.display_name}: {r.action[:150]}")
    
    final_consensus = rounds[-1].consensus if rounds else None
    final_char_predictions = {}
    for p in reversed(all_predictions):
        if p["character_id"] not in final_char_predictions:
            final_char_predictions[p["character_id"]] = p
    
    return {
        "ticker": ticker,
        "current_price": current_price,
        "event": event_name,
        "event_id": event_id,
        "probability": probability,
        "num_rounds": num_rounds,
        "rounds": [r.to_dict() for r in rounds],
        "consensus": final_consensus,
        "character_predictions": list(final_char_predictions.values()),
        "characters": [{"id": c.id, "name": c.display_name, "role": c.role, "tier": c.tier, "avatar_emoji": c.avatar_emoji} for c in all_chars],
        "debate_highlights": _extract_highlights(debate_log),
    }


# ---------------------------------------------------------------------------
# Chat with Character
# ---------------------------------------------------------------------------

def chat_with_character(
    character_id: str,
    message: str,
    ticker: str,
    current_price: float,
    event_context: str = "",
    history: List[Dict] = None,
) -> Dict[str, Any]:
    """Have a 1-on-1 conversation with a character."""
    
    char = MAIN_CHARACTERS.get(character_id) or ANALYST_CHARACTERS.get(character_id)
    if not char:
        raise ValueError(f"Unknown character: {character_id}")
    
    system = char.system_prompt(f"STOCK: {ticker} at ${current_price:.2f}\n{event_context}")
    system += "\n\nYou are now in a 1-on-1 chat with a user. Answer their questions in character. Be conversational and insightful."
    
    messages = []
    if history:
        for h in history[-10:]:  # Last 10 messages
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})
    
    response = _call_claude(char.model, system, messages, max_tokens=400)
    
    return {
        "character_id": char.id,
        "character_name": char.display_name,
        "avatar_emoji": char.avatar_emoji,
        "response": response,
    }


# ---------------------------------------------------------------------------
# List available characters
# ---------------------------------------------------------------------------

def list_characters() -> Dict[str, Any]:
    """List all available characters."""
    return {
        "main_characters": [
            {"id": c.id, "name": c.display_name, "role": c.role, "avatar_emoji": c.avatar_emoji, "expertise": c.expertise}
            for c in MAIN_CHARACTERS.values()
        ],
        "analysts": [
            {"id": c.id, "name": c.display_name, "role": c.role, "avatar_emoji": c.avatar_emoji, "expertise": c.expertise}
            for c in ANALYST_CHARACTERS.values()
        ],
    }