/** @type {import('tailwindcss').Config} */
const brandPalette = {
  50: '#f0f4ff', 100: '#e1e9ff', 200: '#c8d9ff', 300: '#abd2fa',
  400: '#7692ff', 500: '#445de0', 600: '#1b2cc1', 700: '#17259e',
  800: '#14207c', 900: '#091540', 950: '#070f30',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: brandPalette,
        blue: brandPalette,
        slate: {
          50: '#f7f9fc', 100: '#eef2f7', 200: '#dce3ed', 300: '#bdc9d9',
          400: '#64748b', 500: '#56657a', 600: '#46566b', 700: '#34445a',
          800: '#25334a', 900: '#091540', 950: '#111a2b',
        },
        emerald: { 600: '#047857', 700: '#065f46' },
        amber: { 600: '#a14b08', 700: '#853d0b' },
        red: { 600: '#b42318', 700: '#912018' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
