import type { Metadata } from 'next';
import { absoluteUrl, defaultSocialImages } from '../../lib/site';
import SiteFooter from '../../components/SiteFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy | GoDoggyDate',
  description:
    'How GoDoggyDate collects, uses, and protects your account and dog-profile data. We do not sell your personal information.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | GoDoggyDate',
    description: 'How GoDoggyDate handles your data — plainly explained.',
    url: absoluteUrl('/privacy'),
    type: 'article',
    images: defaultSocialImages,
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-white px-6 py-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose">Privacy</p>
        <h1 className="mt-3 font-display text-4xl text-brown">Privacy Policy</h1>
        <p className="mt-2 text-xs text-brown-light">Last updated: November 2026</p>
        <div className="mt-6 space-y-4 text-sm leading-7 text-brown-light">
          <p>GoDoggyDate is operated by GoBots LLC, a Michigan limited liability company, and built to help dog owners find safer, more compatible local playdates.</p>
          <p><strong className="text-brown">What we collect:</strong> your sign-in details (name, email address, and account ID from Google or Apple); your dog&apos;s profile and photos; your ZIP code and approximate location (rounded to about 1 km); swipes, matches, chat messages, ratings, reminders, and reports; push notification tokens; and how you use the site.</p>
          <p><strong className="text-brown">What other people can see:</strong> your dog&apos;s profile, photos, and general area are visible to other members, and to anyone with the link to your dog&apos;s public page. We remove location metadata from photos uploaded on the website.</p>
          <p><strong className="text-brown">Who processes it:</strong> Google Firebase (sign-in, data storage, notifications), Google Analytics (usage measurement, including a user ID), Google Gemini (AI features, which receive dog photos, profile details, and notes you write), Stripe (payments; we never see your full card number), and Vercel (website hosting). We do not sell your personal information.</p>
          <p><strong className="text-brown">Keeping and deleting data:</strong> we keep your data while your account is open. You can delete your account in Profile, or see <a href="/delete-account" className="font-semibold text-rose underline underline-offset-2">how to delete your account</a>; email requests are answered within 30 days. Deleting your account removes your profile, photos, matches, and chats. We keep payment records and reports, including a copy of the conversation at the time of a report, where needed for legal, fraud, and safety reasons.</p>
          <p><strong className="text-brown">Safety reports:</strong> if you report another user, the team reviews the report and the recent messages from that conversation. Moderation is manual during early access.</p>
          <p>Questions about privacy, or requests to access or correct your data, can be sent to <a href="mailto:godoggydate@gobotsai.com" className="font-semibold text-rose underline underline-offset-2">godoggydate@gobotsai.com</a>.</p>
        </div>
      </div>
      </div>
      <SiteFooter />
    </main>
  );
}
