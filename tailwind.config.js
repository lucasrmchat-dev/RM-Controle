/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"SF Pro"',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      colors: {
        apple: {
          canvas: {
            light: '#f5f5f7',
            dark: '#000000',
          },
          card: {
            light: '#ffffff',
            dark: '#161618',
          },
          subtext: {
            light: '#86868b',
            dark: '#a1a1a6',
          },
        },
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
        'apple-sm': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
        'apple': '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
        'apple-card': '0 8px 30px rgba(0, 0, 0, 0.04)',
        'apple-hover': '0 14px 38px rgba(0, 0, 0, 0.08), 0 6px 12px rgba(0, 0, 0, 0.03)',
        'apple-glow': '0 0 40px -10px rgba(101, 163, 13, 0.25)',
        'glass': '0 20px 50px -10px rgba(0, 0, 0, 0.15)',
        'glass-card': '0 10px 30px -5px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
