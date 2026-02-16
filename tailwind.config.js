/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: '#003366',
        gold: '#D4AF37',
        darkNavy: '#001a33',
      }
    }
  }
}
