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
        primary: '#E8633A',
        'primary-light': '#F0896A',
        'primary-dark': '#C44E27',
        gold: '#F5B731',
        'gold-light': '#FAD56A',
        cream: '#FDF6EE',
        'cream-dark': '#F5E6D3',
        brown: '#2D1A0E',
        'brown-mid': '#5C3D2E',
        // Secondary text. Was #9B7560 (3.8:1 on cream, 3.4:1 on cream-dark), which
        // fails WCAG AA for the small body copy it is used for; this is 5.3:1 / 4.6:1.
        'brown-light': '#80604B',
        border: '#EAD9C8',
        // Tailwind's red-500 is 3.8:1 on white; as error text it needs red-600.
        red: { 500: '#DC2626' },
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
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
