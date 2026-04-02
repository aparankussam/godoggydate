import { Alert, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import ProfileEditor from '../components/ProfileEditor';
import { useSession } from '../lib/session';

export default function OnboardingScreen() {
  const { user, profile, saveProfile } = useSession();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) router.replace('/welcome');
  }, [user]);

  if (!user) return null;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ProfileEditor
        userId={user.uid}
        initialProfile={profile}
        saving={saving}
        submitLabel="Save profile"
        onSubmit={async (nextProfile) => {
          try {
            setSaving(true);
            await saveProfile(nextProfile);
            router.replace('/(tabs)/profile');
          } catch {
            Alert.alert('Save failed', 'We could not save your dog profile. Please try again.');
          } finally {
            setSaving(false);
          }
        }}
      />
    </SafeAreaView>
  );
}
