import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fonts, radius } from '../../constants/theme';
import {
  fetchMatch,
  fetchMessages,
  unlockMatch,
  sendMessage,
  type ChatMessage,
  type MatchItem,
} from '../../lib/matches';
import { createChatUnlockIntent } from '../../lib/stripe';
import { useSession } from '../../lib/session';

export default function ChatScreen() {
  const { matchId, name } = useLocalSearchParams<{ matchId: string; name: string }>();
  const { user } = useSession();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [match, setMatch] = useState<MatchItem | null>(null);
  const [chatUnlocked, setChatUnlocked] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    fetchMessages(matchId)
      .then(setMessages)
      .finally(() => setLoading(false));
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    fetchMatch(matchId)
      .then((m) => {
        setMatch(m);
        setChatUnlocked(m?.chatUnlocked ?? false);
      })
      .catch((err) => {
        console.warn('Failed to fetch match:', err);
      });
  }, [matchId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages.length]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !user || !chatUnlocked) return;
    setText('');
    setSending(true);
    try {
      const msg = await sendMessage(matchId, user.uid, trimmed);
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } finally {
      setSending(false);
    }
  }

  async function handleUnlock() {
    if (!user || !matchId) return;

    setUnlockLoading(true);
    setUnlockError(null);

    try {
      const { clientSecret } = await createChatUnlockIntent(matchId, user.uid);
      const initResult = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'GoDoggyDate',
      });
      if (initResult.error) throw new Error(initResult.error.message);

      const presentResult = await presentPaymentSheet();
      if (presentResult.error) throw new Error(presentResult.error.message);

      await unlockMatch(matchId, user.uid);
      setChatUnlocked(true);
      setUnlockError(null);
    } catch (err: any) {
      setUnlockError(err?.message || 'Failed to complete payment');
      console.warn('unlock error', err);
    } finally {
      setUnlockLoading(false);
    }
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === 'me';
    return (
      <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>{name}</Text>
          <Text style={styles.headerSub}>GoDoggyDate match</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !chatUnlocked ? (
        <View style={styles.paywallSendWrap}>
          <Text style={styles.paywallTitle}>Unlock Chat</Text>
          <Text style={styles.paywallBody}>
            Unlock messaging with this match for $4.99 (one-time). This uses Stripe payment
            sheet and persists unlock status in Firestore.
          </Text>
          {unlockError ? <Text style={styles.paywallError}>{unlockError}</Text> : null}
          <Pressable
            style={[styles.unlockBtn, unlockLoading && styles.sendBtnDisabled]}
            onPress={handleUnlock}
            disabled={unlockLoading}
          >
            {unlockLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.unlockBtnText}>Pay $4.99</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatEmoji}>🐾</Text>
                <Text style={styles.emptyChatText}>
                  Say hi to {name}! This is the start of your conversation.
                </Text>
              </View>
            }
          />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={`Message ${name}…`}
              placeholderTextColor={colors.brownLight}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendIcon}>↑</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 32,
    lineHeight: 36,
    color: colors.primary,
    fontFamily: fonts.body,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerName: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.brown,
  },
  headerSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexGrow: 1,
  },
  bubbleWrap: { marginBottom: 8, flexDirection: 'row' },
  bubbleWrapMe: { justifyContent: 'flex-end' },
  bubbleWrapThem: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  bubbleThem: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#fff', fontFamily: fonts.body },
  bubbleTextThem: { color: colors.brown, fontFamily: fonts.body },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brown,
    maxHeight: 120,
    backgroundColor: colors.cream,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: { backgroundColor: colors.brownLight, shadowOpacity: 0 },
  sendIcon: {
    color: '#fff',
    fontSize: 20,
    fontFamily: fonts.bold,
    lineHeight: 24,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyChatEmoji: { fontSize: 48, marginBottom: 14 },
  emptyChatText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  paywallSendWrap: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  paywallTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.brown,
    marginBottom: 10,
    textAlign: 'center',
  },
  paywallBody: {
    fontFamily: fonts.body,
    color: colors.brownLight,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 18,
  },
  paywallError: {
    color: '#c00',
    marginBottom: 12,
    textAlign: 'center',
  },
  unlockBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockBtnText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 16,
  },
});
