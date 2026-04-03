import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import ProfileEditor from '../components/ProfileEditor';
import { colors, fonts } from '../constants/theme';
import { useSession } from '../lib/session';

export default function OnboardingScreen() {
  const { user, profile, profileComplete, saveProfile, signOutUser } = useSession();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) router.replace('/welcome');
    else if (profileComplete) router.replace('/(tabs)/discover');
  }, [profileComplete, user]);

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
});
