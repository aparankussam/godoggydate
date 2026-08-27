import { useCallback, useState } from 'react';
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
import { colors, fonts, radius } from '../../constants/theme';
import { fetchMatches, formatMatchTime, type MatchItem } from '../../lib/matches';
import { useSession } from '../../lib/session';

export default function MatchesTab() {
  const { user, loading: sessionLoading } = useSession();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) {
        if (active) {
          setMatches([]);
          setError(null);
          setLoading(false);
        }
        return () => {
          active = false;
        };
      }

      setLoading(true);
      setError(null);
      fetchMatches(user.uid)
        .then((nextMatches) => {
          if (active) setMatches(nextMatches);
        })
        .catch((err) => {
          // A failed load must not render as "No matches yet" — that tells
          // the user their dog has no matches when the truth is the app
          // couldn't check, and the user has no way to tell the difference.
          console.warn('Failed to load matches:', err);
          if (active) setError(err instanceof Error ? err.message : 'Could not load your matches.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [user, retryToken]),
  );

  // Check session resolution BEFORE the sign-in gate. On a cold launch,
  // Firebase auth reports `user: null` until it finishes restoring the
  // previous session, so a returning signed-in user briefly saw "Sign in to
  // view matches" flash before their real matches loaded — the app appeared
  // to sign them out on every launch.
  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Sign in to view matches</Text>
        <Text style={styles.emptyBody}>
          Your conversations and matches appear here once you have an active session.
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Matches</Text>
        <Text style={styles.subtitle}>
          {matches.length > 0
            ? `${matches.length} pup${matches.length !== 1 ? 's' : ''} want to meet`
            : 'Keep swiping to get matches'}
        </Text>
      </View>

      {error ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>😕</Text>
          <Text style={styles.emptyTitle}>Couldn&apos;t load matches</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => setRetryToken((t) => t + 1)}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>💛</Text>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyBody}>
            Head to Discover and start swiping — your first match could be right around the corner.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {matches.map((match) => (
            <View key={match.id} style={styles.row}>
              {/* Avatar — its own pressable, to the dog's profile. Previously
                  the whole row (avatar included) went straight to chat, with
                  no way to see a matched dog's profile again. */}
              <Pressable
                style={styles.avatarWrap}
                onPress={() => router.push({ pathname: '/dog/[matchId]', params: { matchId: match.id } })}
              >
                {/* heroPhoto, not photos[0] — this thumbnail is the tap target
                    for the dog's profile, which opens on the owner's cover
                    pick, so showing photo 0 here made the two disagree. */}
                {match.dog.heroPhoto ? (
                  <Image source={{ uri: match.dog.heroPhoto }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarEmoji}>🐕</Text>
                  </View>
                )}
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
              >
                <View style={styles.rowTop}>
                  <Text style={[styles.dogName, match.unread && styles.dogNameBold]} numberOfLines={1}>
                    {match.dog.name}
                  </Text>
                  {match.lastMessageAt && (
                    <Text style={styles.timeLabel}>
                      {formatMatchTime(match.lastMessageAt)}
                    </Text>
                  )}
                </View>
                <Text
                  style={[styles.lastMessage, match.unread && styles.lastMessageBold]}
                  numberOfLines={1}
                >
                  {match.chatUnlocked
                    ? (match.lastMessage ?? 'Say hello! 👋')
                    : 'Open chat to send the first hello'}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  center: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.brown,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brownLight,
    marginTop: 2,
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rowPressed: { opacity: 0.75 },
  avatarWrap: { position: 'relative', marginRight: 14 },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.creamDark,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 26 },
  unreadDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },
  rowBody: { flex: 1 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  dogName: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.brown,
    flex: 1,
  },
  dogNameBold: { fontFamily: fonts.bold },
  timeLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    marginLeft: 8,
  },
  lastMessage: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
  },
  lastMessageBold: {
    fontFamily: fonts.semibold,
    color: colors.brownMid,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.brown,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#fff',
  },
});
