export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-white px-6 py-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Privacy</p>
        <h1 className="mt-3 font-display text-4xl text-brown">Privacy Policy</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-brown-light">
          <p>GoDoggyDate collects the account and dog-profile information needed to run discovery, matching, and chat.</p>
          <p>We use Firebase and Stripe to provide sign-in, data storage, and subscription billing. We do not sell your personal information.</p>
          <p>If you report another user, that report is stored so the team can review safety issues. Early access is still evolving, and moderation tooling is limited.</p>
          <p>Questions about privacy can be directed to the contact channel you share with the GoDoggyDate team.</p>
        </div>
      </div>
    </main>
  );
}
