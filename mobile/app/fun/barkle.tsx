// mobile/app/fun/barkle.tsx
// BARKLE — Wordle for dog breeds, ported to a standalone RN screen. A mystery
// breed a day, six tries, a fresh clue after every miss. Public and delight-
// first: no profile, no AI, never waits on the network — every bit of logic lives in
// shared/barkle.ts (the SAME module the web game uses), and the day's progress
// persists in AsyncStorage so a return trip keeps your guesses. Signed in (guests
// too), lib/progressSync also syncs the day's game with the account, so a puzzle
// started on the website carries on here (and vice versa).
//
// The viral loop is the SPOILER-FREE result: an emoji-grid image (brand baked
// in via BarkleResultCard) shared through captureAndShare, plus a text share of
// the canonical buildShareText block for pasting into chats.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius } from '../../constants/theme';
import { BackHeader, Gingham, Glyph, PaperButton, PinkButton, card } from '../../components/pack/kit';
import { captureAndShare } from '../../lib/shareCard';
import { trackEvent } from '../../lib/analytics';
import NextToy from '../../components/playroom/NextToy';
import { loadBarkleGuesses, onProgressChange, saveBarkleGuesses } from '../../lib/progressSync';
import BarkleResultCard from '../../components/BarkleResultCard';
import {
  BREED_NAMES,
  MAX_TRIES,
  buildShareText,
  evaluateGuess,
  findBreed,
  getDailyBreed,
  normalizeBreedName,
  tileForGuess,
  type Breed,
  type DailyPuzzle,
  type GuessResult,
} from '../../../shared/barkle';

type Status = 'playing' | 'won' | 'lost';

function statusFrom(results: GuessResult[]): Status {
  if (results.some((r) => r.correct)) return 'won';
  if (results.length >= MAX_TRIES) return 'lost';
  return 'playing';
}

// Time until the next UTC midnight, when everyone's puzzle rolls over together.
function msUntilNextPuzzle(): number {
  const now = new Date();
  const nextUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
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

export default function BarkleScreen() {
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [results, setResults] = useState<GuessResult[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);
  const clueAnim = useRef(new Animated.Value(1)).current;

  // Resolve today's puzzle and rehydrate any saved progress for the same day,
  // and again when a game synced from the website lands.
  useEffect(() => {
    const today = getDailyBreed();
    setPuzzle(today);
    let alive = true;
    const rehydrate = async () => {
      const names = await loadBarkleGuesses(today.puzzleNumber, today.breed.name);
      const replay = names
        .map((name) => evaluateGuess(name, today.breed))
        .filter((r) => r.matched); // drop anything no longer recognised
      if (!alive || !replay.length) return;
      // A read that raced a guess just made here is behind the screen: keep the screen.
      setResults((cur) =>
        replay.length < cur.length && replay.every((r, i) => r.matched?.name === cur[i].matched?.name)
          ? cur
          : replay,
      );
    };
    void rehydrate();
    const off = onProgressChange(() => void rehydrate());
    trackEvent('barkle_open', {});
    return () => {
      alive = false;
      off();
    };
  }, []);

  const status = useMemo(() => statusFrom(results), [results]);
  const finished = status !== 'playing';
  const wrongCount = useMemo(() => results.filter((r) => !r.correct).length, [results]);
  const triesLeft = MAX_TRIES - results.length;

  const cluesShown = puzzle ? Math.min(wrongCount + 1, puzzle.breed.clues.length) : 0;

  // Autocomplete: top matches from the canonical breed list as the user types.
  const suggestions = useMemo(() => {
    const q = normalizeBreedName(input);
    if (!q || finished) return [];
    const already = new Set(results.map((r) => r.matched?.name));
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of BREED_NAMES) {
      if (already.has(name)) continue;
      const norm = normalizeBreedName(name);
      if (norm.startsWith(q)) starts.push(name);
      else if (norm.includes(q)) contains.push(name);
      if (starts.length >= 6) break;
    }
    return [...starts, ...contains].slice(0, 6);
  }, [input, finished, results]);

  // Live countdown to the next puzzle once the day's game is over.
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
        setError("That's not a breed I know — check the spelling or tap a suggestion.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
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
      Keyboard.dismiss();

      // Persist progress for the day (fire-and-forget; never throws).
      void saveBarkleGuesses(
        puzzle.puzzleNumber,
        next.map((r) => r.matched?.name).filter((n): n is string => typeof n === 'string'),
        statusFrom(next) === 'won',
      );

      // A fresh clue slides in after a miss; a solid thunk on the result.
      clueAnim.setValue(0);
      Animated.spring(clueAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();

      const outcome = statusFrom(next);
      if (outcome === 'playing') {
        Haptics.selectionAsync().catch(() => {});
      } else {
        Haptics.notificationAsync(
          outcome === 'won'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error,
        ).catch(() => {});
        trackEvent('barkle_complete', {
          code: puzzle.breed.name,
          tries: next.length,
          won: outcome === 'won',
        });
      }
    },
    [puzzle, finished, results, clueAnim],
  );

  const shareText = useMemo(() => {
    if (!puzzle || !finished) return '';
    return buildShareText(puzzle.puzzleNumber, results, status === 'won');
  }, [puzzle, finished, results, status]);

  async function handleShareImage() {
    if (sharing || !puzzle || !finished) return;
    setSharing(true);
    trackEvent('barkle_share_click', { method: 'image' });
    const result = await captureAndShare(cardRef, `barkle-${puzzle.puzzleNumber}.png`, 'My Barkle result');
    if (result === 'shared') trackEvent('barkle_shared', { method: 'image' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  async function handleShareText() {
    if (!shareText) return;
    trackEvent('barkle_share_click', { method: 'text' });
    try {
      await Share.share({ message: shareText });
      trackEvent('barkle_shared', { method: 'text' });
    } catch {
      // User dismissed the share sheet — nothing to recover.
    }
  }

  // ── Loading skeleton (pre-resolve) ─────────────────────────────────────────
  if (!puzzle) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <Header />
        <View style={styles.loadingWrap}>
          <Glyph name="paw" size={44} />
          <Text style={styles.loadingText}>Fetching today&apos;s mystery breed…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const breed: Breed = puzzle.breed;
  const clues = breed.clues.slice(0, cluesShown);

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <Header />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.kicker}>The daily dog game</Text>
        <Text style={styles.h1}>Barkle</Text>
        <Text style={styles.intro}>
          Guess today&apos;s mystery breed in six tries. A fresh clue after every miss — no account, no spoilers.
        </Text>

        {/* Header row: puzzle number + guess pips */}
        <View style={styles.metaRow}>
          <Text style={styles.puzzleNo}>BARKLE #{puzzle.puzzleNumber}</Text>
          <View style={styles.pips} accessibilityLabel={`${triesLeft} of ${MAX_TRIES} guesses left`}>
            {Array.from({ length: MAX_TRIES }).map((_, i) => {
              const r = results[i];
              // Same meaning as the share tiles: green correct, yellow same
              // group, orange same size, dark cold; paper = not played yet.
              const bg = !r
                ? colors.cream
                : r.correct
                ? colors.fit
                : r.sameGroup
                ? colors.amber
                : r.sameSize
                ? colors.amberSpine
                : colors.ink;
              return <View key={i} style={[styles.pip, { backgroundColor: bg }]} />;
            })}
          </View>
        </View>

        {/* Clues */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            {finished ? 'The clues were' : `Clue ${cluesShown} of ${breed.clues.length}`}
          </Text>
          {clues.map((clue, i) => {
            const isNewest = i === clues.length - 1 && !finished;
            return (
              <Animated.View
                key={i}
                style={[styles.clueRow, isNewest && { opacity: clueAnim }]}
              >
                <Text style={styles.clueNum}>{i + 1}.</Text>
                <Text style={styles.clueText}>{clue}</Text>
              </Animated.View>
            );
          })}
        </View>

        {/* Guesses so far */}
        {results.length > 0 && (
          <View style={styles.guessList}>
            {results.map((r, i) => (
              <View key={i} style={styles.guessRow}>
                <Text style={styles.guessName}>
                  {tileForGuess(r)}  {r.matched?.name}
                </Text>
                <Text style={styles.guessTag}>
                  {r.correct ? 'Correct!' : r.sameGroup ? 'Same group' : r.sameSize ? 'Same size' : 'Cold'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Input while playing */}
        {!finished && (
          <View style={styles.inputBlock}>
            <TextInput
              value={input}
              onChangeText={(v) => {
                setInput(v);
                if (error) setError('');
              }}
              onSubmitEditing={() => submit(input)}
              placeholder="Name a dog breed…"
              placeholderTextColor={colors.brownLight}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={40}
              returnKeyType="done"
              style={styles.input}
            />

            {suggestions.length > 0 && (
              <View style={styles.suggestions}>
                {suggestions.map((name) => (
                  <Pressable
                    key={name}
                    style={styles.suggestion}
                    onPress={() => submit(name)}
                    accessibilityRole="button"
                    accessibilityLabel={`Guess ${name}`}
                  >
                    <Text style={styles.suggestionText}>{name}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <PinkButton label="Guess" onPress={() => submit(input)} accessibilityLabel="Submit guess" style={styles.primaryButton} />

            <Text style={[styles.hint, error ? styles.hintError : null]}>
              {error
                ? error
                : `${triesLeft} ${triesLeft === 1 ? 'guess' : 'guesses'} left · a new clue after each miss`}
            </Text>
            <Text style={styles.legend}>🟩 correct · 🟨 same group · 🟧 same size · ⬛ cold</Text>
          </View>
        )}

        {/* Result */}
        {finished && (
          <View style={styles.resultBlock}>
            {/* The reveal (breed name + emoji) is on-screen only, never shared. */}
            <View style={styles.reveal}>
              <Text style={styles.revealLabel}>
                {status === 'won' ? `Solved in ${results.length}/${MAX_TRIES}` : `Out of guesses — ${MAX_TRIES}/${MAX_TRIES}`}
              </Text>
              <Text style={styles.revealEmoji}>{breed.emoji}</Text>
              <Text style={styles.revealName}>{breed.name}</Text>
              <Text style={styles.revealMeta}>
                {breed.group} group · {breed.size} size
              </Text>
            </View>

            {/* The spoiler-free shareable card (brand + link baked in). */}
            <View style={styles.shareCardWrap} collapsable={false}>
              <BarkleResultCard
                ref={cardRef}
                puzzleNumber={puzzle.puzzleNumber}
                results={results}
                won={status === 'won'}
              />
            </View>

            <PinkButton
              label={sharing ? 'Rendering…' : 'Share result'}
              icon="export-variant"
              onPress={handleShareImage}
              busy={sharing}
              accessibilityLabel="Share result image"
              style={styles.primaryButton}
            />
            <PaperButton
              label="Copy as text"
              onPress={handleShareText}
              accessibilityLabel="Share result as text"
              style={styles.secondaryButton}
            />

            {countdown ? (
              <Text style={styles.countdown}>
                Next Barkle in <Text style={styles.countdownMono}>{countdown}</Text>
              </Text>
            ) : null}
          </View>
        )}

        <Text style={styles.footerNote}>
          One breed a day, the same for everyone in the world. Just for fun.
        </Text>
        <NextToy current="barkle" />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <BackHeader title="Barkle" onBack={() => router.back()} />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontFamily: fonts.bold, fontSize: 16, color: colors.rose, width: 48 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  content: { padding: 20, paddingBottom: 48 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  loadingEmoji: { fontSize: 52 },
  loadingText: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },

  kicker: {
    fontFamily: fonts.black,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
  },
  h1: {
    fontFamily: fonts.display,
    fontSize: 42,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 4,
  },
  intro: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  puzzleNo: { fontFamily: fonts.black, fontSize: 14, letterSpacing: 1, color: colors.ink },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { height: 16, width: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.ink },

  card: {
    ...card.paper,
    padding: 18,
  },
  cardLabel: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.brownMid,
    marginBottom: 12,
  },
  clueRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  clueNum: { fontFamily: fonts.black, fontSize: 15, lineHeight: 21, color: colors.ink },
  clueText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink, lineHeight: 21 },

  guessList: { marginTop: 14, gap: 8 },
  guessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  guessName: { fontFamily: fonts.black, fontSize: 15, color: colors.brown, flex: 1 },
  guessTag: { fontFamily: fonts.black, fontSize: 13, color: colors.brownMid },

  inputBlock: { marginTop: 16 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brown,
  },
  suggestions: {
    marginTop: 8,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  suggestion: { paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontFamily: fonts.bold, fontSize: 15, color: colors.brown },
  primaryButton: { marginTop: 12, alignSelf: 'stretch' },
  hint: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textAlign: 'center', marginTop: 12 },
  hintError: { fontFamily: fonts.black, color: colors.ink },
  legend: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textAlign: 'center', marginTop: 8 },

  resultBlock: { marginTop: 20, alignItems: 'center' },
  reveal: {
    ...card.paper,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 18,
  },
  revealLabel: { fontFamily: fonts.black, fontSize: 14, color: colors.brownMid },
  revealEmoji: { fontSize: 60, marginTop: 8 },
  revealName: { fontFamily: fonts.display, fontSize: 28, color: colors.brown, marginTop: 6, textAlign: 'center' },
  revealMeta: { fontFamily: fonts.bold, fontSize: 13, color: colors.brownMid, marginTop: 4 },
  shareCardWrap: { marginBottom: 18 },

  secondaryButton: { alignSelf: 'stretch', marginTop: 10 },
  countdown: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, marginTop: 16, textAlign: 'center' },
  countdownMono: { fontFamily: fonts.black, color: colors.ink },

  footerNote: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 28,
  },
});
