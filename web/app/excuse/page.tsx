// web/app/excuse/page.tsx
// PUBLIC, no-signup "Official Dog Excuse Note" toy — the cheapest top-of-funnel
// on the site. Mirrors /quiz: this server shell owns the SEO/OG metadata and
// static chrome, while all the interactivity lives in the ExcuseClient client
// component. Reads nothing from Firestore, needs no auth, works at N=0 users.
//
// The note is a JOKE by construction (see shared/excuseNote.ts) and by
// presentation (see ExcuseNoteCard.tsx). It never imitates a real
// medical/employer document.

import type { Metadata } from 'next';
import ExcuseClient from './ExcuseClient';

export const dynamic = 'force-static';

export function generateMetadata(): Metadata {
  const title = 'The Dog Excuse Note — let your dog get you out of it | GoDoggyDate';
  const description =
    "Make an official-looking (and unmistakably fake) note from your dog explaining why you simply cannot make it. No signup — pick a reason, share the card.";
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: '/excuse' },
  };
}

export default function ExcusePage() {
  return <ExcuseClient />;
}
