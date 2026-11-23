'use client';
// web/components/DogtypeQuiz.tsx
// The NO-SIGNUP Dogtype quiz — the 16personalities-style top-of-funnel. A
// visitor with no account answers 8 playful questions about their dog and gets
// their Dogtype instantly, then a share loop and a signup CTA.
//
// HONESTY RULES (same as everywhere else Dogtype appears):
//  - Fully deterministic: 8 fixed questions, 2 per axis, each answer maps to
//    one pole letter from shared/dogtype. Ties on an axis are broken by the
//    FIRST answer given for that axis — no randomness, no rerolls.
//  - The result is framed as a playful read from the owner's own answers,
//    never a score, a diagnosis, or a psychometric instrument.
//  - Works at N=0 users: no AI, no Firestore, no network calls. The optional
//    dog name personalizes copy in-page only and is never sent anywhere.
//
// SSR-safe: all navigator/window touches live inside handlers or useEffect.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { dogtypeByCode, type Dogtype, type DogtypeAxisKey } from '../../shared/dogtype';
import DogtypeReveal from './DogtypeReveal';
import DogtypeResultCard from './DogtypeResultCard';
import { Chevron, ShareIcon, StickerDog } from './StickerBits';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import { absoluteUrl } from '../lib/site';

// ── Questions ────────────────────────────────────────────────────────────────
// 2 questions per axis in a fixed, playful order. Letters come straight from
// shared/dogtype's poles: Energy E/Z · Play R/G · Social O/S · Spirit B/M.
// "{name}" is replaced with the dog's name (or "your dog") at render time.

interface QuizAnswer {
  letter: string;
  emoji: string;
  line: string;
}

interface QuizQuestion {
  axis: DogtypeAxisKey;
  prompt: string;
  answers: [QuizAnswer, QuizAnswer];
}

const QUESTIONS: QuizQuestion[] = [
  {
    axis: 'energy',
    prompt: "It's 7 a.m. on a Saturday. Where's {name}?",
    answers: [
      { letter: 'E', emoji: '⚡', line: 'Standing on your chest, ready for adventure' },
      { letter: 'Z', emoji: '😴', line: 'A warm lump under the blankets — do not disturb' },
    ],
  },
  {
    axis: 'play',
    prompt: 'A brand-new squeaky toy enters the house…',
    answers: [
      { letter: 'R', emoji: '🤼', line: 'Shaken, wrestled, gloriously de-stuffed by dinner' },
      { letter: 'G', emoji: '🌸', line: 'Carried around gently like precious treasure' },
    ],
  },
  {
    axis: 'social',
    prompt: 'A dog {name} has never met appears at the park…',
    answers: [
      { letter: 'O', emoji: '🎉', line: 'Instant best friend — no questions asked' },
      { letter: 'S', emoji: '🛡️', line: 'Hmm. New friends may apply for approval first' },
    ],
  },
  {
    axis: 'spirit',
    prompt: 'A big, weird, unfamiliar object shows up on your walk.',
    answers: [
      { letter: 'B', emoji: '🚀', line: 'Marches straight up to investigate it' },
      { letter: 'M', emoji: '☁️', line: 'Peeks at it from safely behind your legs' },
    ],
  },
  {
    axis: 'energy',
    prompt: 'How does a game of fetch usually end?',
    answers: [
      { letter: 'E', emoji: '🎾', line: "It doesn't — your throwing arm gives out first" },
      { letter: 'Z', emoji: '🧘', line: 'One dignified retrieve, then a nice lie-down' },
    ],
  },
  {
    axis: 'play',
    prompt: 'Roughhousing with a trusted dog friend looks like…',
    answers: [
      { letter: 'R', emoji: '😤', line: 'Full-contact wrestling, flying paws everywhere' },
      { letter: 'G', emoji: '🐾', line: 'Gentle bitey-face and soft, polite rolls' },
    ],
  },
  {
    axis: 'social',
    prompt: 'You have friends over. {name} spends the evening…',
    answers: [
      { letter: 'O', emoji: '🥳', line: 'Working the entire room for pats and snacks' },
      { letter: 'S', emoji: '🕵️', line: 'Bonding deeply with one hand-picked favorite' },
    ],
  },
  {
    axis: 'spirit',
    prompt: 'A thunderstorm rolls in. {name}…',
    answers: [
      { letter: 'B', emoji: '😎', line: 'Barely looks up from the nap' },
      { letter: 'M', emoji: '🧸', line: 'Relocates immediately to your lap' },
    ],
  },
];

const AXIS_ORDER: DogtypeAxisKey[] = ['energy', 'play', 'social', 'spirit'];

// Where the quiz result is kept so the app can pick it up after sign-up (the
// onboarding reads it and reveals the Dogtype after the first save). Shape:
// { name?: string, code: string, at: number }.
const QUIZ_RESULT_KEY = 'gdd.quiz.v1';

// Which shared link brought this visitor here (?ref=dogtype, ?ref=hero, ...).
// Anything that isn't a short slug is dropped, so a hostile or unknown value
// can never reach analytics or the page.
function readRef(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get('ref') ?? '';
    return /^[a-z0-9_-]{1,32}$/i.test(raw) ? raw.toLowerCase() : 'direct';
  } catch {
    return 'direct';
  }
}

// Deterministic tally: majority letter per axis; a tie is broken by the FIRST
// answer given for that axis (answers are collected in question order, and a
// tied letter can never beat the strictly-greater check, so the earliest one
// encountered wins).
function computeCodeFromAnswers(answers: string[]): string {
  const byAxis: Record<DogtypeAxisKey, string[]> = { energy: [], play: [], social: [], spirit: [] };
  answers.forEach((letter, i) => {
    const q = QUESTIONS[i];
    if (q) byAxis[q.axis].push(letter);
  });
  return AXIS_ORDER.map((axis) => {
    const letters = byAxis[axis];
    const counts = new Map<string, number>();
    for (const l of letters) counts.set(l, (counts.get(l) ?? 0) + 1);
    let best = letters[0] ?? '';
    let bestCount = 0;
    for (const l of letters) {
      const c = counts.get(l) ?? 0;
      if (c > bestCount) {
        best = l;
        bestCount = c;
      }
    }
    return best;
  }).join('');
}

type Stage = 'name' | 'quiz' | 'reveal' | 'result';
type ShareKind = 'type';

export default function DogtypeQuiz() {
  const [stage, setStage] = useState<Stage>('name');
  const [dogName, setDogName] = useState('');
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<Dogtype | null>(null);
  const [copied, setCopied] = useState<ShareKind | null>(null);
  const [reduced, setReduced] = useState(false);
  const [ref, setRef] = useState('direct');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Detect reduced-motion once on mount (SSR-safe: only runs client-side).
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    setRef(readRef());
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const trimmedName = dogName.trim();
  const dogLabel = trimmedName || 'your dog';
  const shareName = trimmedName || 'My dog';
  const personalize = (text: string) => text.replace(/\{name\}/g, dogLabel);

  const startQuiz = () => {
    feedback.pop();
    trackEvent('quiz_start', { named: Boolean(trimmedName), ref });
    setStage('quiz');
  };

  const answer = (letter: string) => {
    feedback.tap();
    const next = [...answers.slice(0, qIndex), letter];
    setAnswers(next);
    if (qIndex + 1 < QUESTIONS.length) {
      setQIndex(qIndex + 1);
      return;
    }
    // Done — assemble the code deterministically and look it up.
    const code = computeCodeFromAnswers(next);
    const type = dogtypeByCode(code);
    if (!type) return; // impossible for valid poles, but keeps types honest
    setResult(type);
    // Keep the result for the app's onboarding (it reveals this Dogtype after
    // the first save). Best effort: private mode or blocked storage is fine.
    try {
      window.localStorage.setItem(
        QUIZ_RESULT_KEY,
        JSON.stringify({ name: trimmedName || undefined, code: type.code, at: Date.now() }),
      );
    } catch {
      /* storage unavailable — the result still shows on this page */
    }
    trackEvent('quiz_complete', { code: type.code, ref });
    feedback.success();
    setStage('reveal');
  };

  const goBack = () => {
    feedback.tap();
    if (qIndex === 0) {
      setStage('name');
      return;
    }
    setAnswers(answers.slice(0, qIndex - 1));
    setQIndex(qIndex - 1);
  };

  const retake = () => {
    feedback.tap();
    trackEvent('quiz_retake', { code: result?.code });
    setAnswers([]);
    setQIndex(0);
    setResult(null);
    setCopied(null);
    setStage('name');
  };

  const share = async (kind: ShareKind) => {
    if (!result) return;
    feedback.pop();
    const url = absoluteUrl(`/dogtype/${result.code}`);
    const text = `${shareName} is ${result.name} ${result.emoji} — what's YOUR dog?`;
    trackEvent('quiz_share', { code: result.code });

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, url });
        return;
      } catch (err) {
        // User dismissed the sheet — do nothing. Any other failure falls
        // through to the clipboard path below.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    const payload = `${text} ${url}`;
    let didCopy = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
        didCopy = true;
      }
    } catch {
      // Clipboard API blocked — fall through to the legacy path below.
    }
    if (!didCopy && typeof document !== 'undefined') {
      // Last-resort legacy copy for browsers that gate the async clipboard.
      try {
        const ta = document.createElement('textarea');
        ta.value = payload;
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
      setCopied(kind);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    }
  };

  const fadeClass = reduced ? '' : 'animate-fade-in-up';

  // ── Stage: name (optional, personalizes copy — never sent anywhere) ────────
  if (stage === 'name') {
    return (
      <>
      {/* Page intro: only on the first screen. Repeating it above every question
          pushed the answers off a phone screen. */}
      <header className="max-w-2xl mx-auto pt-2 sm:pt-8 pb-4 text-center">
        <p className="text-xs font-black text-brown-mid">The Dogtype quiz</p>
        <h1 className="mt-1 font-display text-[34px] sm:text-5xl text-brown leading-none">
          What&apos;s your dog&apos;s Dogtype?
        </h1>
        <p className="mt-3 font-extrabold text-brown-mid">
          8 playful questions, about 90 seconds — no account needed.
        </p>
      </header>
      <div className={`card p-6 sm:p-10 max-w-xl mx-auto text-center ${fadeClass}`}>
        <div className="mb-3 flex justify-center"><StickerDog size={84} label="A drawn sticker dog" /></div>
        <h2 className="font-display text-3xl text-brown mb-2">First things first</h2>
        <label htmlFor="quiz-dog-name" className="block text-brown font-extrabold mb-4">
          What&apos;s your dog&apos;s name? <span className="text-brown-mid font-bold">(optional)</span>
        </label>
        <input
          id="quiz-dog-name"
          type="text"
          value={dogName}
          onChange={(e) => setDogName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') startQuiz();
          }}
          maxLength={30}
          placeholder="e.g. Kaju"
          autoComplete="off"
          className="w-full max-w-xs mx-auto block rounded-full border-2 border-brown bg-paper px-5 py-3 text-center text-lg font-extrabold text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-brown focus:ring-offset-2 focus:ring-offset-paper"
        />
        <p className="mt-2 text-xs font-bold text-brown-mid">
          Just to personalize the questions — it stays on this page and is never sent anywhere.
        </p>
        <button type="button" onClick={startQuiz} className="btn-primary mt-6 flex w-full max-w-xs mx-auto items-center justify-center gap-2.5 min-h-[56px] text-[25px] leading-none">
          Start the quiz
          <Chevron />
        </button>
        <p className="mt-4 text-sm font-bold text-brown-mid">8 questions · about 90 seconds · no signup</p>
      </div>
      </>
    );
  }

  // ── Stage: quiz ─────────────────────────────────────────────────────────────
  if (stage === 'quiz') {
    const question = QUESTIONS[qIndex];
    return (
      <div className="max-w-xl mx-auto pt-2 sm:pt-6">
        {/* Progress dots + back */}
        <div className="flex items-center justify-between mb-3 sm:mb-6">
          <button
            type="button"
            onClick={goBack}
            className="min-h-[44px] pr-3 text-sm font-black text-brown underline decoration-2 underline-offset-[3px]"
            aria-label={qIndex === 0 ? 'Back to name' : 'Back to previous question'}
          >
            ← Back
          </button>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {QUESTIONS.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i < qIndex ? 'bg-brown' : i === qIndex ? 'bg-paper ring-2 ring-brown' : 'bg-paper/50'
                }`}
              />
            ))}
          </div>
          <p className="text-sm font-black text-brown">
            {qIndex + 1}/{QUESTIONS.length}
          </p>
        </div>

        <div key={qIndex} className={fadeClass}>
          <h2 className="font-display text-2xl sm:text-3xl text-brown text-center mb-4 sm:mb-8">
            {personalize(question.prompt)}
          </h2>
          {/* On a phone the two answers are compact side-by-side rows so both
              show without scrolling; from sm up they are the big stacked tiles. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {question.answers.map((a) => (
              <button
                key={a.letter}
                type="button"
                onClick={() => answer(a.letter)}
                className="card flex min-h-[64px] items-center gap-4 p-4 text-left sm:block sm:p-6 sm:text-center hover:brightness-95 active:translate-y-px transition-all"
              >
                <span className="block shrink-0 text-4xl sm:text-5xl sm:mb-3" aria-hidden="true">{a.emoji}</span>
                <span className="block font-extrabold text-brown leading-snug">{a.line}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Stages: reveal + result ─────────────────────────────────────────────────
  if (!result) return null; // unreachable once past the quiz, but keeps TS honest

  return (
    <div className="max-w-md mx-auto">
      {stage === 'reveal' && (
        <DogtypeReveal
          dogtype={result}
          dogName={trimmedName || undefined}
          onDone={() => setStage('result')}
        />
      )}

      <h1 className="mb-3 mt-2 text-center font-display text-[26px] font-normal leading-none text-brown">
        {trimmedName ? `${trimmedName}, meet your Dogtype` : 'Meet your Dogtype'}
      </h1>

      <div className={fadeClass}>
        <DogtypeResultCard dogtype={result} dogName={trimmedName || undefined} />
      </div>

      <div className="mt-5 flex flex-col">
        <button
          type="button"
          onClick={() => share('type')}
          className="btn-primary flex h-14 items-center justify-center gap-2.5 pb-[5px] pt-0 text-[25px] leading-none tracking-[0.3px]"
        >
          {copied === 'type' ? 'Link copied!' : (<><ShareIcon />{`Share ${dogLabel === 'your dog' ? 'this' : `${trimmedName}'s`} Dogtype`}</>)}
        </button>
        <Link
          href="/app?from=quiz"
          onClick={() => trackEvent('quiz_signup_cta', { code: result.code, ref })}
          className="mt-0.5 flex min-h-[44px] items-center justify-center text-sm font-black text-brown underline decoration-2 underline-offset-[3px]"
        >
          Make it official: create {dogLabel === 'your dog' ? "your dog's" : `${trimmedName}'s`} profile
        </Link>
      </div>

      <div className="mt-2 flex items-center justify-center gap-4 whitespace-nowrap text-sm">
        <Link href={`/dogtype/${result.code}`} className="inline-flex min-h-[44px] items-center font-black text-brown-mid underline underline-offset-2">
          Read about the {result.name.replace(/^The /, '')}
        </Link>
        <button
          type="button"
          onClick={retake}
          className="min-h-[44px] font-black text-brown-mid underline underline-offset-2"
        >
          Retake the quiz
        </button>
      </div>
    </div>
  );
}
