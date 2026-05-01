import type { Metadata } from 'next';
import { Fraunces, Nunito } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['700', '900'],
});

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '600', '700'],
});

export const metadata: Metadata = {
  title: 'GoDoggyDate — Find safer, happier playdates for your dog',
  description:
    'GoDoggyDate matches dogs based on safety, compatibility, and play style. Find your dog\'s perfect playdate partner nearby.',
  keywords: 'dog playdate, dog socialization, dog matching, safe dog meetups',
  openGraph: {
    title: 'GoDoggyDate',
    description: 'Find safer, happier playdates for your dog 🐾',
    url: 'https://godoggydate.com',
    siteName: 'GoDoggyDate',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GoDoggyDate',
    description: 'Find safer, happier playdates for your dog 🐾',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable}`}>
      <body className="bg-cream text-brown antialiased">
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
