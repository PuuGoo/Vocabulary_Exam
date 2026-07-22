import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        inksoft: "rgb(var(--color-inksoft) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        gold: "rgb(var(--color-gold) / <alpha-value>)",
        golddark: "rgb(var(--color-golddark) / <alpha-value>)",
        goldpale: "rgb(var(--color-goldpale) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        ok: "rgb(var(--color-ok) / <alpha-value>)",
        okbg: "rgb(var(--color-okbg) / <alpha-value>)",
        bad: "rgb(var(--color-bad) / <alpha-value>)",
        badbg: "rgb(var(--color-badbg) / <alpha-value>)",
      },
      fontFamily: {
        // NOTE: Georgia is intentionally excluded — it lacks proper precomposed
        // glyphs for several Vietnamese diacritic combinations (ấ, ắ, ẫ, ậ, ẳ...),
        // which caused the tone mark to render visually detached from the letter.
        sans: ["Inter", "Manrope", "Segoe UI", "Arial", "sans-serif"],
        serif: ["Inter", "Manrope", "Segoe UI", "Arial", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "12px",
      },
    },
  },
  plugins: [],
};
export default config;
