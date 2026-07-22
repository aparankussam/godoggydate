'use client';
// web/components/PlaydateRatingModal.tsx
// The "Playdate Payout" — a post-game score screen that's secretly the
// missing client half of the deployed trust-score engine (onRatingCreated
// reads from the `ratings` collection this writes to).

import { useState } from 'react';

interface Props {
  dogName: string;
  onSubmit: (stars: number, wouldMeetAgain: boolean) => Promise<void>;
  onDismiss: () => void;
}

export default function PlaydateRatingModal({ dogName, onSubmit, onDismiss }: Props) {
  const [stars, setStars] = useState(0);
  const [wouldMeetAgain, setWouldMeetAgain] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = stars > 0 && wouldMeetAgain !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(stars, wouldMeetAgain!);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl">
        <p className="text-center text-4xl mb-2" aria-hidden="true">🎾</p>
        <h3 className="text-center font-display text-2xl text-brown">How did it go with {dogName}?</h3>
        <p className="text-center text-sm text-brown-light mt-1">
          This feeds the trust score every other dog parent sees.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setStars(n)}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className="text-4xl leading-none transition-transform hover:scale-110"
            >
              {n <= stars ? '⭐' : '☆'}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <p className="text-center text-sm font-semibold text-brown mb-2">Would you meet again?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setWouldMeetAgain(true)}
              className={`flex-1 rounded-full py-2.5 text-sm font-semibold border transition-colors ${
                wouldMeetAgain === true
                  ? 'bg-primary text-white border-primary'
                  : 'bg-cream border-border text-brown'
              }`}
            >
              🐾 Definitely
            </button>
            <button
              onClick={() => setWouldMeetAgain(false)}
              className={`flex-1 rounded-full py-2.5 text-sm font-semibold border transition-colors ${
                wouldMeetAgain === false
                  ? 'bg-brown text-white border-brown'
                  : 'bg-cream border-border text-brown'
              }`}
            >
              Not really
            </button>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary w-full mt-6 py-3 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Submit'}
        </button>
        <button
          onClick={onDismiss}
          className="w-full mt-2 py-2 text-sm text-brown-light hover:text-brown transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
