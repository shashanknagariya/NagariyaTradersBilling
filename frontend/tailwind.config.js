/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#1e1b4b', // Deep Indigo
          gold: '#f59e0b', // Amber/Gold
          light: '#f8fafc', // Slate-50
          gray: '#64748b', // Slate-500
        }
      }
    },
  },
  plugins: [],
}
