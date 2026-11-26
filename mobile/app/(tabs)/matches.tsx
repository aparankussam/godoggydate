import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import { PaperCard, PrimaryButton, SkyBackground, StickerDog, StickerHeader } from '../../components/sticker';
import {
  formatMatchTime,
  lastMessageLine,
  subscribeMatches,
  type MatchItem,
} from '../../lib/matches';
import { useSession } from '../../lib/session';
import { effectiveCode, loadDiscoveries, loadDogSnapshots, onDiscoveriesChange } from '../../lib/dogtypeDiscovery';
import type { DogtypeDogMap, DogtypeLedger } from '../../../shared/progress';

function previewLine(match: MatchItem, selfUid: string): string {
  if (!match.chatUnlocked) return 'Open chat to send the first hello';
  if (match.isNew) return 'Open chat and say hello';
  // The calm preview: no emoji-as-icon (a tick or a calendar) in front of the line.
  return lastMessageLine(match, selfUid).replace(/^(?:📅|✅)\s*/u, '');
}

export default function MatchesTab() {
  const { user, loading: sessionLoading } = useSession();
  const uid = user?.uid;
  const [ledger, setLedger] = useState<DogtypeLedger>({});
  const [snapshots, setSnapshots] = useState<DogtypeDogMap>({});
  useEffect(() => {
    if (!uid) return undefined;
    const load = () => {
      void loadDiscoveries(uid).then(setLedger);
      void loadDogSnapshots(uid).then(setSnapshots);
    };
    load();
    return onDiscoveriesChange(load);
  }, [uid]);
  // null until the first load answers, so a refocus keeps showing the list
  // instead of flashing a spinner.
  const [matches, setMatches] = useState<MatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Another account's list must never show while this one loads.
  useEffect(() => {
    setMatches(null);
    setError(null);
  }, [uid]);

  // Live while the tab is focused: a new match or message moves its row to
  // the top without leaving the tab. Re-subscribing on each focus also picks
  // up a block made inside a chat.
  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        setMatches([]);
        setError(null);
        return undefined;
      }

      return subscribeMatches(
        uid,
        (next) => {
          setMatches(next);
          setError(null);
        },
        (err) => {
          // A failed load must not render as "No matches yet" — that tells
          // the user their dog has no matches when the truth is the app
          // couldn't check, and the user has no way to tell the difference.
          console.warn('Failed to load matches:', err);
          setError(err.message || 'Could not load your matches.');
        },
      );
    }, [uid, retryToken]),
  );

  // Check session resolution BEFORE the sign-in gate. On a cold launch,
  // Firebase auth reports `user: null` until it finishes restoring the
  // previous session, so a returning signed-in user briefly saw "Sign in to
  // view matches" flash before their real matches loaded — the app appeared
  // to sign them out on every launch.
  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <SkyBackground />
        <ActivityIndicator color={colors.ink} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <SkyBackground />
        <StickerHeader title="Matches" large style={styles.header} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Sign in to view matches</Text>
          <Text style={styles.emptyBody}>
            Your conversations and matches appear here once you have an active session.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (matches === null && !error) {
    return (
      <SafeAreaView style={styles.center}>
        <SkyBackground />
        <ActivityIndicator color={colors.ink} />
      </SafeAreaView>
    );
  }

  const list = matches ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <SkyBackground />
      <StickerHeader title="Matches" large style={styles.header} />
      {list.length > 0 && !error && (
        <Text style={styles.subtitle}>
          {list.length} {list.length === 1 ? 'dog wants' : 'dogs want'} to meet yours
        </Text>
      )}

      {error ? (
        <View style={styles.emptyWrap}>
          <PaperCard style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Couldn&apos;t load matches</Text>
            <Text style={styles.emptyBody}>{error}</Text>
            <PrimaryButton
              label="Retry"
              onPress={() => {
                setError(null);
                setRetryToken((t) => t + 1);
              }}
              style={styles.emptyBtn}
            />
          </PaperCard>
        </View>
      ) : list.length === 0 ? (
        <View style={styles.emptyWrap}>
          <PaperCard style={styles.emptyCard}>
            <StickerDog size={84} />
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptyBody}>
              A match happens when you and another dog parent both say WOOF to each other&apos;s dogs.
            </Text>
            <Text style={styles.emptyBody}>
              Check Discover for dogs nearby. New neighbors join over time, so it&apos;s worth looking again.
            </Text>
            <PrimaryButton
              label="Go to Discover"
              onPress={() => router.push('/(tabs)/discover')}
              style={styles.emptyBtn}
            />
          </PaperCard>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {list.map((match) => {
            const breed = match.dog.breed && match.dog.breed !== 'Unknown breed' ? match.dog.breed : null;
            const quiet = !match.chatUnlocked || match.isNew;
            return (
              <View key={match.id} style={styles.row}>
                {/* Avatar — its own pressable, to the dog's profile. Previously
                    the whole row (avatar included) went straight to chat, with
                    no way to see a matched dog's profile again. */}
                <Pressable
                  style={styles.avatarWrap}
                  onPress={() => router.push({ pathname: '/dog/[matchId]', params: { matchId: match.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${match.dog.name}'s profile`}
                >
                  {/* heroPhoto, not photos[0] — this thumbnail is the tap target
                      for the dog's profile, which opens on the owner's cover
                      pick, so showing photo 0 here made the two disagree. */}
                  <View style={styles.avatar}>
                    {match.dog.heroPhoto ? (
                      <Image source={{ uri: match.dog.heroPhoto }} style={styles.avatarImg} />
                    ) : (
                      <StickerDog size={52} label={`A drawn sticker dog standing in for ${match.dog.name}`} />
                    )}
                  </View>
                  {match.unread && <View style={styles.unreadDot} />}
                </Pressable>

                {/* Text — its own pressable, to the chat thread. */}
                <Pressable
                  style={({ pressed }) => [styles.rowBody, pressed && styles.rowPressed]}
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[matchId]',
                      params: { matchId: match.id, name: match.dog.name },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Chat with ${match.dog.name}${match.unread ? ', unread messages' : ''}`}
                >
                  <View style={styles.rowText}>
                    <View style={styles.rowTop}>
                      <Text style={styles.dogName} numberOfLines={1}>
                        {match.dog.name}
                      </Text>
                      <View style={styles.rowTopSpacer} />
                      {match.activityAt > 0 && (
                        <Text style={styles.timeLabel}>{formatMatchTime(match.activityAt)}</Text>
                      )}
                    </View>
                    <View style={styles.breedRow}>
                      {breed && (
                        <Text style={styles.breed} numberOfLines={1}>
                          {breed}
                        </Text>
                      )}
                      {(() => {
                        const code = effectiveCode(snapshots, match.dog.id, match.dog.profile) ?? undefined;
                        const e = code ? ledger[code] : undefined;
                        const newType = !!e && e.dogId === match.dog.id && !e.seen;
                        return newType || match.isNew ? (
                          <View style={styles.newTag}>
                            <Text style={styles.newTagText}>{newType ? 'New Dogtype' : 'New match'}</Text>
                          </View>
                        ) : null;
                      })()}
                    </View>
                    <Text
                      style={[
                        styles.lastMessage,
                        quiet && styles.lastMessageNew,
                        match.unread && styles.lastMessageBold,
                      ]}
                      numberOfLines={1}
                    >
                      {previewLine(match, user.uid)}
                    </Text>
                  </View>
                  <View style={[styles.chatCoin, !match.chatUnlocked && styles.chatCoinLocked]}>
                    <Ionicons
                      name={match.chatUnlocked ? 'chatbubble' : 'lock-closed'}
                      size={19}
                      color={colors.ink}
                    />
                  </View>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky, overflow: 'hidden' },
  center: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { paddingTop: 8 },
  subtitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
    paddingHorizontal: 18,
    marginTop: 2,
    marginBottom: 4,
  },
  list: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 32, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 12,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 3,
  },
  rowPressed: { opacity: 0.8 },
  avatarWrap: { position: 'relative', marginRight: 12 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.note,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  unreadDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  rowText: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowTopSpacer: { flex: 1 },
  dogName: {
    fontFamily: fonts.display,
    fontSize: 21,
    lineHeight: 25,
    color: colors.ink,
    flexShrink: 1,
  },
  timeLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brownMid,
    marginLeft: 8,
  },
  breedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  breed: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: colors.brownMid,
  },
  newTag: {
    backgroundColor: colors.kraft,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
    transform: [{ rotate: '-2deg' }],
  },
  newTagText: { fontFamily: fonts.black, fontSize: 12, color: colors.ink },
  lastMessage: {
    marginTop: 3,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.brownMid,
  },
  lastMessageNew: { fontFamily: fonts.black, color: colors.rose },
  lastMessageBold: { fontFamily: fonts.black, color: colors.ink },
  chatCoin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 4,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatCoinLocked: { backgroundColor: colors.creamDark },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  emptyCard: { alignItems: 'center', paddingHorizontal: 22, paddingVertical: 26, gap: 10 },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.brownMid,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyBtn: { alignSelf: 'stretch', marginTop: 8 },
});
