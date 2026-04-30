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
  const { user } = useSession();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) {
        if (active) {
          setMatches([]);
          setLoading(false);
        }
        return () => {
          active = false;
        };
      }

      setLoading(true);
      fetchMatches(user.uid)
        .then((nextMatches) => {
          if (active) setMatches(nextMatches);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [user]),
  );

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

      {matches.length === 0 ? (
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
            <Pressable
              key={match.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                router.push({
                  pathname: '/chat/[matchId]',
                  params: { matchId: match.id, name: match.dog.name },
                })
              }
            >
              {/* Avatar */}
              <View style={styles.avatarWrap}>
                {match.dog.photos[0] ? (
                  <Image source={{ uri: match.dog.photos[0] }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarEmoji}>🐕</Text>
                  </View>
                )}
                {match.unread && <View style={styles.unreadDot} />}
              </View>

              {/* Text */}
              <View style={styles.rowBody}>
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
                    : 'Unlock chat to start messaging'}
                </Text>
              </View>
            </Pressable>
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
});
