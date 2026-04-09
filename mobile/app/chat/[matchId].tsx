import { useEffect, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
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
import { getFirebase } from '../../lib/firebase';
import {
  fetchMatch,
  markMatchRead,
  sendMessage,
  type ChatMessage,
  type MatchItem,
} from '../../lib/matches';
import {
  createChatUnlockIntent,
  getPaymentConfigurationError,
  isPaymentConfigured,
} from '../../lib/stripe';
import { useSession } from '../../lib/session';

export default function ChatScreen() {
  const { matchId, name } = useLocalSearchParams<{ matchId?: string | string[]; name?: string | string[] }>();
  const { user } = useSession();
  const resolvedMatchId = Array.isArray(matchId) ? matchId[0] : matchId;
  const resolvedName = Array.isArray(name) ? name[0] : name;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [match, setMatch] = useState<MatchItem | null>(null);
  const [chatUnlocked, setChatUnlocked] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const listRef = useRef<FlatList>(null);
  const paymentConfigured = isPaymentConfigured();
  const paymentConfigurationError = getPaymentConfigurationError();

  useEffect(() => {
    if (!resolvedMatchId || !user) {
      setLoading(false);
      return;
    }

    const db = getFirebase().db;
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'matches', resolvedMatchId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(200),
      ),
      async (snapshot) => {
        setMessages(
          snapshot.docs.map((messageDoc) => {
            const data = messageDoc.data() as {
              text?: string;
              fromUserId?: string;
              senderId?: string;
              createdAt?: { toMillis?: () => number };
            };

            return {
              id: messageDoc.id,
              text: data.text ?? '',
              senderId: data.fromUserId ?? data.senderId ?? 'other',
              createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
            };
          }),
        );
        setLoading(false);
        try {
          await markMatchRead(resolvedMatchId, user.uid);
        } catch (error) {
          console.warn('Failed to mark chat as read:', error);
        }
      },
      (error) => {
        console.warn('Failed to subscribe to messages:', error);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [resolvedMatchId, user]);

  useEffect(() => {
    if (!resolvedMatchId) return;

    fetchMatch(resolvedMatchId, user?.uid ?? '')
      .then((m) => {
        setMatch(m);
        setChatUnlocked(m?.chatUnlocked ?? false);
      })
      .catch((err) => {
        console.warn('Failed to fetch match:', err);
      });
  }, [resolvedMatchId, user?.uid]);

  useEffect(() => {
    if (!resolvedMatchId) return;

    const db = getFirebase().db;
    const unsubscribe = onSnapshot(
      doc(db, 'matches', resolvedMatchId),
      (matchDoc) => {
        if (!matchDoc.exists()) {
          setChatUnlocked(false);
          return;
        }

        const data = matchDoc.data() as { chatUnlocked?: boolean };
        const nextChatUnlocked = Boolean(data.chatUnlocked);
        setChatUnlocked(nextChatUnlocked);
        setMatch((currentMatch) => (currentMatch
          ? { ...currentMatch, chatUnlocked: nextChatUnlocked }
          : currentMatch));
      },
      (error) => {
        console.warn('Failed to subscribe to match state:', error);
      },
    );

    return unsubscribe;
  }, [resolvedMatchId]);

  useEffect(() => {
    if (!chatUnlocked) return;
    setAwaitingVerification(false);
    setUnlockLoading(false);
    setUnlockError(null);
  }, [chatUnlocked]);

  useEffect(() => {
    if (!awaitingVerification) return undefined;

    const timeoutId = setTimeout(() => {
      setAwaitingVerification(false);
      setUnlockLoading(false);
      setUnlockError('Payment succeeded, but verification is taking longer than expected. Please reopen this chat in a moment.');
    }, 30000);

    return () => clearTimeout(timeoutId);
  }, [awaitingVerification]);

  useEffect(() => {
    if (messages.length > 0) {
      const timeoutId = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: false });
      }, 80);
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length]);

  async function handleRefreshUnlockStatus() {
    if (!resolvedMatchId) return;

    try {
      const refreshedMatch = await fetchMatch(resolvedMatchId, user?.uid ?? '');
      setMatch(refreshedMatch);
      setChatUnlocked(refreshedMatch?.chatUnlocked ?? false);

      if (refreshedMatch?.chatUnlocked) {
        setUnlockError(null);
      } else {
        setUnlockError('Chat is still waiting for payment verification. Please try again in a moment.');
      }
    } catch (error) {
      console.warn('Failed to refresh unlock status:', error);
      setUnlockError('We could not refresh chat status right now. Please try again in a moment.');
    }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !user || !chatUnlocked || !resolvedMatchId) return;
    setText('');
    setSending(true);
    try {
      await sendMessage(resolvedMatchId, user.uid, trimmed);
    } finally {
      setSending(false);
    }
  }

  async function handleUnlock() {
    if (!user || !resolvedMatchId) return;

    setUnlockLoading(true);
    setUnlockError(null);
    setAwaitingVerification(false);
    let paymentSubmitted = false;

    try {
      const { clientSecret } = await createChatUnlockIntent(resolvedMatchId, user.uid);
      const initResult = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'GoDoggyDate',
      });
      if (initResult.error) throw new Error(initResult.error.message);

      const presentResult = await presentPaymentSheet();
      if (presentResult.error) throw new Error(presentResult.error.message);

      paymentSubmitted = true;
      setAwaitingVerification(true);
      setUnlockError(null);
      return;
    } catch (err: any) {
      setAwaitingVerification(false);
      setUnlockError(err?.message || 'Failed to complete payment');
      console.warn('unlock error', err);
    } finally {
      if (!paymentSubmitted) {
        setUnlockLoading(false);
      }
    }
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === user?.uid || item.senderId === 'me';
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
          <Text style={styles.headerName}>{resolvedName || match?.dog.name || 'Chat'}</Text>
          <Text style={styles.headerSub}>GoDoggyDate match</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {!resolvedMatchId ? (
        <View style={styles.emptyChat}>
          <Text style={styles.emptyChatText}>This chat link is missing a match id.</Text>
        </View>
      ) : !user ? (
        <View style={styles.emptyChat}>
          <Text style={styles.emptyChatText}>Sign in to open this chat.</Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !chatUnlocked ? (
        <View style={styles.paywallSendWrap}>
          <Text style={styles.paywallTitle}>Unlock Chat</Text>
          <Text style={styles.paywallBody}>
            {paymentConfigured
              ? 'Unlock messaging with this match for $4.99 (one-time). This uses Stripe payment sheet and persists unlock status in Firestore.'
              : paymentConfigurationError ?? 'Payments are not configured for this build yet, so locked chats cannot be unlocked on this device.'}
          </Text>
          {unlockError ? <Text style={styles.paywallError}>{unlockError}</Text> : null}
          {!unlockLoading && unlockError ? (
            <Pressable style={styles.statusButton} onPress={handleRefreshUnlockStatus}>
              <Text style={styles.statusButtonText}>Check Unlock Status</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.unlockBtn, unlockLoading && styles.sendBtnDisabled]}
            onPress={handleUnlock}
            disabled={unlockLoading || !paymentConfigured}
          >
            {unlockLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.unlockBtnText}>
                {paymentConfigured ? 'Pay $4.99' : 'Payment Not Configured'}
              </Text>
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
                  Say hi to {resolvedName || match?.dog.name || 'your match'}! This is the start of your conversation.
                </Text>
              </View>
            }
          />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={`Message ${resolvedName || match?.dog.name || 'your match'}…`}
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
  statusButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 6,
  },
  statusButtonText: {
    color: colors.primary,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
});
