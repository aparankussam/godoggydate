import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl } from '../../lib/site';
import {
  AFTER_A_BAD_MEETING,
  BODY_LANGUAGE_PREAMBLE,
  CAUTION_SIGNALS,
  CONSENT_TEST,
  FIRST_MEETING_STEPS,
  MEETUP_DISCLAIMER,
  NEW_OWNER_NOTES,
  PLAY_SIGNALS,
  SOURCES,
  WHEN_TO_ABORT,
  getSource,
  type BodyLanguageSignal,
  type EvidenceLevel,
  type SourceId,
} from '../../lib/meetupSafety';

export const metadata: Metadata = {
  title: 'Play or Fight? First-Meeting Safety Reference | GoDoggyDate',
  description:
    'How professionals introduce two dogs who have never met, and how to tell play from conflict while it is happening. A plain-language reference to AVSAB, ASPCA, AKC and SPCA guidance.',
  alternates: {
    canonical: '/playdate-safety',
  },
  openGraph: {
    title: 'Play or Fight? First-Meeting Safety Reference | GoDoggyDate',
    description:
      'The introduction protocol professionals use, a play-vs-conflict body language reference, and honest notes for new and future dog owners.',
    url: absoluteUrl('/playdate-safety'),
    type: 'article',
  },
};

const SECTIONS = [
  { id: 'protocol', label: 'The protocol' },
  { id: 'play-or-fight', label: 'Play or fight' },
  { id: 'consent-test', label: 'Consent test' },
  { id: 'stop-now', label: 'Stop now' },
  { id: 'new-owners', label: 'New to dogs' },
  { id: 'sources', label: 'Sources' },
];

/** Offset for anything else that sticks: jump bar is h-16 (64px) + 1px border.
 *  Written as a literal class string so Tailwind's scanner still sees it. */
const STICKY_TOP = 'top-[65px]';

const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  'professional-consensus': 'Professional consensus',
  'rule-of-thumb': 'Rule of thumb',
  contested: 'Contested',
};

/** Consensus is muted so the two weaker labels are what catches the eye. */
const EVIDENCE_STYLE: Record<EvidenceLevel, string> = {
  'professional-consensus': 'bg-cream-dark text-brown-mid',
  'rule-of-thumb': 'bg-[rgba(245,183,49,0.28)] text-brown',
  contested: 'bg-[rgba(232,99,58,0.14)] text-primary-dark',
};

function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${EVIDENCE_STYLE[level]}`}
    >
      {EVIDENCE_LABEL[level]}
    </span>
  );
}

/** Where the guidance is softer than it sounds, the caveat gets its own box
 *  rather than a parenthetical, so nobody skims past it. */
function Caveat({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-[1.25rem] border-l-4 border-gold bg-cream px-4 py-3 text-base leading-7 text-brown-mid">
      <span className="font-bold text-brown">Worth knowing: </span>
      {children}
    </p>
  );
}

/** Empty `sources` means the item is ours rather than something we found
 *  published. Say that, rather than rendering a dangling "Source:" label. */
function Attribution({ ids }: { ids: readonly SourceId[] }) {
  if (ids.length === 0) {
    return (
      <p className="mt-4 text-sm leading-6 text-brown-mid">
        Source: none — this one is ours, not a published protocol.
      </p>
    );
  }
  return (
    <p className="mt-4 text-sm leading-6 text-brown-mid">
      Source:{' '}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ' · '}
          <a
            href={getSource(id).url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-border underline-offset-2 hover:text-primary"
          >
            {getSource(id).name}
          </a>
        </span>
      ))}
    </p>
  );
}

function SignalList({
  signals,
  tone,
}: {
  signals: readonly BodyLanguageSignal[];
  tone: 'play' | 'caution';
}) {
  const dot = tone === 'play' ? 'bg-gold' : 'bg-primary';
  return (
    <ul className="divide-y divide-border">
      {signals.map((s) => (
        <li key={s.id} className="px-5 py-5 sm:px-6">
          {/* h4, not h3 — the column header above this list is the h3. */}
          <h4 className="flex items-start gap-3 font-display text-xl leading-snug text-brown">
            <span className={`mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            {s.signal}
          </h4>
          <p className="mt-2 pl-[1.375rem] text-base leading-7 text-brown-mid">{s.meaning}</p>
          {s.caveat && (
            <p className="mt-3 ml-[1.375rem] rounded-[1.25rem] bg-cream px-4 py-3 text-sm leading-6 text-brown-mid">
              <span className="font-bold text-brown">But: </span>
              {s.caveat}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PlaydateSafetyPage() {
  return (
    <main className="min-h-screen bg-cream">
      {/* Jump bar. Plain anchors so the page needs no JavaScript to navigate —
          this gets opened at a park on a bad connection. Height is pinned to
          h-16 so STICKY_TOP below can clear it exactly. */}
      <nav
        aria-label="On this page"
        className="sticky top-0 z-20 border-b border-border bg-cream/95 backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 overflow-x-auto px-4">
          <Link
            href="/"
            className="shrink-0 rounded-full px-3 py-3 font-display text-lg text-brown"
          >
            🐾 GoDoggyDate
          </Link>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 rounded-full border border-border bg-white px-4 py-3 text-sm font-bold text-brown-mid hover:border-primary hover:text-primary"
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
            First meetings
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-brown sm:text-5xl">
            Play or fight?
          </h1>
          <p className="mt-5 text-lg leading-8 text-brown-mid">
            Two dogs who have never met are about to meet. This is how veterinary and
            animal-welfare organizations say to run that introduction, and how to read what
            happens next while it is still happening.
          </p>
          <p className="mt-4 text-lg leading-8 text-brown-mid">
            Written to be read one-handed, outdoors, with a leash in the other hand.
          </p>
        </header>

        {/* Guardrail up top, not buried in a footer. */}
        <aside className="mt-8 rounded-[1.5rem] border-2 border-border bg-white px-5 py-5 sm:px-6">
          <h2 className="font-display text-xl text-brown">Read this part first</h2>
          <p className="mt-3 text-base leading-7 text-brown-mid">{MEETUP_DISCLAIMER}</p>
        </aside>

        {/* ---------------------------------------------------------------- */}
        <section id="protocol" className="mt-14 scroll-mt-20">
          <h2 className="font-display text-3xl leading-tight text-brown sm:text-4xl">
            The introduction protocol
          </h2>
          <p className="mt-4 text-base leading-7 text-brown-mid">
            This is assembled from the introduction protocols the SF SPCA and the Animal
            Humane Society publish for adopters, which are written for putting two unfamiliar
            dogs together on purpose. It works the same way for two owners in a car park.
            Steps in order. Where a step is ours rather than theirs, it says so.
          </p>

          <ol className="mt-8 space-y-5">
            {FIRST_MEETING_STEPS.map((step, i) => (
              <li key={step.id} className="rounded-[1.5rem] bg-white px-5 py-6 shadow-sm sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-baseline gap-4">
                    <span
                      className="font-display text-4xl leading-none text-[rgba(232,99,58,0.25)]"
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="font-display text-2xl leading-snug text-brown">{step.title}</h3>
                  </div>
                  <EvidenceBadge level={step.evidence} />
                </div>
                <p className="mt-4 text-lg leading-8 text-brown-mid">{step.detail}</p>
                {step.whyItMatters && (
                  <p className="mt-4 text-base leading-7 text-brown-mid">
                    <span className="font-bold text-brown">Why it matters: </span>
                    {step.whyItMatters}
                  </p>
                )}
                {step.caveat && <Caveat>{step.caveat}</Caveat>}
                <Attribution ids={step.sources} />
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section id="play-or-fight" className="mt-16 scroll-mt-20">
          <h2 className="font-display text-3xl leading-tight text-brown sm:text-4xl">
            Play or conflict, side by side
          </h2>
          <p className="mt-4 text-base leading-7 text-brown-mid">{BODY_LANGUAGE_PREAMBLE}</p>

          {/* Two columns on desktop, stacked on mobile. Each column header
              sticks so the label stays visible while scrolling a long list. */}
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* No overflow-hidden on these wrappers — it would silently disable
                position:sticky on the column headers. Corners are rounded on the
                header itself instead. The header fills are opaque literals rather
                than rgba tints of gold/primary because list rows scroll underneath
                them. */}
            <div className="rounded-[1.5rem] border-2 border-gold bg-white">
              <div className={`sticky ${STICKY_TOP} z-10 rounded-t-[1.35rem] border-b-2 border-gold bg-[#FCEFCF] px-5 py-4 sm:px-6`}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brown-mid">
                  Column one
                </p>
                <h3 className="mt-1 font-display text-2xl text-brown">This looks like play</h3>
              </div>
              <SignalList signals={PLAY_SIGNALS} tone="play" />
            </div>

            <div className="rounded-[1.5rem] border-2 border-primary bg-white">
              <div className={`sticky ${STICKY_TOP} z-10 rounded-t-[1.35rem] border-b-2 border-primary bg-[#FBE0D6] px-5 py-4 sm:px-6`}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brown-mid">
                  Column two
                </p>
                <h3 className="mt-1 font-display text-2xl text-brown">
                  Stop and look closer
                </h3>
              </div>
              <SignalList signals={CAUTION_SIGNALS} tone="caution" />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section id="consent-test" className="mt-16 scroll-mt-20">
          <h2 className="font-display text-3xl leading-tight text-brown sm:text-4xl">
            {CONSENT_TEST.name}
          </h2>
          <p className="mt-2 text-sm font-bold uppercase tracking-[0.14em] text-brown-mid">
            Also called {CONSENT_TEST.alsoCalled}
          </p>
          <div className="mt-6 rounded-[1.5rem] bg-white px-5 py-6 shadow-sm sm:px-6">
            <div className="mb-4">
              <EvidenceBadge level={CONSENT_TEST.evidence} />
            </div>
            <p className="text-lg leading-8 text-brown-mid">{CONSENT_TEST.summary}</p>
            <ol className="mt-6 space-y-4">
              {CONSENT_TEST.steps.map((step, i) => (
                <li key={step} className="flex gap-4">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-dark font-bold text-brown">
                    {i + 1}
                  </span>
                  <span className="text-lg leading-8 text-brown-mid">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border-2 border-gold bg-[#FCEFCF] px-4 py-4">
                <h3 className="font-display text-xl text-brown">Yes looks like</h3>
                <p className="mt-2 text-base leading-7 text-brown-mid">
                  {CONSENT_TEST.yesLooksLike}
                </p>
              </div>
              <div className="rounded-[1.25rem] border-2 border-primary bg-[#FBE0D6] px-4 py-4">
                <h3 className="font-display text-xl text-brown">No looks like</h3>
                <p className="mt-2 text-base leading-7 text-brown-mid">
                  {CONSENT_TEST.noLooksLike}
                </p>
              </div>
            </div>
            <Attribution ids={CONSENT_TEST.sources} />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section id="stop-now" className="mt-16 scroll-mt-20">
          <h2 className="font-display text-3xl leading-tight text-brown sm:text-4xl">
            End the meeting now
          </h2>
          <p className="mt-4 text-base leading-7 text-brown-mid">
            Any one of these is enough on its own. You do not need two.
          </p>

          <ul className="mt-8 space-y-4">
            {WHEN_TO_ABORT.map((item) => (
              <li
                key={item.id}
                className="rounded-[1.5rem] border-l-8 border-primary bg-white px-5 py-5 shadow-sm sm:px-6"
              >
                <h3 className="font-display text-2xl leading-snug text-brown">{item.sign}</h3>
                <p className="mt-2 text-lg leading-8 text-brown-mid">{item.detail}</p>
                <Attribution ids={item.sources} />
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-[1.5rem] bg-brown px-5 py-6 sm:px-6">
            <h3 className="font-display text-2xl text-white">Afterwards</h3>
            <p className="mt-3 text-lg leading-8 text-[rgba(255,255,255,0.85)]">
              {AFTER_A_BAD_MEETING}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={getSource('iaabc').url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white px-5 py-3 text-base font-bold text-brown hover:text-primary"
              >
                Find an IAABC consultant
              </a>
              <a
                href={getSource('ccpdt').url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white px-5 py-3 text-base font-bold text-brown hover:text-primary"
              >
                Find a CCPDT trainer
              </a>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section id="new-owners" className="mt-16 scroll-mt-20">
          <h2 className="font-display text-3xl leading-tight text-brown sm:text-4xl">
            If your dog is new, or you do not have one yet
          </h2>
          <p className="mt-4 text-base leading-7 text-brown-mid">
            Most of what gets written for new owners is either a sales pitch or a shrug. Here
            is the part that actually changes outcomes, including where the popular advice is
            softer than it sounds.
          </p>

          <div className="mt-8 space-y-5">
            {NEW_OWNER_NOTES.map((note) => (
              <article key={note.id} className="rounded-[1.5rem] bg-white px-5 py-6 shadow-sm sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-display text-2xl leading-snug text-brown">{note.title}</h3>
                  <EvidenceBadge level={note.evidence} />
                </div>
                <p className="mt-4 text-lg leading-8 text-brown-mid">{note.body}</p>
                {note.caveat && <Caveat>{note.caveat}</Caveat>}
                <Attribution ids={note.sources} />
              </article>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section id="sources" className="mt-16 scroll-mt-20">
          <h2 className="font-display text-3xl leading-tight text-brown sm:text-4xl">Sources</h2>
          <p className="mt-4 text-base leading-7 text-brown-mid">
            Everything above came from these. None of it is ours, and none of it is specific to
            your dog. Go and read the originals — they are better than any summary, including
            this one.
          </p>
          <ul className="mt-6 space-y-2">
            {SOURCES.map((source) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-[1.25rem] bg-white px-5 py-4 text-base font-semibold leading-7 text-brown-mid shadow-sm hover:text-primary"
                >
                  {source.name}
                  <span className="block text-sm font-normal text-brown-mid">
                    {new URL(source.url).hostname.replace(/^www\./, '')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="mt-16 rounded-[2rem] bg-cream-dark px-5 py-8 sm:px-8">
          <h2 className="font-display text-2xl leading-snug text-brown sm:text-3xl">
            Keep reading
          </h2>
          <p className="mt-3 text-base leading-7 text-brown-mid">
            GoDoggyDate helps owners find each other and compare notes before a meetup. What
            happens at the meetup is down to the two of you and this protocol.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/dog-playdates" className="btn-secondary text-center text-base">
              Finding safer playdates
            </Link>
            <Link href="/dog-socialization-tips" className="btn-secondary text-center text-base">
              Dog socialization tips
            </Link>
            <Link href="/" className="btn-primary text-center text-base">
              About GoDoggyDate
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
