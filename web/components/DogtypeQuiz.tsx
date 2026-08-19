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
type ShareKind = 'type' | 'compat';

export default function DogtypeQuiz() {
  const [stage, setStage] = useState<Stage>('name');
  const [dogName, setDogName] = useState('');
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<Dogtype | null>(null);
  const [copied, setCopied] = useState<ShareKind | null>(null);
  const [reduced, setReduced] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Detect reduced-motion once on mount (SSR-safe: only runs client-side).
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
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
    trackEvent('quiz_start', { named: Boolean(trimmedName) });
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
    trackEvent('quiz_complete', { code: type.code });
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
    const url = absoluteUrl(kind === 'type' ? `/dogtype/${result.code}` : `/compat/${result.code}`);
    const text =
      kind === 'type'
        ? `${shareName} is ${result.name} ${result.emoji} — what's YOUR dog?`
        : `${shareName} is ${result.name} ${result.emoji} — would our dogs get along?`;
    trackEvent(kind === 'type' ? 'quiz_share' : 'quiz_share_compat', { code: result.code });

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
      <div className={`card p-6 sm:p-10 max-w-xl mx-auto text-center ${fadeClass}`}>
        <p className="text-5xl mb-4" aria-hidden="true">🐶</p>
        <h2 className="font-display text-3xl text-brown mb-2">First things first</h2>
        <label htmlFor="quiz-dog-name" className="block text-brown-mid font-semibold mb-4">
          What&apos;s your dog&apos;s name? <span className="text-brown-light font-normal">(optional)</span>
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
          className="w-full max-w-xs mx-auto block rounded-full border border-border bg-cream px-5 py-3 text-center text-lg text-brown placeholder:text-brown-light focus:border-primary focus:outline-none"
        />
        <p className="mt-2 text-xs text-brown-light">
          Just to personalize the questions — it stays on this page and is never sent anywhere.
        </p>
        <button type="button" onClick={startQuiz} className="btn-primary mt-6 text-lg px-10">
          Start the quiz
        </button>
        <p className="mt-4 text-sm text-brown-light">8 questions · about 90 seconds · no signup</p>
      </div>
    );
  }

  // ── Stage: quiz ─────────────────────────────────────────────────────────────
  if (stage === 'quiz') {
    const question = QUESTIONS[qIndex];
    return (
      <div className="max-w-xl mx-auto">
        {/* Progress dots + back */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={goBack}
            className="text-sm font-semibold text-brown-light hover:text-primary transition-colors"
            aria-label={qIndex === 0 ? 'Back to name' : 'Back to previous question'}
          >
            ← Back
          </button>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {QUESTIONS.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i < qIndex ? 'bg-primary' : i === qIndex ? 'bg-gold' : 'bg-cream-dark'
                }`}
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-brown-light">
            {qIndex + 1}/{QUESTIONS.length}
          </p>
        </div>

        <div key={qIndex} className={fadeClass}>
          <h2 className="font-display text-2xl sm:text-3xl text-brown text-center mb-8">
            {personalize(question.prompt)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {question.answers.map((a) => (
              <button
                key={a.letter}
                type="button"
                onClick={() => answer(a.letter)}
                className="card p-6 text-center border-2 border-transparent hover:border-primary active:scale-95 transition-all"
              >
                <span className="block text-5xl mb-3" aria-hidden="true">{a.emoji}</span>
                <span className="block font-semibold text-brown-mid leading-snug">{a.line}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Stages: reveal + result ─────────────────────────────────────────────────
  if (!result) return null; // unreachable once past the quiz, but keeps TS honest

  const spark = result.code[0] === 'E';
  const heroGradient = spark
    ? 'linear-gradient(160deg, #7A2E0E 0%, #E8633A 55%, #F5B731 100%)'
    : 'linear-gradient(160deg, #241A2E 0%, #5C3D2E 50%, #C98A5E 100%)';

  return (
    <div className="max-w-xl mx-auto">
      {stage === 'reveal' && (
        <DogtypeReveal
          dogtype={result}
          dogName={trimmedName || undefined}
          onDone={() => setStage('result')}
        />
      )}

      {/* Result hero */}
      <div className={`rounded-[2rem] overflow-hidden text-white p-8 text-center ${fadeClass}`} style={{ background: heroGradient }}>
        <div className="flex items-center justify-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
            {trimmedName ? `${trimmedName}'s Dogtype` : 'Dogtype'}
          </p>
          <span className="font-mono text-sm font-bold tracking-[0.28em] bg-black/25 rounded-md px-2.5 py-1">
            {result.code}
          </span>
        </div>
        <div className="mt-5 text-7xl leading-none" aria-hidden="true">{result.emoji}</div>
        <h2 className="mt-3 font-display text-4xl leading-tight">{result.name}</h2>
        <p className="mt-2 text-lg text-white/90 italic font-semibold">{result.tagline}</p>
        <p className="mt-3 text-white/85 leading-relaxed">{result.blurb}</p>
      </div>

      {/* The four axes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {result.axes.map((a) => (
          <div key={a.key} className="card p-4 rounded-2xl">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brown-light">{a.axis}</p>
            <p className="mt-1 font-display text-lg text-brown">
              {a.pole.emoji} {a.pole.label}
              <span className="text-brown-light text-sm font-body font-normal"> over {a.other.label}</span>
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-brown-light">
        A playful read from your answers — not a score or a diagnosis.
      </p>

      {/* Share loop */}
      <div className="mt-6 flex flex-col sm:flex-row items-stretch justify-center gap-3">
        <button type="button" onClick={() => share('type')} className="btn-primary text-base">
          {copied === 'type' ? 'Link copied!' : `Share ${dogLabel === 'your dog' ? 'this' : `${trimmedName}'s`} Dogtype`}
        </button>
        <button type="button" onClick={() => share('compat')} className="btn-secondary text-base">
          {copied === 'compat' ? 'Link copied!' : 'Would our dogs get along?'}
        </button>
      </div>

      {/* Signup CTA */}
      <div className="card p-6 mt-8 text-center">
        <p className="text-3xl mb-2" aria-hidden="true">🐾</p>
        <h3 className="font-display text-xl text-brown mb-2">Make it official</h3>
        <p className="text-sm text-brown-mid mb-4">
          Add photos and personality, and meet the dogs who actually fit.
        </p>
        <Link
          href="/app"
          onClick={() => trackEvent('quiz_signup_cta', { code: result.code })}
          className="btn-primary inline-block"
        >
          Save {dogLabel === 'your dog' ? "your dog's" : `${trimmedName}'s`} Dogtype + get their daily card — free
        </Link>
      </div>

      <div className="mt-6 flex items-center justify-center gap-6 text-sm">
        <Link href={`/dogtype/${result.code}`} className="font-semibold text-brown-mid hover:text-primary transition-colors">
          Read all about the {result.name.replace(/^The /, '')}
        </Link>
        <button
          type="button"
          onClick={retake}
          className="font-semibold text-brown-light hover:text-primary transition-colors underline underline-offset-2"
        >
          Retake the quiz
        </button>
      </div>
    </div>
  );
}
