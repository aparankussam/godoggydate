import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import ProfileEditor from '../components/ProfileEditor';
import { HouseholdJoinForm } from '../components/HouseholdSection';
import { colors, fonts, radius } from '../constants/theme';
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
    Alert.alert('You’re in! 🐾', 'You joined the household. Their dog will show up here shortly.');
  }

  if (!user) return null;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {profile ? 'Finish your dog’s profile' : 'Set up your dog’s profile'}
          </Text>
          <Text style={styles.subtitle}>
            Need a different account? Sign out and return to the welcome screen.
          </Text>
        </View>
        <Pressable
          style={styles.switchButton}
          onPress={async () => {
            await signOutUser();
            router.replace('/welcome');
          }}
        >
          <Text style={styles.switchText}>Switch account</Text>
        </Pressable>

        {householdOnly ? (
          <Pressable style={styles.householdLinkRow} onPress={() => router.replace('/household')}>
            <Text style={styles.householdLink}>← Back to your household</Text>
          </Pressable>
        ) : showJoin ? (
          <View style={styles.joinCard}>
            <Text style={styles.joinTitle}>Join someone’s household</Text>
            <Text style={styles.joinBody}>
              Help look after their dog — reminders and all. No dog of your own needed.
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: colors.cream,
  },
  headerText: {
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.brown,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    lineHeight: 20,
    marginTop: 4,
  },
  switchButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  switchText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primary,
  },
  householdLinkRow: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  householdLink: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDark,
    textDecorationLine: 'underline',
  },
  joinCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 4,
    gap: 6,
  },
  joinTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.brown,
  },
  joinBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.brownLight,
    marginBottom: 4,
  },
});
