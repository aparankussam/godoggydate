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
import { getOtherDogId, type MatchIdentityLike } from '../../lib/firestoreData';
import { openReportSheet } from '../../lib/reports';
import { breedConfidencePhrase } from '../../lib/vibeCheck';
import { resolveHeroIndex } from '../../lib/coverPhoto';
import { getRenderablePhotos } from '../../lib/photos';
import { Ionicons } from '@expo/vector-icons';
import VibeTypeCard from '../../components/VibeTypeCard';
import { PrimaryButton, SkyBackground, StickerDog, Tape } from '../../components/sticker';
import { colors, fonts } from '../../constants/theme';
import type { SavedDogProfile } from '../../lib/profile';
import { foundingBadgeLabel } from '../../../shared/founding';
import { temperamentLabel } from '../../../shared/temperament';

// Mirrors mobile/components/SwipeCard.tsx's heroIndexFor — the photo this
// screen should open on: the owner's cover pick (or AI hero), clamped to the
// real (non-placeholder) photos so a stale index never lands out of range.
function heroIndexFor(photos: string[], profile: SavedDogProfile): number {
  const h = resolveHeroIndex(profile);
  return typeof h === 'number' && h >= 0 && h < photos.length ? h : 0;
}

/** The other PERSON on the match — who a report or block is about. Reads the
 *  user-id fields (current and legacy), as web's dog page does, and falls back
 *  to the dog id, which is the owner's uid for every dogs/{uid} doc. */
function getOtherUserId(data: MatchIdentityLike, currentUserId: string, otherDogId: string): string {
  if (data.dog1UserId === currentUserId && data.dog2UserId) return data.dog2UserId;
  if (data.dog2UserId === currentUserId && data.dog1UserId) return data.dog1UserId;
  if (data.userAId === currentUserId && data.userBId) return data.userBId;
  if (data.userBId === currentUserId && data.userAId) return data.userAId;
  return otherDogId;
}

export default function MatchedDogProfileScreen() {
  const { matchId } = useLocalSearchParams<{ matchId?: string | string[] }>();
  const resolvedMatchId = Array.isArray(matchId) ? matchId[0] : matchId;
  const { user, loading: sessionLoading } = useSession();

  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    // Signed out, or no match id: there's nothing to load, so stop the
    // spinner and let the states below say why. This used to return early
    // with `loading` still true, which spun forever.
    if (sessionLoading) return;
    if (!user || !resolvedMatchId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    (async () => {
      const db = getFirebase().db;
      try {
        const matchSnap = await getDoc(doc(db, 'matches', resolvedMatchId));
        if (!matchSnap.exists()) {
          if (!cancelled) { setFailed(true); setLoading(false); }
          return;
        }
        const matchData = matchSnap.data() as MatchIdentityLike;
        const otherDogId = getOtherDogId(matchData, user.uid);
        if (!otherDogId) {
          if (!cancelled) { setFailed(true); setLoading(false); }
          return;
        }
        if (!cancelled) setOtherUserId(getOtherUserId(matchData, user.uid, otherDogId));
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
  }, [sessionLoading, user, resolvedMatchId]);

  if (sessionLoading || loading) {
    return (
      <SafeAreaView style={styles.center}>
        <SkyBackground />
        <ActivityIndicator color={colors.ink} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.center}>
        <SkyBackground />
        <StickerDog size={72} />
        <Text style={styles.emptyTitle}>Sign in to view this profile</Text>
        <PrimaryButton label="Sign in" onPress={() => router.replace('/welcome')} style={styles.backLink} />
      </SafeAreaView>
    );
  }

  if (failed || !profile) {
    return (
      <SafeAreaView style={styles.center}>
        <SkyBackground />
        <Text style={styles.emptyTitle}>Couldn&apos;t load this profile</Text>
        <PrimaryButton label="Go back" onPress={() => router.back()} style={styles.backLink} />
      </SafeAreaView>
    );
  }

  const photos = getRenderablePhotos(profile.photos);
  const vibeCheck = profile.ai?.vibeCheck;
  const signedInUid = user.uid;

  function handleSafetyMenu() {
    if (!otherUserId || !profile) return;
    openReportSheet(
      { reporterId: signedInUid, targetUserId: otherUserId, source: 'profile', matchId: resolvedMatchId },
      {
        name: profile.name,
        // A blocked match disappears from Matches, so go back there rather
        // than to a chat (or this page) with someone you've just blocked.
        onBlocked: () => router.dismissTo('/(tabs)/matches'),
      },
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{profile.name}&apos;s profile</Text>
        {otherUserId && (
          <Pressable
            style={styles.moreBtn}
            onPress={handleSafetyMenu}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Report or block ${profile.name}`}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
          </Pressable>
        )}
      </View>

      <View style={styles.page}>
        <SkyBackground />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.polaroid}>
            <Tape style={styles.tape} />
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
                <StickerDog size={140} label={`A drawn sticker dog standing in for ${profile.name}`} />
              )}
              {photos.length > 1 && (
                <View style={styles.photoBars} pointerEvents="none">
                  {photos.map((_, i) => (
                    <View key={i} style={[styles.photoBar, i === photoIndex && styles.photoBarActive]} />
                  ))}
                </View>
              )}
            </Pressable>
          </View>

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
              <Text style={styles.foundingBadgeText}>{foundingBadgeLabel(profile.foundingPackNumber)}</Text>
            </View>
          )}

          {vibeCheck && (
            <View style={styles.vibeSection}>
              <VibeTypeCard archetype={vibeCheck.archetype} />
              {vibeCheck.bio && (
                <View>
                  {/* Says who wrote it: the bio is in the dog's voice, but the
                      owner didn't type it. Mirrors the web dog page. */}
                  <Text style={styles.aiLabel}>Written by AI from their photos</Text>
                  <Text style={styles.bio}>“{vibeCheck.bio}”</Text>
                </View>
              )}
              {vibeCheck.breedGuess && (
                <Text style={styles.muttMeter}>
                  AI&apos;s read: {vibeCheck.breedGuess.name} · {breedConfidencePhrase(vibeCheck.breedGuess.confidence)}
                </Text>
              )}
            </View>
          )}

          {(profile.temperament?.length ?? 0) > 0 && (
            <View style={styles.tagSection}>
              <Text style={styles.sectionLabel}>Temperament</Text>
              <View style={styles.tagRow}>
                {profile.temperament!.map(temperamentLabel).map((t) => (
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

          <PrimaryButton
            label={`Message ${profile.name}`}
            icon={<Ionicons name="chatbubble" size={20} color={colors.ink} />}
            onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: resolvedMatchId ?? '', name: profile.name } })}
            style={styles.messageBtn}
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  page: { flex: 1, backgroundColor: colors.sky, overflow: 'hidden' },
  center: { flex: 1, overflow: 'hidden', backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink, textAlign: 'center' },
  backLink: { alignSelf: 'stretch', marginTop: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', minHeight: 62, paddingLeft: 4, paddingRight: 10, gap: 6,
    borderBottomWidth: 2, borderBottomColor: colors.ink, backgroundColor: colors.paper,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.ink },
  moreBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.ink,
    backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: 16, paddingTop: 22, paddingBottom: 40 },
  // A taped polaroid, tilted a little, like the Discover card.
  polaroid: {
    backgroundColor: colors.paper, borderRadius: 6, borderWidth: 1.5, borderColor: colors.ink,
    padding: 8, paddingBottom: 14, marginBottom: 14, transform: [{ rotate: '-1.2deg' }],
    shadowColor: colors.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 0, elevation: 5,
  },
  tape: { top: -10, left: 34 },
  hero: {
    width: '100%', aspectRatio: 1, borderRadius: 3, borderWidth: 1.5, borderColor: colors.ink, overflow: 'hidden',
    backgroundColor: colors.note, alignItems: 'center', justifyContent: 'center',
  },
  heroImage: { width: '100%', height: '100%' },
  photoBars: {
    position: 'absolute', top: 12, left: 10, right: 10,
    flexDirection: 'row', gap: 4,
  },
  photoBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,249,236,0.45)' },
  photoBarActive: { backgroundColor: colors.paper },
  photoStrip: { marginBottom: 16 },
  photoStripItem: {
    width: 76, height: 76, borderRadius: 10, marginRight: 8, backgroundColor: colors.note,
    borderWidth: 2, borderColor: colors.ink,
  },
  photoStripItemActive: { borderWidth: 3, borderColor: colors.ink, opacity: 1 },
  name: { fontFamily: fonts.display, fontSize: 36, lineHeight: 40, color: colors.ink },
  meta: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink, marginTop: 2 },
  foundingBadge: {
    alignSelf: 'flex-start', marginTop: 10, backgroundColor: colors.paper,
    borderWidth: 2, borderColor: colors.ink, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 4, transform: [{ rotate: '-2deg' }],
  },
  foundingBadgeText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  vibeSection: { marginTop: 18, gap: 10 },
  aiLabel: { fontFamily: fonts.black, fontSize: 12.5, color: colors.ink, marginBottom: 2, paddingHorizontal: 2 },
  bio: { fontFamily: fonts.bold, fontSize: 15, fontStyle: 'italic', color: colors.ink, lineHeight: 21, paddingHorizontal: 2 },
  muttMeter: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, paddingHorizontal: 2 },
  tagSection: { marginTop: 18 },
  sectionLabel: { fontFamily: fonts.black, fontSize: 13, color: colors.ink, marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    borderRadius: 999, borderWidth: 2, borderColor: colors.ink,
    backgroundColor: colors.paper, paddingHorizontal: 12, paddingVertical: 6,
  },
  tagText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  messageBtn: { marginTop: 26 },
});
