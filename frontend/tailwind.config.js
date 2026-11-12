/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        asphalt: { DEFAULT: "#2A2F35", light: "#3A4048", dark: "#1D2126" },
        concrete: { DEFAULT: "#E4E7EA", dark: "#CFD4D9" },
        sign: { DEFAULT: "#0A4DA2", dark: "#083B7C", light: "#DCE8F7" },
        paint: "#F2C200",
        go: "#1E8E5A",
        stop: "#C73A2F",
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', "sans-serif"],
        body: ['"Public Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
