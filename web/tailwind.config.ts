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
        gold: '#F5B731',
        'gold-light': '#FAD56A',
        cream: '#FFF9EC',
        'cream-dark': '#F3ECDC',
        brown: '#2A1F4A',
        'brown-mid': '#4A3F6E',
        // Secondary text: passes WCAG AA on cream and cream-dark.
        'brown-light': '#5E5380',
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
        // Tailwind's red-500 is 3.8:1 on white; as error text it needs red-600.
        red: { 500: '#DC2626' },
      },
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
