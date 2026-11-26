// mobile/app/lost/now.tsx
// "My dog is lost", for someone in a panic. One question (where was the dog last
// seen), then one big button. Everything else comes from what the owner already
// saved: the lost-dog kit if they made one, otherwise the Pupfile photo and
// details, so an unfinished kit never blocks an alert. After sending, a short
// checklist of what to do next, since nobody remembers it in the moment.
// Reached from Neighbarkhood, the Pupfile header and the app-icon shortcut.
// Mirrors web/app/app/lost/now/page.tsx.

import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { colors, fonts } from '../../constants/theme';
import { BackHeader, Gingham, Paper, PaperButton, Slip } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { getHeroPhoto } from '../../lib/photos';
import { resolveHeroIndex } from '../../lib/coverPhoto';
import { trackEvent } from '../../lib/analytics';
import { onReminders } from '../../lib/reminders';
import { getHouseholdDogsForUser } from '../../lib/household';
import type { SavedDogProfile } from '../../lib/profile';
import { LOST_LIMITS, createLostAlert, getLostKit, medicineNeeds, onMyActiveAlert, type LostAlert, type LostKit } from '../../lib/lostDog';
import { LOST_CHECKLIST } from '../../../shared/lostDog';
import { CONTENT_FILTER_MESSAGE, checkContent } from '../../../shared/contentFilter';
import type { Reminder } from '../../../shared/types';

export default function LostNowScreen() {
  const { user, profile } = useSession();
  const uid = user?.uid;
  // ?dog=<ownerUid>: a sitter or other household member raising the alert for the dog they mind.
  const { dog: dogParam } = useLocalSearchParams<{ dog?: string }>();
  const forOwnerId = typeof dogParam === 'string' && dogParam && dogParam !== uid ? dogParam : undefined;
  const [householdDog, setHouseholdDog] = useState<SavedDogProfile | null | undefined>(undefined);
  const target = forOwnerId ? householdDog : profile;
  const targetId = forOwnerId ?? uid;
  const dogName = target?.name?.trim() || 'Your dog';
  const heroPhoto = getHeroPhoto(target?.photos, resolveHeroIndex(target ?? undefined));
  const [alertId, setAlertId] = useState<string | null>(null);
  const alertPath = (id: string | null) => (forOwnerId && id ? `/lost/${id}` : '/lost');

  const [kit, setKit] = useState<LostKit>({});
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [active, setActive] = useState<LostAlert | null | undefined>(undefined);
  const [lastSeen, setLastSeen] = useState('');
  const [locating, setLocating] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!uid || !forOwnerId) return;
    getHouseholdDogsForUser(uid)
      .then((list) => setHouseholdDog(list.find((d) => d.dogId === forOwnerId)?.profile ?? null))
      .catch(() => setHouseholdDog(null));
  }, [uid, forOwnerId]);

  useEffect(() => {
    if (!uid || !targetId) return;
    if (!forOwnerId) getLostKit(uid).then(setKit).catch(() => {}); // the kit is private to the owner
    const offReminders = onReminders(targetId, setReminders);
    const offAlert = onMyActiveAlert(targetId, setActive);
    return () => { offReminders(); offAlert(); };
  }, [uid, targetId, forOwnerId]);

  // Already lost and not just sent from here: go straight to the open alert.
  useEffect(() => {
    if (active && !sent) router.replace(alertPath(active.id) as never);
  }, [active, sent]);

  const medicines = useMemo(() => medicineNeeds(reminders), [reminders]);
  const photo = kit.photoUrl || heroPhoto || undefined;

  async function useMyLocation() {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { Alert.alert('Location is off', 'Type where you last saw them instead.'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const street = place?.street || place?.name;
      const label = street ? `Near ${street}${place?.city ? `, ${place.city}` : ''}` : place?.city ? `Near ${place.city}` : 'Near where I am now';
      setLastSeen(label.slice(0, LOST_LIMITS.lastSeen));
    } catch {
      Alert.alert('Could not find you', 'Type where you last saw them instead.');
    } finally {
      setLocating(false);
    }
  }

  async function send() {
    if (!uid || sending) return;
    if (lastSeen.trim() && !checkContent(lastSeen).ok) { Alert.alert('Please check the text', CONTENT_FILTER_MESSAGE); return; }
    setSending(true);
    try {
      const id = await createLostAlert(uid, {
        forOwnerId,
        dogName,
        breed: target?.breed,
        size: target?.size,
        markings: kit.markings,
        photoUrl: photo,
        microchipped: !!kit.microchip?.trim(),
        medicines,
        lastSeen,
        city: target?.city,
        state: target?.state,
        lostPin: pin,
      });
      trackEvent('lost_alert_created', { from: forOwnerId ? 'household' : 'panic', hadKit: !!(kit.photoUrl || kit.markings) });
      setAlertId(id);
      setSent(true);
    } catch {
      Alert.alert('Could not send the alert', 'Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (forOwnerId && target === undefined) {
    return <SafeAreaView style={styles.container}><Gingham /><BackHeader title="Lost dog" onBack={() => router.back()} /></SafeAreaView>;
  }

  if (!user || !target) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <BackHeader title="Lost dog" onBack={() => router.back()} />
        <View style={styles.content}><Slip>Create your dog&apos;s profile first, so we have a photo to show neighbors.</Slip></View>
      </SafeAreaView>
    );
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <BackHeader title="Alert sent" onBack={() => router.replace(alertPath(alertId) as never)} />
        <ScrollView contentContainerStyle={styles.content}>
          <Slip tone="ok">Neighbors near {target.city || 'you'} are being alerted about {dogName}.{forOwnerId ? ' Their owner is being told too.' : ''}</Slip>
          <Text style={styles.h2}>What to do now</Text>
          {LOST_CHECKLIST.map((step, i) => (
            <Paper key={step.title} style={styles.step}>
              <Text style={styles.stepTitle}>{i + 1}. {step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
              {step.title.startsWith('Call your microchip') && kit.microchip ? (
                <Text style={styles.chip}>Chip number: {kit.microchip}</Text>
              ) : null}
            </Paper>
          ))}
          <Pressable onPress={() => router.replace(alertPath(alertId) as never)} style={styles.redBtn} accessibilityRole="button">
            <Text style={styles.redBtnText}>Open the alert: poster and sightings</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title="Lost dog" onBack={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.h1}>{dogName} is lost</Text>
          <Text style={styles.calm}>Take a breath. We&apos;ll alert your neighbors with {dogName}&apos;s photo and details.</Text>
          {photo ? <Image source={{ uri: photo }} style={styles.photo} accessibilityLabel={`Photo of ${dogName}`} /> : null}

          <Text style={styles.question}>Where did you last see {dogName}?</Text>
          <TextInput
            style={styles.input}
            value={lastSeen}
            onChangeText={setLastSeen}
            placeholder="e.g. Beaver Park, near the creek"
            placeholderTextColor={colors.brownMid}
            maxLength={LOST_LIMITS.lastSeen}
            accessibilityLabel={`Where did you last see ${dogName}?`}
          />
          <PaperButton small icon="map-marker" label={locating ? 'Finding you…' : pin ? '✓ Neighbors around here are told first' : 'Use where I am now'} busy={locating} onPress={useMyLocation} />

          <Pressable onPress={send} disabled={sending} style={[styles.redBtn, sending && { opacity: 0.6 }]} accessibilityRole="button">
            <Text style={styles.redBtnText}>{sending ? 'Sending…' : 'Alert my neighbors'}</Text>
          </Pressable>
          <Text style={styles.fine}>
            Makes a public poster with a link. Your phone number and address are never shown.
            {!(kit.photoUrl || kit.markings) ? ' You can add markings and a newer photo later.' : ''}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  h1: { fontFamily: fonts.display, fontSize: 32, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, marginTop: 4 },
  calm: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, color: colors.ink },
  photo: { width: '100%', height: 220, borderRadius: 18, borderWidth: 2, borderColor: colors.ink },
  question: { fontFamily: fonts.black, fontSize: 18, color: colors.ink, marginTop: 4 },
  input: {
    borderWidth: 2, borderColor: colors.ink, borderRadius: 14, backgroundColor: colors.paper,
    paddingHorizontal: 14, paddingVertical: 14, fontFamily: fonts.bold, fontSize: 16, color: colors.ink,
  },
  redBtn: {
    minHeight: 60, borderRadius: 30, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.ink,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 8,
  },
  redBtnText: { fontFamily: fonts.display, fontSize: 22, color: '#fff', textAlign: 'center' },
  fine: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.ink, textAlign: 'center' },
  step: { gap: 4 },
  stepTitle: { fontFamily: fonts.black, fontSize: 16, color: colors.ink },
  stepBody: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  chip: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, marginTop: 2 },
});
