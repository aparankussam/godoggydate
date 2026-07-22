import { useEffect, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type MatchItem,
  type PlaydateDetails,
} from '../../lib/matches';
import {
  createChatUnlockIntent,
  getPaymentConfigurationError,
  isPaymentConfigured,
} from '../../lib/stripe';
import { useSession } from '../../lib/session';
import { isUserChatUnlocked } from '../../../shared/matchAccess';
import { blockUser } from '../../lib/blocks';
import { onEntitlements, getFoundingMemberLink } from '../../lib/entitlements';
import { trackEvent } from '../../lib/analytics';
import { CHAT_UNLOCK_PRICE_CENTS, formatPrice, getChatUnlockPitch } from '../../../shared/utils/stripe';
import { hasRatedPlaydate, submitPlaydateRating } from '../../lib/ratings';
import PlaydateRatingModal from '../../components/PlaydateRatingModal';
import PlaydateMemoryCard from '../../components/PlaydateMemoryCard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

const SAFETY_TIP =
  'Safety tip: For a first playdate, meet in a public dog park or other busy public place. Keep dogs leashed at first and take it slow.';

function isSeedUserId(id?: string): boolean {
  return Boolean(id?.startsWith('user_seed_'));
}

function playdateKey(p?: PlaydateDetails): string {
  return p ? `${p.date}|${p.time}|${p.place}` : '';
}

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
  const [hasLifetime, setHasLifetime] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [showPlaydateForm, setShowPlaydateForm] = useState(false);
  const [playdateDraft, setPlaydateDraft] = useState<PlaydateDetails>({ date: '', time: '', place: '' });
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(true);
  const [memoryCardStars, setMemoryCardStars] = useState<number | null>(null);
  const [sharingMemoryCard, setSharingMemoryCard] = useState(false);
  const memoryCardRef = useRef<View>(null);
  const listRef = useRef<FlatList>(null);
  const paymentConfigured = isPaymentConfigured();
  const paymentConfigurationError = getPaymentConfigurationError();

  // Effective chat access: per-match unlock OR Founding Member entitlement.
  const canChat = chatUnlocked || hasLifetime;

  useEffect(() => {
    if (!resolvedMatchId || loading) return;
    trackEvent(canChat ? 'chat_view' : 'chat_unlock_prompt_view', { match_id: resolvedMatchId });
  }, [canChat, loading, resolvedMatchId]);

  useEffect(() => {
    if (!user) return;
    return onEntitlements(user.uid, (e) => setHasLifetime(e.lifetimeChatUnlocks));
  }, [user]);

  async function submitReport(reason: 'block' | 'spam' | 'inappropriate') {
    if (!user || !resolvedMatchId || !match?.dog.id) return;

    // Block FIRST and independently — the safety action must not be skipped
    // because the report write fails (e.g. repeat reports: rules forbid
    // updating an existing report doc).
    if (reason === 'block') {
      try {
        await blockUser(user.uid, match.dog.id);
      } catch (error) {
        console.warn('Block failed', error);
        Alert.alert('Block failed', 'Please check your connection and try again.');
        return;
      }
    }

    try {
      const db = getFirebase().db;
      // Unique id per submission so repeat reports are creates, never updates.
      const reportId = `${user.uid}_${match.dog.id}_${Date.now()}`;
      await setDoc(doc(db, 'reports', reportId), {
        reporterId: user.uid,
        targetUserId: match.dog.id,
        matchId: resolvedMatchId,
        reason,
        createdAt: serverTimestamp(),
      });

      Alert.alert(
        reason === 'block' ? 'User blocked' : 'Report submitted',
        reason === 'block'
          ? 'We saved your block request and removed this conversation from your flow.'
          : 'Thanks for letting us know. We saved your report for review.',
        [{ text: 'OK', onPress: () => reason === 'block' && router.replace('/(tabs)/matches') }],
      );
    } catch (error) {
      console.warn('Failed to submit report', error);
      if (reason === 'block') {
        // The block itself already succeeded — don't tell the user it failed.
        Alert.alert('User blocked', 'We removed this conversation from your flow.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/matches') },
        ]);
      } else {
        Alert.alert('Could not submit report', 'Please try again in a moment.');
      }
    }
  }

  function openSafetyMenu() {
    Alert.alert(
      'Safety options',
      'Choose what you want to do with this match.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report spam or fake profile', onPress: () => void submitReport('spam') },
        { text: 'Report inappropriate behaviour', onPress: () => void submitReport('inappropriate') },
        { text: 'Block this user', style: 'destructive', onPress: () => void submitReport('block') },
      ],
    );
  }

  useEffect(() => {
    if (!resolvedMatchId || !user) {
      setLoading(false);
      return;
    }

    if (!canChat) {
      setMessages([]);
      setLoading(false);
      return undefined;
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
              type?: ChatMessage['type'];
              playdate?: PlaydateDetails;
            };

            return {
              id: messageDoc.id,
              text: data.text ?? '',
              senderId: data.fromUserId ?? data.senderId ?? 'other',
              createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
              type: data.type,
              playdate: data.playdate,
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
  }, [canChat, resolvedMatchId, user]);

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

        const data = matchDoc.data() as {
          chatUnlocked?: boolean;
          dog1ChatUnlocked?: boolean | null;
          dog2ChatUnlocked?: boolean | null;
          dog1UserId?: string;
          dog2UserId?: string;
        };
        // OR in hasLifetime so this state means the same "effective access"
        // as fetchMatch()/fetchMatches() in lib/matches.ts — Founding
        // Members never look locked in match.chatUnlocked here.
        const nextChatUnlocked = (user ? isUserChatUnlocked(data, user.uid) : false) || hasLifetime;
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
  }, [resolvedMatchId, user, hasLifetime]);

  useEffect(() => {
    if (!canChat) return;
    setAwaitingVerification(false);
    setUnlockLoading(false);
    setUnlockError(null);
  }, [canChat]);

  useEffect(() => {
    if (!awaitingVerification) return undefined;

    const timeoutId = setTimeout(() => {
      setAwaitingVerification(false);
      setUnlockLoading(false);
      setUnlockError('We’re still confirming your payment. Chat usually opens within a minute. Tap below to check again.');
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
        setUnlockError('We’re still confirming your payment. Please check again in a moment.');
      }
    } catch (error) {
      console.warn('Failed to refresh unlock status:', error);
      setUnlockError('We could not refresh chat status right now. Please try again in a moment.');
    }
  }

  async function handleSend(
    overrideText?: string,
    extra?: { type: ChatMessage['type']; playdate: PlaydateDetails },
  ): Promise<boolean> {
    const trimmed = (overrideText ?? text).trim();
    if (!trimmed || sending || !user || !canChat || !resolvedMatchId) return false;
    if (!overrideText) setText('');
    setSending(true);
    let delivered = false;
    try {
      await sendMessage(resolvedMatchId, user.uid, trimmed, extra);
      delivered = true;
      trackEvent(
        extra?.type === 'playdate_proposal' ? 'playdate_proposed'
          : extra?.type === 'playdate_confirmed' ? 'playdate_confirmed'
            : 'message_sent',
        { match_id: resolvedMatchId },
      );
    } catch (error) {
      console.warn('Message send failed:', error);
      if (!overrideText) setText(trimmed); // restore the draft — silent loss is worse
      Alert.alert('Message didn’t send', 'Please check your connection and try again.');
    } finally {
      setSending(false);
    }
    return delivered;
  }

  const confirmedPlaydateKeys = new Set(
    messages.filter((m) => m.type === 'playdate_confirmed').map((m) => playdateKey(m.playdate)),
  );
  const hasConfirmedPlaydate = confirmedPlaydateKeys.size > 0;

  useEffect(() => {
    if (!user || !resolvedMatchId || !hasConfirmedPlaydate) return;
    let cancelled = false;
    hasRatedPlaydate(user.uid, resolvedMatchId).then((rated) => {
      if (!cancelled) setAlreadyRated(rated);
    });
    return () => { cancelled = true; };
  }, [user, resolvedMatchId, hasConfirmedPlaydate]);

  async function handleSubmitRating(stars: number, wouldMeetAgain: boolean) {
    if (!user || !match?.dog.id || !resolvedMatchId) return;
    await submitPlaydateRating({
      matchId: resolvedMatchId,
      raterId: user.uid,
      dogId: match.dog.id,
      stars,
      wouldMeetAgain,
    });
    trackEvent('playdate_rated', { match_id: resolvedMatchId, stars, would_meet_again: wouldMeetAgain });
    setAlreadyRated(true);
    setShowRatingModal(false);
    setMemoryCardStars(stars);
  }

  async function handleShareMemoryCard() {
    if (!memoryCardRef.current || sharingMemoryCard) return;
    setSharingMemoryCard(true);
    trackEvent('memory_card_share_click', { match_id: resolvedMatchId ?? '' });
    try {
      const uri = await captureRef(memoryCardRef, { format: 'png', quality: 1 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
        trackEvent('memory_card_shared', { match_id: resolvedMatchId ?? '', method: 'native_share' });
      } else {
        Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
      }
    } catch (error) {
      console.warn('Failed to share memory card', error);
      Alert.alert('Could not share card', 'Please try again in a moment.');
    } finally {
      setSharingMemoryCard(false);
    }
  }

  async function proposePlaydate() {
    const { date, time, place } = playdateDraft;
    if (!date.trim() || !place.trim()) return;
    const when = time.trim() ? `${date.trim()} at ${time.trim()}` : date.trim();
    const delivered = await handleSend(`📅 Playdate proposal: ${when} — ${place.trim()}`, {
      type: 'playdate_proposal',
      playdate: { date: date.trim(), time: time.trim(), place: place.trim() },
    });
    if (!delivered) return; // keep the form + draft so the user can retry
    setShowPlaydateForm(false);
    setPlaydateDraft({ date: '', time: '', place: '' });
  }

  async function acceptPlaydate(proposal: ChatMessage) {
    if (!proposal.playdate) return;
    const { date, time, place } = proposal.playdate;
    const when = time ? `${date} at ${time}` : date;
    await handleSend(`✅ Playdate confirmed: ${when} — ${place}`, {
      type: 'playdate_confirmed',
      playdate: proposal.playdate,
    });
  }

  function openFoundingMemberLink() {
    if (!user) return;
    const link = getFoundingMemberLink(user.uid);
    if (!link) return;
    trackEvent('founding_member_cta_click', { match_id: resolvedMatchId ?? '' });
    Linking.openURL(link).catch((error) => {
      console.warn('Failed to open Founding Member link', error);
      Alert.alert('Could not open link', 'Please try again in a moment.');
    });
  }

  async function openWebUnlockLink() {
    if (!resolvedMatchId || unlockLoading) return;
    const webBase =
      process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') || 'https://godoggydate.com';
    const path = `/app/messages/${resolvedMatchId}`;

    setUnlockLoading(true);
    // The system browser has no access to the app's local auth session, so
    // a plain link dumps the user on a cold sign-in screen. Mint a custom
    // token from the app's own ID token and hand off an already-signed-in
    // session — this is what makes "opens automatically after payment"
    // actually true instead of stalling on a sign-in wall.
    try {
      const currentUser = getFirebase().auth.currentUser;
      if (!currentUser) throw new Error('Not signed in');
      const idToken = await currentUser.getIdToken();
      const res = await fetch(`${webBase}/api/auth/handoff-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as { customToken?: string };
      if (!res.ok || !data.customToken) throw new Error('Handoff token request failed');
      await Linking.openURL(`${webBase}${path}?handoff=${encodeURIComponent(data.customToken)}`);
    } catch (error) {
      console.warn('Handoff sign-in unavailable, opening plain link', error);
      // Still get them to the right page — they'll just need to sign in there.
      try {
        await Linking.openURL(`${webBase}${path}`);
      } catch (linkError) {
        console.warn('Failed to open web unlock link', linkError);
        Alert.alert('Could not open link', 'Please try again in a moment.');
      }
    } finally {
      setUnlockLoading(false);
    }
  }

  async function handleUnlock() {
    if (!user || !resolvedMatchId) return;
    if (isSeedUserId(match?.dog.id)) {
      setUnlockError('This demo profile is not available for chat unlocks.');
      return;
    }

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
    } catch (err: unknown) {
      setAwaitingVerification(false);
      const message = err instanceof Error ? err.message : 'Failed to complete payment';
      setUnlockError(message);
      console.warn('unlock error', err);
    } finally {
      if (!paymentSubmitted) {
        setUnlockLoading(false);
      }
    }
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === user?.uid || item.senderId === 'me';

    if (item.type === 'playdate_proposal' && item.playdate) {
      const confirmed = confirmedPlaydateKeys.has(playdateKey(item.playdate));
      return (
        <View style={[styles.playdateCard, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
          <Text style={styles.playdateLabel}>📅 Playdate {confirmed ? '· Confirmed' : 'proposal'}</Text>
          <Text style={styles.playdateWhen}>
            {item.playdate.date}{item.playdate.time ? ` at ${item.playdate.time}` : ''}
          </Text>
          <Text style={styles.playdateWhere}>{item.playdate.place}</Text>
          {!isMe && !confirmed && (
            <Pressable
              style={styles.playdateAcceptBtn}
              onPress={() => acceptPlaydate(item)}
              disabled={sending}
            >
              <Text style={styles.playdateAcceptText}>Accept playdate</Text>
            </Pressable>
          )}
        </View>
      );
    }

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
      <PlaydateRatingModal
        visible={showRatingModal}
        dogName={resolvedName || match?.dog.name || 'your match'}
        onSubmit={handleSubmitRating}
        onDismiss={() => setShowRatingModal(false)}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>{resolvedName || match?.dog.name || 'Chat'}</Text>
          <Text style={styles.headerSub}>GoDoggyDate match</Text>
        </View>
        <Pressable style={styles.moreBtn} onPress={openSafetyMenu}>
          <Text style={styles.moreBtnText}>•••</Text>
        </Pressable>
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
      ) : match && isSeedUserId(match.dog.id) ? (
        <View style={styles.emptyChat}>
          <Text style={styles.emptyChatEmoji}>🐾</Text>
          <Text style={styles.emptyChatText}>
            This demo profile is no longer available for chats or unlocks.
          </Text>
        </View>
      ) : !canChat ? (
        <View style={styles.paywallSendWrap}>
          <Text style={styles.paywallTitle}>Unlock Chat</Text>
          {Platform.OS === 'ios' ? (
            // Apple Guideline 3.1.1: digital-content purchases inside the app
            // must use IAP. An in-app card sheet (Stripe PaymentSheet) is a
            // rejection; an external purchase LINK is permitted on the US
            // storefront (post-2025 Epic ruling). So on iOS we link out to
            // the web checkout — the realtime match listener flips the
            // unlock automatically once the webhook lands, no refresh needed.
            <>
              <Text style={styles.paywallBody}>
                {getChatUnlockPitch()} Pay on godoggydate.com — this chat opens here automatically after payment.
              </Text>
              <Text style={styles.paywallSupport}>{SAFETY_TIP}</Text>
              <Pressable
                style={[styles.unlockBtn, unlockLoading && styles.sendBtnDisabled]}
                onPress={openWebUnlockLink}
                disabled={unlockLoading}
              >
                {unlockLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.unlockBtnText}>Unlock on godoggydate.com — {formatPrice(CHAT_UNLOCK_PRICE_CENTS)}</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.paywallBody}>
                {paymentConfigured
                  ? getChatUnlockPitch()
                  : paymentConfigurationError ?? 'Payments are not configured for this build yet, so locked chats cannot be unlocked on this device.'}
              </Text>
              <Text style={styles.paywallSupport}>
                {SAFETY_TIP}
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
                    {paymentConfigured ? `Unlock chat for ${formatPrice(CHAT_UNLOCK_PRICE_CENTS)}` : 'Payment Not Configured'}
                  </Text>
                )}
              </Pressable>
            </>
          )}
          {getFoundingMemberLink(user.uid) && (
            <Pressable style={styles.foundingMemberLink} onPress={openFoundingMemberLink}>
              <Text style={styles.foundingMemberLinkText}>
                🐾 Or go Founding Member — $39 once. Every chat, forever. Badge included.
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.safetyBanner}>
            <Text style={styles.safetyBannerText}>{SAFETY_TIP}</Text>
          </View>
          {hasConfirmedPlaydate && !alreadyRated && (
            <Pressable style={styles.ratingBanner} onPress={() => setShowRatingModal(true)}>
              <Text style={styles.ratingBannerText}>
                🎾 How did the playdate with {resolvedName || match?.dog.name || 'your match'} go?
              </Text>
              <Text style={styles.ratingBannerCta}>Rate it →</Text>
            </Pressable>
          )}
          {memoryCardStars !== null && (
            <View style={styles.memoryCardWrap}>
              <PlaydateMemoryCard
                ref={memoryCardRef}
                dogName={resolvedName || match?.dog.name || 'your match'}
                dogBreed={match?.dog.breed}
                photo={match?.dog.photos?.[0]}
                stars={memoryCardStars}
              />
              <View style={styles.memoryCardActions}>
                <Pressable
                  style={[styles.unlockBtn, sharingMemoryCard && styles.sendBtnDisabled]}
                  onPress={handleShareMemoryCard}
                  disabled={sharingMemoryCard}
                >
                  {sharingMemoryCard ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.unlockBtnText}>📤 Share this memory</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setMemoryCardStars(null)} style={{ paddingVertical: 10 }}>
                  <Text style={styles.dismissMemoryText}>Dismiss</Text>
                </Pressable>
              </View>
            </View>
          )}
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
                  Someone has to text first — and dogs can't type. Say hi to {resolvedName || match?.dog.name || 'your match'}!
                </Text>
              </View>
            }
          />

          {showPlaydateForm && (
            <View style={styles.playdateForm}>
              <Text style={styles.playdateFormLabel}>📅 Propose a playdate</Text>
              <TextInput
                style={styles.playdateFormInput}
                value={playdateDraft.date}
                onChangeText={(v) => setPlaydateDraft((d) => ({ ...d, date: v }))}
                placeholder="Date (e.g. Sat, July 12)"
                placeholderTextColor={colors.brownLight}
              />
              <TextInput
                style={styles.playdateFormInput}
                value={playdateDraft.time}
                onChangeText={(v) => setPlaydateDraft((d) => ({ ...d, time: v }))}
                placeholder="Time (e.g. 10:00 AM)"
                placeholderTextColor={colors.brownLight}
              />
              <TextInput
                style={styles.playdateFormInput}
                value={playdateDraft.place}
                onChangeText={(v) => setPlaydateDraft((d) => ({ ...d, place: v }))}
                placeholder="Where? (e.g. Maple Dog Park)"
                placeholderTextColor={colors.brownLight}
              />
              <View style={styles.playdateFormActions}>
                <Pressable
                  style={[styles.playdateSendBtn, (!playdateDraft.date.trim() || !playdateDraft.place.trim() || sending) && styles.sendBtnDisabled]}
                  onPress={proposePlaydate}
                  disabled={!playdateDraft.date.trim() || !playdateDraft.place.trim() || sending}
                >
                  <Text style={styles.playdateSendBtnText}>Send proposal</Text>
                </Pressable>
                <Pressable style={styles.playdateCancelBtn} onPress={() => setShowPlaydateForm(false)}>
                  <Text style={styles.playdateCancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.inputRow}>
            <Pressable
              style={styles.playdateToggleBtn}
              onPress={() => setShowPlaydateForm((v) => !v)}
              disabled={sending}
            >
              <Text style={styles.playdateToggleBtnText}>📅</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={`Message ${resolvedName || match?.dog.name || 'your match'}…`}
              placeholderTextColor={colors.brownLight}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
            />
            <Pressable
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
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
  moreBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtnText: {
    fontSize: 16,
    color: colors.brownLight,
    fontFamily: fonts.bold,
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
  safetyBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 2,
    borderRadius: radius.md,
    backgroundColor: 'rgba(232,99,58,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ratingBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245,183,49,0.4)',
    backgroundColor: 'rgba(245,183,49,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingBannerText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.brown,
  },
  ratingBannerCta: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
  },
  memoryCardWrap: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  memoryCardActions: {
    alignItems: 'center',
    gap: 4,
  },
  dismissMemoryText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brownLight,
  },
  safetyBannerText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.brownMid,
    textAlign: 'center',
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
    marginBottom: 12,
    lineHeight: 22,
  },
  paywallSupport: {
    fontFamily: fonts.body,
    color: colors.brownMid,
    fontSize: 13,
    lineHeight: 19,
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
  foundingMemberLink: {
    marginTop: 14,
    paddingVertical: 6,
  },
  foundingMemberLinkText: {
    color: colors.primary,
    fontFamily: fonts.semibold,
    fontSize: 13,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  playdateCard: {
    maxWidth: '85%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  playdateLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  playdateWhen: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.brown,
    marginTop: 4,
  },
  playdateWhere: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
  },
  playdateAcceptBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  playdateAcceptText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  playdateToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(212,163,53,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playdateToggleBtnText: { fontSize: 18 },
  playdateForm: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  playdateFormLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: 8,
  },
  playdateFormInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brown,
    backgroundColor: colors.cream,
    marginBottom: 8,
  },
  playdateFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  playdateSendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  playdateSendBtnText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  playdateCancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  playdateCancelBtnText: {
    color: colors.brownLight,
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
});
