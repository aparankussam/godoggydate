import type { Metadata } from 'next';
import { absoluteUrl } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service | GoDoggyDate',
  description:
    'The terms for using GoDoggyDate — eligibility, assumption of risk for in-person meetups, your responsibilities, limitation of liability, and refunds.',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'Terms of Service | GoDoggyDate',
    description: 'The terms for using GoDoggyDate, including meetup safety and liability.',
    url: absoluteUrl('/terms'),
    type: 'article',
  },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-white px-6 py-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Terms</p>
        <h1 className="mt-3 font-display text-4xl text-brown">Terms of Service</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-brown-light">
          <p>GoDoggyDate is operated by GoBotsAI as an early-access service for discovering compatible dog playdates.</p>

          <p><strong className="text-brown">Eligibility:</strong> you must be at least 18 years old to create an account or use GoDoggyDate.</p>

          <p>You are responsible for the accuracy of your profile, your dog&apos;s vaccination status, and how you arrange meetups with other owners.</p>

          <p><strong className="text-brown">No vetting or verification:</strong> GoDoggyDate does not verify any user&apos;s identity, any dog&apos;s vaccination records, temperament, breed, health, or behavioral history, or the accuracy of any profile. Profile information is self-reported by users and is not independently confirmed by GoDoggyDate.</p>

          <p><strong className="text-brown">Assumption of risk and release of liability:</strong> in-person meetups arranged through GoDoggyDate carry inherent risks, including but not limited to injury to you or your dog, property damage, and injury caused by another person&apos;s dog. You voluntarily assume all such risks. To the fullest extent permitted by law, you release GoDoggyDate, GoBotsAI, and their officers, employees, and agents from any and all claims, liability, injury, loss, or damage arising from or related to your use of the service, including any in-person meetup, whether or not caused by negligence. GoDoggyDate does not organize, supervise, staff, or guarantee the safety of any playdate, meetup, or event, including any first-party GoDoggyDate event.</p>

          <p><strong className="text-brown">Your responsibility at meetups:</strong> you are solely responsible for evaluating whether a meetup is safe for you and your dog, verifying vaccination and temperament to your own satisfaction before meeting, keeping your dog leashed and under control unless you and the other owner agree otherwise, and using good judgment about meetup locations (we recommend public, populated places for first meetups).</p>

          <p><strong className="text-brown">Limitation of liability:</strong> the service is provided &quot;as is&quot; without warranties of any kind. To the fullest extent permitted by law, GoDoggyDate and GoBotsAI are not liable for any indirect, incidental, special, or consequential damages, and our total liability for any claim relating to the service is limited to the amount you paid us in the 12 months before the claim arose.</p>

          <p><strong className="text-brown">Indemnification:</strong> you agree to indemnify and hold harmless GoDoggyDate and GoBotsAI from any claim or demand, including reasonable attorneys&apos; fees, arising from your conduct, your dog&apos;s conduct, or your violation of these terms.</p>

          <p>Use the service respectfully. Harassment, spam, unsafe conduct, or misrepresenting your dog&apos;s vaccination status or temperament may lead to suspension or removal from the platform, at GoDoggyDate&apos;s discretion and without notice.</p>

          <p><strong className="text-brown">Reporting safety concerns:</strong> if a meetup goes wrong or you have safety concerns about another user, use the in-app Report/Block feature and, for any injury or emergency, contact local emergency services and animal control directly — GoDoggyDate is not a substitute for either.</p>

          <p><strong className="text-brown">What&apos;s for sale:</strong> GoDoggyDate is free to use during early access, including chat. The one paid option is Founding Member, a one-time $39 purchase. It includes every future Pro feature at no extra cost for as long as GoDoggyDate operates. Pro features are not live yet, and Founding Member is not a guarantee that the service will continue. Features and pricing may change during early access. Any future subscription will show its price and renewal terms before you pay.</p>

          <p><strong className="text-brown">Refunds:</strong> Founding Member is refundable for any reason within 14 days of purchase. A refund or chargeback ends Founding Member status. To request a refund, contact us at <a href="mailto:support@godoggydate.com" className="font-semibold text-primary underline underline-offset-2">support@godoggydate.com</a>.</p>

          <p><strong className="text-brown">Governing law:</strong> these terms are governed by the laws of the state in which GoBotsAI is organized, without regard to conflict-of-law principles.</p>

          <p>Questions about these terms can be directed to the GoDoggyDate team at <a href="mailto:support@godoggydate.com" className="font-semibold text-primary underline underline-offset-2">support@godoggydate.com</a> or through <a href="https://gobotsai.com" className="font-semibold text-primary underline underline-offset-2">gobotsai.com</a>.</p>
        </div>
      </div>
    </main>
  );
}
