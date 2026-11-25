/** @type {import('tailwindcss').Config} */
// Ontario Tech University palette: dark blue (PMS 541, #003C71), Simcoe blue (#0077CA) and
// Tech Tangerine (#E75D2A). Green/red are kept only as availability signals (free / full).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#003C71", dark: "#002849", deep: "#001B33", light: "#E3ECF5" },
        simcoe: { DEFAULT: "#0077CA", dark: "#005FA3", light: "#DDEEFA" },
        tangerine: { DEFAULT: "#E75D2A", dark: "#C4471A", light: "#FCE6DC" },
        // neutrals / legacy token names used across components
        asphalt: { DEFAULT: "#1E2A38", light: "#2E3B4C", dark: "#141C26" },
        concrete: { DEFAULT: "#EEF2F6", dark: "#D9E0E8" },
        sign: { DEFAULT: "#003C71", dark: "#002849", light: "#E3ECF5" },
        paint: "#E75D2A",
        go: "#178A55",
        stop: "#C8372D",
      },
      fontFamily: {
        display: ['"Montserrat"', "system-ui", "sans-serif"],
        body: ['"Public Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,27,51,.06), 0 4px 16px rgba(0,27,51,.06)",
      },
      keyframes: {
        pulseDot: { "0%,100%": { opacity: 1, transform: "scale(1)" }, "50%": { opacity: .4, transform: "scale(.8)" } },
        slideIn: { from: { opacity: 0, transform: "translateY(-6px)" }, to: { opacity: 1, transform: "none" } },
      },
      animation: { pulseDot: "pulseDot 1.6s ease-in-out infinite", slideIn: "slideIn .35s ease-out" },
    },
  },
  plugins: [],
};
