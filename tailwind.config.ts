import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c2b3a",
        inksoft: "#3a4a5c",
        paper: "#f2eee1",
        panel: "#fffdf8",
        gold: "#a9812f",
        golddark: "#7d5f22",
        goldpale: "#f1e6c8",
        line: "#ddd4bd",
        muted: "#7c7566",
        ok: "#2f6a52",
        okbg: "#e8f2ec",
        bad: "#a8402e",
        badbg: "#fbeae6",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
      },
      borderRadius: {
        DEFAULT: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
