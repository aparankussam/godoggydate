import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Dog Playdates Near Me | GoDoggyDate',
  description:
    'Learn how to find safer dog playdates nearby, choose compatible dogs, and avoid stressful first meetups.',
  alternates: {
    canonical: '/dog-playdates',
  },
  openGraph: {
    title: 'Dog Playdates Near Me | GoDoggyDate',
    description:
      'A practical guide to finding safe, compatible dog playdates in your area.',
    url: absoluteUrl('/dog-playdates'),
    type: 'article',
  },
};

const checklist = [
  'Look for similar size, energy level, and play style before scheduling a meetup.',
  'Choose a neutral public location for the first introduction.',
  'Confirm vaccination status and any behavior boundaries ahead of time.',
  'Keep the first meetup short so both dogs leave with a positive experience.',
];

export default function DogPlaydatesPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-12">
      <article className="mx-auto max-w-3xl rounded-[2rem] bg-white px-6 py-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Dog Playdates
        </p>
        <h1 className="mt-3 font-display text-4xl text-brown">
          How to find safer dog playdates near you
        </h1>
        <p className="mt-6 text-base leading-8 text-brown-light">
          The best dog playdates are not just nearby. They are compatible. A good match
          depends on size, confidence, energy, play style, and whether both owners are
          aligned on safety. That is the problem GoDoggyDate is trying to solve.
        </p>
        <h2 className="mt-8 font-display text-2xl text-brown">A simple first-meetup checklist</h2>
        <ul className="mt-4 space-y-3 text-sm leading-7 text-brown-light">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2 className="mt-8 font-display text-2xl text-brown">What usually goes wrong</h2>
        <p className="mt-4 text-sm leading-7 text-brown-light">
          Most bad playdates start with mismatched expectations. One dog wants chase and
          wrestling, the other wants gentle sniffing. One owner assumes an off-leash park
          is fine, the other prefers a structured intro. Screening for compatibility before
          the meetup lowers that risk.
        </p>
        <h2 className="mt-8 font-display text-2xl text-brown">Finding the right local match</h2>
        <p className="mt-4 text-sm leading-7 text-brown-light">
          If you are searching for dog playdates near you, start with your city, your dog&apos;s
          temperament, and the type of interaction they enjoy. A confident high-energy dog
          needs a different playmate than a smaller dog that prefers calm one-on-one time.
        </p>
        <div className="mt-10 rounded-[1.5rem] bg-cream-dark px-5 py-5">
          <p className="text-sm leading-7 text-brown-light">
            Want a simpler way to screen matches? Visit the{' '}
            <Link href="/" className="font-semibold text-primary underline underline-offset-2">
              GoDoggyDate homepage
            </Link>{' '}
            or read our{' '}
            <Link
              href="/dog-socialization-tips"
              className="font-semibold text-primary underline underline-offset-2"
            >
              dog socialization tips
            </Link>
            .
          </p>
        </div>
      </article>
    </main>
  );
}
