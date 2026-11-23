'use client';
// web/components/BarkleGame.tsx
// BARKLE — the client game. Wordle for dog breeds: a mystery breed, six tries,
// and a fresh clue revealed after every wrong guess. Public, no signup, no AI —
// all logic lives in shared/barkle.ts, all state lives here + in localStorage so
// a refresh keeps your progress for the day. For someone who has signed in on
// this browser, lib/progressSync also syncs the day's game with their account,
// so a puzzle started on the iPhone app carries on here (and vice versa).
//
// The viral loop is the SPOILER-FREE result: an emoji-grid image
// (BarkleResultCard, brand baked in) and the canonical buildShareText block.
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
import { shareOrDownloadCard } from '../lib/shareCard';
import {
  ensureProgressSyncFromAuth,
  loadBarkleGuesses,
  onProgressChange,
  saveBarkleGuesses,
} from '../lib/progressSync';
import BarkleResultCard from './BarkleResultCard';
import ScaleToFit from './ScaleToFit';
import { PawCoin, ShareIcon } from './StickerBits';

type Status = 'playing' | 'won' | 'lost';

// Today's guesses, replayed against today's breed (drops anything no longer recognised).
function loadResults(puzzle: DailyPuzzle): GuessResult[] {
  return loadBarkleGuesses(puzzle.puzzleNumber, puzzle.breed.name)
    .map((name) => evaluateGuess(name, puzzle.breed))
    .filter((r) => r.matched);
}

function guessNames(results: GuessResult[]): string[] {
  return results.map((r) => r.matched?.name).filter((n): n is string => typeof n === 'string');
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
  const [sharingImage, setSharingImage] = useState(false);
  const [countdown, setCountdown] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // The puzzle on screen, readable from listeners that outlive a render (and
  // that must follow the day rolling over, not the one resolved at mount).
  const puzzleRef = useRef<DailyPuzzle | null>(null);

  // Resolve today's puzzle and rehydrate any saved progress — client-only. A
  // sign-in, or a game synced from the app, re-reads it.
  useEffect(() => {
    const today = getDailyBreed();
    puzzleRef.current = today;
    setPuzzle(today);
    setResults(loadResults(today));
    setMounted(true);
    const offProgress = onProgressChange(() => {
      if (puzzleRef.current) setResults(loadResults(puzzleRef.current));
    });
    ensureProgressSyncFromAuth();
    return () => {
      offProgress();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // A tab left open across UTC midnight must move on to the new day's puzzle:
  // otherwise it keeps offering (and saving guesses against) yesterday's, and
  // the countdown sits at 00:00:00. A timer covers the open tab; the
  // visibility/focus checks cover timers that were throttled or slept through.
  const puzzleNumber = puzzle?.puzzleNumber;
  useEffect(() => {
    if (puzzleNumber === undefined) return;
    const rollOver = () => {
      const today = getDailyBreed();
      if (today.puzzleNumber === puzzleNumber) return;
      puzzleRef.current = today;
      setPuzzle(today);
      setResults(loadResults(today));
      setInput('');
      setError('');
    };
    const timer = setTimeout(rollOver, msUntilNextPuzzle() + 500);
    const onVisible = () => { if (document.visibilityState === 'visible') rollOver(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', rollOver);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', rollOver);
    };
  }, [puzzleNumber]);

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
      const outcome = statusFrom(next);
      saveBarkleGuesses(puzzle.puzzleNumber, guessNames(next), outcome === 'won');

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
    trackEvent('barkle_share_click', { method: 'text' });
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText });
        trackEvent('barkle_shared', { method: 'text' });
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
      trackEvent('barkle_shared', { method: 'copied' });
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [shareText]);

  // The spoiler-free image (same html2canvas path as the other web cards): the
  // share sheet where the browser can share files, a PNG download otherwise.
  const shareImage = useCallback(async () => {
    if (!puzzle || !finished || !cardRef.current || sharingImage) return;
    setSharingImage(true);
    trackEvent('barkle_share_click', { method: 'image' });
    try {
      const result = await shareOrDownloadCard(cardRef.current, `barkle-${puzzle.puzzleNumber}.png`, {
        shareTitle: `Barkle #${puzzle.puzzleNumber}`,
        shareText,
      });
      trackEvent('barkle_shared', { method: result === 'shared' ? 'image' : 'image_download' });
    } catch {
      // Rendering failed — the text share still works; let them retry.
    } finally {
      setSharingImage(false);
    }
  }, [puzzle, finished, sharingImage, shareText]);

  // ── Loading skeleton (pre-mount) ────────────────────────────────────────────
  if (!mounted || !puzzle) {
    return (
      <div className="card p-6 sm:p-8 max-w-xl mx-auto text-center">
        <span className="mb-3 flex justify-center"><PawCoin size={48} /></span>
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
        <span className="font-mono text-sm font-black tracking-widest text-brown">
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
            return <span key={i} className={`h-3 w-3 rounded-full border-[1.5px] border-brown ${cls}`} aria-hidden="true" />;
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
              <span className="font-display text-rose font-bold shrink-0">{i + 1}.</span>
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
              className="flex items-center justify-between rounded-2xl border-2 border-brown bg-paper px-4 py-3"
            >
              <span className="font-semibold text-brown flex items-center gap-2">
                <span aria-hidden="true">{tileForGuess(r)}</span>
                {r.matched?.name}
              </span>
              <span className="text-xs font-bold text-brown-mid">
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
              className="flex-1 min-h-[48px] rounded-full border-2 border-brown bg-paper px-5 py-3 text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-brown/40"
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
              <span className="text-sm font-black text-brown">{error}</span>
            ) : (
              <span className="text-sm font-semibold text-brown">
                {triesLeft} {triesLeft === 1 ? 'guess' : 'guesses'} left · a new clue after each miss
              </span>
            )}
          </div>
        </form>
      )}

      {/* Legend */}
      {!finished && (
        <p className="mt-3 text-center text-xs font-semibold text-brown">
          🟩 correct · 🟨 same breed group · 🟧 same size · ⬛ cold
        </p>
      )}

      {/* Result */}
      {finished && (
        <div className="mt-5">
          <div className="card text-brown p-7 text-center animate-fade-in-up">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rose">
              {status === 'won'
                ? `Solved in ${results.length}/${MAX_TRIES}`
                : `Out of guesses — ${MAX_TRIES}/${MAX_TRIES}`}
            </p>
            <div className="mt-4 text-7xl leading-none" aria-hidden="true">
              {breed.emoji}
            </div>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl leading-tight">{breed.name}</h2>
            <p className="mt-2 text-brown-mid font-semibold text-sm">
              {breed.group} group · {breed.size} size
            </p>
            <div className="mt-4 font-mono text-2xl tracking-wide" aria-hidden="true">
              {results.map(tileForGuess).join('')}
            </div>
          </div>

          {/* The spoiler-free shareable card (brand + link baked in). The reveal
              above is on-screen only and never shared. */}
          <div className="mt-5 flex flex-col items-center">
            <ScaleToFit width={320}>
              <BarkleResultCard
                ref={cardRef}
                puzzleNumber={puzzle.puzzleNumber}
                results={results}
                won={status === 'won'}
              />
            </ScaleToFit>
            <p className="mt-2 text-xs font-semibold text-brown">Spoiler-free: the image never shows the breed.</p>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch justify-center gap-3">
            <button
              type="button"
              onClick={shareImage}
              disabled={sharingImage}
              className="btn-primary inline-flex items-center justify-center gap-2 text-base disabled:opacity-60"
            >
              {sharingImage ? 'Preparing…' : <><ShareIcon size={20} /> Share image</>}
            </button>
            <button type="button" onClick={share} className="btn-secondary text-base">
              {copied ? 'Copied result!' : 'Share as text'}
            </button>
            <Link href="/quiz" className="btn-secondary text-base text-center">
              Try the Dogtype quiz
            </Link>
          </div>

          {countdown && (
            <p className="mt-4 text-center text-sm font-semibold text-brown">
              Next Barkle in <span className="font-mono font-black text-brown">{countdown}</span>
            </p>
          )}
        </div>
      )}

      {/* Signup CTA — same top-of-funnel move as the quiz */}
      <div className="card p-6 mt-8 text-center">
        <span className="mb-2 flex justify-center"><PawCoin size={40} /></span>
        <h3 className="font-display text-xl text-brown mb-2">Love dogs this much?</h3>
        <p className="text-sm text-brown-mid mb-4">
          Build your dog&apos;s profile, get their daily card, and meet dogs who actually fit — free.
        </p>
        <Link href="/app" className="btn-secondary inline-block">
          Open GoDoggyDate
        </Link>
      </div>
    </div>
  );
}
