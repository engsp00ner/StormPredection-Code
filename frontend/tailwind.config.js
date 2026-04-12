/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        "panel-strong": "rgb(var(--panel-strong) / <alpha-value>)",
        "panel-muted": "rgb(var(--panel-muted) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted-foreground) / <alpha-value>)",
        subtle: "rgb(var(--subtle-foreground) / <alpha-value>)",
      },
    },
  },
  plugins: [],
}
