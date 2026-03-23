import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0f",
        card: "#1a1a2e",
        cardHover: "#222240",
        accent: "#00d4aa",
        accentDim: "#00a888",
        bullish: "#00d4aa",
        bearish: "#ff4757",
        neutral: "#6b7280",
        muted: "#94a3b8",
        border: "#2a2a4a",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "monospace"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
