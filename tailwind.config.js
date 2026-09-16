/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6f8ed',
          100: '#ebf1d6',
          200: '#d9e4b0',
          300: '#c1d480',
          400: '#a8c255',
          500: '#8aa822',
          600: '#759019',
          700: '#5a7017',
          800: '#485918',
          900: '#3d4b18',
        },
      },
      boxShadow: {
        'glass': '0 20px 50px -10px rgba(0, 0, 0, 0.15)',
        'glass-card': '0 10px 30px -5px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
