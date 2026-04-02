import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import ProfileEditor from '../../components/ProfileEditor';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';

export default function ProfileTab() {
  const { user, profile, profileComplete, saveProfile, signOutUser } = useSession();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  if (editing || !profile) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ProfileEditor
          userId={user.uid}
          initialProfile={profile}
          saving={saving}
          submitLabel={profile ? 'Save changes' : 'Create profile'}
          onSubmit={async (nextProfile) => {
            try {
              setSaving(true);
              await saveProfile(nextProfile);
              setEditing(false);
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

  const photos = (profile.photos ?? []).filter((photo: string) => photo && !photo.startsWith('_'));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {profileComplete ? 'Your mobile profile is ready for Phase 2 discover.' : 'Complete your dog profile to unlock the next phase.'}
        </Text>

        <View style={styles.card}>
          {photos[0] ? <Image source={{ uri: photos[0] }} style={styles.hero} /> : null}
          <View style={styles.cardBody}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.meta}>
              {[profile.breed, profile.age, profile.sex, profile.location].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.badge}>
              {profileComplete ? 'Ready for mobile discover' : 'Profile still needs a few details'}
            </Text>
          </View>
        </View>

        <Pressable style={styles.primaryButton} onPress={() => setEditing(true)}>
          <Text style={styles.primaryText}>Edit profile</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={async () => {
            await signOutUser();
            router.replace('/welcome');
          }}
        >
          <Text style={styles.secondaryText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40 },
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 16,
    ...shadow.card,
  },
  hero: { width: '100%', height: 280, backgroundColor: colors.creamDark },
  cardBody: { padding: 18 },
  name: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.brown,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    marginTop: 6,
  },
  badge: {
    marginTop: 12,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
    ...shadow.button,
  },
  primaryText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.brown,
  },
});
