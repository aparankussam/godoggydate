export default function TermsPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-white px-6 py-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Terms</p>
        <h1 className="mt-3 font-display text-4xl text-brown">Terms of Service</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-brown-light">
          <p>GoDoggyDate is operated by GoBotsAI as an early-access service for discovering compatible dog playdates.</p>
          <p>You are responsible for the accuracy of your profile, your dog’s vaccination status, and how you arrange meetups with other owners.</p>
          <p>Use the service respectfully. Harassment, spam, or unsafe conduct may lead to removal from the platform.</p>
          <p>Current launch pricing uses one-time match unlocks. Features and pricing may change as the product evolves during early access.</p>
          <p><strong className="text-brown">Refunds:</strong> the $4.99 chat unlock is a one-time digital purchase. If a payment was made in error, was duplicated, or the unlocked match failed to open chat within a reasonable time, contact us within 14 days of purchase at <a href="mailto:support@godoggydate.com" className="font-semibold text-primary underline underline-offset-2">support@godoggydate.com</a> for a refund. Refunds are not available once you have exchanged messages with your match.</p>
          <p><strong className="text-brown">Meetups are between owners:</strong> GoDoggyDate helps you discover compatible dogs and does not organize, supervise, or guarantee the safety of any in-person playdate. You are solely responsible for verifying your dog&apos;s vaccination status and temperament, and for exercising reasonable care when meeting another owner and dog. By using GoDoggyDate you assume the risks associated with arranging and attending in-person meetups.</p>
          <p>Questions about these terms can be directed to the GoDoggyDate team at <a href="mailto:support@godoggydate.com" className="font-semibold text-primary underline underline-offset-2">support@godoggydate.com</a> or through <a href="https://gobotsai.com" className="font-semibold text-primary underline underline-offset-2">gobotsai.com</a>.</p>
        </div>
      </div>
    </main>
  );
}
