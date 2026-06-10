/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202124",
        leaf: "#2f7d57",
        mint: "#e5f4ec",
        peach: "#fff0e8",
        line: "#06c755"
      }
    }
  },
  plugins: []
};
