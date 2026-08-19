// mobile/components/DogQuizSection.tsx
// "Who actually knows {name}?" — the pass-the-phone party quiz, ported to RN.
// Mirrors web/components/DogQuizSection.tsx. NO AI, NO backend, NO new deps.
//
// The OWNER (already authenticated on this device) first sets the ANSWER KEY —
// their true answers to ten curated questions about their dog. Then it becomes a
// pass-the-phone game: a guest types their name, answers the same ten questions
// with the key hidden, and is scored against it. Everything lives in local
// component state on the owner's phone, so guests need no account and nothing is
// written to a server.
//
// HONEST by construction: a score is the literal count of a guest's answers that
// matched the owner's stated key (scoreDogQuiz), shown as "N / total matched".
// The denominator is the number of questions the key actually answers, never
// inflated. The verdict labels are explicitly flagged as playful. The shareable
// scoreboard card bakes "GoDoggyDate · godoggydate.com" INTO the captured PNG so
// a reposted screenshot still carries the back-link.

import { forwardRef, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import type { SavedDogProfile } from '../lib/profile';
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

type Phase = 'intro' | 'setup' | 'lobby' | 'play' | 'result';

let scoreboardSeq = 0;

// Never let a haptics failure break a product flow (matches shareCard.ts).
const tapHaptic = () => Haptics.selectionAsync().catch(() => {});
const popHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
const successHaptic = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

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
  const cardRef = useRef<View>(null);

  const total = DOG_QUIZ_LENGTH;

  // ── Setup: the owner records their true answers ─────────────────────────────
  function startSetup() {
    popHaptic();
    setStepIdx(0);
    setPhase('setup');
    trackEvent('dogquiz_setup_start');
  }

  function pickSetupAnswer(optionId: string) {
    const q = DOG_QUIZ_QUESTIONS[stepIdx];
    if (!q) return;
    tapHaptic();
    setKey((prev) => ({ ...prev, [q.id]: optionId }));
    if (stepIdx + 1 < total) {
      setStepIdx((i) => i + 1);
    } else {
      successHaptic();
      setPhase('lobby');
      trackEvent('dogquiz_key_set');
    }
  }

  function redoKey() {
    tapHaptic();
    setKey({});
    setStepIdx(0);
    setPhase('setup');
    trackEvent('dogquiz_key_redo');
  }

  // ── Lobby: hand the phone to the next guest ─────────────────────────────────
  function startGuest() {
    const name = guestName.trim();
    if (!name || !keyLocked) return;
    popHaptic();
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
    tapHaptic();
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
      successHaptic();
      setPhase('result');
      setGuestName('');
      trackEvent('dogquiz_guest_scored', { correct: score.correct, total: score.total });
    }
  }

  function nextGuest() {
    tapHaptic();
    setActiveGuest('');
    setLastScore(null);
    setPhase('lobby');
  }

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    trackEvent('dogquiz_share_click', { players: scoreboard.length });
    const result = await captureAndShare(
      cardRef,
      `who-knows-${dogName.toLowerCase().replace(/\s+/g, '-')}.png`,
      `Who actually knows ${dogName}?`,
    );
    if (result === 'shared') {
      trackEvent('dogquiz_shared', { method: 'native_share', players: scoreboard.length });
    }
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  const ranked = rankScoreboard(scoreboard);
  const currentQuestion = DOG_QUIZ_QUESTIONS[stepIdx];

  return (
    <View style={styles.section}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>Pass the phone 📱</Text>
        <Text style={styles.title}>Who actually knows {dogName}?</Text>
        <Text style={styles.lede}>
          Ten questions about {dogName}. You set the real answers, then hand the phone around — friends and
          family guess, and find out who truly knows this dog. No accounts, all on your phone.
        </Text>
      </View>

      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      {phase === 'intro' && (
        <View>
          {!keyLocked ? (
            <Pressable style={styles.primaryButton} onPress={startSetup}>
              <Text style={styles.primaryText}>Set {dogName}’s answer key →</Text>
            </Pressable>
          ) : (
            <View style={{ gap: 8 }}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  popHaptic();
                  setPhase('lobby');
                }}
              >
                <Text style={styles.primaryText}>Start the game →</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={redoKey}>
                <Text style={styles.secondaryText}>Redo the answer key</Text>
              </Pressable>
            </View>
          )}
          <Text style={styles.fineprint}>
            You answer first, as the owner — those become the correct answers. Everyone else is scored against
            them. Scores are just how many they matched, nothing more.
          </Text>
        </View>
      )}

      {/* ── Setup: owner records the true answers ─────────────────────────── */}
      {phase === 'setup' && currentQuestion && (
        <View>
          <View style={styles.stepHeader}>
            <Text style={styles.stepLabel}>Answer key · {stepIdx + 1} of {total}</Text>
            <Text style={styles.ownerOnly}>🔒 owner only</Text>
          </View>
          <ProgressBar current={stepIdx} total={total} />
          <Text style={styles.prompt}>
            {currentQuestion.emoji} {quizPrompt(currentQuestion.prompt, dogName)}
          </Text>
          <View style={styles.options}>
            {currentQuestion.options.map((opt) => {
              const selected = key[currentQuestion.id] === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => pickSetupAnswer(opt.id)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {stepIdx > 0 && (
            <Pressable
              onPress={() => {
                tapHaptic();
                setStepIdx((i) => Math.max(0, i - 1));
              }}
            >
              <Text style={styles.backLink}>← Back</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── Lobby: pass the phone to the next guest ───────────────────────── */}
      {phase === 'lobby' && (
        <View>
          <View style={styles.infoTile}>
            <Text style={styles.infoTileTitle}>🔒 Answer key locked in ({total} answers)</Text>
            <Text style={styles.infoTileSub}>
              Hand the phone to a friend or family member. They’ll answer the same {total} questions — no peeking
              at your answers.
            </Text>
          </View>

          {ranked.length > 0 && <Scoreboard entries={ranked} dogName={dogName} />}

          <Text style={styles.inputLabel}>Who’s playing next?</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={guestName}
              maxLength={24}
              placeholder="e.g. Mom, Dad, Alex"
              placeholderTextColor={colors.brownLight}
              onChangeText={setGuestName}
              onSubmitEditing={startGuest}
              returnKeyType="go"
              style={styles.input}
            />
            <Pressable
              style={[styles.goButton, !guestName.trim() && styles.goButtonDisabled]}
              onPress={startGuest}
              disabled={!guestName.trim()}
            >
              <Text style={styles.goText}>Go →</Text>
            </Pressable>
          </View>

          <Pressable onPress={redoKey}>
            <Text style={styles.redoLink}>Redo the answer key</Text>
          </Pressable>
        </View>
      )}

      {/* ── Play: the guest answers, key hidden ───────────────────────────── */}
      {phase === 'play' && currentQuestion && (
        <View>
          <View style={styles.passTile}>
            <Text style={styles.passText}>📱 Pass to {activeGuest} — no peeking!</Text>
          </View>
          <View style={styles.stepHeader}>
            <Text style={styles.stepLabel}>Question {stepIdx + 1} of {total}</Text>
            <Text style={styles.ownerOnly}>{activeGuest}’s guesses</Text>
          </View>
          <ProgressBar current={stepIdx} total={total} />
          <Text style={styles.prompt}>
            {currentQuestion.emoji} {quizPrompt(currentQuestion.prompt, dogName)}
          </Text>
          <View style={styles.options}>
            {currentQuestion.options.map((opt) => {
              const selected = guesses[currentQuestion.id] === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => pickGuessAnswer(opt.id)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Result: the guest's score + review + scoreboard ───────────────── */}
      {phase === 'result' && lastScore && (
        <View>
          <View style={styles.resultCard}>
            <Text style={styles.resultWho}>{activeGuest} scored</Text>
            <Text style={styles.resultScore}>
              {lastScore.correct}
              <Text style={styles.resultScoreDenom}>/{lastScore.total || total}</Text>
            </Text>
            {(() => {
              const v = scoreVerdict(lastScore);
              return (
                <Text style={styles.resultVerdict}>
                  {v.emoji} {v.label}
                </Text>
              );
            })()}
            <Text style={styles.resultNote}>
              matched {dogName}’s owner’s answers · a playful label, not a real score
            </Text>
          </View>

          {/* Per-question review — reveals your true answer next to their guess. */}
          <View style={styles.review}>
            {lastScore.perQuestion.map((pq) => {
              const q = DOG_QUIZ_QUESTIONS.find((x) => x.id === pq.questionId);
              if (!q) return null;
              return (
                <View key={pq.questionId} style={styles.reviewRow}>
                  <Text style={styles.reviewMark}>{pq.correct ? '✅' : '❌'}</Text>
                  <Text style={styles.reviewText}>
                    <Text style={styles.reviewEmoji}>{q.emoji} </Text>
                    {pq.correct ? (
                      <>
                        Guessed <Text style={styles.reviewStrong}>{optionLabel(q, pq.guessOptionId)}</Text>
                      </>
                    ) : (
                      <>
                        Guessed “{optionLabel(q, pq.guessOptionId) ?? '—'}” · you said{' '}
                        <Text style={styles.reviewStrong}>{optionLabel(q, pq.keyOptionId) ?? '—'}</Text>
                      </>
                    )}
                  </Text>
                </View>
              );
            })}
          </View>

          {ranked.length > 0 && <Scoreboard entries={ranked} dogName={dogName} />}

          {/* The capturable scoreboard card — shown here and shared as a PNG. */}
          {ranked.length > 0 && (
            <View style={styles.cardWrap}>
              <ScoreboardCard ref={cardRef} dogName={dogName} entries={ranked} />
            </View>
          )}

          <View style={{ gap: 8, marginTop: 14 }}>
            <Pressable style={styles.primaryButton} onPress={nextGuest}>
              <Text style={styles.primaryText}>Next player →</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, sharing && { opacity: 0.6 }]}
              onPress={handleShare}
              disabled={sharing}
            >
              <Text style={styles.secondaryText}>{sharing ? 'Preparing…' : '📤 Share the scoreboard'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Small inline progress bar ─────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  );
}

// ── On-page scoreboard (the live standings) ───────────────────────────────────
function Scoreboard({ entries, dogName }: { entries: DogQuizScoreboardEntry[]; dogName: string }) {
  return (
    <View style={styles.standings}>
      <Text style={styles.standingsTitle}>Who knows {dogName} best 🏆</Text>
      <View style={{ marginTop: 8, gap: 6 }}>
        {entries.map((e, i) => (
          <View key={e.id} style={styles.standingsRow}>
            <View style={styles.standingsNameWrap}>
              <Text style={styles.standingsRank}>{i === 0 ? '🥇' : `${i + 1}.`}</Text>
              <Text style={styles.standingsName} numberOfLines={1}>
                {e.name}
              </Text>
            </View>
            <Text style={styles.standingsScore}>
              {e.correct}
              <Text style={styles.standingsScoreDenom}>/{e.total}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── The shareable scoreboard card (captured to PNG) ───────────────────────────
// The brand + URL are baked in so a reposted screenshot still points home.
const ScoreboardCard = forwardRef<View, { dogName: string; entries: DogQuizScoreboardEntry[] }>(
  ({ dogName, entries }, ref) => {
    const top = entries.slice(0, 6);
    const denom = entries[0]?.total || DOG_QUIZ_LENGTH;
    return (
      <View ref={ref} collapsable={false} style={styles.shareCard}>
        <LinearGradient
          colors={[colors.cream, '#F7EADB', '#F1DFC9']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.shareEyebrow}>Pass the phone 📱</Text>
        <Text style={styles.shareTitle}>Who actually knows {dogName}?</Text>
        <Text style={styles.shareSub}>out of {denom} questions</Text>

        <View style={{ marginTop: 14, gap: 8 }}>
          {top.map((e, i) => {
            const leader = i === 0;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return (
              <View key={e.id} style={[styles.shareRow, leader && styles.shareRowLeader]}>
                <View style={styles.shareRowNameWrap}>
                  <Text style={styles.shareMedal}>{medal}</Text>
                  <Text
                    style={[styles.shareName, leader && styles.shareNameLeader]}
                    numberOfLines={1}
                  >
                    {e.name}
                  </Text>
                </View>
                <Text style={[styles.shareScore, leader && styles.shareScoreLeader]}>
                  {e.correct}
                  <Text style={[styles.shareScoreDenom, leader && styles.shareScoreDenomLeader]}>
                    /{e.total}
                  </Text>
                </Text>
              </View>
            );
          })}
        </View>

        {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
        <View style={styles.shareFooter}>
          <Text style={styles.shareBrand}>GoDoggyDate</Text>
          <Text style={styles.shareUrl}>godoggydate.com</Text>
        </View>
      </View>
    );
  },
);
ScoreboardCard.displayName = 'ScoreboardCard';

const SHARE_CARD_WIDTH = 300;

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.gold}4D`, // ~30%
    backgroundColor: `${colors.gold}14`, // ~8%
    padding: 18,
    marginBottom: 16,
  },
  headerBlock: { marginBottom: 14 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.brown, marginTop: 2, lineHeight: 26 },
  lede: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 4 },

  // Buttons
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadow.button,
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  secondaryButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.brown },
  fineprint: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, lineHeight: 15, marginTop: 12 },

  // Step header + progress
  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  stepLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  ownerOnly: { fontFamily: fonts.bold, fontSize: 11, color: colors.brownLight },
  progressTrack: { height: 6, borderRadius: radius.full, backgroundColor: 'rgba(45,26,14,0.10)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.primary },
  prompt: { fontFamily: fonts.display, fontSize: 18, color: colors.brown, lineHeight: 24, marginTop: 12 },

  // Options
  options: { marginTop: 12, gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}1A`, // ~10%
  },
  optionText: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid },
  optionTextSelected: { fontFamily: fonts.bold, color: colors.brown },
  backLink: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary, marginTop: 12 },

  // Lobby
  infoTile: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoTileTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  infoTileSub: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, lineHeight: 16, marginTop: 2 },
  inputLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown, marginTop: 16, marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
  },
  goButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
  goButtonDisabled: { opacity: 0.5 },
  goText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  redoLink: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownLight, marginTop: 16 },

  // Play
  passTile: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(45,26,14,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  passText: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown },

  // Result
  resultCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.gold}66`, // ~40%
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resultWho: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  resultScore: { fontFamily: fonts.display, fontSize: 52, lineHeight: 56, color: colors.primary, marginTop: 2 },
  resultScoreDenom: { fontFamily: fonts.display, fontSize: 26, color: colors.brownLight },
  resultVerdict: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown, marginTop: 2 },
  resultNote: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 4, textAlign: 'center' },

  // Review list
  review: { marginTop: 12, gap: 6 },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewMark: { fontSize: 12, marginTop: 1 },
  reviewText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.brownMid, lineHeight: 17 },
  reviewEmoji: { fontFamily: fonts.bold, color: colors.brown },
  reviewStrong: { fontFamily: fonts.bold, color: colors.brown },

  // On-page standings
  standings: {
    marginTop: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  standingsTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.brown },
  standingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  standingsNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  standingsRank: { width: 20, fontFamily: fonts.body, fontSize: 12, color: colors.brownLight },
  standingsName: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.brown },
  standingsScore: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown, marginLeft: 8 },
  standingsScoreDenom: { fontFamily: fonts.body, color: colors.brownLight },

  // Capturable share card
  cardWrap: { alignItems: 'center', marginTop: 16 },
  shareCard: {
    width: SHARE_CARD_WIDTH,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: colors.cream,
  },
  shareEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  shareTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.brown, lineHeight: 26, marginTop: 4 },
  shareSub: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginTop: 2 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  shareRowLeader: { backgroundColor: colors.gold, borderColor: colors.gold },
  shareRowNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  shareMedal: { fontSize: 14, width: 22 },
  shareName: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  shareNameLeader: { color: colors.white },
  shareScore: { fontFamily: fonts.display, fontSize: 19, color: colors.primary, marginLeft: 8 },
  shareScoreLeader: { color: colors.white },
  shareScoreDenom: { fontFamily: fonts.display, fontSize: 13, color: colors.brownLight },
  shareScoreDenomLeader: { color: '#FFF3DA' },
  shareFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  shareBrand: { fontFamily: fonts.display, fontSize: 14, color: colors.brown },
  shareUrl: { fontFamily: fonts.body, fontSize: 10, color: colors.brownMid },
});
