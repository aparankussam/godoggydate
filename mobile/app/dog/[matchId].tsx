// mobile/app/dog/[matchId].tsx
// A matched dog's full profile — read-only. Mirrors
// web/app/app/dog/[matchId]/page.tsx. Before this screen existed, tapping a
// dog on the Matches list or in the chat header went straight to chat (or
// nowhere) — there was no way to see a matched dog's photos, temperament,
// play styles, or Vibe Check archetype/bio once you'd matched.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../../lib/firebase';
import { useSession } from '../../lib/session';
import { getOtherDogId } from '../../lib/firestoreData';
import { breedConfidencePhrase } from '../../lib/vibeCheck';
import { resolveHeroIndex } from '../../lib/coverPhoto';
import { getRenderablePhotos } from '../../lib/photos';
import VibeTypeCard from '../../components/VibeTypeCard';
import { colors, fonts, radius } from '../../constants/theme';
import type { SavedDogProfile } from '../../lib/profile';

// Mirrors mobile/components/SwipeCard.tsx's heroIndexFor — the photo this
// screen should open on: the owner's cover pick (or AI hero), clamped to the
// real (non-placeholder) photos so a stale index never lands out of range.
function heroIndexFor(photos: string[], profile: SavedDogProfile): number {
  const h = resolveHeroIndex(profile);
  return typeof h === 'number' && h >= 0 && h < photos.length ? h : 0;
}

export default function MatchedDogProfileScreen() {
  const { matchId } = useLocalSearchParams<{ matchId?: string | string[] }>();
  const resolvedMatchId = Array.isArray(matchId) ? matchId[0] : matchId;
  const { user } = useSession();

  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    if (!user || !resolvedMatchId) return;
    let cancelled = false;

    (async () => {
      const db = getFirebase().db;
      try {
        const matchSnap = await getDoc(doc(db, 'matches', resolvedMatchId));
        if (!matchSnap.exists()) {
          if (!cancelled) { setFailed(true); setLoading(false); }
          return;
        }
        const otherDogId = getOtherDogId(matchSnap.data(), user.uid);
        if (!otherDogId) {
          if (!cancelled) { setFailed(true); setLoading(false); }
          return;
        }
        const dogSnap = await getDoc(doc(db, 'dogs', otherDogId));
        if (!cancelled) {
          if (dogSnap.exists()) {
            const data = dogSnap.data() as SavedDogProfile;
            setProfile(data);
            const realPhotos = getRenderablePhotos(data.photos);
            setPhotoIndex(heroIndexFor(realPhotos, data));
          } else {
            setFailed(true);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setFailed(true); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [user, resolvedMatchId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (failed || !profile) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyEmoji}>😕</Text>
        <Text style={styles.emptyTitle}>Couldn&apos;t load this profile</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const photos = getRenderablePhotos(profile.photos);
  const vibeCheck = profile.ai?.vibeCheck;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{profile.name}&apos;s profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          style={styles.hero}
          disabled={photos.length <= 1}
          onPress={() => setPhotoIndex((i) => (i + 1) % photos.length)}
          accessibilityRole={photos.length > 1 ? 'button' : undefined}
          accessibilityLabel={photos.length > 1 ? `Photo ${photoIndex + 1} of ${photos.length}. Tap for next.` : undefined}
        >
          {photos[photoIndex] ? (
            <Image source={{ uri: photos[photoIndex] }} style={styles.heroImage} />
          ) : (
            <Text style={styles.heroEmoji}>🐕</Text>
          )}
          {photos.length > 1 && (
            <View style={styles.photoBars} pointerEvents="none">
              {photos.map((_, i) => (
                <View key={i} style={[styles.photoBar, i === photoIndex && styles.photoBarActive]} />
              ))}
            </View>
          )}
        </Pressable>

        {photos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
            {photos.map((url, i) => (
              <Pressable key={i} onPress={() => setPhotoIndex(i)}>
                <Image
                  source={{ uri: url }}
                  style={[styles.photoStripItem, i === photoIndex && styles.photoStripItemActive]}
                />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.meta}>
          {[profile.breed, profile.age, profile.size, profile.location].filter(Boolean).join(' · ')}
        </Text>
        {typeof profile.foundingPackNumber === 'number' && (
          <View style={styles.foundingBadge}>
            <Text style={styles.foundingBadgeText}>🏅 Founding Pack #{profile.foundingPackNumber}</Text>
          </View>
        )}

        {vibeCheck && (
          <View style={styles.vibeSection}>
            <VibeTypeCard archetype={vibeCheck.archetype} />
            {vibeCheck.bio && <Text style={styles.bio}>“{vibeCheck.bio}”</Text>}
            {vibeCheck.breedGuess && (
              <Text style={styles.muttMeter}>
                🔍 AI&apos;s read: {vibeCheck.breedGuess.name} · {breedConfidencePhrase(vibeCheck.breedGuess.confidence)}
              </Text>
            )}
          </View>
        )}

        {(profile.temperament?.length ?? 0) > 0 && (
          <View style={styles.tagSection}>
            <Text style={styles.sectionLabel}>Temperament</Text>
            <View style={styles.tagRow}>
              {profile.temperament!.map((t) => (
                <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
              ))}
            </View>
          </View>
        )}
        {(profile.playStyles?.length ?? 0) > 0 && (
          <View style={styles.tagSection}>
            <Text style={styles.sectionLabel}>Play style</Text>
            <View style={styles.tagRow}>
              {profile.playStyles!.map((p) => (
                <View key={p} style={styles.tag}><Text style={styles.tagText}>{p}</Text></View>
              ))}
            </View>
          </View>
        )}

        <Pressable
          style={styles.messageBtn}
          onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: resolvedMatchId ?? '', name: profile.name } })}
        >
          <Text style={styles.messageBtnText}>💬 Message {profile.name}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, marginBottom: 16, textAlign: 'center' },
  backLink: { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 24, paddingVertical: 10 },
  backLinkText: { fontFamily: fonts.bold, fontSize: 14, color: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', backgroundColor: colors.cream,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: colors.brownLight, marginTop: -2 },
  headerTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.brown, marginLeft: 4 },
  content: { padding: 18, paddingBottom: 40 },
  hero: {
    width: '100%', aspectRatio: 1, borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.creamDark, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  heroImage: { width: '100%', height: '100%' },
  heroEmoji: { fontSize: 72 },
  photoBars: {
    position: 'absolute', top: 12, left: 10, right: 10,
    flexDirection: 'row', gap: 4,
  },
  photoBar: { flex: 1, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.38)' },
  photoBarActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  photoStrip: { marginBottom: 16 },
  photoStripItem: { width: 84, height: 84, borderRadius: radius.md, marginRight: 8, backgroundColor: colors.creamDark },
  photoStripItemActive: { borderWidth: 2, borderColor: colors.primary },
  name: { fontFamily: fonts.display, fontSize: 28, color: colors.brown },
  meta: { fontFamily: fonts.body, fontSize: 14, color: colors.brownLight, marginTop: 4 },
  foundingBadge: {
    alignSelf: 'flex-start', marginTop: 10, backgroundColor: 'rgba(245,183,49,0.15)',
    borderWidth: 1, borderColor: 'rgba(245,183,49,0.4)', borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  foundingBadgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown },
  vibeSection: { marginTop: 18, gap: 10 },
  bio: { fontFamily: fonts.body, fontSize: 14, fontStyle: 'italic', color: colors.brownMid, lineHeight: 20, paddingHorizontal: 2 },
  muttMeter: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, paddingHorizontal: 2 },
  tagSection: { marginTop: 18 },
  sectionLabel: {
    fontFamily: fonts.bold, fontSize: 11, color: colors.brownLight,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 7,
  },
  tagText: { fontFamily: fonts.body, fontSize: 13, color: colors.brown },
  messageBtn: {
    marginTop: 24, backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 15, alignItems: 'center',
  },
  messageBtnText: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
});
