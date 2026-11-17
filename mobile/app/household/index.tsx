// mobile/app/household/index.tsx
// Home for someone invited onto a dog's household who has no finished dog of
// their own. Mirrors the household-only view on web/app/app/profile/page.tsx:
// the dog(s) they help with, and those dogs' reminders, which they can see and
// mark Done. firestore.rules already lets a household member read the dog doc
// and read/write dogs/{dogId}/reminders.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { onReminders } from '../../lib/reminders';
import { resolveHeroIndex } from '../../lib/coverPhoto';
import type { HouseholdDog } from '../../lib/household';
import RemindersSection from '../../components/RemindersSection';
import { HouseholdJoinForm } from '../../components/HouseholdSection';
import type { Reminder } from '../../../shared/types';

const AGE_LABELS: Record<string, string> = { puppy: 'Puppy', adult: 'Adult', senior: 'Senior' };

function DogSummary({ dog }: { dog: HouseholdDog }) {
  const photos = (dog.profile.photos ?? []).filter((photo) => photo && !photo.startsWith('_'));
  const heroIndex = resolveHeroIndex(dog.profile) ?? 0;
  const photo = photos[Math.min(heroIndex, photos.length - 1)] ?? null;
  const details = [dog.profile.breed, dog.profile.age ? AGE_LABELS[dog.profile.age] : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.dogCard}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.dogPhoto} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.dogPhoto, styles.dogPhotoEmpty]}>
          <Text style={styles.dogPhotoEmoji}>🐕</Text>
        </View>
      )}
      <View style={styles.dogText}>
        <Text style={styles.dogName} numberOfLines={1}>{dog.profile.name || 'Your household dog'}</Text>
        {details ? <Text style={styles.dogDetails} numberOfLines={1}>{details}</Text> : null}
      </View>
    </View>
  );
}

export default function HouseholdScreen() {
  const {
    user,
    loading,
    profile,
    profileComplete,
    householdDogs,
    refreshSession,
    signOutUser,
  } = useSession();
  const [reminders, setReminders] = useState<Record<string, Reminder[]>>({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/welcome');
    // They've finished a dog profile of their own since: the full app is theirs.
    else if (profileComplete) router.replace('/(tabs)/discover');
  }, [loading, profileComplete, user]);

  // Live reminders per household dog, same as web.
  const dogIdsKey = householdDogs.map((dog) => dog.dogId).join(',');
  useEffect(() => {
    if (!dogIdsKey) return;
    const unsubs = dogIdsKey.split(',').map((dogId) =>
      onReminders(dogId, (list) => setReminders((prev) => ({ ...prev, [dogId]: list }))),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [dogIdsKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSession();
    } catch {
      // Keep showing what we have.
    } finally {
      setRefreshing(false);
    }
  }, [refreshSession]);

  async function handleSignOut() {
    await signOutUser();
    router.replace('/welcome');
  }

  if (loading || !user) {
    return (
      <SafeAreaView style={styles.gateContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const intro = householdDogs.length === 1
    ? `You help look after ${householdDogs[0].profile.name || 'this dog'}.`
    : 'You help look after these dogs.';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        <Text style={styles.title}>Your household</Text>

        {householdDogs.length > 0 ? (
          <>
            <Text style={styles.subtitle}>
              {intro} You can see and complete their reminders — no dog of your own required.
            </Text>
            {householdDogs.map((dog) => (
              <View key={dog.dogId}>
                <DogSummary dog={dog} />
                <RemindersSection dogId={dog.dogId} reminders={reminders[dog.dogId] ?? []} />
              </View>
            ))}
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>You&apos;re not in a household right now</Text>
            <Text style={styles.emptyBody}>
              The owner may have removed you. Ask them for a new invite code, or set up a dog of your own.
            </Text>
            <HouseholdJoinForm onJoined={async () => { await refreshSession(); }} />
          </View>
        )}

        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={() => router.push('/onboarding')}>
            <Text style={styles.secondaryText}>
              {profile ? 'Finish your own dog’s profile' : 'Add a dog of your own'}
            </Text>
          </Pressable>
          <Pressable style={styles.signOutButton} onPress={handleSignOut} hitSlop={8}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40 },
  gateContainer: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.brown,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    lineHeight: 20,
    marginBottom: 20,
  },
  dogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 14,
    marginBottom: 12,
    ...shadow.card,
  },
  dogPhoto: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.creamDark,
  },
  dogPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  dogPhotoEmoji: { fontSize: 30 },
  dogText: { flex: 1 },
  dogName: { fontFamily: fonts.display, fontSize: 22, color: colors.brown },
  dogDetails: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight, marginTop: 2 },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.brown },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.brownLight, marginBottom: 4 },
  actions: { gap: 12, marginTop: 8, alignItems: 'stretch' },
  secondaryButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.brown },
  signOutButton: { alignSelf: 'center', paddingVertical: 8 },
  signOutText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brownLight },
});
