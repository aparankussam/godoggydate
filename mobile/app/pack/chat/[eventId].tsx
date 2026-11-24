// mobile/app/pack/chat/[eventId].tsx
// The Pack Day group chat. It opens when you RSVP (members are the event's RSVP
// list), is free for everyone (the 1:1 match chat stays paid), and turns
// read-only 48 hours after the event (firestore.rules enforces that; this
// screen just says so). After the event the screen leads with the shared photo
// album, the "Class photo" card and "Who did <dog> play with?".
//
// Reused as they are: the 1:1 chat's content filter and bubble (ChatBubble),
// the report sheet (lib/reports, now able to name one message), blocks
// (lib/blocks), the Pack Day loader (lib/packDay), swipes (lib/matching) and
// the share-card capture (lib/shareCard).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc } from 'firebase/firestore';
import { colors, fonts } from '../../../constants/theme';
import { BackHeader, Gingham, Glyph, Heading, InkLink, PaperButton, PinkButton, Slip } from '../../../components/pack/kit';
import ChatBubble from '../../../components/chat/ChatBubble';
import ClassPhotoCard from '../../../components/pack/ClassPhotoCard';
import { useSession } from '../../../lib/session';
import { getFirebase } from '../../../lib/firebase';
import { getBlockedUserIds } from '../../../lib/blocks';
import { openReportSheet } from '../../../lib/reports';
import { recordSwipe } from '../../../lib/matching';
import { captureAndShare } from '../../../lib/shareCard';
import { packDayUrl } from '../../../lib/webLinks';
import { trackEvent } from '../../../lib/analytics';
import { formatMessageTime } from '../../../lib/playdates';
import { getPackDay, loadPackDayAttendees, packDayErrorMessage, type PackDayAttendee } from '../../../lib/packDay';
import {
  ChatContentError,
  EMPTY_CONTROL,
  loadCheckinUids,
  packDayHostAction,
  sendPackDayPhoto,
  sendPackDayQuick,
  sendPackDayRainCheck,
  sendPackDayText,
  subscribePackDayControl,
  subscribePackDayMessages,
  type HostAction,
  type PackDayChatControl,
  type PackDayMessage,
} from '../../../lib/packDayChat';
import { CONTENT_FILTER_MESSAGE } from '../../../../shared/contentFilter';
import { formatPackDayWhen } from '../../../../shared/packDay';
import type { PackDay } from '../../../../shared/packDay';
import {
  CHAT_MAX_TEXT,
  CHAT_QUICK_MESSAGES,
  canPostPhoto,
  canPostText,
  chatPhase,
  classPhotoUids,
  visibleChatMessages,
  whoPlayedCandidates,
} from '../../../../shared/packDayChat';

type Tab = 'chat' | 'album';
type PlayState = 'saving' | 'pack' | 'match';

export default function PackDayChatScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = (Array.isArray(params.eventId) ? params.eventId[0] : params.eventId) ?? '';
  const { user, profile } = useSession();
  const uid = user?.uid ?? '';

  const [event, setEvent] = useState<PackDay | null>(null);
  const [attendees, setAttendees] = useState<PackDayAttendee[]>([]);
  const [load, setLoad] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<PackDayMessage[]>([]);
  const [control, setControl] = useState<PackDayChatControl>(EMPTY_CONTROL);
  const [tab, setTab] = useState<Tab | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [actionFor, setActionFor] = useState<PackDayMessage | null>(null);
  const [checkinUids, setCheckinUids] = useState<string[]>([]);
  const [played, setPlayed] = useState<Record<string, PlayState>>({});
  const [sharing, setSharing] = useState(false);
  const listRef = useRef<FlatList<PackDayMessage>>(null);
  const cardRef = useRef<View>(null);

  const reload = useCallback(async () => {
    try {
      const result = await getPackDay(eventId);
      if (!result) return setLoad('missing');
      setEvent(result.event);
      setAttendees(await loadPackDayAttendees(result.event, result.foundingUids));
      setLoad('ready');
    } catch (error) {
      console.warn('Pack Day chat: load failed', error);
      setLoad('error');
    }
  }, [eventId]);

  useEffect(() => {
    if (!uid || !eventId) return;
    void reload();
    getBlockedUserIds(uid).then(setBlocked).catch(() => undefined);
    trackEvent('packday_chat_view', { eventId });
  }, [uid, eventId, reload]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const member = Boolean(event && event.attendeeUids.includes(uid));

  // Only a member may read (firestore.rules), so don't subscribe before we know.
  useEffect(() => {
    if (!member) return undefined;
    const offMessages = subscribePackDayMessages(eventId, setMessages, (e) => console.warn('Pack Day chat: messages', e));
    const offControl = subscribePackDayControl(eventId, setControl);
    return () => { offMessages(); offControl(); };
  }, [member, eventId]);

  const phase = event ? chatPhase(event, now) : 'before';
  const afterEvent = phase === 'after' || phase === 'readonly';
  const activeTab: Tab = tab ?? (afterEvent ? 'album' : 'chat');
  const isHost = Boolean(event && event.hostUid === uid);
  const muted = control.mutedUids.includes(uid);
  const byUid = useMemo(() => new Map(attendees.map((a) => [a.uid, a])), [attendees]);
  const nameOf = (id: string) => byUid.get(id)?.name ?? 'A dog';
  const visible = useMemo(() => visibleChatMessages(messages, blocked), [messages, blocked]);
  const photos = visible.filter((m) => m.kind === 'photo' && m.photoUrl && !m.moderated);

  // After the event, the class photo needs to know who checked in.
  useEffect(() => {
    if (member && afterEvent) loadCheckinUids(eventId).then(setCheckinUids);
  }, [member, afterEvent, eventId]);

  // Who I already added: a "like" swipe on their dog (the existing Pack/match code).
  useEffect(() => {
    if (!member || !afterEvent) return;
    const { db } = getFirebase();
    const others = whoPlayedCandidates(event?.attendeeUids ?? [], uid, blocked);
    void Promise.all(others.map(async (other) => {
      const snap = await getDoc(doc(db, 'swipes', uid, 'decisions', other)).catch(() => null);
      return snap?.exists() && snap.data()?.action === 'like' ? other : null;
    })).then((liked) => setPlayed((p) => {
      const next = { ...p };
      for (const id of liked) if (id && !next[id]) next[id] = 'pack';
      return next;
    }));
  }, [member, afterEvent, event, uid, blocked]);

  async function run(action: () => Promise<void>, failure: string) {
    if (sending) return;
    setSending(true);
    try {
      await action();
    } catch (error) {
      if (error instanceof ChatContentError) Alert.alert('Message not sent', CONTENT_FILTER_MESSAGE);
      else Alert.alert('Didn’t go through', packDayErrorMessage(error, failure));
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    const draft = text.trim();
    if (!draft) return;
    setText('');
    await run(async () => {
      try {
        await sendPackDayText(eventId, uid, draft);
      } catch (error) {
        setText(draft); // never lose a draft
        throw error;
      }
    }, 'Check your connection and try again.');
  }

  async function handlePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    trackEvent('packday_photo_add', { eventId });
    await run(() => sendPackDayPhoto(eventId, uid, asset.uri, asset.mimeType ?? 'image/jpeg'), 'The photo didn’t upload.');
  }

  async function handleHost(action: HostAction, target: { messageId?: string; targetUid?: string }, done?: string) {
    setActionFor(null);
    try {
      await packDayHostAction(eventId, action, target);
      if (action === 'remove') await reload();
      if (done) Alert.alert(done);
    } catch (error) {
      Alert.alert('Didn’t go through', packDayErrorMessage(error, 'Try again in a moment.'));
    }
  }

  function handleReport(message: PackDayMessage) {
    setActionFor(null);
    openReportSheet(
      { reporterId: uid, targetUserId: message.fromUserId, source: 'packday', eventId, messageId: message.id },
      { name: nameOf(message.fromUserId), onBlocked: () => getBlockedUserIds(uid).then(setBlocked).catch(() => undefined) },
    );
  }

  async function handleAddToPack(other: PackDayAttendee) {
    setPlayed((p) => ({ ...p, [other.uid]: 'saving' }));
    try {
      const result = await recordSwipe({
        currentUserId: uid,
        currentDogId: uid,
        targetUserId: other.uid,
        targetDogId: other.uid,
        action: 'like',
      });
      trackEvent('packday_played_with', { eventId, matched: result.isMatch });
      setPlayed((p) => ({ ...p, [other.uid]: result.isMatch ? 'match' : 'pack' }));
    } catch (error) {
      console.warn('Pack Day chat: add to pack failed', error);
      setPlayed((p) => Object.fromEntries(Object.entries(p).filter(([id]) => id !== other.uid)));
      Alert.alert('Didn’t go through', 'Check your connection and try again.');
    }
  }

  async function handleShareClassPhoto() {
    if (!event || sharing) return;
    setSharing(true);
    trackEvent('packday_class_photo_share', { eventId });
    const result = await captureAndShare(cardRef, `${event.title.toLowerCase().replace(/\s+/g, '-')}-class-photo.png`, `${event.title} class photo`, {
      caption: `Class photo from ${event.title} on GoDoggyDate:`,
      url: packDayUrl(event.id),
    });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setSharing(false);
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/pack/${eventId}`));

  if (!uid || load === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <BackHeader title="Pack Day chat" onBack={back} />
        <View style={styles.center}>{uid ? <ActivityIndicator color={colors.ink} size="large" /> : <Text style={styles.body}>Sign in to open this chat.</Text>}</View>
      </SafeAreaView>
    );
  }

  if (load !== 'ready' || !event || !member) {
    const message = load === 'missing' ? 'This Pack Day isn’t here anymore.'
      : load === 'error' ? 'We couldn’t load this chat.'
        : 'The chat opens when you RSVP to this Pack Day.';
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <BackHeader title="Pack Day chat" onBack={back} />
        <View style={styles.center}>
          <Heading size={22} style={styles.centerText}>{message}</Heading>
          {load === 'error' && <PaperButton label="Try again" icon="refresh" onPress={() => void reload()} style={styles.wide} />}
          <PinkButton label="See the Pack Day" onPress={() => router.replace(`/pack/${eventId}`)} style={styles.wide} />
        </View>
      </SafeAreaView>
    );
  }

  const pinnedVisible = control.pinned && !blocked.has(control.pinned.fromUserId) ? control.pinned : null;
  const readOnlyReason = event.status === 'cancelled' ? 'This Pack Day was cancelled, so the chat is read-only.'
    : 'This chat closed 48 hours after the Pack Day. You can still read it and see the photos.';
  const candidates = whoPlayedCandidates(event.attendeeUids, uid, blocked)
    .map((id) => byUid.get(id))
    .filter((a): a is PackDayAttendee => Boolean(a));
  const classDogs = classPhotoUids(checkinUids, event.attendeeUids)
    .filter((id) => !blocked.has(id) || id === uid)
    .map((id) => byUid.get(id))
    .filter((a): a is PackDayAttendee => Boolean(a));
  const myDog = profile?.name?.trim() || 'your dog';

  const renderMessage = ({ item }: { item: PackDayMessage }) => {
    const mine = item.fromUserId === uid;
    const time = formatMessageTime(item.createdAt, now);
    if (item.kind === 'headsup') {
      return (
        <View style={styles.headsUp} accessibilityRole="summary">
          <Glyph name="weather-partly-rainy" size={18} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headsUpText}>{item.text}</Text>
            <Text style={styles.headsUpMeta}>{item.fromUserId === 'system' ? 'Morning of' : `Host · ${time}`}</Text>
          </View>
        </View>
      );
    }
    const press = () => setActionFor(item);
    if (item.kind === 'here' || item.kind === 'late') {
      return (
        <Pressable onLongPress={press} style={styles.quickNote} accessibilityLabel={`${nameOf(item.fromUserId)}: ${CHAT_QUICK_MESSAGES[item.kind]}`}>
          <Text style={styles.quickNoteText}>
            {mine ? 'You' : nameOf(item.fromUserId)}: {CHAT_QUICK_MESSAGES[item.kind]}
          </Text>
          <Text style={styles.headsUpMeta}>{time}</Text>
        </Pressable>
      );
    }
    return (
      <Pressable onLongPress={press} delayLongPress={350} style={[styles.row, mine ? styles.rowMe : styles.rowThem]}>
        {!mine && <Text style={styles.sender}>{nameOf(item.fromUserId)}</Text>}
        {item.kind === 'photo' && item.photoUrl && !item.moderated ? (
          <Image source={{ uri: item.photoUrl }} style={styles.chatPhoto} accessibilityLabel={`Photo from ${mine ? 'you' : nameOf(item.fromUserId)}`} />
        ) : (
          <ChatBubble text={item.text} fromMe={mine} time={time} moderated={item.moderated} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title={event.title} onBack={back} backLabel="Back" />

      <View style={styles.tabs}>
        {(['chat', 'album'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, activeTab === t && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === t }}
          >
            <Text style={styles.tabText}>{t === 'chat' ? 'Chat' : `Album${photos.length ? ` · ${photos.length}` : ''}`}</Text>
          </Pressable>
        ))}
      </View>

      {pinnedVisible && (
        <View style={styles.pinned}>
          <Glyph name="pin" size={16} />
          <Text style={styles.pinnedText} numberOfLines={2}>
            {pinnedVisible.kind === 'here' || pinnedVisible.kind === 'late'
              ? `${nameOf(pinnedVisible.fromUserId)}: ${CHAT_QUICK_MESSAGES[pinnedVisible.kind as 'here' | 'late']}`
              : pinnedVisible.text}
          </Text>
          {isHost && <InkLink label="Unpin" onPress={() => void handleHost('unpin', {})} />}
        </View>
      )}

      {activeTab === 'chat' ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={listRef}
            data={visible}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[styles.body, styles.centerText]}>No messages yet. Say hi to the pack 🐾</Text>}
          />
          {canPostText(phase) && !muted ? (
            <View style={styles.composer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
                <Chip label={CHAT_QUICK_MESSAGES.here} onPress={() => void run(() => sendPackDayQuick(eventId, uid, 'here'), 'Try again.')} disabled={sending} />
                <Chip label={CHAT_QUICK_MESSAGES.late} onPress={() => void run(() => sendPackDayQuick(eventId, uid, 'late'), 'Try again.')} disabled={sending} />
                {isHost && <Chip label="Rain? ☔" onPress={() => void run(() => sendPackDayRainCheck(eventId, uid), 'Try again.')} disabled={sending} />}
                {canPostPhoto(phase) && <Chip label="Add photo 📷" onPress={() => void handlePhoto()} disabled={sending} />}
              </ScrollView>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder="Message the pack…"
                  placeholderTextColor={colors.brownLight}
                  multiline
                  maxLength={CHAT_MAX_TEXT}
                  accessibilityLabel="Message the pack"
                />
                <Pressable
                  style={[styles.send, (!text.trim() || sending) && styles.dim]}
                  onPress={() => void handleSend()}
                  disabled={!text.trim() || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                >
                  {sending ? <ActivityIndicator color={colors.ink} size="small" /> : <Glyph name="arrow-up" size={22} />}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.composer}>
              <Text style={[styles.body, styles.centerText, styles.pad]}>
                {muted ? 'The host has muted you in this chat.' : readOnlyReason}
              </Text>
            </View>
          )}
        </KeyboardAvoidingView>
      ) : (
        <ScrollView contentContainerStyle={styles.albumContent}>
          {canPostPhoto(phase) ? (
            <PaperButton label="Add a photo" icon="camera" onPress={() => void handlePhoto()} busy={sending} disabled={muted} />
          ) : (
            <Slip icon="camera">{phase === 'before' ? 'Photos open when the Pack Day starts.' : readOnlyReason}</Slip>
          )}
          {photos.length === 0 ? (
            <Text style={[styles.body, styles.centerText]}>No photos yet.</Text>
          ) : (
            <View style={styles.grid}>
              {photos.map((p) => (
                <Pressable key={p.id} onLongPress={() => setActionFor(p)} style={styles.gridCell} accessibilityLabel={`Photo from ${nameOf(p.fromUserId)}`}>
                  <Image source={{ uri: p.photoUrl as string }} style={styles.gridPhoto} />
                </Pressable>
              ))}
            </View>
          )}

          {afterEvent && event.status !== 'cancelled' && (
            <>
              <Heading size={22}>Class photo</Heading>
              <View style={styles.cardWrap}>
                <ClassPhotoCard
                  ref={cardRef}
                  title={event.title}
                  when={formatPackDayWhen(event)}
                  dogs={classDogs}
                />
              </View>
              <PaperButton label={sharing ? 'Rendering…' : 'Share the class photo'} icon="export-variant" onPress={() => void handleShareClassPhoto()} disabled={sharing} />

              {candidates.length > 0 && (
                <>
                  <Heading size={22}>Who did {myDog} play with?</Heading>
                  {candidates.map((other) => {
                    const state = played[other.uid];
                    return (
                      <View key={other.uid} style={styles.playRow}>
                        {other.photo ? <Image source={{ uri: other.photo }} style={styles.playPhoto} /> : <View style={[styles.playPhoto, styles.center]}><Glyph name="paw" size={22} /></View>}
                        <Text style={styles.playName} numberOfLines={1}>{other.name}</Text>
                        {state === 'match' ? (
                          <Text style={styles.playDone}>It’s a match 🎉</Text>
                        ) : state === 'pack' ? (
                          <Text style={styles.playDone}>In your Pack ✓</Text>
                        ) : (
                          <PaperButton small label="Add to my Pack" busy={state === 'saving'} onPress={() => void handleAddToPack(other)} />
                        )}
                      </View>
                    );
                  })}
                  <Text style={styles.small}>If they add your dog back, it becomes a match.</Text>
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Long-press a message or photo: report/block for anyone, host tools for the host. */}
      <Modal visible={Boolean(actionFor)} transparent animationType="fade" onRequestClose={() => setActionFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setActionFor(null)} accessibilityLabel="Close">
          <View style={styles.sheet}>
            {actionFor && (
              <>
                <Text style={styles.sheetTitle}>{actionFor.fromUserId === uid ? 'Your message' : nameOf(actionFor.fromUserId)}</Text>
                {actionFor.fromUserId !== uid && <SheetRow label="Report or block…" onPress={() => handleReport(actionFor)} />}
                {isHost && actionFor.kind !== 'photo' && !actionFor.moderated && actionFor.kind !== 'headsup' && (
                  <SheetRow label="Pin message" onPress={() => void handleHost('pin', { messageId: actionFor.id })} />
                )}
                {isHost && actionFor.fromUserId !== uid && actionFor.fromUserId !== 'system' && (
                  <>
                    <SheetRow
                      label={control.mutedUids.includes(actionFor.fromUserId) ? `Unmute ${nameOf(actionFor.fromUserId)}` : `Mute ${nameOf(actionFor.fromUserId)}`}
                      onPress={() => void handleHost(control.mutedUids.includes(actionFor.fromUserId) ? 'unmute' : 'mute', { targetUid: actionFor.fromUserId })}
                    />
                    <SheetRow
                      label={`Remove ${nameOf(actionFor.fromUserId)} from the Pack Day`}
                      danger
                      onPress={() => Alert.alert('Remove from this Pack Day?', 'They lose their spot and the chat, and can’t rejoin.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => void handleHost('remove', { targetUid: actionFor.fromUserId }) },
                      ])}
                    />
                  </>
                )}
                <SheetRow label="Cancel" onPress={() => setActionFor(null)} />
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Chip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.chip, pressed && styles.dim, disabled && styles.dim]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function SheetRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.sheetRow} accessibilityRole="button">
      <Text style={[styles.sheetRowText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerText: { textAlign: 'center' },
  wide: { alignSelf: 'stretch' },
  pad: { padding: 14 },
  body: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink },
  small: { fontFamily: fonts.bold, fontSize: 13, color: colors.brownMid, textAlign: 'center' },
  dim: { opacity: 0.4 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper },
  tabOn: { backgroundColor: colors.note },
  tabText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, padding: 10, borderRadius: 14, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.kraft },
  pinnedText: { flex: 1, fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  list: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  row: { maxWidth: '100%', marginBottom: 2 },
  rowMe: { alignItems: 'flex-end' },
  rowThem: { alignItems: 'flex-start' },
  sender: { fontFamily: fonts.black, fontSize: 12, color: colors.brownMid, marginBottom: 2, marginLeft: 4 },
  chatPhoto: { width: 220, height: 220, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, marginBottom: 10 },
  quickNote: { alignSelf: 'center', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10, borderRadius: 999, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.goldLight },
  quickNoteText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  headsUp: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, marginBottom: 12, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.creamDark },
  headsUpText: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20, color: colors.ink },
  headsUpMeta: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid },
  composer: { backgroundColor: colors.paper, borderTopWidth: 2.5, borderColor: colors.ink },
  chips: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderBottomWidth: 4, borderColor: colors.ink, backgroundColor: colors.paper },
  chipText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12 },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderWidth: 2, borderColor: colors.ink, borderRadius: 23, paddingHorizontal: 16, paddingVertical: 11, fontFamily: fonts.bold, fontSize: 15, color: colors.ink, backgroundColor: '#FFFDF6' },
  send: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  albumContent: { padding: 16, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridCell: { width: '32%', aspectRatio: 1 },
  gridPhoto: { flex: 1, borderRadius: 10, borderWidth: 2, borderColor: colors.ink },
  cardWrap: { alignItems: 'center' },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper },
  playPhoto: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.note },
  playName: { flex: 1, fontFamily: fonts.black, fontSize: 16, color: colors.ink },
  playDone: { fontFamily: fonts.black, fontSize: 14, color: colors.success },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.paper, padding: 16, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 2, borderColor: colors.ink, gap: 4 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginBottom: 4 },
  sheetRow: { minHeight: 48, justifyContent: 'center' },
  sheetRowText: { fontFamily: fonts.black, fontSize: 16, color: colors.ink },
});
