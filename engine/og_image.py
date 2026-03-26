"""
AlphaEdge OG Image Generator

Generates Open Graph preview images for scenario sharing.
Uses simple SVG-based rendering — no heavy dependencies.
"""

import json
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)


def generate_og_svg(
    ticker: str,
    title: str,
    median_target: float,
    prob_profit: float,
    event_count: int,
    author_name: str = "Anonymous",
    is_bullish: bool = True,
) -> str:
    """Generate an SVG Open Graph image for a scenario."""
    
    # Colors
    accent = "#6366f1"  # Indigo
    bg = "#0a0a1a"
    card_bg = "#111128"
    text = "#e5e7eb"
    muted = "#6b7280"
    bullish = "#22c55e"
    bearish = "#ef4444"
    direction_color = bullish if is_bullish else bearish
    direction_arrow = "↑" if is_bullish else "↓"
    direction_text = "Bullish" if is_bullish else "Bearish"
    
    # Calculate change percentage
    # (we don't have current price here, so just show the target)
    
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="1200" height="630" fill="{bg}"/>
  
  <!-- Gradient accent bar at top -->
  <defs>
    <linearGradient id="accent_grad" x1="0" y1="0" x2="1200" y2="0">
      <stop offset="0%" style="stop-color:{accent};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1"/>
    </linearGradient>
    <linearGradient id="card_grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:{card_bg};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:{bg};stop-opacity:0.8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="4" fill="url(#accent_grad)"/>
  
  <!-- Logo + branding -->
  <rect x="40" y="30" width="36" height="36" rx="8" fill="{accent}"/>
  <text x="58" y="56" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="{bg}" text-anchor="middle">α</text>
  <text x="88" y="55" font-family="system-ui,sans-serif" font-size="18" font-weight="600" fill="{text}">AlphaEdge</text>
  <text x="1160" y="55" font-family="system-ui,sans-serif" font-size="13" fill="{muted}" text-anchor="end">alphaedge.io</text>

  <!-- Main card area -->
  <rect x="40" y="80" width="1120" height="460" rx="16" fill="url(#card_grad)" stroke="{accent}" stroke-opacity="0.2" stroke-width="1"/>
  
  <!-- Ticker badge -->
  <rect x="70" y="110" width="{len(ticker) * 18 + 30}" height="40" rx="8" fill="{accent}" fill-opacity="0.15"/>
  <text x="85" y="137" font-family="monospace" font-size="22" font-weight="700" fill="{accent}">${ticker}</text>
  
  <!-- Title -->
  <text x="70" y="185" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="{text}">
    {_escape_svg(title[:60])}{" ..." if len(title) > 60 else ""}
  </text>
  
  <!-- Stats row -->
  <g transform="translate(70, 230)">
    <!-- Median Target -->
    <rect width="240" height="110" rx="12" fill="{bg}" stroke="{muted}" stroke-opacity="0.15"/>
    <text x="20" y="35" font-family="system-ui,sans-serif" font-size="13" fill="{muted}">Median Target</text>
    <text x="20" y="75" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="{direction_color}">${median_target:,.0f}</text>
    <text x="20" y="95" font-family="system-ui,sans-serif" font-size="14" fill="{direction_color}">{direction_arrow} {direction_text}</text>
    
    <!-- Prob Profit -->
    <g transform="translate(270, 0)">
      <rect width="240" height="110" rx="12" fill="{bg}" stroke="{muted}" stroke-opacity="0.15"/>
      <text x="20" y="35" font-family="system-ui,sans-serif" font-size="13" fill="{muted}">Probability Profit</text>
      <text x="20" y="75" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="{direction_color}">{prob_profit:.0f}%</text>
      <text x="20" y="95" font-family="system-ui,sans-serif" font-size="14" fill="{muted}">Monte Carlo sim</text>
    </g>
    
    <!-- Events -->
    <g transform="translate(540, 0)">
      <rect width="240" height="110" rx="12" fill="{bg}" stroke="{muted}" stroke-opacity="0.15"/>
      <text x="20" y="35" font-family="system-ui,sans-serif" font-size="13" fill="{muted}">Events Modeled</text>
      <text x="20" y="75" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="{accent}">{event_count}</text>
      <text x="20" y="95" font-family="system-ui,sans-serif" font-size="14" fill="{muted}">scenario events</text>
    </g>
  </g>
  
  <!-- Author + CTA -->
  <text x="70" y="400" font-family="system-ui,sans-serif" font-size="15" fill="{muted}">by {_escape_svg(author_name)}</text>
  
  <!-- CTA bar -->
  <rect x="70" y="430" width="350" height="44" rx="10" fill="{accent}"/>
  <text x="245" y="458" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="white" text-anchor="middle">See Live Simulation →</text>
  
  <!-- Disclaimer -->
  <text x="600" y="590" font-family="system-ui,sans-serif" font-size="11" fill="{muted}" text-anchor="middle">
    For educational simulation purposes only. Not financial advice.
  </text>
</svg>'''
    
    return svg


def _escape_svg(text: str) -> str:
    """Escape special characters for SVG text."""
    return (text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;"))


def svg_to_png_bytes(svg_str: str) -> Optional[bytes]:
    """Convert SVG to PNG. Requires cairosvg (optional dep)."""
    try:
        import cairosvg
        return cairosvg.svg2png(bytestring=svg_str.encode("utf-8"), output_width=1200, output_height=630)
    except ImportError:
        logger.info("cairosvg not installed — serving SVG directly")
        return None
