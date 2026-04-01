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
        'brown-light': '#9B7560',
        border: '#EAD9C8',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        body: ['var(--font-nunito)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
export default config;
