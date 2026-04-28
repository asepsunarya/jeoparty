import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        jeopardy: {
          blue: "#060CE9",
          deep: "#060694",
          gold: "#FFCC00",
          cream: "#FFF5C4",
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', "Impact", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        tile: "inset 0 0 0 2px rgba(255,255,255,0.12), 0 10px 30px rgba(0,0,0,0.45)",
        glow: "0 0 40px rgba(255,204,0,0.6)",
      },
      animation: {
        "buzz-pulse": "buzzPulse 0.6s ease-out",
        "tile-flip": "tileFlip 0.6s ease-in-out",
      },
      keyframes: {
        buzzPulse: {
          "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(255,204,0,0.8)" },
          "100%": { transform: "scale(1.04)", boxShadow: "0 0 0 20px rgba(255,204,0,0)" },
        },
        tileFlip: {
          "0%": { transform: "rotateY(0deg)" },
          "50%": { transform: "rotateY(90deg)" },
          "100%": { transform: "rotateY(0deg)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
