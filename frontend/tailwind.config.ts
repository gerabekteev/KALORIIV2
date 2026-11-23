/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neutral: {
          850: '#1A1A1D',
        },
        nothing: {
          black: '#000000',
          canvas: '#000000',
          sheet: '#111113',
          surface: '#1A1A1D',
          elevated: '#222226',
          pill: '#2A2A2F',
          border: '#2E2E34',
          muted: '#7A7A82',
          subtle: '#A1A1AA',
          red: '#E02424',
          'red-hover': '#C81E1E',
        },
        dark: {
          bg: '#000000',
          surface: '#111113',
          card: '#1A1A1D',
          elevated: '#222226',
          border: '#2A2A2F',
          muted: '#7A7A82',
        },
        brand: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#E02424',
          600: '#C81E1E',
          700: '#991b1b',
          800: '#7f1d1d',
          900: '#450a0a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        ndot: ['Doto', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        bento: '22px',
        sheet: '28px',
      },
    },
  },
  plugins: [],
}
