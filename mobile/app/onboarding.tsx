import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import ProfileEditor from '../components/ProfileEditor';
import { HouseholdJoinForm } from '../components/HouseholdSection';
import { colors, fonts, radius } from '../constants/theme';
import { PawCoin } from '../components/sticker';
import { useSession } from '../lib/session';
import { clearPendingHouseholdInvite, peekPendingHouseholdInvite } from '../lib/household';

export default function OnboardingScreen() {
  const {
    user,
    loading,
    profile,
    profileComplete,
    householdOnly,
    saveProfile,
    signOutUser,
    refreshSession,
  } = useSession();
  const [saving, setSaving] = useState(false);
  // An invite link opened before sign-in leaves its code here; open the join
  // form with it filled in so they don't have to find it again.
  const [pendingCode] = useState(() => peekPendingHouseholdInvite());
  const [showJoin, setShowJoin] = useState(Boolean(pendingCode));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/welcome');
    else if (profileComplete) router.replace('/(tabs)/discover');
  }, [loading, profileComplete, user]);

  async function handleJoined() {
    clearPendingHouseholdInvite();
    try {
      const snapshot = await refreshSession();
      if (snapshot.householdOnly) {
        router.replace('/household');
        return;
      }
    } catch (error) {
      console.warn('[Onboarding] could not reload the household after joining', error);
    }
    setShowJoin(false);
    Alert.alert('You’re in!', 'You joined the household. Their dog will show up here shortly.');
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <PawCoin size={30} />
          <Text style={styles.wordmark}>GoDoggyDate</Text>
          <Pressable
            style={styles.switchButton}
            accessibilityRole="button"
            accessibilityHint="Signs out and returns to the welcome screen"
            onPress={async () => {
              await signOutUser();
              router.replace('/welcome');
            }}
          >
            <Text style={styles.switchText}>Switch account</Text>
          </Pressable>
        </View>

        {householdOnly ? (
          <Pressable style={styles.householdLinkRow} onPress={() => router.replace('/household')}>
            <Ionicons name="chevron-back" size={16} color={colors.ink} />
            <Text style={styles.householdLink}>Back to your household</Text>
          </Pressable>
        ) : showJoin ? (
          <View style={styles.joinCard}>
            <Text style={styles.joinTitle}>Join someone’s household</Text>
            <Text style={styles.joinBody}>
              Help look after their dog, reminders and all. No dog of your own needed.
            </Text>
            <HouseholdJoinForm
              initialCode={pendingCode}
              onJoined={handleJoined}
              onCancel={() => setShowJoin(false)}
            />
          </View>
        ) : (
          <Pressable style={styles.householdLinkRow} onPress={() => setShowJoin(true)} accessibilityRole="button">
            <Text style={styles.householdLink}>Joining someone’s household? Enter your invite code</Text>
          </Pressable>
        )}
      </View>
      <ProfileEditor
        userId={user.uid}
        initialProfile={profile}
        saving={saving}
        submitLabel="Save profile"
        onSubmit={async (nextProfile) => {
          try {
            setSaving(true);
            await saveProfile(nextProfile);
            router.replace('/(tabs)/discover');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'We could not save your dog profile. Please try again.';
            Alert.alert('Save failed', message);
          } finally {
            setSaving(false);
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.sky,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
    backgroundColor: colors.sky,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  wordmark: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  switchButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 4,
    borderRadius: radius.full,
  },
  switchText: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.ink,
  },
  householdLinkRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
  },
  householdLink: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  joinCard: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 14,
    marginTop: 6,
    marginBottom: 6,
    gap: 6,
  },
  joinTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: colors.ink,
  },
  joinBody: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.brownMid,
    marginBottom: 4,
  },
});
