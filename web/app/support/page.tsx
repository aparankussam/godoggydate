import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl, defaultSocialImages } from '../../lib/site';
import SiteFooter from '../../components/SiteFooter';

const SUPPORT_EMAIL = 'godoggydate@gobotsai.com';

export const metadata: Metadata = {
  title: 'Support | GoDoggyDate',
  description:
    'How to reach GoDoggyDate, report a profile or message, delete your account, and find the safety guide.',
  alternates: {
    canonical: '/support',
  },
  openGraph: {
    title: 'Support | GoDoggyDate',
    description: 'How to reach us, report a profile or message, and delete your account.',
    url: absoluteUrl('/support'),
    type: 'article',
    images: defaultSocialImages,
  },
};

const link = 'font-semibold text-rose underline underline-offset-2';

export default function SupportPage() {
  return (
    <main className="min-h-screen">
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl card px-6 py-8 sm:px-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose">Support</p>
          <h1 className="mt-3 font-display text-4xl text-brown">How can we help?</h1>
          <p className="mt-3 text-sm leading-7 text-brown-mid">
            GoDoggyDate is a small, independent app. The quickest way to reach a person is email.
          </p>

          <div className="mt-6 space-y-6 text-sm leading-7 text-brown-mid">
            <section aria-labelledby="support-contact">
              <h2 id="support-contact" className="font-display text-xl text-brown">Contact us</h2>
              <p className="mt-1">
                Email{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>{SUPPORT_EMAIL}</a>
                {' '}for anything about your account, a bug, a purchase or refund, or your data.
                Writing from the address on your account helps us find it.
              </p>
            </section>

            <section aria-labelledby="support-report">
              <h2 id="support-report" className="font-display text-xl text-brown">Report a profile or a message</h2>
              <p className="mt-1">
                If a profile or a message looks wrong or unsafe, report it in the app so the team can review it:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>In a chat, tap the ••• at the top and choose <strong className="text-brown">Report or block</strong>.</li>
                <li>On a dog&apos;s profile card, use the <strong className="text-brown">Report or block</strong> button.</li>
              </ul>
              <p className="mt-2">
                The same menu lets you block that person. If you can&apos;t use the app,
                email us the dog&apos;s name and what happened. For an injury or an emergency, contact local
                emergency services and animal control directly; GoDoggyDate can&apos;t step in at a meetup.
              </p>
            </section>

            <section aria-labelledby="support-delete">
              <h2 id="support-delete" className="font-display text-xl text-brown">Delete your account</h2>
              <p className="mt-1">
                Open Profile, choose Delete account, and confirm. If you can&apos;t sign in, email us. The
                steps, and what is and isn&apos;t deleted, are on the{' '}
                <Link href="/delete-account" className={link}>delete your account</Link> page.
              </p>
            </section>

            <section aria-labelledby="support-safety">
              <h2 id="support-safety" className="font-display text-xl text-brown">Meeting another dog safely</h2>
              <p className="mt-1">
                Read <Link href="/playdate-safety" className={link}>Play or Fight?</Link>, our guide to
                first meetings, body language and when to call it off.
              </p>
            </section>

            <section aria-labelledby="support-signin">
              <h2 id="support-signin" className="font-display text-xl text-brown">Trouble signing in?</h2>
              <p className="mt-1">
                You sign in with Google or Apple. If you opened GoDoggyDate inside another app&apos;s built-in
                browser (Instagram, Facebook and similar), open the page in Safari or Chrome and try again.
              </p>
            </section>

            <section aria-labelledby="support-legal">
              <h2 id="support-legal" className="font-display text-xl text-brown">The fine print</h2>
              <p className="mt-1">
                <Link href="/terms" className={link}>Terms of Service</Link> and{' '}
                <Link href="/privacy" className={link}>Privacy Policy</Link>. GoDoggyDate is operated by
                GoBots LLC, a Michigan limited liability company.
              </p>
            </section>
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
