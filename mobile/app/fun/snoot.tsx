// mobile/app/fun/snoot.tsx
// Snoot Boop — a shameless one-tap haptic toy. The dog's hero photo is a
// boop-able snoot: tap it, it squishes, your palm buzzes, a counter climbs, and
// milestone titles unlock. The only number shown is a literal count of YOUR OWN
// taps (see lib/boops.ts) — nothing about the dog is asserted, so it's honest
// candy. Count is local-first + debounced; the network is never in the tap loop.

import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, Easing, Pressable, SafeAreaView, StyleSheet, Text, View, Image } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { getHeroPhoto } from '../../lib/photos';
import { captureAndShare } from '../../lib/shareCard';
import { trackEvent } from '../../lib/analytics';
import {
  loadBoops,
  persistBoops,
  localDateStr,
  milestoneAt,
  nextMilestone,
  crossedMilestone,
  type BoopState,
} from '../../lib/boops';

const CONFETTI = ['🐾', '🐾', '🐾', '✨', '🦴', '🐾'];

export default function SnootScreen() {
  const { user, profile } = useSession();
  const dogId = user?.uid ?? '';
  const dogName = profile?.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(profile?.photos, profile?.ai?.vibeCheck?.heroPhotoIndex);

  const [state, setState] = useState<BoopState>({ allTime: 0, todayCount: 0, todayDate: '' });
  const [ready, setReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const badgeRef = useRef<View>(null);

  // Animations.
  const squish = useRef(new Animated.Value(1)).current;
  const celebrate = useRef(new Animated.Value(0)).current;
  const confettiAnims = useRef(CONFETTI.map(() => new Animated.Value(0))).current;

  // Debounced persistence — never write on every tap.
  const pending = useRef<BoopState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const flushPending = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current) { void persistBoops(dogId, pending.current); pending.current = null; }
  };

  useEffect(() => {
    if (!dogId) return;
    let active = true;
    loadBoops(dogId).then((s) => {
      if (active) {
        setState(s);
        setReady(true);
      }
    });
    trackEvent('snoot_open');
    // Flush pending boops when the app backgrounds — catches the common iOS
    // swipe-away-to-kill, where an unmount cleanup may not run.
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flushPending();
    });
    return () => {
      active = false;
      sub.remove();
      flushPending();
    };
  }, [dogId]);

  const schedulePersist = (next: BoopState) => {
    pending.current = next;
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (pending.current) persistBoops(dogId, pending.current);
      pending.current = null;
    }, 400);
  };

  function runConfetti() {
    confettiAnims.forEach((v) => v.setValue(0));
    Animated.stagger(
      40,
      confettiAnims.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
    Animated.sequence([
      Animated.spring(celebrate, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(celebrate, { toValue: 0, duration: 500, delay: 900, useNativeDriver: true }),
    ]).start();
  }

  function boop() {
    if (!ready) return;
    const before = stateRef.current.allTime;
    const after = before + 1;
    // Recompute the day each tap so a session left open across midnight rolls
    // the daily counter over instead of crediting today's boops to yesterday.
    const today = localDateStr();
    const sameDay = stateRef.current.todayDate === today;
    const next: BoopState = {
      allTime: after,
      todayCount: (sameDay ? stateRef.current.todayCount : 0) + 1,
      todayDate: today,
    };
    setState(next);
    schedulePersist(next);

    // Squish + spring back.
    squish.stopAnimation();
    Animated.sequence([
      Animated.timing(squish, { toValue: 0.86, duration: 70, useNativeDriver: true }),
      Animated.spring(squish, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
    ]).start();

    const milestone = crossedMilestone(before, after);
    if (milestone) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      runConfetti();
      trackEvent('snoot_milestone', { count: milestone.count, title: milestone.title });
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }

  async function shareBadge() {
    if (sharing) return;
    setSharing(true);
    trackEvent('snoot_share_click', { all_time: state.allTime });
    const result = await captureAndShare(badgeRef, `${dogName.toLowerCase().replace(/\s+/g, '-')}-boops.png`, `${dogName}'s snoot`);
    if (result === 'shared') trackEvent('snoot_shared', { all_time: state.allTime, method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  const title = milestoneAt(state.allTime);
  const next = nextMilestone(state.allTime);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#FDF6EE', '#F5E6D3']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Snoot Boop</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.prompt}>Boop the snoot 👆</Text>

        <View style={styles.stage}>
          {/* Confetti burst overlay */}
          {confettiAnims.map((v, i) => {
            const tx = (i - CONFETTI.length / 2) * 34;
            return (
              <Animated.Text
                key={i}
                pointerEvents="none"
                style={[
                  styles.confetti,
                  {
                    opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                    transform: [
                      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -160] }) },
                      { translateX: tx },
                      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) },
                    ],
                  },
                ]}
              >
                {CONFETTI[i]}
              </Animated.Text>
            );
          })}

          <Pressable onPress={boop} disabled={!ready}>
            <Animated.View style={[styles.snoot, { transform: [{ scale: squish }] }]}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.snootPhoto} />
              ) : (
                <Text style={styles.snootEmoji}>🐽</Text>
              )}
            </Animated.View>
          </Pressable>
        </View>

        {/* Milestone title */}
        <Animated.View style={{ transform: [{ scale: celebrate.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }}>
          {title ? (
            <Text style={styles.milestoneTitle}>{title.emoji} {title.title}</Text>
          ) : (
            <Text style={styles.milestoneTitleMuted}>Boop to earn your first title…</Text>
          )}
        </Animated.View>

        {/* Counters */}
        <View style={styles.counters}>
          <View style={styles.counter}>
            <Text style={styles.counterNum}>{state.todayCount.toLocaleString()}</Text>
            <Text style={styles.counterLabel}>today</Text>
          </View>
          <View style={styles.counterDivider} />
          <View style={styles.counter}>
            <Text style={styles.counterNum}>{state.allTime.toLocaleString()}</Text>
            <Text style={styles.counterLabel}>all time</Text>
          </View>
        </View>

        {next && (
          <Text style={styles.nextLine}>
            {(next.count - state.allTime).toLocaleString()} more boop{next.count - state.allTime === 1 ? '' : 's'} to {next.emoji} {next.title}
          </Text>
        )}

        <Pressable
          style={[styles.shareButton, (sharing || state.allTime === 0) && { opacity: 0.6 }]}
          onPress={shareBadge}
          disabled={sharing || state.allTime === 0}
        >
          <Text style={styles.shareText}>{sharing ? 'Rendering…' : '📤 Share the boop count'}</Text>
        </Pressable>
      </View>

      {/* Off-screen capturable badge */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={badgeRef} collapsable={false} style={styles.badge}>
          <LinearGradient colors={['#5C3D2E', '#B45309', '#E8633A']} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
          {photo ? <Image source={{ uri: photo }} style={styles.badgePhoto} /> : <Text style={styles.badgeEmoji}>🐽</Text>}
          <Text style={styles.badgeCount}>{state.allTime.toLocaleString()}</Text>
          <Text style={styles.badgeLabel}>boops and counting</Text>
          <Text style={styles.badgeName}>{dogName}&apos;s snoot{title ? ` · ${title.title}` : ''}</Text>
          <View style={styles.badgeFooter}>
            <Text style={styles.badgeBrand}>GoDoggyDate</Text>
            <Text style={styles.badgeUrl}>godoggydate.com</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const SNOOT = 240;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontFamily: fonts.semibold, fontSize: 16, color: colors.primary, width: 48 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 18 },
  prompt: { fontFamily: fonts.display, fontSize: 22, color: colors.brownMid },
  stage: { width: SNOOT + 40, height: SNOOT + 40, alignItems: 'center', justifyContent: 'center' },
  confetti: { position: 'absolute', fontSize: 30, zIndex: 5 },
  snoot: {
    width: SNOOT,
    height: SNOOT,
    borderRadius: SNOOT / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.white,
    ...shadow.card,
  },
  snootPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  snootEmoji: { fontSize: 120 },
  milestoneTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.primaryDark },
  milestoneTitleMuted: { fontFamily: fonts.body, fontSize: 14, color: colors.brownLight },
  counters: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  counter: { alignItems: 'center' },
  counterNum: { fontFamily: fonts.display, fontSize: 34, color: colors.brown },
  counterLabel: { fontFamily: fonts.bold, fontSize: 11, color: colors.brownLight, textTransform: 'uppercase', letterSpacing: 1 },
  counterDivider: { width: 1, height: 40, backgroundColor: colors.border },
  nextLine: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight, textAlign: 'center' },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    ...shadow.button,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  // Off-screen render for the share badge — laid out but not visible.
  offscreen: { position: 'absolute', top: -1000, left: 0 },
  badge: {
    width: 300,
    height: 380,
    borderRadius: radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 36,
    paddingHorizontal: 20,
  },
  badgePhoto: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' },
  badgeEmoji: { fontSize: 96 },
  badgeCount: { fontFamily: fonts.display, fontSize: 68, color: '#fff', marginTop: 12 },
  badgeLabel: { fontFamily: fonts.bold, fontSize: 13, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: -4 },
  badgeName: { fontFamily: fonts.semibold, fontSize: 15, color: 'rgba(255,255,255,0.92)', marginTop: 14, textAlign: 'center' },
  badgeFooter: {
    position: 'absolute',
    bottom: 18,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 10,
  },
  badgeBrand: { fontFamily: fonts.display, fontSize: 13, color: '#fff' },
  badgeUrl: { fontFamily: fonts.body, fontSize: 10, color: 'rgba(255,255,255,0.6)' },
});
