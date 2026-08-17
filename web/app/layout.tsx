import type { Metadata } from 'next';
import { Fraunces, Nunito } from 'next/font/google';
import Script from 'next/script';
import AnalyticsTracker from '../components/AnalyticsTracker';
import { absoluteUrl, siteUrl } from '../lib/site';
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
  metadataBase: new URL(siteUrl),
  title: 'GoDoggyDate — Your dog\'s whole life, in one place',
  description:
    'Discover your dog\'s Dogtype, watch them grow through every life stage, celebrate the real milestones, and find the playmates who actually fit. Free to start.',
  keywords: 'dog personality, dogtype, dog identity, dog life stage, dog milestones, dog playdate, dog socialization',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'GoDoggyDate — Your dog\'s whole life, in one place',
    description: 'Your dog\'s Dogtype, their life stage, their milestones — and the playmates who actually fit.',
    url: absoluteUrl('/'),
    siteName: 'GoDoggyDate',
    type: 'website',
    images: [
      {
        url: absoluteUrl('/images/kaju-hero.jpg'),
        width: 1200,
        height: 630,
        alt: 'GoDoggyDate founder dog Kaju',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GoDoggyDate — Your dog\'s whole life, in one place',
    description: 'Your dog\'s Dogtype, their life stage, their milestones — and the playmates who actually fit.',
    images: [absoluteUrl('/images/kaju-hero.jpg')],
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable}`}>
      <body className="bg-cream text-brown antialiased">
        {gaMeasurementId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}', { send_page_view: false });
              `}
            </Script>
          </>
        )}
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  );
}
