import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#FF5C8D',
        'primary-light': '#FF8FB0',
        'primary-dark': '#D63A6B',
        gold: '#FFC56B',
        'gold-light': '#FFE2AE',
        cream: '#FFF9EC',
        'cream-dark': '#F3ECDC',
        brown: '#2A1F4A',
        'brown-mid': '#4A3F6E',
        // Secondary text: passes WCAG AA on cream and cream-dark.
        'brown-light': '#4D4373',
        border: '#E3D6BA',
        // "Sticker Book, grown up" palette
        // Pink as TEXT on paper must pass 4.5:1, so it is a deeper raspberry.
        rose: '#B8214F',
        sky: '#8FC9F2',
        ink: '#2A1F4A',
        paper: '#FFF9EC',
        kraft: '#E6CFA6',
        fit: '#6FDB9C',
        note: '#DCEEFB',
        amber: { DEFAULT: '#FFC56B', spine: '#E8820C' },
        // One red, the app's colors.danger. 700 is its darker shade for text on tints.
        red: { 500: '#D93A3A', 600: '#D93A3A', 700: '#B32D2D' },
      },
      // Matches the app's three Nunito weights: 400 body, 800 labels, 900 buttons.
      fontWeight: { semibold: '800', bold: '800' },
      fontFamily: {
        display: ['var(--font-chewy)', 'Nunito', 'system-ui', 'sans-serif'],
        hand: ['var(--font-caveat)', 'cursive'],
        body: ['var(--font-nunito)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        pawFall: {
          '0%':   { transform: 'translateY(0) rotate(0deg)', opacity: '0' },
          '10%':  { opacity: '0.85' },
          '100%': { transform: 'translateY(110vh) rotate(340deg)', opacity: '0' },
        },
      },
      animation: {
        'paw-fall': 'pawFall linear forwards',
      },
    },
  },
  plugins: [],
};
export default config;
