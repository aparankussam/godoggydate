'use client';
// web/components/PlaydateRatingModal.tsx
// The "Playdate Payout" — a post-game score screen. The rating is private: it is
// stored in `ratings` (and folded into a server-side score by onRatingCreated),
// and no screen shows anyone's rating or score to another member. Keep the copy
// in step with that; do not promise a visible trust score.

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
  const [error, setError] = useState<string | null>(null);

  const canSubmit = stars > 0 && wouldMeetAgain !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(stars, wouldMeetAgain!);
    } catch {
      // Offline, or a rating for this match is already on file. Previously the
      // rejection went unhandled and the modal just sat there.
      setError('We couldn’t save your rating. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brown/50 px-4 pb-4 sm:pb-0">
      <div role="dialog" aria-modal="true" aria-label={`How did it go with ${dogName}?`} className="w-full max-w-sm rounded-[1.75rem] border-2 border-brown bg-cream p-6 shadow-[0_10px_0_rgba(42,31,74,0.18)]">
        <p className="text-center text-4xl mb-2" aria-hidden="true">🎾</p>
        <h3 className="text-center font-display text-2xl text-brown">How did it go with {dogName}?</h3>
        <p className="text-center text-sm font-bold text-brown-mid mt-1">
          Your rating is private. It helps us notice problems and keep playdates safe.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setStars(n)}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className="min-h-[44px] min-w-[44px] text-4xl leading-none transition-transform hover:scale-110"
            >
              {n <= stars ? '⭐' : '☆'}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <p className="text-center text-sm font-black text-brown mb-2">Would you meet again?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setWouldMeetAgain(true)}
              className={`flex-1 min-h-[44px] rounded-full py-2.5 text-sm font-black border-2 transition-colors ${
                wouldMeetAgain === true
                  ? 'bg-brown text-cream border-brown'
                  : 'bg-cream border-brown text-brown'
              }`}
            >
              🐾 Definitely
            </button>
            <button
              onClick={() => setWouldMeetAgain(false)}
              className={`flex-1 min-h-[44px] rounded-full py-2.5 text-sm font-black border-2 transition-colors ${
                wouldMeetAgain === false
                  ? 'bg-brown text-cream border-brown'
                  : 'bg-cream border-brown text-brown'
              }`}
            >
              Not really
            </button>
          </div>
        </div>

        {error && <p role="alert" className="mt-4 text-center text-xs font-semibold text-red-600">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary w-full mt-6 py-3 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Submit'}
        </button>
        <button
          onClick={onDismiss}
          className="w-full mt-2 min-h-[44px] py-2 text-sm font-bold text-brown-mid hover:text-brown transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
