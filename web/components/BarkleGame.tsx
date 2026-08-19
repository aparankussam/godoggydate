'use client';
// web/components/BarkleGame.tsx
// BARKLE — the client game. Wordle for dog breeds: a mystery breed, six tries,
// and a fresh clue revealed after every wrong guess. Public, no signup, no AI,
// no network — all logic lives in shared/barkle.ts, all state lives here + in
// localStorage so a refresh keeps your progress for the day.
//
// SSR-safe: today's puzzle depends on the local clock and on localStorage, so
// nothing puzzle-specific renders until after mount (a stable skeleton shows
// first), which also avoids any hydration mismatch.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  buildShareText,
  evaluateGuess,
  findBreed,
  getDailyBreed,
  tileForGuess,
  BREED_NAMES,
  MAX_TRIES,
  type Breed,
  type DailyPuzzle,
  type GuessResult,
} from '../../shared/barkle';
import { trackEvent } from '../lib/analytics';

type Status = 'playing' | 'won' | 'lost';

const STORAGE_KEY = 'godoggydate.barkle.v1';

interface SavedState {
  puzzleNumber: number;
  guessNames: string[]; // canonical breed names, in the order played
}

function loadSaved(): SavedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    if (
      typeof parsed?.puzzleNumber === 'number' &&
      Array.isArray(parsed.guessNames) &&
      parsed.guessNames.every((n) => typeof n === 'string')
    ) {
      return { puzzleNumber: parsed.puzzleNumber, guessNames: parsed.guessNames };
    }
  } catch {
    // Corrupt or unavailable storage — start fresh, never throw.
  }
  return null;
}

function saveState(puzzleNumber: number, results: GuessResult[]) {
  if (typeof window === 'undefined') return;
  try {
    const payload: SavedState = {
      puzzleNumber,
      guessNames: results
        .map((r) => r.matched?.name)
        .filter((n): n is string => typeof n === 'string'),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or blocked — the game still plays for this session.
  }
}

function statusFrom(results: GuessResult[]): Status {
  if (results.some((r) => r.correct)) return 'won';
  if (results.length >= MAX_TRIES) return 'lost';
  return 'playing';
}

// Time until the next UTC midnight, when everyone's puzzle rolls over together.
function msUntilNextPuzzle(): number {
  const now = new Date();
  const nextUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(0, nextUtc - now.getTime());
}

function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function BarkleGame() {
  const [mounted, setMounted] = useState(false);
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [results, setResults] = useState<GuessResult[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resolve today's puzzle and rehydrate any saved progress — client-only.
  useEffect(() => {
    const today = getDailyBreed();
    setPuzzle(today);
    const saved = loadSaved();
    if (saved && saved.puzzleNumber === today.puzzleNumber) {
      const replay = saved.guessNames
        .map((name) => evaluateGuess(name, today.breed))
        .filter((r) => r.matched); // drop anything no longer recognised
      setResults(replay);
    }
    setMounted(true);
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const status = useMemo(() => statusFrom(results), [results]);
  const finished = status !== 'playing';
  const wrongCount = useMemo(
    () => results.filter((r) => !r.correct).length,
    [results],
  );

  // Clues revealed: the first one is free, then one more per wrong guess.
  const cluesShown = puzzle
    ? Math.min(wrongCount + 1, puzzle.breed.clues.length)
    : 0;

  // Tick a live countdown once the day's game is over.
  useEffect(() => {
    if (!finished) return;
    const update = () => setCountdown(formatCountdown(msUntilNextPuzzle()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [finished]);

  const submit = useCallback(
    (raw: string) => {
      if (!puzzle || finished) return;
      const guess = raw.trim();
      if (!guess) return;

      const matched = findBreed(guess);
      if (!matched) {
        setError("That's not a breed I know — check the spelling or pick from the list.");
        return;
      }
      if (results.some((r) => r.matched?.name === matched.name)) {
        setError(`You already guessed the ${matched.name}.`);
        return;
      }

      const result = evaluateGuess(matched.name, puzzle.breed);
      const next = [...results, result];
      setResults(next);
      setInput('');
      setError('');
      saveState(puzzle.puzzleNumber, next);

      const outcome = statusFrom(next);
      if (outcome !== 'playing') {
        trackEvent('barkle_complete', {
          code: puzzle.breed.name,
          tries: next.length,
          won: outcome === 'won',
        });
      }
    },
    [puzzle, finished, results],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const shareText = useMemo(() => {
    if (!puzzle || !finished) return '';
    return buildShareText(puzzle.puzzleNumber, results, status === 'won');
  }, [puzzle, finished, results, status]);

  const share = useCallback(async () => {
    if (!shareText) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    let didCopy = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        didCopy = true;
      }
    } catch {
      // fall through to legacy copy
    }
    if (!didCopy && typeof document !== 'undefined') {
      try {
        const ta = document.createElement('textarea');
        ta.value = shareText;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        didCopy = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        didCopy = false;
      }
    }
    if (didCopy) {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [shareText]);

  // ── Loading skeleton (pre-mount) ────────────────────────────────────────────
  if (!mounted || !puzzle) {
    return (
      <div className="card p-6 sm:p-8 max-w-xl mx-auto text-center">
        <p className="text-5xl mb-3" aria-hidden="true">🐾</p>
        <p className="text-brown-light">Fetching today&apos;s mystery breed…</p>
      </div>
    );
  }

  const breed: Breed = puzzle.breed;
  const clues = breed.clues.slice(0, cluesShown);
  const triesLeft = MAX_TRIES - results.length;

  return (
    <div className="max-w-xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-sm font-bold tracking-widest text-brown-light">
          BARKLE #{puzzle.puzzleNumber}
        </span>
        <div className="flex items-center gap-1.5" aria-label={`${triesLeft} of ${MAX_TRIES} guesses left`}>
          {Array.from({ length: MAX_TRIES }).map((_, i) => {
            const r = results[i];
            const cls = !r
              ? 'bg-cream-dark'
              : r.correct
              ? 'bg-primary'
              : r.sameGroup
              ? 'bg-gold'
              : r.sameSize
              ? 'bg-gold-light'
              : 'bg-brown-light';
            return <span key={i} className={`h-2.5 w-2.5 rounded-full ${cls}`} aria-hidden="true" />;
          })}
        </div>
      </div>

      {/* Clues */}
      <div className="card p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brown-light mb-3">
          {finished ? 'The clues were' : `Clue ${cluesShown} of ${breed.clues.length}`}
        </p>
        <ol className="space-y-2.5">
          {clues.map((clue, i) => (
            <li
              key={i}
              className={`flex gap-3 text-brown-mid leading-snug ${
                i === clues.length - 1 && !finished ? 'animate-fade-in-up' : ''
              }`}
            >
              <span className="font-display text-primary font-bold shrink-0">{i + 1}.</span>
              <span>{clue}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Guess rows so far */}
      {results.length > 0 && (
        <ul className="mt-4 space-y-2">
          {results.map((r, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3"
            >
              <span className="font-semibold text-brown flex items-center gap-2">
                <span aria-hidden="true">{tileForGuess(r)}</span>
                {r.matched?.name}
              </span>
              <span className="text-xs font-semibold text-brown-light">
                {r.correct
                  ? 'Correct!'
                  : r.sameGroup
                  ? 'Same group'
                  : r.sameSize
                  ? 'Same size'
                  : 'Cold'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Input (while playing) */}
      {!finished && (
        <form onSubmit={onSubmit} className="mt-4">
          <label htmlFor="barkle-guess" className="sr-only">
            Guess the breed
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="barkle-guess"
              ref={inputRef}
              type="text"
              list="barkle-breeds"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (error) setError('');
              }}
              placeholder="Name a dog breed…"
              autoComplete="off"
              autoCapitalize="words"
              maxLength={40}
              className="flex-1 rounded-full border border-border bg-white px-5 py-3 text-brown placeholder:text-brown-light focus:border-primary focus:outline-none"
            />
            <button type="submit" className="btn-primary px-8">
              Guess
            </button>
          </div>
          <datalist id="barkle-breeds">
            {BREED_NAMES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="mt-2 min-h-[1.25rem] text-center">
            {error ? (
              <span className="text-sm font-semibold text-primary-dark">{error}</span>
            ) : (
              <span className="text-sm text-brown-light">
                {triesLeft} {triesLeft === 1 ? 'guess' : 'guesses'} left · a new clue after each miss
              </span>
            )}
          </div>
        </form>
      )}

      {/* Legend */}
      {!finished && (
        <p className="mt-3 text-center text-xs text-brown-light">
          🟩 correct · 🟨 same breed group · 🟧 same size · ⬛ cold
        </p>
      )}

      {/* Result */}
      {finished && (
        <div className="mt-5">
          <div
            className="rounded-[1.75rem] text-white p-7 text-center animate-fade-in-up"
            style={{
              background:
                status === 'won'
                  ? 'linear-gradient(160deg, #7A2E0E 0%, #E8633A 55%, #F5B731 100%)'
                  : 'linear-gradient(160deg, #241A2E 0%, #5C3D2E 55%, #9B7560 100%)',
            }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
              {status === 'won'
                ? `Solved in ${results.length}/${MAX_TRIES}`
                : `Out of guesses — ${MAX_TRIES}/${MAX_TRIES}`}
            </p>
            <div className="mt-4 text-7xl leading-none" aria-hidden="true">
              {breed.emoji}
            </div>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl leading-tight">{breed.name}</h2>
            <p className="mt-2 text-white/85 text-sm">
              {breed.group} group · {breed.size} size
            </p>
            <div className="mt-4 font-mono text-2xl tracking-wide" aria-hidden="true">
              {results.map(tileForGuess).join('')}
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row items-stretch justify-center gap-3">
            <button type="button" onClick={share} className="btn-primary text-base">
              {copied ? 'Copied result!' : 'Share result'}
            </button>
            <Link href="/quiz" className="btn-secondary text-base text-center">
              Try the Dogtype quiz
            </Link>
          </div>

          {countdown && (
            <p className="mt-4 text-center text-sm text-brown-light">
              Next Barkle in <span className="font-mono font-semibold text-brown-mid">{countdown}</span>
            </p>
          )}
        </div>
      )}

      {/* Signup CTA — same top-of-funnel move as the quiz */}
      <div className="card p-6 mt-8 text-center">
        <p className="text-3xl mb-2" aria-hidden="true">🐾</p>
        <h3 className="font-display text-xl text-brown mb-2">Love dogs this much?</h3>
        <p className="text-sm text-brown-mid mb-4">
          Build your dog&apos;s profile, get their daily card, and meet dogs who actually fit — free.
        </p>
        <Link href="/app" className="btn-primary inline-block">
          Open GoDoggyDate
        </Link>
      </div>
    </div>
  );
}
