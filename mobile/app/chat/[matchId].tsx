import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  Share,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
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
import PlaydateHeadsUpCard, { playdateConflicts } from '../../components/PlaydateHeadsUpCard';
import ChatBubble from '../../components/chat/ChatBubble';
import PlaydateTicket, {
  RoundPaperButton,
  TicketCream,
  TicketNote,
  TicketPink,
  TicketQuiet,
} from '../../components/chat/PlaydateTicket';
import { PrimaryButton, SecondaryButton, SkyBackground, StickerDog } from '../../components/sticker';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { setBestFriend, clearBestFriend } from '../../lib/bestFriend';

// Shown after a bold "Tip:" (as on web), in the calm register.
const SAFETY_TIP = 'always meet in a public place for your first playdate.';

/** What this person did with a received proposal. Kept on this device only, as on web. */
type ProposalResponse = 'declined' | 'countered';

function responsesKey(matchId: string): string {
  return `gdd.playdateResponses.${matchId}`;
}

/** The other owner's first name as the match doc carries it, or null. Mirrors web's cleanFirstName. */
function cleanFirstName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 40 ? trimmed : null;
}

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
  // The other owner's first name, from the match document only (they can hide it).
  const [otherOwnerFirstName, setOtherOwnerFirstName] = useState<string | null>(null);
  // Declined / suggested-another-time, per proposal. A per-device convenience
  // like web's localStorage copy; the thread itself is the record.
  const [responses, setResponses] = useState<Record<string, ProposalResponse>>({});
  const [confirmDeclineId, setConfirmDeclineId] = useState<string | null>(null);
  // The proposal a new one answers ("Suggest another time"), marked handled once sent.
  const [counterOfId, setCounterOfId] = useState<string | null>(null);
  // The message box has focus (keyboard up): the Heads-Up card folds to its header.
  const [inputFocused, setInputFocused] = useState(false);
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
          dog1OwnerFirstName?: unknown;
          dog2OwnerFirstName?: unknown;
        };
        if (user) {
          setOtherUserId(getOtherUserId(data, user.uid));
          const iAmDog1 = data.dog1UserId === user.uid;
          setOtherOwnerFirstName(cleanFirstName(iAmDog1 ? data.dog2OwnerFirstName : data.dog1OwnerFirstName));
        }
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
    if (!resolvedMatchId) return undefined;
    let cancelled = false;
    AsyncStorage.getItem(responsesKey(resolvedMatchId))
      .then((raw) => {
        const parsed = raw ? JSON.parse(raw) : {};
        if (!cancelled && parsed && typeof parsed === 'object') setResponses(parsed);
      })
      .catch(() => { /* a per-device convenience; the thread is the record */ });
    return () => { cancelled = true; };
  }, [resolvedMatchId]);

  function recordResponse(messageId: string, response: ProposalResponse) {
    if (!resolvedMatchId) return;
    setResponses((current) => {
      const next = { ...current, [messageId]: response };
      AsyncStorage.setItem(responsesKey(resolvedMatchId), JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

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
    if (showPlaydateForm) setCounterOfId(null);
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
    // The Send button reads `now`, which only ticks once a minute, so check the
    // real clock again: a time picked a moment ago can have slipped past.
    if (draftToDate(playdateDraft).getTime() < Date.now()) {
      setNow(Date.now()); // shows the "already passed" warning immediately
      return;
    }
    const when = time ? `${date} at ${time}` : date;
    const delivered = await handleSend(`📅 Playdate proposal: ${when} — ${place.trim()}`, {
      type: 'playdate_proposal',
      playdate: { date, time, place: place.trim() },
    });
    if (!delivered) return; // keep the form + draft so the user can retry
    if (counterOfId) recordResponse(counterOfId, 'countered');
    setCounterOfId(null);
    setShowPlaydateForm(false);
    setPlaydateDraft(defaultPlaydateDraft());
  }

  function closePlaydateForm() {
    setShowPlaydateForm(false);
    setCounterOfId(null);
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

  // Accept is one tap, unless the two dogs' declared limits cross: then the
  // owner-named limits are said first and have to be tapped through (web's
  // "Before you accept" sheet).
  function handleAcceptTap(proposal: ChatMessage) {
    const conflicts = playdateConflicts(myProfile, otherProfile);
    if (conflicts.length === 0) {
      void acceptPlaydate(proposal);
      return;
    }
    const lines = conflicts.map((c) => `• ${c.text}${c.detail ? `. ${c.detail}.` : ''}`).join('\n');
    const body = `What you and ${dogName}’s owner each said about your dogs:\n\n${lines}`;
    if (Platform.OS === 'web') {
      // react-native-web has no Alert; the browser's confirm says the same.
      if (typeof window !== 'undefined' && window.confirm(`Before you accept\n\n${body}`)) void acceptPlaydate(proposal);
      return;
    }
    Alert.alert('Before you accept', body, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Got it, accept playdate', onPress: () => void acceptPlaydate(proposal) },
    ]);
  }

  async function handleDecline(proposal: ChatMessage) {
    if (!proposal.playdate) return;
    setConfirmDeclineId(null);
    const delivered = await handleSend(
      `Can’t make ${formatPlaydateWhen(proposal.playdate, now)}. Thanks for suggesting it! 🐾`,
    );
    if (delivered) recordResponse(proposal.id, 'declined');
  }

  // "Suggest another time": the proposal form again, with the same place filled in.
  function handleSuggestAnotherTime(proposal: ChatMessage) {
    setPlaydateDraft({ ...defaultPlaydateDraft(), place: proposal.playdate?.place ?? '' });
    setCounterOfId(proposal.id);
    setShowPlaydateForm(true);
  }

  // Web downloads an .ics file. The app has no file-system package to write
  // one (same as Pack Day's "Save the date"), so this opens the share sheet
  // with the date and place, which Calendar, Notes or Messages can take.
  async function handleSaveTheDate(p: PlaydateDetails) {
    trackEvent('playdate_calendar', { match_id: resolvedMatchId ?? '', method: 'share' });
    try {
      await Share.share({ message: `Playdate with ${dogName}\n${formatPlaydateWhen(p, now)}\n${p.place}` });
    } catch {
      // A dismissed share sheet isn't an error worth showing.
    }
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

  // A confirmation whose proposal ticket is in the thread is shown BY that
  // ticket ("Playdate · Confirmed"); its own message is only a copy of it.
  const proposalKeys = new Set(
    messages
      .filter((m) => isPlaydateMessage(m, 'playdate_proposal'))
      .map((m) => playdateKey(m.playdate)),
  );
  // Exactly one pink action in the thread, as on web: "Send proposal" while
  // the form is open; else the newest proposal waiting on me ("Accept
  // playdate"); else "I'm here" on the soonest upcoming playdate.
  const pinkProposalId = showPlaydateForm
    ? null
    : ([...messages].reverse().find((m) =>
        isPlaydateMessage(m, 'playdate_proposal')
        && m.senderId !== user?.uid
        && !confirmedPlaydateKeys.has(playdateKey(m.playdate))
        && playdatePhase(m.playdate, now, m.createdAt) !== 'happened'
        && !responses[m.id],
      )?.id ?? null);
  const pinkPlaydateKey =
    !showPlaydateForm && !pinkProposalId && upcomingPlaydate ? playdateKey(upcomingPlaydate) : null;
  const otherName = otherOwnerFirstName ?? dogName;

  // A confirmed playdate that is still ahead: the quick messages and the date.
  const confirmedActions = (p: PlaydateDetails, sentAt: number) => {
    if (playdatePhase(p, now, sentAt) !== 'upcoming') return null;
    const pink = playdateKey(p) === pinkPlaydateKey;
    return (
      <>
        {pink ? (
          <TicketPink label="I’m here" onPress={() => void handleSend('I’m here! 🐾')} disabled={sending} />
        ) : (
          <TicketCream label="I’m here" icon="paw" onPress={() => void handleSend('I’m here! 🐾')} disabled={sending} />
        )}
        <TicketCream
          label="Running late"
          icon="clock"
          onPress={() => void handleSend('Running a few minutes late. See you soon! ⏰')}
          disabled={sending}
        />
        <TicketCream label="Save the date" icon="calendar" onPress={() => void handleSaveTheDate(p)} />
      </>
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === user?.uid || item.senderId === 'me';
    const time = formatMessageTime(item.createdAt, now);

    // Caught by the server's content filter: muted, never a playdate card.
    if (item.moderated) {
      return <ChatBubble text={item.text} fromMe={isMe} time={time} moderated />;
    }

    if (isPlaydateMessage(item, 'playdate_proposal')) {
      const confirmed = confirmedPlaydateKeys.has(playdateKey(item.playdate));
      // A proposal whose time has gone by can't be confirmed: that would
      // count as a meetup that never happened and prompt for a rating of it.
      const passed = playdatePhase(item.playdate, now, item.createdAt) === 'happened';
      const response = responses[item.id];
      const awaitingMe = !isMe && !confirmed && !passed && !response;
      const status = !isMe && !confirmed && passed
        ? 'That time has passed. Propose a new one.'
        : isMe && !confirmed && !passed
          ? `Waiting for ${otherName} to reply.`
          : !isMe && !confirmed && !passed && response
            ? (response === 'declined' ? 'You declined this one.' : 'You suggested another time.')
            : null;
      let actions: ReactNode = null;
      if (confirmed) {
        actions = confirmedActions(item.playdate, item.createdAt);
      } else if (awaitingMe) {
        actions = confirmDeclineId === item.id ? (
          <>
            <TicketNote>Let {otherName} know you can’t make it?</TicketNote>
            <TicketCream label="Yes, decline" onPress={() => void handleDecline(item)} disabled={sending} />
            <TicketQuiet label="Cancel" onPress={() => setConfirmDeclineId(null)} />
          </>
        ) : (
          <>
            {item.id === pinkProposalId ? (
              <TicketPink label="Accept playdate" onPress={() => handleAcceptTap(item)} disabled={sending} />
            ) : (
              <TicketCream label="Accept playdate" icon="paw" onPress={() => handleAcceptTap(item)} disabled={sending} />
            )}
            <TicketCream
              label="Suggest another time"
              icon="clock"
              onPress={() => handleSuggestAnotherTime(item)}
              disabled={sending}
            />
            <TicketQuiet label="Decline" onPress={() => setConfirmDeclineId(item.id)} disabled={sending} />
          </>
        );
      }
      return (
        <PlaydateTicket
          align={isMe ? 'end' : 'start'}
          header={confirmed ? 'Playdate · Confirmed' : `Playdate proposal · from ${isMe ? 'you' : otherName}`}
          when={formatPlaydateWhen(item.playdate, now)}
          place={item.playdate.place}
          status={status}
          actions={actions}
          time={time}
        />
      );
    }

    if (isPlaydateMessage(item, 'playdate_confirmed')) {
      // Its proposal ticket already says "Confirmed"; this would be a duplicate.
      if (proposalKeys.has(playdateKey(item.playdate))) return null;
      return (
        <PlaydateTicket
          align="center"
          header="Playdate · Confirmed"
          when={formatPlaydateWhen(item.playdate, now)}
          place={item.playdate.place}
          actions={confirmedActions(item.playdate, item.createdAt)}
          time={time}
        />
      );
    }

    return <ChatBubble text={item.text} fromMe={isMe} time={time} />;
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

  const isBestFriend = myBestFriendMatchId === resolvedMatchId;
  const headerSub = otherOwnerFirstName ? `with ${otherOwnerFirstName}` : otherBreed;

  return (
    <SafeAreaView style={styles.container}>
      <PlaydateRatingModal
        visible={showRatingModal}
        dogName={dogName}
        onSubmit={handleSubmitRating}
        onDismiss={() => setShowRatingModal(false)}
      />

      {/* Header: a paper strip with an ink rule, as on web */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={4}
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Pressable
          style={styles.headerCenter}
          onPress={() => resolvedMatchId && router.push({ pathname: '/dog/[matchId]', params: { matchId: resolvedMatchId } })}
          accessibilityRole="button"
          accessibilityLabel={`View ${dogName}'s profile`}
        >
          <View style={styles.headerAvatar}>
            {otherPhoto ? (
              <Image source={{ uri: otherPhoto }} style={styles.headerAvatarImg} />
            ) : (
              <StickerDog size={36} label={`A drawn sticker dog standing in for ${dogName}`} />
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>{resolvedName || match?.dog.name || 'Chat'}</Text>
            {headerSub ? <Text style={styles.headerSub} numberOfLines={1}>{headerSub}</Text> : null}
          </View>
        </Pressable>
        {resolvedMatchId && (
          <Pressable
            style={[styles.bestFriendBtn, togglingBestFriend && styles.dimmed]}
            onPress={handleToggleBestFriend}
            disabled={togglingBestFriend}
            accessibilityRole="button"
            accessibilityLabel={isBestFriend ? 'Remove Best Friend' : `Make ${dogName} Best Friend`}
            accessibilityState={{ selected: isBestFriend }}
          >
            <Ionicons name={isBestFriend ? 'star' : 'star-outline'} size={22} color={colors.ink} />
          </Pressable>
        )}
        <Pressable
          style={[styles.moreBtn, !reportReady && !reportPending && styles.dimmed]}
          onPress={openSafetyMenu}
          disabled={!reportReady}
          accessibilityRole="button"
          accessibilityLabel="Report or block"
        >
          {reportPending ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
          )}
        </Pressable>
      </View>

      <View style={styles.page}>
        <SkyBackground />
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
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : matchLoadError ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatTitle}>Couldn’t load this chat</Text>
            <Text style={styles.emptyChatText}>Check your connection and try again.</Text>
            <PrimaryButton
              label="Retry"
              onPress={() => setMatchLoadRetryToken((t) => t + 1)}
              style={styles.emptyChatBtn}
            />
          </View>
        ) : matchMissing ? (
          <View style={styles.emptyChat}>
            <StickerDog size={72} />
            <Text style={styles.emptyChatText}>This match isn’t available any more.</Text>
          </View>
        ) : match && isSeedUserId(match.dog.id) ? (
          <View style={styles.emptyChat}>
            <StickerDog size={72} />
            <Text style={styles.emptyChatText}>
              This demo profile is no longer available for chats or unlocks.
            </Text>
          </View>
        ) : !canChat ? (
          <ScrollView contentContainerStyle={styles.paywallScroll}>
            <View style={styles.paywallCard}>
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
                  {unlockError ? <Text style={styles.paywallNotice}>{unlockError}</Text> : null}
                  <PrimaryButton label="Check again" onPress={handleRefreshUnlockStatus} style={styles.paywallBtn} />
                </>
              ) : (
                <>
                  <Text style={styles.paywallTitle}>Unlock chat with {dogName}</Text>
                  <Text style={styles.paywallBody}>
                    {paymentConfigured
                      ? getChatUnlockPitch()
                      : paymentConfigurationError ?? 'Payments are not configured for this build yet, so locked chats cannot be unlocked on this device.'}
                  </Text>
                  {unlockError ? <Text style={styles.paywallError}>{unlockError}</Text> : null}
                  {!unlockLoading && unlockError ? (
                    <SecondaryButton
                      label="Check unlock status"
                      onPress={handleRefreshUnlockStatus}
                      style={styles.paywallSecondary}
                    />
                  ) : null}
                  <PrimaryButton
                    label={paymentConfigured ? `Unlock chat for ${formatPrice(CHAT_UNLOCK_PRICE_CENTS)}` : 'Payment not configured'}
                    onPress={handleUnlock}
                    disabled={unlockLoading || !paymentConfigured}
                    loading={unlockLoading}
                    style={styles.paywallBtn}
                  />
                  {founding.phase === 'paid' && getFoundingMemberLink(user.uid) && (
                    <Pressable style={styles.foundingMemberLink} onPress={openFoundingMemberLink} accessibilityRole="link">
                      <Text style={styles.foundingMemberLinkText}>
                        Or become a Founding Member — $39 once. Pro for life, first access to every Pro feature as it ships, and a numbered Founding Member badge.
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
              <Text style={styles.paywallSupport}>
                <Text style={styles.tipLead}>Tip:</Text> {SAFETY_TIP}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
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
                  <SecondaryButton
                    label="Share this memory"
                    icon={<Ionicons name="share" size={18} color={colors.ink} />}
                    onPress={handleShareMemoryCard}
                    loading={sharingMemoryCard}
                  />
                  <Pressable onPress={() => setMemoryCardStars(null)} style={styles.dismissMemory} accessibilityRole="button">
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
              extraData={[now, responses, confirmDeclineId, pinkProposalId, pinkPlaydateKey, otherOwnerFirstName, sending]}
              onScroll={handleListScroll}
              scrollEventThrottle={100}
              keyboardShouldPersistTaps="handled"
              // Loading earlier messages adds rows ABOVE what's on screen; this
              // keeps the message you were reading where it was. Index 1 skips
              // the "Load earlier" header.
              maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
              ListHeaderComponent={
                hasOlder ? (
                  <SecondaryButton
                    label={loadingOlder ? 'Loading…' : 'Load earlier messages'}
                    onPress={loadOlderMessages}
                    disabled={loadingOlder}
                    style={styles.loadOlderBtn}
                    textStyle={styles.loadOlderText}
                  />
                ) : null
              }
              // Right below the newest message: the rating prompt once a
              // playdate has happened, then the calm tip line. Generic advice
              // yields to the specific briefing once a playdate is on the
              // calendar, as on web.
              ListFooterComponent={
                <>
                  {hasPastPlaydate && !alreadyRated && (
                    <Pressable
                      style={styles.ratingBanner}
                      onPress={() => setShowRatingModal(true)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.ratingBannerText}>How did the playdate with {dogName} go?</Text>
                      <Text style={styles.ratingBannerCta}>Rate it</Text>
                    </Pressable>
                  )}
                  {!upcomingPlaydate && messages.length > 0 && (
                    <Text style={styles.tipLine}>
                      <Text style={styles.tipLead}>Tip:</Text> {SAFETY_TIP}
                    </Text>
                  )}
                </>
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
                  <StickerDog size={84} label={`A drawn sticker dog standing in for ${dogName}`} />
                  <Text style={styles.emptyChatTitle}>Someone has to text first</Text>
                  <Text style={styles.emptyChatText}>
                    And dogs can’t type, so it’s on you. Say hi to {dogName}.
                  </Text>
                  <Text style={styles.tipLine}>
                    <Text style={styles.tipLead}>Tip:</Text> {SAFETY_TIP}
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
                ownerFirstName={otherOwnerFirstName}
                compact={inputFocused}
              />
            )}

            {/* The composer: a paper bar. The quick actions sit above the box
                as paper chips: "Propose playdate", then the starter ideas
                (which fill the box for editing, never send). */}
            <View style={styles.composer}>
              {showPlaydateForm && (
                <View style={styles.playdateForm}>
                  <Text style={styles.playdateFormLabel}>
                    {counterOfId ? 'Suggest another time' : 'Propose a playdate'}
                  </Text>
                  {Platform.OS === 'ios' ? (
                    <View style={styles.playdatePickerRow}>
                      <DateTimePicker
                        value={draftDate}
                        mode="date"
                        display="compact"
                        minimumDate={todayStart}
                        accentColor={colors.ink}
                        themeVariant="light"
                        onChange={(_event: DateTimePickerEvent, picked?: Date) => picked && setDraftDate(picked)}
                      />
                      <DateTimePicker
                        value={draftDate}
                        mode="time"
                        display="compact"
                        minuteInterval={5}
                        accentColor={colors.ink}
                        themeVariant="light"
                        onChange={(_event: DateTimePickerEvent, picked?: Date) => picked && setDraftTime(picked)}
                      />
                    </View>
                  ) : (
                    <View style={styles.playdatePickerRow}>
                      <Pressable
                        style={styles.playdatePickerBtn}
                        onPress={() => openAndroidPicker('date')}
                        accessibilityRole="button"
                        accessibilityLabel="Playdate date"
                      >
                        <Ionicons name="calendar" size={18} color={colors.ink} />
                        <Text style={styles.playdatePickerBtnText}>{formatDay(draftDate, now)}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.playdatePickerBtn}
                        onPress={() => openAndroidPicker('time')}
                        accessibilityRole="button"
                        accessibilityLabel="Playdate time"
                      >
                        <Ionicons name="time" size={18} color={colors.ink} />
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
                    autoCapitalize="words"
                    returnKeyType="done"
                    accessibilityLabel="Playdate place"
                  />
                  <View style={styles.playdateFormActions}>
                    <PrimaryButton
                      label="Send proposal"
                      onPress={proposePlaydate}
                      disabled={!canSendProposal}
                      style={styles.playdateSendBtn}
                      textStyle={styles.playdateSendBtnText}
                    />
                    <SecondaryButton
                      label="Cancel"
                      onPress={closePlaydateForm}
                      style={styles.playdateCancelBtn}
                      textStyle={styles.playdateCancelBtnText}
                    />
                  </View>
                </View>
              )}
              {!showPlaydateForm && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={styles.chipRow}
                  contentContainerStyle={styles.chipRowContent}
                >
                  <Pressable
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, sending && styles.dimmed]}
                    onPress={togglePlaydateForm}
                    disabled={sending}
                    accessibilityRole="button"
                    accessibilityLabel="Propose a playdate"
                  >
                    <Ionicons name="ticket" size={18} color={colors.ink} />
                    <Text style={styles.chipTextStrong}>Propose playdate</Text>
                  </Pressable>
                  {starterPrompts.map((prompt) => (
                    <Pressable
                      key={prompt}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                      onPress={() => applyStarterPrompt(prompt)}
                      disabled={sending}
                      accessibilityRole="button"
                    >
                      <Text style={styles.chipText}>{prompt}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder={`Message ${dogName}…`}
                  placeholderTextColor={colors.brownLight}
                  multiline
                  // Web (preview) only: one row to start, like iOS. Android/iOS grow anyway.
                  numberOfLines={1}
                  maxLength={MAX_MESSAGE_LENGTH}
                  returnKeyType="send"
                  // A multiline TextInput defaults to submitBehavior 'newline': the
                  // keyboard's "send" key would insert a line break and never call
                  // onSubmitEditing. 'submit' makes it send (like web's Enter),
                  // keeps the keyboard up, and still lets long messages wrap.
                  submitBehavior="submit"
                  onSubmitEditing={() => handleSend()}
                  accessibilityLabel={`Message ${dogName}`}
                />
                <RoundPaperButton
                  size={46}
                  onPress={() => void handleSend()}
                  disabled={!text.trim() || sending}
                  accessibilityLabel="Send"
                  icon={sending
                    ? <ActivityIndicator color={colors.ink} size="small" />
                    : <Ionicons name="arrow-up" size={22} color={colors.ink} />}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </SafeAreaView>
  );
}

const INK_SHADOW = {
  shadowColor: colors.ink,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 0,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  // Paper behind the status bar and the home indicator; the sky is the page.
  container: { flex: 1, backgroundColor: colors.paper },
  // overflow hidden: the shared Gingham draws 12 columns (528px), wider than a phone.
  page: { flex: 1, backgroundColor: colors.sky, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
    paddingLeft: 4,
    paddingRight: 10,
    gap: 6,
    backgroundColor: colors.paper,
    borderBottomWidth: 2,
    borderBottomColor: colors.ink,
    zIndex: 2,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, minHeight: 44 },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.note,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...INK_SHADOW,
  },
  headerAvatarImg: { width: '100%', height: '100%' },
  headerText: { flex: 1, minWidth: 0 },
  headerName: { fontFamily: fonts.display, fontSize: 22, lineHeight: 25, color: colors.ink },
  headerSub: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 16, color: colors.brownMid },
  bestFriendBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.4 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, flexGrow: 1 },
  messageListAnchored: { justifyContent: 'flex-end' },
  loadOlderBtn: { alignSelf: 'center', minHeight: 44, marginBottom: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  loadOlderText: { fontSize: 14 },
  tipLine: {
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 8,
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.brownMid,
    textAlign: 'center',
  },
  tipLead: { fontFamily: fonts.black, color: colors.ink },
  ratingBanner: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.kraft,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  ratingBannerText: { flex: 1, fontFamily: fonts.black, fontSize: 14, lineHeight: 19, color: colors.ink },
  ratingBannerCta: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
  memoryCardWrap: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  memoryCardActions: { alignItems: 'center', gap: 4 },
  dismissMemory: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  dismissMemoryText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
  composer: {
    backgroundColor: colors.paper,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: colors.ink,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginHorizontal: -2.5,
  },
  chipRow: { flexGrow: 0 },
  chipRowContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 4,
    backgroundColor: colors.paper,
  },
  chipPressed: { transform: [{ translateY: 1 }], opacity: 0.92 },
  chipTextStrong: { fontFamily: fonts.black, fontSize: 13.5, color: colors.ink },
  chipText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 23,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    backgroundColor: '#FFFDF6',
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
    gap: 10,
  },
  emptyChatTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 31, color: colors.ink, textAlign: 'center' },
  emptyChatText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyChatBtn: { alignSelf: 'stretch', marginTop: 8 },
  paywallScroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  paywallCard: {
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 0,
    elevation: 4,
  },
  paywallTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  paywallBody: {
    fontFamily: fonts.bold,
    color: colors.brownMid,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 21,
  },
  paywallSupport: {
    fontFamily: fonts.bold,
    color: colors.brownMid,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
  },
  paywallError: {
    fontFamily: fonts.black,
    color: colors.rose,
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 12,
    textAlign: 'center',
  },
  paywallNotice: {
    fontFamily: fonts.bold,
    color: colors.brownMid,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 12,
  },
  paywallBtn: { alignSelf: 'stretch' },
  paywallSecondary: { alignSelf: 'stretch', marginBottom: 10 },
  foundingMemberLink: { marginTop: 12, minHeight: 44, justifyContent: 'center' },
  foundingMemberLinkText: {
    color: colors.rose,
    fontFamily: fonts.black,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  // Inside the composer's paper bar, above the message box.
  playdateForm: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  playdateFormLabel: { fontFamily: fonts.black, fontSize: 15, color: colors.ink, marginBottom: 8 },
  playdatePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  playdatePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFDF6',
  },
  playdatePickerBtnText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  playdateDraftSummary: { fontFamily: fonts.bold, fontSize: 13, color: colors.brownMid, marginBottom: 8 },
  playdateDraftWarning: { fontFamily: fonts.black, color: colors.rose },
  playdateFormInput: {
    minHeight: 44,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: '#FFFDF6',
    marginBottom: 10,
  },
  playdateFormActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playdateSendBtn: { flex: 1, minHeight: 50, paddingTop: 4, paddingBottom: 10 },
  playdateSendBtnText: { fontSize: 22, lineHeight: 26 },
  playdateCancelBtn: { minHeight: 50, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10 },
  playdateCancelBtnText: { fontSize: 14 },
});
