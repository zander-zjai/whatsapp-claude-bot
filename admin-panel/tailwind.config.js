/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Matches the design tokens on zjai.co.za (--gold / --gold-bright).
        primary: {
          DEFAULT: '#C9A876',
          50: '#1F1B10',
          100: '#2A2415',
          200: '#3D3420',
          300: '#6B5C3A',
          400: '#9C8557',
          500: '#C9A876',
          600: '#E2C594',
          700: '#E2C594',
          800: '#8A734A',
          900: '#5C4D32',
        },
        black: '#0A0A0B',
        panel: '#151517',
        'panel-2': '#1B1B1E',
        line: '#29292C',
        'line-soft': '#1F1F22',
        cream: {
          DEFAULT: '#F5F2EA',
          dim: '#B9B6AC',
        },
        grey: '#6B6B70',
        ink: '#1A1408',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
