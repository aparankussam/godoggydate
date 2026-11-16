import type { Metadata } from 'next';
import { absoluteUrl } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Delete Your Account | GoDoggyDate',
  description: 'How to delete your GoDoggyDate account and the data connected to it.',
  alternates: {
    canonical: '/delete-account',
  },
  openGraph: {
    title: 'Delete Your Account | GoDoggyDate',
    description: 'How to delete your GoDoggyDate account and the data connected to it.',
    url: absoluteUrl('/delete-account'),
    type: 'article',
  },
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-white px-6 py-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Account</p>
        <h1 className="mt-3 font-display text-4xl text-brown">Delete your account</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-brown-light">
          <p><strong className="text-brown">In the app or on the website:</strong> open Profile, choose Delete account, and confirm. This takes effect immediately and can&apos;t be undone.</p>
          <p><strong className="text-brown">By email:</strong> if you can&apos;t sign in, email <a href="mailto:godoggydate@gobotsai.com" className="font-semibold text-primary underline underline-offset-2">godoggydate@gobotsai.com</a> from the address on your account. We respond within 30 days.</p>
          <p><strong className="text-brown">What gets deleted:</strong> your account, your dog&apos;s profile and photos, swipes, matches, and chats.</p>
          <p><strong className="text-brown">What we keep:</strong> payment records, and safety reports with the conversation copy attached to them, where needed for legal, fraud, and safety reasons.</p>
          <p>If you bought Founding Member in the last 14 days and want a refund, email us before deleting your account.</p>
        </div>
      </div>
    </main>
  );
}
