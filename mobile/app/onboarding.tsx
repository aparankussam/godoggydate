import { Alert, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';
import ProfileEditor from '../components/ProfileEditor';
import { useSession } from '../lib/session';

export default function OnboardingScreen() {
  const { user, profile, saveProfile } = useSession();

  useEffect(() => {
    if (!user) router.replace('/welcome');
  }, [user]);

  if (!user) return null;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ProfileEditor
        userId={user.uid}
        initialProfile={profile}
        saving={false}
        submitLabel="Save profile"
        onSubmit={async (nextProfile) => {
          try {
            await saveProfile(nextProfile);
            router.replace('/(tabs)/profile');
          } catch {
            Alert.alert('Save failed', 'We could not save your dog profile. Please try again.');
          }
        }}
      />
    </SafeAreaView>
  );
}
