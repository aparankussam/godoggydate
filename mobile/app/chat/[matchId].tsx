import { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useStripe } from '@stripe/stripe-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fonts, radius } from '../../constants/theme';
import { getFirebase } from '../../lib/firebase';
import {
  fetchMatch,
  getOtherUserId,
  isPlaydateMessage,
  markMatchRead,
  sendMessage,
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type MatchItem,
  type PlaydateDetails,
} from '../../lib/matches';
import {
  formatClock,
  formatDay,
  formatMessageTime,
  formatPlaydateWhen,
  parseIsoDate,
  parseIsoTime,
  playdatePhase,
  playdateStartMs,
  toIsoDate,
  toIsoTime,
} from '../../lib/playdates';
import {
  createChatUnlockIntent,
  getPaymentConfigurationError,
  isPaymentConfigured,
} from '../../lib/stripe';
import { useSession } from '../../lib/session';
import { isUserChatUnlocked } from '../../../shared/matchAccess';
import { checkContent, CONTENT_FILTER_MESSAGE } from '../../../shared/contentFilter';
import type { SavedDogProfile } from '../../../shared/profile';
import { openReportSheet } from '../../lib/reports';
import { onEntitlements, getFoundingMemberLink } from '../../lib/entitlements';
import { useFoundingState } from '../../lib/founding';
import { canOfferInAppPurchase } from '../../lib/pro';
import { trackEvent } from '../../lib/analytics';
import { CHAT_UNLOCK_PRICE_CENTS, formatPrice, getChatUnlockPitch } from '../../../shared/utils/stripe';
import { hasRatedPlaydate, submitPlaydateRating } from '../../lib/ratings';
import PlaydateRatingModal from '../../components/PlaydateRatingModal';
import PlaydateMemoryCard from '../../components/PlaydateMemoryCard';
import PlaydateHeadsUpCard from '../../components/PlaydateHeadsUpCard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { setBestFriend, clearBestFriend } from '../../lib/bestFriend';

const SAFETY_TIP =
  'Safety tip: For a first playdate, meet in a public dog park or other busy public place. Keep dogs leashed at first and take it slow.';

/** How many of the newest messages to load, and how many more each "Load earlier" adds. */
const MESSAGE_PAGE_SIZE = 50;

function isSeedUserId(id?: string | null): boolean {
  return Boolean(id?.startsWith('user_seed_'));
}

function playdateKey(p?: PlaydateDetails): string {
  return p ? `${p.date}|${p.time}|${p.place}` : '';
}

function toChatMessage(messageDoc: QueryDocumentSnapshot): ChatMessage {
  // 'estimate' gives a just-sent (pending) message its local time instead of
  // null, so it sorts and stamps correctly before the server acknowledges it.
  const data = messageDoc.data({ serverTimestamps: 'estimate' }) as {
    text?: string;
    fromUserId?: string;
    senderId?: string;
    createdAt?: { toMillis?: () => number } | null;
    type?: ChatMessage['type'];
    playdate?: PlaydateDetails;
    moderated?: boolean;
  };
  const moderated = data.moderated === true;
  return {
    id: messageDoc.id,
    text: typeof data.text === 'string' ? data.text : '',
    senderId: data.fromUserId ?? data.senderId ?? 'other',
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    // The server deletes these on moderation; never trust them if it didn't.
    type: moderated ? undefined : data.type,
    playdate: moderated ? undefined : data.playdate,
    moderated,
  };
}

/** Template conversation starters, mirroring web's buildSmartPromptsFromProfile. Not AI. */
function buildStarterPrompts(profile: SavedDogProfile | null | undefined, name: string): string[] {
  const loc = (profile?.location ?? profile?.city ?? '').trim();
  const city = loc.includes(',') ? loc.split(',')[0].trim() : loc;
  const playStyles = Array.isArray(profile?.playStyles) ? (profile?.playStyles ?? []) : [];
  const has = (needle: string) => playStyles.some((s) => typeof s === 'string' && s.toLowerCase().includes(needle));

  const prompts: string[] = [];
  if (city) prompts.push(`Any good dog parks in ${city}? 🌳`);

  if (has('fetch')) {
    prompts.push(`Does ${name} love to fetch? 🎾`);
  } else if (has('runner') || has('high-energy')) {
    prompts.push(`Up for a morning run with ${name}? ⚡`);
  } else if (has('gentle') || has('calm')) {
    prompts.push(`Calm walk with ${name} this weekend? 🐾`);
  } else {
    prompts.push(`Morning walk with ${name}? 🐾`);
  }

  prompts.push('Our dogs would cause problems together 🐶');
  prompts.push('Coffee + dogs? ☕🐕');
  return prompts.slice(0, 4);
}

function defaultPlaydateDraft(): PlaydateDetails {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { date: toIsoDate(tomorrow), time: '10:00', place: '' };
}

/** The draft's date and time as one local Date, for the pickers. */
function draftToDate(draft: PlaydateDetails): Date {
  const day = parseIsoDate(draft.date) ?? new Date();
  const minutes = parseIsoTime(draft.time) ?? 10 * 60;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
}

export default function ChatScreen() {
  const { matchId, name } = useLocalSearchParams<{ matchId?: string | string[]; name?: string | string[] }>();
  const { user } = useSession();
  const resolvedMatchId = Array.isArray(matchId) ? matchId[0] : matchId;
  const resolvedName = Array.isArray(name) ? name[0] : name;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [confirmedMessages, setConfirmedMessages] = useState<ChatMessage[]>([]);
  const [messageWindow, setMessageWindow] = useState(MESSAGE_PAGE_SIZE);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [match, setMatch] = useState<MatchItem | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [matchMissing, setMatchMissing] = useState(false);
  // False until the match doc's listener first answers, so a chat that is
  // open doesn't flash the locked screen while access is still unknown.
  const [matchStateKnown, setMatchStateKnown] = useState(false);
  const [myProfile, setMyProfile] = useState<SavedDogProfile | null>(null);
  const [chatUnlocked, setChatUnlocked] = useState(false);
  const [hasLifetime, setHasLifetime] = useState(false);
  // The $39 offer only exists while paid founding spots #51–150 are open.
  const founding = useFoundingState();
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [showPlaydateForm, setShowPlaydateForm] = useState(false);
  const [playdateDraft, setPlaydateDraft] = useState<PlaydateDetails>(defaultPlaydateDraft);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(true);
  const [memoryCardStars, setMemoryCardStars] = useState<number | null>(null);
  const [sharingMemoryCard, setSharingMemoryCard] = useState(false);
  const [myBestFriendMatchId, setMyBestFriendMatchId] = useState<string | null>(null);
  const [togglingBestFriend, setTogglingBestFriend] = useState(false);
  const [matchLoadError, setMatchLoadError] = useState(false);
  const [matchLoadRetryToken, setMatchLoadRetryToken] = useState(0);
  // Ticks once a minute so a playdate moves from "upcoming" (Heads-Up card)
  // to "happened" (rating prompt) while the chat is open.
  const [now, setNow] = useState(() => Date.now());
  const memoryCardRef = useRef<View>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const nearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const messagesLoadedRef = useRef(false);
  const paymentConfigured = isPaymentConfigured();
  const paymentConfigurationError = getPaymentConfigurationError();

  // Effective chat access: per-match unlock OR Founding Member entitlement.
  const canChat = chatUnlocked || hasLifetime;
  const dogName = resolvedName || match?.dog.name || 'your match';
  const otherProfile = match?.dog.profile ?? null;
  // The photo the dog leads with (cover pick, else AI hero, else first real
  // photo) — the same one the match list shows.
  const otherPhoto = match?.dog.heroPhoto ?? null;
  const otherBreed = otherProfile?.breed?.trim() || null;
  // Who to report or rate. The match doc's listener usually answers first;
  // fetchMatch's dog id is the same person and covers older match docs.
  const otherPartyId = otherUserId ?? match?.dog.id ?? null;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!resolvedMatchId || loading) return;
    trackEvent(canChat ? 'chat_view' : 'chat_unlock_prompt_view', { match_id: resolvedMatchId });
  }, [canChat, loading, resolvedMatchId]);

  useEffect(() => {
    if (!user) return;
    return onEntitlements(user.uid, (e) => setHasLifetime(e.lifetimeChatUnlocks));
  }, [user]);

  // My own dog doc, live: the Best Friend star (so it updates if toggled
  // from another device) and the whole profile, which the Heads-Up card needs
  // to work out where the two dogs cross and to mirror back what the other
  // owner can see. One listener, no extra read.
  useEffect(() => {
    if (!user) return;
    const db = getFirebase().db;
    return onSnapshot(doc(db, 'dogs', user.uid), (snap) => {
      const data = snap.data() as (SavedDogProfile & { bestFriendMatchId?: string }) | undefined;
      setMyBestFriendMatchId(data?.bestFriendMatchId ?? null);
      setMyProfile(data ?? null);
    });
  }, [user]);

  async function handleToggleBestFriend() {
    if (!user || !resolvedMatchId || togglingBestFriend) return;
    setTogglingBestFriend(true);
    try {
      if (myBestFriendMatchId === resolvedMatchId) {
        await clearBestFriend(user.uid);
      } else {
        await setBestFriend(user.uid, resolvedMatchId);
      }
    } catch {
      // Non-critical — the star just doesn't update, user can retry.
    } finally {
      setTogglingBestFriend(false);
    }
  }

  function openSafetyMenu() {
    if (!user || !resolvedMatchId || !otherPartyId) return;
    openReportSheet(
      { reporterId: user.uid, targetUserId: otherPartyId, source: 'chat', matchId: resolvedMatchId },
      { name: dogName, onBlocked: () => router.replace('/(tabs)/matches') },
    );
  }

  // The NEWEST messages. This used to be orderBy('createdAt','asc') +
  // limit(200), i.e. the OLDEST 200, so once a thread passed 200 messages
  // nothing new ever appeared on iPhone. Read newest-first, show oldest-first.
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

    // Spin until the first batch arrives, instead of flashing the empty
    // "say hi" state. Loading earlier messages keeps the list on screen.
    if (!messagesLoadedRef.current) setLoading(true);

    const db = getFirebase().db;
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'matches', resolvedMatchId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(messageWindow),
      ),
      async (snapshot) => {
        messagesLoadedRef.current = true;
        setMessages(snapshot.docs.map(toChatMessage).reverse());
        // A cache-only answer can be short just because the cache is; only
        // trust "no more" from the server.
        if (!snapshot.metadata.fromCache || snapshot.docs.length >= messageWindow) {
          setHasOlder(snapshot.docs.length >= messageWindow);
          setLoadingOlder(false);
        }
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
        setLoadingOlder(false);
      },
    );

    return unsubscribe;
  }, [canChat, resolvedMatchId, user, messageWindow]);

  // Every confirmed playdate in the thread, however old. The message window
  // above can't see one confirmed 300 messages ago, and the rating prompt,
  // the Heads-Up card and each proposal's "Confirmed" label all depend on it.
  useEffect(() => {
    if (!resolvedMatchId || !user || !canChat) {
      setConfirmedMessages([]);
      return undefined;
    }
    const db = getFirebase().db;
    return onSnapshot(
      query(
        collection(db, 'matches', resolvedMatchId, 'messages'),
        where('type', '==', 'playdate_confirmed'),
      ),
      (snapshot) => setConfirmedMessages(snapshot.docs.map(toChatMessage)),
      (error) => console.warn('Failed to subscribe to confirmed playdates:', error),
    );
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
        setMatchLoadError(false); // a successful delivery means we're not actually stuck
        setMatchStateKnown(true);

        if (!matchDoc.exists()) {
          setChatUnlocked(false);
          setMatchMissing(true);
          return;
        }
        setMatchMissing(false);

        const data = matchDoc.data() as {
          chatUnlocked?: boolean;
          dog1ChatUnlocked?: boolean | null;
          dog2ChatUnlocked?: boolean | null;
          dog1UserId?: string;
          dog2UserId?: string;
          userAId?: string;
          userBId?: string;
        };
        if (user) setOtherUserId(getOtherUserId(data, user.uid));
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
        // This used to only log — chatUnlocked stayed at its initial `false`,
        // which combined with hasLifetime=false fell straight into the
        // !canChat paywall branch below and presented a real payment button
        // for what was actually a dropped connection, not an unpaid chat.
        console.warn('Failed to subscribe to match state:', error);
        setMatchLoadError(true);
      },
    );

    return unsubscribe;
  }, [resolvedMatchId, user, hasLifetime, matchLoadRetryToken]);

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

  // Follow the conversation when a NEW message lands at the bottom. Keyed on
  // the newest message, not the count, so loading earlier messages (which
  // grows the count from the top) doesn't yank the reader back down. Someone
  // else's message only scrolls if you were already at the bottom; your own
  // always does.
  const newestMessage = messages[messages.length - 1];
  const newestId = newestMessage?.id;
  const newestIsMine = newestMessage ? newestMessage.senderId === user?.uid : false;
  useEffect(() => {
    if (!newestId) return undefined;
    const first = !initialScrollDoneRef.current;
    if (!first && !newestIsMine && !nearBottomRef.current) return undefined;
    const timeoutId = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: !first });
      initialScrollDoneRef.current = true;
    }, 80);
    return () => clearTimeout(timeoutId);
  }, [newestId, newestIsMine]);

  function handleListScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
  }

  function loadOlderMessages() {
    if (loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    setMessageWindow((w) => w + MESSAGE_PAGE_SIZE);
  }

  // iOS never shows a price, a purchase button or a link to pay (Guideline
  // 3.1.1), so its "check again" copy can't mention payment either.
  async function handleRefreshUnlockStatus() {
    if (!resolvedMatchId) return;
    const neutral = !canOfferInAppPurchase();

    try {
      const refreshedMatch = await fetchMatch(resolvedMatchId, user?.uid ?? '');
      setMatch(refreshedMatch);
      setChatUnlocked(refreshedMatch?.chatUnlocked ?? false);

      if (refreshedMatch?.chatUnlocked) {
        setUnlockError(null);
      } else {
        setUnlockError(neutral
          ? 'This chat isn’t open yet. It will open here on its own as soon as it is.'
          : 'We’re still confirming your payment. Please check again in a moment.');
      }
    } catch (error) {
      console.warn('Failed to refresh unlock status:', error);
      setUnlockError(neutral
        ? 'We couldn’t check right now. Please try again in a moment.'
        : 'We could not refresh chat status right now. Please try again in a moment.');
    }
  }

  async function handleSend(
    overrideText?: string,
    extra?: { type: ChatMessage['type']; playdate: PlaydateDetails },
  ): Promise<boolean> {
    const trimmed = (overrideText ?? text).trim();
    if (!trimmed || sending || !user || !canChat || !resolvedMatchId) return false;

    // Apple 1.2: filter objectionable text before it's posted. The draft
    // stays in the input so it can be reworded. The server checks again,
    // because a modified client could skip this.
    const filtered = checkContent(trimmed);
    if (!filtered.ok) {
      trackEvent('content_filter_blocked', { surface: 'chat', reason: filtered.reason });
      Alert.alert('Message not sent', CONTENT_FILTER_MESSAGE);
      return false;
    }

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

  // ── Playdates ───────────────────────────────────────────────────────────────
  // Confirmations from both sources (the whole-thread listener and the
  // visible window), never moderated ones: the server strips a caught
  // message's playdate, and it must not count as a meetup either way.
  const confirmedById = new Map<string, ChatMessage & { playdate: PlaydateDetails }>();
  for (const m of [...confirmedMessages, ...messages]) {
    if (isPlaydateMessage(m, 'playdate_confirmed')) confirmedById.set(m.id, m);
  }
  const confirmedPlaydates = [...confirmedById.values()];
  const confirmedPlaydateKeys = new Set(confirmedPlaydates.map((m) => playdateKey(m.playdate)));

  // The soonest confirmed playdate that hasn't happened yet — what the
  // Heads-Up card briefs for. An old free-text date that can't be read is
  // neither upcoming nor past.
  const upcomingPlaydate =
    confirmedPlaydates
      .filter((m) => playdatePhase(m.playdate, now, m.createdAt) === 'upcoming')
      .sort((a, b) =>
        (playdateStartMs(a.playdate, a.createdAt) ?? 0) - (playdateStartMs(b.playdate, b.createdAt) ?? 0))[0]
      ?.playdate ?? null;
  // A rating is only honest once the meetup has actually happened. This used
  // to fire the moment a playdate was CONFIRMED, so a date a week out asked
  // "How did it go?" — and the rating feeds the other dog's trust score.
  const hasPastPlaydate = confirmedPlaydates.some(
    (m) => playdatePhase(m.playdate, now, m.createdAt) === 'happened',
  );

  useEffect(() => {
    if (!user || !resolvedMatchId || !hasPastPlaydate) return;
    let cancelled = false;
    hasRatedPlaydate(user.uid, resolvedMatchId).then((rated) => {
      if (!cancelled) setAlreadyRated(rated);
    });
    return () => { cancelled = true; };
  }, [user, resolvedMatchId, hasPastPlaydate]);

  async function handleSubmitRating(stars: number, wouldMeetAgain: boolean) {
    if (!user || !otherPartyId || !resolvedMatchId) return;
    try {
      await submitPlaydateRating({
        matchId: resolvedMatchId,
        raterId: user.uid,
        dogId: otherPartyId,
        stars,
        wouldMeetAgain,
      });
    } catch (error) {
      console.warn('Failed to save playdate rating', error);
      Alert.alert('Couldn’t save your rating', 'Please check your connection and try again.');
      return;
    }
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

  function togglePlaydateForm() {
    if (!showPlaydateForm) {
      // Re-arm a stale draft, e.g. a date that has passed since it was picked.
      setPlaydateDraft((d) => {
        const day = parseIsoDate(d.date);
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return day && day >= startOfToday ? d : { ...defaultPlaydateDraft(), place: d.place };
      });
    }
    setShowPlaydateForm(!showPlaydateForm);
  }

  function setDraftDate(picked: Date) {
    setPlaydateDraft((d) => ({ ...d, date: toIsoDate(picked) }));
  }

  function setDraftTime(picked: Date) {
    setPlaydateDraft((d) => ({ ...d, time: toIsoTime(picked) }));
  }

  function openAndroidPicker(mode: 'date' | 'time') {
    const today = new Date();
    DateTimePickerAndroid.open({
      value: draftToDate(playdateDraft),
      mode,
      minimumDate: mode === 'date' ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : undefined,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== 'set' || !picked) return;
        if (mode === 'date') setDraftDate(picked);
        else setDraftTime(picked);
      },
    });
  }

  // Same strings as web (page.tsx proposePlaydate): ISO 'YYYY-MM-DD' and
  // 'HH:MM', so either app can tell whether the playdate is still ahead.
  async function proposePlaydate() {
    const { date, time, place } = playdateDraft;
    if (!parseIsoDate(date) || !place.trim()) return;
    const when = time ? `${date} at ${time}` : date;
    const delivered = await handleSend(`📅 Playdate proposal: ${when} — ${place.trim()}`, {
      type: 'playdate_proposal',
      playdate: { date, time, place: place.trim() },
    });
    if (!delivered) return; // keep the form + draft so the user can retry
    setShowPlaydateForm(false);
    setPlaydateDraft(defaultPlaydateDraft());
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

  // Fills the input rather than sending straight away (web sends on tap), so
  // a stray tap while scrolling the chips never posts a message.
  function applyStarterPrompt(prompt: string) {
    setText(prompt);
    inputRef.current?.focus();
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
    const time = formatMessageTime(item.createdAt, now);

    // Caught by the server's content filter: muted, never a playdate card.
    if (item.moderated) {
      return (
        <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
          <View style={[styles.bubble, styles.bubbleModerated]}>
            <Text style={styles.bubbleTextModerated}>{item.text || 'This message was removed.'}</Text>
          </View>
          <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>{time}</Text>
        </View>
      );
    }

    if (isPlaydateMessage(item, 'playdate_proposal')) {
      const confirmed = confirmedPlaydateKeys.has(playdateKey(item.playdate));
      return (
        <View style={[styles.playdateCard, isMe ? styles.playdateCardMe : styles.playdateCardThem]}>
          <Text style={styles.playdateLabel}>📅 Playdate {confirmed ? '· Confirmed' : 'proposal'}</Text>
          <Text style={styles.playdateWhen}>{formatPlaydateWhen(item.playdate, now)}</Text>
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
          <Text style={styles.playdateTime}>{time}</Text>
        </View>
      );
    }

    // A confirmation's stored text carries web's ISO strings
    // ("2026-11-22 at 15:00"); show the date the way the proposal card does.
    const bubbleText = isPlaydateMessage(item, 'playdate_confirmed')
      ? `✅ Playdate confirmed: ${formatPlaydateWhen(item.playdate, now)} — ${item.playdate.place}`
      : item.text;

    return (
      <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {bubbleText}
          </Text>
        </View>
        <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>{time}</Text>
      </View>
    );
  };

  // Starters only until you've written something yourself.
  const showStarterPrompts =
    canChat && !showPlaydateForm && !messages.some((m) => m.senderId === user?.uid);
  const starterPrompts = showStarterPrompts ? buildStarterPrompts(otherProfile, dogName) : [];

  const draftDate = draftToDate(playdateDraft);
  const draftStartsInPast = draftDate.getTime() < now;
  const todayStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate());
  const canSendProposal =
    Boolean(parseIsoDate(playdateDraft.date)) && Boolean(playdateDraft.place.trim()) && !draftStartsInPast && !sending;

  // The report button needs to know who it's reporting. Spin until then,
  // rather than silently doing nothing as it used to.
  const reportReady = Boolean(user && resolvedMatchId && otherPartyId);
  const reportPending = Boolean(user && resolvedMatchId) && !reportReady && !matchMissing && !matchLoadError;

  return (
    <SafeAreaView style={styles.container}>
      <PlaydateRatingModal
        visible={showRatingModal}
        dogName={dogName}
        onSubmit={handleSubmitRating}
        onDismiss={() => setShowRatingModal(false)}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Pressable
          style={styles.headerCenter}
          onPress={() => resolvedMatchId && router.push({ pathname: '/dog/[matchId]', params: { matchId: resolvedMatchId } })}
          accessibilityLabel={`View ${dogName}'s profile`}
        >
          {otherPhoto ? (
            <Image source={{ uri: otherPhoto }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
              <Text style={styles.headerAvatarEmoji}>🐕</Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>{resolvedName || match?.dog.name || 'Chat'}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{otherBreed ?? 'Tap to view profile'}</Text>
          </View>
        </Pressable>
        {resolvedMatchId && (
          <Pressable
            style={styles.bestFriendBtn}
            onPress={handleToggleBestFriend}
            disabled={togglingBestFriend}
            hitSlop={8}
          >
            <Text style={styles.bestFriendBtnText}>
              {myBestFriendMatchId === resolvedMatchId ? '⭐' : '☆'}
            </Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.moreBtn, !reportReady && !reportPending && styles.moreBtnDisabled]}
          onPress={openSafetyMenu}
          disabled={!reportReady}
          accessibilityLabel="Report or block"
        >
          {reportPending ? (
            <ActivityIndicator size="small" color={colors.brownLight} />
          ) : (
            <Text style={styles.moreBtnText}>•••</Text>
          )}
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
      ) : loading || (!matchStateKnown && !matchLoadError) ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : matchLoadError ? (
        <View style={styles.emptyChat}>
          <Text style={styles.emptyChatEmoji}>😕</Text>
          <Text style={styles.emptyChatText}>Couldn’t load this chat. Check your connection and try again.</Text>
          <Pressable
            style={styles.statusButton}
            onPress={() => setMatchLoadRetryToken((t) => t + 1)}
          >
            <Text style={styles.statusButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : matchMissing ? (
        <View style={styles.emptyChat}>
          <Text style={styles.emptyChatEmoji}>🐾</Text>
          <Text style={styles.emptyChatText}>This match isn’t available any more.</Text>
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
          {!canOfferInAppPurchase() ? (
            // Apple Guideline 3.1.1: no in-app sale of digital content
            // without IAP, and no price, purchase button or link that steers
            // to one. This used to show "Unlock on godoggydate.com — $X",
            // which the purchase rule didn't hide. Neutral copy only; the
            // realtime match listener opens the chat on its own once it's
            // unlocked.
            <>
              <Text style={styles.paywallTitle}>Chat isn’t open yet</Text>
              <Text style={styles.paywallBody}>
                Your chat with {dogName} will open right here as soon as it’s available.
              </Text>
              <Text style={styles.paywallSupport}>{SAFETY_TIP}</Text>
              {unlockError ? <Text style={styles.paywallNotice}>{unlockError}</Text> : null}
              <Pressable style={styles.statusButton} onPress={handleRefreshUnlockStatus}>
                <Text style={styles.statusButtonText}>Check again</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.paywallTitle}>Unlock Chat</Text>
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
              {founding.phase === 'paid' && getFoundingMemberLink(user.uid) && (
                <Pressable style={styles.foundingMemberLink} onPress={openFoundingMemberLink}>
                  <Text style={styles.foundingMemberLinkText}>
                    ⭐ Or become a Founding Member — $39 once. Pro for life, first access to every Pro feature as it ships, and a numbered Founding Member badge.
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* Generic advice yields to the specific briefing once a playdate
              is on the calendar, as on web. */}
          {!upcomingPlaydate && (
            <View style={styles.safetyBanner}>
              <Text style={styles.safetyBannerText}>{SAFETY_TIP}</Text>
            </View>
          )}
          {hasPastPlaydate && !alreadyRated && (
            <Pressable style={styles.ratingBanner} onPress={() => setShowRatingModal(true)}>
              <Text style={styles.ratingBannerText}>
                🎾 How did the playdate with {dogName} go?
              </Text>
              <Text style={styles.ratingBannerCta}>Rate it →</Text>
            </Pressable>
          )}
          {memoryCardStars !== null && (
            <View style={styles.memoryCardWrap}>
              <PlaydateMemoryCard
                ref={memoryCardRef}
                dogName={dogName}
                dogBreed={otherBreed ?? undefined}
                photo={otherPhoto}
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
            extraData={now}
            onScroll={handleListScroll}
            scrollEventThrottle={100}
            // Loading earlier messages adds rows ABOVE what's on screen; this
            // keeps the message you were reading where it was. Index 1 skips
            // the "Load earlier" header.
            maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
            ListHeaderComponent={
              hasOlder ? (
                <Pressable
                  style={styles.loadOlderBtn}
                  onPress={loadOlderMessages}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.loadOlderText}>Load earlier messages</Text>
                  )}
                </Pressable>
              ) : null
            }
            // flexGrow:1 alone stretched the container to the full viewport
            // and left the messages pinned to the TOP, so a short thread had
            // a large dead gap above the input. Anchoring to the end is the
            // normal chat behaviour; only applied when messages exist so the
            // empty-state component can still center itself.
            contentContainerStyle={[
              styles.messageList,
              messages.length > 0 && styles.messageListAnchored,
            ]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatEmoji}>🐾</Text>
                <Text style={styles.emptyChatText}>
                  Someone has to text first — and dogs can't type. Say hi to {dogName}!
                </Text>
              </View>
            }
          />

          {/* Pinned so it can't scroll away — the one thing in the thread
              you want to re-read on the way to the park. */}
          {upcomingPlaydate && otherProfile && (
            <PlaydateHeadsUpCard
              dogName={dogName}
              otherProfile={otherProfile}
              myProfile={myProfile}
              playdate={upcomingPlaydate}
            />
          )}

          {showPlaydateForm && (
            <View style={styles.playdateForm}>
              <Text style={styles.playdateFormLabel}>📅 Propose a playdate</Text>
              {Platform.OS === 'ios' ? (
                <View style={styles.playdatePickerRow}>
                  <DateTimePicker
                    value={draftDate}
                    mode="date"
                    display="compact"
                    minimumDate={todayStart}
                    accentColor={colors.primary}
                    themeVariant="light"
                    onChange={(_event: DateTimePickerEvent, picked?: Date) => picked && setDraftDate(picked)}
                  />
                  <DateTimePicker
                    value={draftDate}
                    mode="time"
                    display="compact"
                    minuteInterval={5}
                    accentColor={colors.primary}
                    themeVariant="light"
                    onChange={(_event: DateTimePickerEvent, picked?: Date) => picked && setDraftTime(picked)}
                  />
                </View>
              ) : (
                <View style={styles.playdatePickerRow}>
                  <Pressable style={styles.playdatePickerBtn} onPress={() => openAndroidPicker('date')}>
                    <Text style={styles.playdatePickerBtnText}>{formatDay(draftDate, now)}</Text>
                  </Pressable>
                  <Pressable style={styles.playdatePickerBtn} onPress={() => openAndroidPicker('time')}>
                    <Text style={styles.playdatePickerBtnText}>
                      {formatClock(parseIsoTime(playdateDraft.time) ?? 10 * 60)}
                    </Text>
                  </Pressable>
                </View>
              )}
              <Text style={[styles.playdateDraftSummary, draftStartsInPast && styles.playdateDraftWarning]}>
                {draftStartsInPast
                  ? 'That time has already passed. Pick a later one.'
                  : formatPlaydateWhen(playdateDraft, now)}
              </Text>
              <TextInput
                style={styles.playdateFormInput}
                value={playdateDraft.place}
                onChangeText={(v) => setPlaydateDraft((d) => ({ ...d, place: v }))}
                placeholder="Where? (e.g. Maple Dog Park)"
                placeholderTextColor={colors.brownLight}
                maxLength={200}
              />
              <View style={styles.playdateFormActions}>
                <Pressable
                  style={[styles.playdateSendBtn, !canSendProposal && styles.sendBtnDisabled]}
                  onPress={proposePlaydate}
                  disabled={!canSendProposal}
                >
                  <Text style={styles.playdateSendBtnText}>Send proposal</Text>
                </Pressable>
                <Pressable style={styles.playdateCancelBtn} onPress={() => setShowPlaydateForm(false)}>
                  <Text style={styles.playdateCancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          {starterPrompts.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.starterRow}
              contentContainerStyle={styles.starterRowContent}
            >
              {starterPrompts.map((prompt) => (
                <Pressable
                  key={prompt}
                  style={styles.starterChip}
                  onPress={() => applyStarterPrompt(prompt)}
                  disabled={sending}
                >
                  <Text style={styles.starterChipText}>{prompt}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.inputRow}>
            <Pressable
              style={styles.playdateToggleBtn}
              onPress={togglePlaydateForm}
              disabled={sending}
              accessibilityLabel="Propose a playdate"
            >
              <Text style={styles.playdateToggleBtnText}>📅</Text>
            </Pressable>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={`Message ${dogName}…`}
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
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.creamDark,
  },
  headerAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  headerAvatarEmoji: { fontSize: 20 },
  headerText: { flex: 1, minWidth: 0 },
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
  moreBtnDisabled: { opacity: 0.35 },
  moreBtnText: {
    fontSize: 16,
    color: colors.brownLight,
    fontFamily: fonts.bold,
  },
  bestFriendBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestFriendBtnText: {
    fontSize: 20,
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
  messageListAnchored: {
    justifyContent: 'flex-end',
  },
  loadOlderBtn: {
    alignSelf: 'center',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(232,99,58,0.08)',
  },
  loadOlderText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
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
  bubbleWrap: { marginBottom: 8 },
  bubbleWrapMe: { alignItems: 'flex-end' },
  bubbleWrapThem: { alignItems: 'flex-start' },
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
  bubbleModerated: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#fff', fontFamily: fonts.body },
  bubbleTextThem: { color: colors.brown, fontFamily: fonts.body },
  bubbleTextModerated: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownLight,
  },
  messageTime: {
    marginTop: 3,
    marginHorizontal: 6,
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.brownLight,
  },
  messageTimeMe: { textAlign: 'right' },
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
  starterRow: {
    flexGrow: 0,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  starterRowContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  starterChip: {
    borderRadius: radius.full,
    backgroundColor: 'rgba(232,99,58,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  starterChipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
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
  paywallNotice: {
    fontFamily: fonts.body,
    color: colors.brownMid,
    fontSize: 13,
    lineHeight: 19,
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
  playdateCardMe: {
    alignSelf: 'flex-end',
    borderColor: 'rgba(232,99,58,0.25)',
    backgroundColor: '#FFF7F3',
  },
  playdateCardThem: { alignSelf: 'flex-start' },
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
  playdateTime: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: 10,
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
  playdatePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  playdatePickerBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.cream,
  },
  playdatePickerBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.brown,
  },
  playdateDraftSummary: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brownLight,
    marginBottom: 8,
  },
  playdateDraftWarning: { color: colors.primaryDark },
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
