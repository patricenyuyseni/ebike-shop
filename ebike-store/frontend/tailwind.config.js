/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: { 50: '#f4f5f6', 100: '#e6e8ea', 200: '#c9cdd2', 300: '#a2a8b0', 400: '#78808a', 500: '#5a626c', 600: '#434a53', 700: '#2f353c', 800: '#20252a', 900: '#16191d', 950: '#0d0f11' },
        volt: { 50: '#ecfff4', 100: '#d3ffe6', 200: '#a6ffcc', 300: '#6dffaa', 400: '#33f585', 500: '#12e068', 600: '#09b852', 700: '#0a8f42', 800: '#0d7038', 900: '#0d5b30' },
      },
      fontFamily: {
        display: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 40px -8px rgba(18,224,104,.55)', card: '0 1px 2px rgba(13,15,17,.06), 0 8px 24px -12px rgba(13,15,17,.18)' },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseGlow: { '0%,100%': { opacity: '.55' }, '50%': { opacity: '1' } },
        wheel: { to: { transform: 'rotate(360deg)' } },
      },
      animation: { 'fade-up': 'fadeUp .6s ease-out both', 'pulse-glow': 'pulseGlow 3.5s ease-in-out infinite', wheel: 'wheel 6s linear infinite' },
    },
  },
  plugins: [],
}
