"""
LLM Router — OpenAI (Codex free tier) with automatic Claude fallback.

Routes to GPT-5.3 first. On 429 rate limit, falls back to Claude for 60s cooldown.
On auth errors, falls back permanently until restart.
"""

import os
import time
import logging
import json

logger = logging.getLogger(__name__)

# Track rate limit state
_openai_limited_until = 0
_openai_permanently_failed = False
_fallback_count = 0
_openai_count = 0


def _get_openai_client():
    """Lazy init OpenAI client."""
    try:
        from openai import OpenAI
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            return None
        return OpenAI(api_key=key)
    except ImportError:
        logger.warning("openai package not installed, Claude-only mode")
        return None


def _get_anthropic_client():
    """Lazy init Anthropic client."""
    try:
        from anthropic import Anthropic
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            return None
        return Anthropic(api_key=key)
    except ImportError:
        logger.warning("anthropic package not installed")
        return None


def chat_completion(
    messages: list,
    model: str = "gpt-5.3",
    max_tokens: int = 1024,
    temperature: float = 0.7,
    **kwargs,
) -> str:
    """
    Route to OpenAI first, fall back to Claude on rate limit.
    
    Args:
        messages: OpenAI-format messages [{"role": "...", "content": "..."}]
        model: OpenAI model name (ignored for Claude fallback)
        max_tokens: Max response tokens
        temperature: Sampling temperature
    
    Returns:
        Response text string
    """
    global _openai_limited_until, _openai_permanently_failed, _fallback_count, _openai_count

    # If OpenAI is permanently failed or in cooldown, go straight to Claude
    if _openai_permanently_failed or time.time() < _openai_limited_until:
        return _claude_fallback(messages, max_tokens=max_tokens, temperature=temperature)

    client = _get_openai_client()
    if not client:
        return _claude_fallback(messages, max_tokens=max_tokens, temperature=temperature)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        _openai_count += 1
        return response.choices[0].message.content

    except Exception as e:
        error_str = str(e).lower()

        if "429" in str(e) or "rate_limit" in error_str or "too many" in error_str:
            # Rate limited — cooldown for 60 seconds
            _openai_limited_until = time.time() + 60
            _fallback_count += 1
            logger.warning(
                f"OpenAI rate limited (count={_fallback_count}), "
                f"falling back to Claude for 60s"
            )
            return _claude_fallback(messages, max_tokens=max_tokens, temperature=temperature)

        elif "401" in str(e) or "403" in str(e) or "invalid_api_key" in error_str:
            # Auth error — permanent fallback
            _openai_permanently_failed = True
            logger.error(f"OpenAI auth error (permanent fallback): {e}")
            return _claude_fallback(messages, max_tokens=max_tokens, temperature=temperature)

        elif "insufficient_quota" in error_str or "billing" in error_str:
            # Quota exhausted — permanent fallback
            _openai_permanently_failed = True
            logger.error(f"OpenAI quota exhausted (permanent fallback): {e}")
            return _claude_fallback(messages, max_tokens=max_tokens, temperature=temperature)

        else:
            # Unknown error — try Claude as one-time fallback
            logger.error(f"OpenAI unknown error, trying Claude: {e}")
            return _claude_fallback(messages, max_tokens=max_tokens, temperature=temperature)


def _claude_fallback(
    messages: list,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """Fall back to Claude via Anthropic API."""
    global _fallback_count
    _fallback_count += 1

    client = _get_anthropic_client()
    if not client:
        raise RuntimeError("Both OpenAI and Anthropic unavailable — no API keys configured")

    # Convert OpenAI message format to Anthropic format
    system_msg = None
    claude_messages = []
    for m in messages:
        if m["role"] == "system":
            system_msg = m["content"]
        else:
            claude_messages.append({"role": m["role"], "content": m["content"]})

    # Ensure messages alternate user/assistant and start with user
    if claude_messages and claude_messages[0]["role"] != "user":
        claude_messages.insert(0, {"role": "user", "content": "Continue."})

    response = client.messages.create(
        model="claude-haiku-4-5",  # Fast + cheap for fallback
        max_tokens=max_tokens,
        system=system_msg or "",
        messages=claude_messages,
        temperature=temperature,
    )
    return response.content[0].text


def get_router_stats() -> dict:
    """Return routing statistics for monitoring."""
    return {
        "openai_calls": _openai_count,
        "claude_fallback_calls": _fallback_count,
        "openai_permanently_failed": _openai_permanently_failed,
        "openai_cooldown_active": time.time() < _openai_limited_until,
        "openai_cooldown_remaining_s": max(0, int(_openai_limited_until - time.time())),
    }
