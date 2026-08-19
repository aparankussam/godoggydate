'use client';
// web/components/DogQuizSection.tsx
// "Who actually knows {name}?" — a pass-the-phone party quiz on the profile page.
//
// NO AI, NO backend, NO new dependencies. The OWNER (already authenticated on
// this device) first sets the ANSWER KEY — their true answers to ten curated
// questions about their dog. Then it becomes a pass-the-phone game: a guest
// types their name, answers the same ten questions with the key hidden, and is
// scored against it. Everything lives in local React state on the owner's phone,
// so guests need no account and nothing is written to a server.
//
// HONEST by construction: a score is the literal count of a guest's answers that
// matched the owner's stated key (scoreDogQuiz), shown as "N/10 matched
// {owner}'s answers". The verdict labels are explicitly flagged as playful. The
// shareable scoreboard card bakes "GoDoggyDate · godoggydate.com" INTO the
// captured PNG so a reposted screenshot still carries the back-link.

import { useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import {
  DOG_QUIZ_QUESTIONS,
  DOG_QUIZ_LENGTH,
  quizPrompt,
  optionLabel,
  isKeyComplete,
  scoreDogQuiz,
  scoreVerdict,
  rankScoreboard,
  type DogQuizKey,
  type DogQuizScore,
  type DogQuizScoreboardEntry,
} from '../../shared/dogQuiz';

interface Props {
  savedProfile: SavedDogProfile;
}

// On-brand palette baked as inline hex (no oklch / backdrop-blur) so
// html2canvas captures the scoreboard card faithfully — same rationale as
// DiptychCard / WantedPosterWeb.
const BROWN = '#2D1A0E';
const BROWN_MID = '#5C3D2E';
const BROWN_LIGHT = '#9B7560';
const PRIMARY = '#E8633A';
const GOLD = '#D9A441';
const BORDER = '#EAD9C8';
const CREAM = '#FDF6EE';

type Phase = 'intro' | 'setup' | 'lobby' | 'play' | 'result';

let scoreboardSeq = 0;

export default function DogQuizSection({ savedProfile }: Props) {
  const dogName = savedProfile.name?.trim() || 'Your dog';

  const [phase, setPhase] = useState<Phase>('intro');

  // The owner's true answers. Built up during setup, then locked.
  const [key, setKey] = useState<DogQuizKey>({});
  const keyLocked = isKeyComplete(key);

  // Step index shared by the setup pass and each guest's play pass.
  const [stepIdx, setStepIdx] = useState(0);

  // Guest play state.
  const [guestName, setGuestName] = useState('');
  const [activeGuest, setActiveGuest] = useState('');
  const [guesses, setGuesses] = useState<DogQuizKey>({});
  const [lastScore, setLastScore] = useState<DogQuizScore | null>(null);

  const [scoreboard, setScoreboard] = useState<DogQuizScoreboardEntry[]>([]);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const total = DOG_QUIZ_LENGTH;

  // ── Setup: the owner records their true answers ─────────────────────────────
  function startSetup() {
    feedback.pop();
    setStepIdx(0);
    setPhase('setup');
    trackEvent('dogquiz_setup_start');
  }

  function pickSetupAnswer(optionId: string) {
    const q = DOG_QUIZ_QUESTIONS[stepIdx];
    if (!q) return;
    feedback.tap();
    setKey((prev) => ({ ...prev, [q.id]: optionId }));
    if (stepIdx + 1 < total) {
      setStepIdx((i) => i + 1);
    } else {
      feedback.success();
      setPhase('lobby');
      trackEvent('dogquiz_key_set');
    }
  }

  function redoKey() {
    feedback.tap();
    setKey({});
    setStepIdx(0);
    setPhase('setup');
    trackEvent('dogquiz_key_redo');
  }

  // ── Lobby: hand the phone to the next guest ─────────────────────────────────
  function startGuest() {
    const name = guestName.trim();
    if (!name || !keyLocked) return;
    feedback.pop();
    setActiveGuest(name);
    setGuesses({});
    setStepIdx(0);
    setPhase('play');
    trackEvent('dogquiz_guest_start');
  }

  // ── Play: the guest answers with the key hidden ─────────────────────────────
  function pickGuessAnswer(optionId: string) {
    const q = DOG_QUIZ_QUESTIONS[stepIdx];
    if (!q) return;
    feedback.tap();
    const nextGuesses = { ...guesses, [q.id]: optionId };
    setGuesses(nextGuesses);
    if (stepIdx + 1 < total) {
      setStepIdx((i) => i + 1);
    } else {
      const score = scoreDogQuiz(key, nextGuesses);
      setLastScore(score);
      const entry: DogQuizScoreboardEntry = {
        id: `sb-${scoreboardSeq++}`,
        name: activeGuest,
        correct: score.correct,
        total: score.total,
      };
      setScoreboard((prev) => [...prev, entry]);
      feedback.success();
      setPhase('result');
      setGuestName('');
      trackEvent('dogquiz_guest_scored', { correct: score.correct, total: score.total });
    }
  }

  function nextGuest() {
    feedback.tap();
    setActiveGuest('');
    setLastScore(null);
    setPhase('lobby');
  }

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('dogquiz_share_click', { players: scoreboard.length });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        cardRef.current,
        `who-knows-${dogName.toLowerCase().replace(/\s+/g, '-')}.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `Who actually knows ${dogName}?`,
          shareText: `We played "Who actually knows ${dogName}?" 🐶 Think you know a dog better than their own family? Make your own on GoDoggyDate.`,
        },
      );
      feedback.success();
      trackEvent('dogquiz_shared', { method: result, players: scoreboard.length });
    } catch {
      /* html2canvas/share failures are non-critical — let them retry. */
    } finally {
      setSharing(false);
    }
  }

  const ranked = rankScoreboard(scoreboard);
  const currentQuestion = DOG_QUIZ_QUESTIONS[stepIdx];

  return (
    <section className="rounded-2xl border border-gold/30 bg-gradient-to-br from-primary/5 to-gold/10 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Pass the phone 📱</p>
        <h2 className="font-display text-xl text-brown leading-tight">Who actually knows {dogName}?</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          Ten questions about {dogName}. You set the real answers, then hand the phone around — friends and
          family guess, and find out who truly knows this dog. No accounts, all on your phone.
        </p>
      </div>

      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      {phase === 'intro' && (
        <>
          {!keyLocked ? (
            <button type="button" onClick={startSetup} className="btn-primary w-full">
              Set {dogName}’s answer key →
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => { feedback.pop(); setPhase('lobby'); }} className="btn-primary w-full">
                Start the game →
              </button>
              <button type="button" onClick={redoKey} className="btn-secondary w-full">
                Redo the answer key
              </button>
            </div>
          )}
          <p className="mt-3 text-[11px] text-brown-light leading-snug">
            You answer first, as the owner — those become the correct answers. Everyone else is scored against
            them. Scores are just how many they matched, nothing more.
          </p>
        </>
      )}

      {/* ── Setup: owner records the true answers ─────────────────────────── */}
      {phase === 'setup' && currentQuestion && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              Answer key · {stepIdx + 1} of {total}
            </p>
            <span className="text-[11px] font-bold text-brown-light">🔒 owner only</span>
          </div>
          <ProgressBar current={stepIdx} total={total} />
          <p className="mt-3 font-display text-lg text-brown leading-snug">
            {currentQuestion.emoji} {quizPrompt(currentQuestion.prompt, dogName)}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {currentQuestion.options.map((opt) => {
              const selected = key[currentQuestion.id] === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => pickSetupAnswer(opt.id)}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-sm transition-all ${
                    selected
                      ? 'border-primary bg-primary/10 text-brown font-semibold ring-2 ring-primary/25'
                      : 'border-border bg-white text-brown-mid hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {stepIdx > 0 && (
            <button
              type="button"
              onClick={() => { feedback.tap(); setStepIdx((i) => Math.max(0, i - 1)); }}
              className="mt-3 text-xs font-bold text-primary underline underline-offset-2"
            >
              ← Back
            </button>
          )}
        </div>
      )}

      {/* ── Lobby: pass the phone to the next guest ───────────────────────── */}
      {phase === 'lobby' && (
        <div>
          <div className="rounded-xl bg-white/70 border border-border px-3.5 py-3">
            <p className="text-sm font-bold text-brown">🔒 Answer key locked in ({total} answers)</p>
            <p className="mt-0.5 text-xs text-brown-light leading-snug">
              Hand the phone to a friend or family member. They’ll answer the same {total} questions — no peeking
              at your answers.
            </p>
          </div>

          {ranked.length > 0 && <Scoreboard entries={ranked} dogName={dogName} />}

          <label htmlFor="dogquiz-guest" className="block mt-4 text-xs font-bold text-brown mb-1.5">
            Who’s playing next?
          </label>
          <div className="flex gap-2">
            <input
              id="dogquiz-guest"
              type="text"
              value={guestName}
              maxLength={24}
              placeholder="e.g. Mom, Dad, Alex"
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') startGuest(); }}
              className="flex-1 min-w-0 rounded-xl border border-border bg-white px-3 py-2 text-sm text-brown focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={startGuest}
              disabled={!guestName.trim()}
              className="btn-primary px-4 shrink-0 disabled:opacity-50"
            >
              Go →
            </button>
          </div>

          <button
            type="button"
            onClick={redoKey}
            className="mt-4 text-xs font-bold text-brown-light underline underline-offset-2 hover:text-brown"
          >
            Redo the answer key
          </button>
        </div>
      )}

      {/* ── Play: the guest answers, key hidden ───────────────────────────── */}
      {phase === 'play' && currentQuestion && (
        <div>
          <div className="rounded-lg bg-brown/5 border border-border px-3 py-2 mb-3">
            <p className="text-xs font-bold text-brown">
              📱 Pass to {activeGuest} — no peeking!
            </p>
          </div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              Question {stepIdx + 1} of {total}
            </p>
            <span className="text-[11px] font-bold text-brown-light">{activeGuest}’s guesses</span>
          </div>
          <ProgressBar current={stepIdx} total={total} />
          <p className="mt-3 font-display text-lg text-brown leading-snug">
            {currentQuestion.emoji} {quizPrompt(currentQuestion.prompt, dogName)}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {currentQuestion.options.map((opt) => {
              const selected = guesses[currentQuestion.id] === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => pickGuessAnswer(opt.id)}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-sm transition-all ${
                    selected
                      ? 'border-primary bg-primary/10 text-brown font-semibold ring-2 ring-primary/25'
                      : 'border-border bg-white text-brown-mid hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Result: the guest's score + review + scoreboard ───────────────── */}
      {phase === 'result' && lastScore && (
        <div>
          <div className="rounded-2xl border border-gold/40 bg-white/70 px-4 py-4 text-center">
            <p className="text-sm font-bold text-brown">{activeGuest} scored</p>
            <p className="font-display leading-none mt-1" style={{ fontSize: 52, color: PRIMARY }}>
              {lastScore.correct}
              <span style={{ fontSize: 26, color: BROWN_LIGHT }}>/{lastScore.total || total}</span>
            </p>
            {(() => {
              const v = scoreVerdict(lastScore);
              return (
                <p className="mt-1 text-sm font-bold text-brown">
                  {v.emoji} {v.label}
                </p>
              );
            })()}
            <p className="mt-1 text-[11px] text-brown-light">
              matched {dogName}’s owner’s answers · a playful label, not a real score
            </p>
          </div>

          {/* Per-question review — reveals your true answer next to their guess. */}
          <div className="mt-3 space-y-1.5">
            {lastScore.perQuestion.map((pq) => {
              const q = DOG_QUIZ_QUESTIONS.find((x) => x.id === pq.questionId);
              if (!q) return null;
              return (
                <div key={pq.questionId} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5">{pq.correct ? '✅' : '❌'}</span>
                  <span className="flex-1 text-brown-mid leading-snug">
                    <span className="font-semibold text-brown">{q.emoji} </span>
                    {pq.correct ? (
                      <>Guessed <span className="font-semibold text-brown">{optionLabel(q, pq.guessOptionId)}</span></>
                    ) : (
                      <>
                        Guessed “{optionLabel(q, pq.guessOptionId) ?? '—'}” · you said{' '}
                        <span className="font-semibold text-brown">{optionLabel(q, pq.keyOptionId) ?? '—'}</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {ranked.length > 0 && <Scoreboard entries={ranked} dogName={dogName} />}

          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={nextGuest} className="btn-primary w-full">
              Next player →
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="btn-secondary w-full disabled:opacity-60"
            >
              {sharing ? 'Preparing…' : '📤 Share the scoreboard'}
            </button>
          </div>
        </div>
      )}

      {/* Off-screen capturable scoreboard card (rendered once a game exists). */}
      {ranked.length > 0 && (
        <div className="fixed -left-[9999px] top-0" aria-hidden="true">
          <ScoreboardCard innerRef={cardRef} dogName={dogName} entries={ranked} />
        </div>
      )}
    </section>
  );
}

// ── Small inline progress bar ─────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-brown/10 overflow-hidden">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── On-page scoreboard (the live standings) ───────────────────────────────────
function Scoreboard({ entries, dogName }: { entries: DogQuizScoreboardEntry[]; dogName: string }) {
  return (
    <div className="mt-4 rounded-xl bg-white/70 border border-border px-3.5 py-3">
      <p className="text-xs font-bold text-brown">
        Who knows {dogName} best 🏆
      </p>
      <div className="mt-2 space-y-1.5">
        {entries.map((e, i) => (
          <div key={e.id} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-4 text-brown-light text-xs shrink-0">{i === 0 ? '🥇' : `${i + 1}.`}</span>
              <span className="truncate text-brown">{e.name}</span>
            </span>
            <span className="font-bold text-brown shrink-0">
              {e.correct}<span className="text-brown-light font-normal">/{e.total}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── The shareable scoreboard card (captured to PNG) ───────────────────────────
// Inline hex + solid fills so html2canvas renders it faithfully. The brand +
// URL are baked in so a reposted screenshot still points home.
function ScoreboardCard({
  innerRef,
  dogName,
  entries,
}: {
  innerRef: React.Ref<HTMLDivElement>;
  dogName: string;
  entries: DogQuizScoreboardEntry[];
}) {
  const top = entries.slice(0, 6);
  const denom = entries[0]?.total || DOG_QUIZ_LENGTH;
  return (
    <div
      ref={innerRef}
      className="relative overflow-hidden"
      style={{
        width: 360,
        borderRadius: 28,
        background: `linear-gradient(160deg, ${CREAM} 0%, #F7EADB 55%, #F1DFC9 100%)`,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div className="flex flex-col px-6 pt-6 pb-5">
        <p className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: 2.4, color: PRIMARY }}>
          Pass the phone 📱
        </p>
        <h3 className="font-display leading-tight mt-1" style={{ fontSize: 25, color: BROWN }}>
          Who actually knows {dogName}?
        </h3>
        <p className="mt-1" style={{ fontSize: 12, color: BROWN_LIGHT }}>
          out of {denom} questions
        </p>

        <div className="mt-4 flex flex-col gap-2.5">
          {top.map((e, i) => {
            const leader = i === 0;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return (
              <div
                key={e.id}
                className="flex items-center justify-between"
                style={{
                  borderRadius: 14,
                  padding: '10px 14px',
                  backgroundColor: leader ? GOLD : '#FFFFFF',
                  border: `1px solid ${leader ? GOLD : BORDER}`,
                }}
              >
                <span className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 15, width: 24 }}>{medal}</span>
                  <span
                    className="font-display truncate"
                    style={{ fontSize: 19, color: leader ? '#FFFFFF' : BROWN, maxWidth: 170 }}
                  >
                    {e.name}
                  </span>
                </span>
                <span className="font-display" style={{ fontSize: 20, color: leader ? '#FFFFFF' : PRIMARY }}>
                  {e.correct}
                  <span style={{ fontSize: 13, color: leader ? '#FFF3DA' : BROWN_LIGHT }}>/{e.total}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
        <div
          className="w-full mt-5 pt-3 flex items-center justify-between"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <p className="font-display" style={{ fontSize: 13, color: BROWN }}>
            GoDoggyDate
          </p>
          <p style={{ fontSize: 10, color: BROWN_MID }}>godoggydate.com</p>
        </div>
      </div>
    </div>
  );
}
