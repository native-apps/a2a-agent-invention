/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "neon-green": "rgb(var(--neon-green-rgb) / <alpha-value>)",
        "hot-pink": "rgb(var(--hot-pink-rgb) / <alpha-value>)",
        "blood-orange": "rgb(var(--blood-orange-rgb) / <alpha-value>)",
        "electric-cyan": "rgb(var(--electric-cyan-rgb) / <alpha-value>)",
        "deep-void": "rgb(var(--deep-void-rgb) / <alpha-value>)",
        "dark-matter": "rgb(var(--dark-matter-rgb) / <alpha-value>)",
        "neural-node": "rgb(var(--neural-node-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Departure Mono", "JetBrains Mono", "monospace"],
        heading: ["Departure Mono", "JetBrains Mono", "monospace"],
        mono: ["Departure Mono", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        xl: "0",
        lg: "0",
        md: "0",
        sm: "0",
        xs: "0",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "glow-green":
          "0 0 20px rgb(var(--neon-green-rgb) / 0.3), 0 0 40px rgb(var(--neon-green-rgb) / 0.1)",
        "glow-pink":
          "0 0 20px rgb(var(--hot-pink-rgb) / 0.3), 0 0 40px rgb(var(--hot-pink-rgb) / 0.1)",
        "glow-orange":
          "0 0 20px rgb(var(--blood-orange-rgb) / 0.3), 0 0 40px rgb(var(--blood-orange-rgb) / 0.1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.6" },
        },
        "node-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.5" },
          "50%": { transform: "scale(1.5)", opacity: "1" },
        },
        "line-flow": {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        float: "float 4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "node-pulse": "node-pulse 2s ease-in-out infinite",
        "line-flow": "line-flow 2s linear forwards",
        "spin-slow": "spin-slow 20s linear infinite",
        "fade-in": "fade-in 0.3s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
