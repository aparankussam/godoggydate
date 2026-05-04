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
          <p>Questions about these terms can be directed to the GoDoggyDate team or through <a href="https://gobotsai.com" className="font-semibold text-primary underline underline-offset-2">gobotsai.com</a>.</p>
        </div>
      </div>
    </main>
  );
}
