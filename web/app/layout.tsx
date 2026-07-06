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
  title: 'GoDoggyDate — Find safer, happier playdates for your dog',
  description:
    'GoDoggyDate matches dogs based on safety, compatibility, and play style. Find your dog\'s perfect playdate partner nearby.',
  keywords: 'dog playdate, dog socialization, dog matching, safe dog meetups',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'GoDoggyDate — Find safer, happier playdates for your dog',
    description: 'Find safer, happier playdates for your dog nearby.',
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
    title: 'GoDoggyDate — Find safer, happier playdates for your dog',
    description: 'Find safer, happier playdates for your dog nearby.',
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
