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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../../constants/theme';
import { PawCoin, SecondaryButton, StickerDog } from '../../components/sticker';
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
          <StickerDog size={58} label={`${dog.profile.name || 'Household dog'}, no photo yet`} />
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
        <ActivityIndicator color={colors.ink} size="large" />
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
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.ink} />
        }
      >
        <View style={styles.header}>
          <PawCoin size={30} />
          <Text style={styles.title} accessibilityRole="header">Your household</Text>
        </View>

        {householdDogs.length > 0 ? (
          <>
            <Text style={styles.subtitle}>
              {intro} You can see and complete their reminders, no dog of your own required.
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
          <SecondaryButton
            label={profile ? 'Finish your own dog’s profile' : 'Add a dog of your own'}
            onPress={() => router.push('/onboarding')}
          />
          <Pressable style={styles.signOutButton} onPress={handleSignOut} hitSlop={8} accessibilityRole="button">
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  gateContainer: {
    flex: 1,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.ink,
    lineHeight: 20,
    marginBottom: 16,
  },
  dogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.paper,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 14,
    marginBottom: 12,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 4,
  },
  dogPhoto: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.creamDark,
  },
  dogPhotoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.note },
  dogText: { flex: 1 },
  dogName: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  dogDetails: { fontFamily: fonts.black, fontSize: 13.5, color: colors.ink, marginTop: 2 },
  emptyCard: {
    backgroundColor: colors.paper,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 25, color: colors.ink },
  emptyBody: { fontFamily: fonts.bold, fontSize: 13.5, lineHeight: 19, color: colors.brownMid, marginBottom: 4 },
  actions: { gap: 12, marginTop: 8, alignItems: 'stretch' },
  signOutButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  signOutText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
});
