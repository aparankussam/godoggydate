import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { SEED_DOGS } from '../../../shared/data/seedDogs';

// Demo matches — first 4 seed dogs
const DEMO_MATCHES = SEED_DOGS.slice(1, 5).map((dog, i) => ({
  ...dog,
  score: [92, 87, 79, 83][i],
  chatUnlocked: i < 2,
  distanceMiles: [0.6, 1.2, 0.9, 1.8][i],
}));

const SMART_PROMPTS = [
  'Park tomorrow? 🌳',
  'Morning fetch session? 🎾',
  'Short intro walk? 🐾',
  'Dog beach Saturday? 🏖️',
  'Coffee + dogs this weekend?',
];

type Screen = 'list' | 'chat' | 'rate';

export default function MatchesScreen() {
  const [screen, setScreen] = useState<Screen>('list');
  const [activeMatch, setActiveMatch] = useState<(typeof DEMO_MATCHES)[0] | null>(null);
  const [messages, setMessages] = useState<{ text: string; fromMe: boolean }[]>([]);
  const [inputText, setInputText] = useState('');
  const [rating, setRating] = useState(0);
  const [wouldMeetAgain, setWouldMeetAgain] = useState<boolean | null>(null);
  const [ratingTags, setRatingTags] = useState<string[]>([]);
  const [ratedMatches, setRatedMatches] = useState<Set<string>>(new Set());

  function openChat(match: (typeof DEMO_MATCHES)[0]) {
    setActiveMatch(match);
    setMessages([
      {
        text: `Hi! ${match.name} and I would love to meet your pup 🐾`,
        fromMe: false,
      },
    ]);
    setScreen('chat');
  }

  function sendMessage(text: string) {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { text, fromMe: true }]);
    setInputText('');
    // Auto-reply after 1s
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { text: 'That sounds great! 🎉 Looking forward to it!', fromMe: false },
      ]);
    }, 1000);
  }

  function openRate(match: (typeof DEMO_MATCHES)[0]) {
    setActiveMatch(match);
    setRating(0);
    setWouldMeetAgain(null);
    setRatingTags([]);
    setScreen('rate');
  }

  function submitRating() {
    if (activeMatch) {
      setRatedMatches((prev) => new Set([...prev, activeMatch.id]));
    }
    setScreen('list');
  }

  function toggleTag(tag: string) {
    setRatingTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  if (screen === 'chat' && activeMatch) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setScreen('list')} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.chatTitle}>{activeMatch.name}</Text>
          <TouchableOpacity onPress={() => openRate(activeMatch)} style={styles.rateBtn}>
            <Text style={styles.rateBtnText}>Rate ⭐</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.chatMessages} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[styles.bubble, m.fromMe ? styles.bubbleMe : styles.bubbleThem]}
            >
              <Text style={[styles.bubbleText, m.fromMe && styles.bubbleTextMe]}>{m.text}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Smart Prompts */}
        <ScrollView
          horizontal
          style={styles.promptsRow}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          showsHorizontalScrollIndicator={false}
        >
          {SMART_PROMPTS.map((p) => (
            <TouchableOpacity key={p} style={styles.promptChip} onPress={() => sendMessage(p)}>
              <Text style={styles.promptChipText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="Type a message..."
              placeholderTextColor={colors.brownLight}
              value={inputText}
              onChangeText={setInputText}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage(inputText)}
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => sendMessage(inputText)}
            >
              <Text style={styles.sendBtnText}>➤</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (screen === 'rate' && activeMatch) {
    const RATING_TAGS = ['Friendly 😊', 'Too rough ⚠️', 'Great match 💛', 'Slow intro needed 🐾'];
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setScreen('chat')} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.chatTitle}>Rate Playdate</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Text style={styles.rateTitle}>How was your playdate with {activeMatch.name}?</Text>

          {/* Stars */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <TouchableOpacity key={s} onPress={() => setRating(s)}>
                <Text style={[styles.star, s <= rating && styles.starFilled]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Would meet again */}
          <Text style={styles.rateQuestion}>Would you meet again?</Text>
          <View style={styles.yesNoRow}>
            <TouchableOpacity
              style={[styles.yesNoBtn, wouldMeetAgain === true && styles.yesNoBtnActive]}
              onPress={() => setWouldMeetAgain(true)}
            >
              <Text style={styles.yesNoText}>🐾 Yes!</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.yesNoBtn, wouldMeetAgain === false && styles.yesNoBtnWarning]}
              onPress={() => setWouldMeetAgain(false)}
            >
              <Text style={styles.yesNoText}>Not this time</Text>
            </TouchableOpacity>
          </View>

          {/* Tags */}
          <Text style={styles.rateQuestion}>How would you describe it?</Text>
          <View style={styles.tagRow}>
            {RATING_TAGS.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.rateTag, ratingTags.includes(tag) && styles.rateTagActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text
                  style={[styles.rateTagText, ratingTags.includes(tag) && styles.rateTagTextActive]}
                >
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.submitRateBtn, rating === 0 && styles.submitRateBtnDisabled]}
            onPress={submitRating}
            disabled={rating === 0}
          >
            <Text style={styles.submitRateBtnText}>Submit Rating ⭐</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💛 Matches</Text>
        <Text style={styles.headerSub}>{DEMO_MATCHES.length} connections</Text>
      </View>

      <ScrollView contentContainerStyle={styles.matchList}>
        {DEMO_MATCHES.map((match) => (
          <View key={match.id} style={styles.matchCard}>
            <LinearGradient colors={['#F5B731', '#E8633A']} style={styles.matchPhoto}>
              <Text style={styles.matchEmoji}>🐕</Text>
            </LinearGradient>
            <View style={styles.matchInfo}>
              <Text style={styles.matchName}>{match.name}</Text>
              <Text style={styles.matchBreed}>{match.breed}</Text>
              <View style={styles.matchMeta}>
                <Text style={styles.matchScore}>{match.score}% match</Text>
                <Text style={styles.matchDist}>📍 {match.distanceMiles} mi</Text>
              </View>
            </View>
            <View style={styles.matchActions}>
              {match.chatUnlocked ? (
                <>
                  <TouchableOpacity
                    style={[styles.matchBtn, styles.chatBtn]}
                    onPress={() => openChat(match)}
                  >
                    <Text style={styles.matchBtnText}>💬</Text>
                  </TouchableOpacity>
                  {!ratedMatches.has(match.id) && (
                    <TouchableOpacity
                      style={[styles.matchBtn, styles.rateSmallBtn]}
                      onPress={() => openRate(match)}
                    >
                      <Text style={styles.matchBtnText}>⭐</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <TouchableOpacity style={[styles.matchBtn, styles.unlockBtn]}>
                  <Text style={styles.unlockBtnLabel}>🔓 $4.99</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.brown },
  headerSub: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight },
  matchList: { padding: 16, gap: 12 },
  matchCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...shadow.card,
  },
  matchPhoto: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchEmoji: { fontSize: 32 },
  matchInfo: { flex: 1, padding: 12 },
  matchName: { fontFamily: fonts.bold, fontSize: 16, color: colors.brown },
  matchBreed: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight, marginTop: 2 },
  matchMeta: { flexDirection: 'row', gap: 8, marginTop: 4 },
  matchScore: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primary },
  matchDist: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight },
  matchActions: { flexDirection: 'row', gap: 8, paddingRight: 12 },
  matchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtn: { backgroundColor: colors.primary },
  rateSmallBtn: { backgroundColor: colors.gold },
  unlockBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  unlockBtnLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown },
  matchBtnText: { fontSize: 18 },
  // Chat
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40 },
  backText: { fontSize: 22, color: colors.brown },
  chatTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.brown, textAlign: 'center' },
  rateBtn: {
    backgroundColor: 'rgba(245,183,49,0.15)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rateBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownMid },
  chatMessages: { flex: 1, backgroundColor: colors.cream },
  bubble: {
    maxWidth: '75%',
    borderRadius: radius.lg,
    padding: 12,
    backgroundColor: colors.white,
    alignSelf: 'flex-start',
    ...shadow.card,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  bubbleText: { fontFamily: fonts.body, fontSize: 15, color: colors.brown },
  bubbleTextMe: { color: colors.white },
  promptsRow: {
    maxHeight: 48,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  promptChip: {
    backgroundColor: 'rgba(232,99,58,0.1)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  promptChipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.cream,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brown,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: colors.white, fontSize: 18 },
  // Rating
  rateTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.brown, marginBottom: 20 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  star: { fontSize: 40, color: colors.border },
  starFilled: { color: colors.gold },
  rateQuestion: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brownMid, marginBottom: 12, marginTop: 8 },
  yesNoRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  yesNoBtn: {
    flex: 1,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  yesNoBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(232,99,58,0.08)' },
  yesNoBtnWarning: { borderColor: colors.warning },
  yesNoText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.brown },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 },
  rateTag: {
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rateTagActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rateTagText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownMid },
  rateTagTextActive: { color: colors.white },
  submitRateBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    padding: 16,
    alignItems: 'center',
    ...shadow.button,
  },
  submitRateBtnDisabled: { opacity: 0.4 },
  submitRateBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
});
