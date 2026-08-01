import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Dog Socialization Tips | GoDoggyDate',
  description:
    'Practical dog socialization tips for calmer introductions, better play, and safer local meetups.',
  alternates: {
    canonical: '/dog-socialization-tips',
  },
  openGraph: {
    title: 'Dog Socialization Tips | GoDoggyDate',
    description:
      'Practical steps to help your dog build confidence and enjoy better social experiences.',
    url: absoluteUrl('/dog-socialization-tips'),
    type: 'article',
  },
};

const tips = [
  'Start with one calm dog instead of a crowded group setting.',
  'Watch for loose body language, pauses, and mutual re-engagement.',
  'Advocate early if your dog looks overwhelmed instead of waiting for escalation.',
  'End the interaction while it is still going well.',
];

export default function DogSocializationTipsPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-12">
      <article className="mx-auto max-w-3xl rounded-[2rem] bg-white px-6 py-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Dog Socialization
        </p>
        <h1 className="mt-3 font-display text-4xl text-brown">
          Dog socialization tips that actually reduce stress
        </h1>
        <p className="mt-6 text-base leading-8 text-brown-light">
          Socialization is not about meeting as many dogs as possible. It is about helping
          your dog build good experiences with the right dogs, in the right environment, at
          the right pace.
        </p>
        <h2 className="mt-8 font-display text-2xl text-brown">Four habits that help</h2>
        <ul className="mt-4 space-y-3 text-sm leading-7 text-brown-light">
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        <p className="mt-8 text-sm leading-7 text-brown-light">
          Good socialization is especially important for dogs that are recovering from a bad
          park experience, are naturally cautious, or get over-aroused quickly. Structured
          one-on-one playdates often work better than chaotic public dog park encounters.
        </p>
        <div className="mt-10 rounded-[1.5rem] bg-cream-dark px-5 py-5">
          <p className="text-sm leading-7 text-brown-light">
            Before a first meeting, read the{' '}
            <Link
              href="/playdate-safety"
              className="font-semibold text-primary underline underline-offset-2"
            >
              play-or-fight first-meeting reference
            </Link>{' '}
            — the introduction protocol professionals use, and how to tell play from conflict
            while it is happening.
          </p>
          <p className="mt-4 text-sm leading-7 text-brown-light">
            Looking for compatible dogs instead of random encounters? Read our guide to{' '}
            <Link
              href="/dog-playdates"
              className="font-semibold text-primary underline underline-offset-2"
            >
              safer dog playdates
            </Link>{' '}
            or explore{' '}
            <Link href="/" className="font-semibold text-primary underline underline-offset-2">
              GoDoggyDate
            </Link>
            .
          </p>
        </div>
      </article>
    </main>
  );
}
