// mobile/app/lost/index.tsx
// Lost dog: the owner's kit, the one-tap "My dog is lost", and, while an alert is
// open, the poster, the sightings and the "Found" button. FREE for everyone.
//
// The kit (recent photo, microchip number, vet phone, markings) is saved ahead of
// time at users/{uid}/private/lostKit. Medicine needs come from the Daily medicine
// reminders, and only a "Needs <label> daily" line goes on the public poster. The
// microchip number and vet phone are never published.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts } from '../../constants/theme';
import { BackHeader, Gingham, Heading, Paper, PaperButton, PinkButton, Slip } from '../../components/pack/kit';
import WantedPosterCard from '../../components/WantedPosterCard';
import { useSession } from '../../lib/session';
import { getHeroPhoto } from '../../lib/photos';
import { resolveHeroIndex } from '../../lib/coverPhoto';
import { uploadDogPhoto } from '../../lib/storage';
import { captureAndShare } from '../../lib/shareCard';
import { trackEvent } from '../../lib/analytics';
import { onReminders } from '../../lib/reminders';
import {
  LOST_LIMITS,
  createLostAlert,
  getLostKit,
  lostAlertUrl,
  lostFacts,
  markDogFound,
  medicineNeeds,
  onMyActiveAlert,
  onSightings,
  saveLostKit,
  type LostAlert,
  type Sighting,
} from '../../lib/lostDog';
import { timeAgo } from '../../../shared/lostDog';
import { CONTENT_FILTER_MESSAGE, checkContent } from '../../../shared/contentFilter';
import type { Reminder } from '../../../shared/types';

export default function LostDogScreen() {
  const { user, profile } = useSession();
  const dogName = profile?.name?.trim() || 'Your dog';
  const heroPhoto = getHeroPhoto(profile?.photos, resolveHeroIndex(profile));

  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [markings, setMarkings] = useState('');
  const [microchip, setMicrochip] = useState('');
  const [vetPhone, setVetPhone] = useState('');
  const [lastSeen, setLastSeen] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [active, setActive] = useState<LostAlert | null | undefined>(undefined);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [busy, setBusy] = useState<'' | 'kit' | 'lost' | 'found' | 'photo' | 'share'>('');
  const [savedNote, setSavedNote] = useState('');
  const cardRef = useRef<View>(null);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    getLostKit(uid).then((kit) => {
      setPhotoUrl(kit.photoUrl || undefined);
      setMarkings(kit.markings ?? '');
      setMicrochip(kit.microchip ?? '');
      setVetPhone(kit.vetPhone ?? '');
    }).catch(() => {});
    const offReminders = onReminders(uid, setReminders);
    const offAlert = onMyActiveAlert(uid, setActive);
    return () => { offReminders(); offAlert(); };
  }, [uid]);

  useEffect(() => {
    if (!active) { setSightings([]); return; }
    return onSightings(active.id, setSightings);
  }, [active?.id]);

  const medicines = useMemo(() => medicineNeeds(reminders), [reminders]);
  const kitPhoto = photoUrl || heroPhoto || undefined;

  function problemWithText(): string | null {
    for (const t of [markings, lastSeen]) if (t.trim() && !checkContent(t).ok) return CONTENT_FILTER_MESSAGE;
    return null;
  }

  async function pickPhoto(source: 'camera' | 'library') {
    if (!uid) return;
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow access to add a recent photo.'); return; }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      const asset = !result.canceled ? result.assets?.[0] : undefined;
      if (!asset?.uri) return;
      setBusy('photo');
      setPhotoUrl(await uploadDogPhoto(uid, asset.uri, asset.fileName ?? 'lost-kit.jpg', asset.mimeType ?? 'image/jpeg'));
    } catch {
      Alert.alert('Could not add the photo', 'Please try again.');
    } finally {
      setBusy('');
    }
  }

  function choosePhoto() {
    Alert.alert('Recent photo', 'A clear, recent photo is what people will look for.', [
      { text: 'Take a photo', onPress: () => pickPhoto('camera') },
      { text: 'Choose from library', onPress: () => pickPhoto('library') },
      ...(heroPhoto ? [{ text: `Use ${dogName}'s profile photo`, onPress: () => setPhotoUrl(heroPhoto) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  async function saveKit(quiet = false) {
    if (!uid) return false;
    const problem = problemWithText();
    if (problem) { Alert.alert('Please check the text', problem); return false; }
    setBusy('kit');
    try {
      await saveLostKit(uid, { photoUrl: kitPhoto, markings, microchip, vetPhone });
      if (!quiet) { setSavedNote('Saved. It stays private until you need it.'); trackEvent('lost_kit_saved', {}); }
      return true;
    } catch {
      Alert.alert('Could not save', 'Please try again.');
      return false;
    } finally {
      setBusy('');
    }
  }

  function confirmLost() {
    Alert.alert(
      `Report ${dogName} lost?`,
      `This sends an alert to people near ${profile?.city || 'you'} and makes a public poster with a link. Your phone number and address are never shown.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'My dog is lost', style: 'destructive', onPress: reportLost },
      ],
    );
  }

  async function reportLost() {
    if (!uid || busy) return;
    if (!(await saveKit(true))) return;
    setBusy('lost');
    try {
      await createLostAlert(uid, {
        dogName,
        breed: profile?.breed,
        size: profile?.size,
        markings,
        photoUrl: kitPhoto,
        microchipped: microchip.trim().length > 0,
        medicines,
        lastSeen,
        city: profile?.city,
        state: profile?.state,
      });
      trackEvent('lost_alert_created', {});
    } catch {
      Alert.alert('Could not send the alert', 'Please check your connection and try again. If you already have an alert open, close it first.');
    } finally {
      setBusy('');
    }
  }

  function confirmFound() {
    Alert.alert(`Is ${dogName} home?`, 'This closes the alert and thanks the people who helped.', [
      { text: 'Not yet', style: 'cancel' },
      { text: `${dogName} is found!`, onPress: found },
    ]);
  }

  async function found() {
    if (!uid || !active) return;
    setBusy('found');
    try {
      await markDogFound(uid, active.id);
      trackEvent('lost_alert_found', { sightings: sightings.length });
    } catch {
      Alert.alert('Could not close the alert', 'Please try again.');
    } finally {
      setBusy('');
    }
  }

  async function sharePoster() {
    if (!active || busy) return;
    setBusy('share');
    const url = lostAlertUrl(active.id);
    const result = await captureAndShare(cardRef, `${dogName.toLowerCase().replace(/\s+/g, '-')}-lost.png`, `${dogName} is lost`, {
      caption: `LOST DOG: ${dogName}${active.city ? ` near ${active.city}` : ''}. If you see ${dogName}, please tell the family here:`,
      url,
    });
    if (result === 'shared') trackEvent('lost_poster_shared', {});
    if (result === 'error') Alert.alert('Could not share', 'Please try again in a moment.');
    setBusy('');
  }

  if (!user || !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <BackHeader title="Lost dog" onBack={() => router.back()} />
        <View style={styles.content}><Slip>Create your dog&apos;s profile first, then set up their lost-dog kit.</Slip></View>
      </SafeAreaView>
    );
  }

  if (active === undefined) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <BackHeader title="Lost dog" onBack={() => router.back()} />
      </SafeAreaView>
    );
  }

  // ── An alert is open ────────────────────────────────────────────────────────
  if (active) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <BackHeader title={`${active.dogName} is lost`} onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.content}>
          <Slip tone="error">People near {active.city || 'you'} have been alerted. Share the poster to reach more neighbors.</Slip>

          <View style={styles.center}>
            <WantedPosterCard
              ref={cardRef}
              dogName={active.dogName}
              photoUrl={active.photoUrl}
              lost={{ facts: lostFacts(active), url: lostAlertUrl(active.id) }}
            />
          </View>
          <PinkButton label={busy === 'share' ? 'Printing…' : 'Share the poster'} icon="export-variant" busy={busy === 'share'} onPress={sharePoster} />

          <Heading size={22}>Sightings ({sightings.length})</Heading>
          {sightings.length === 0 && <Text style={styles.help}>No reports yet. You will get a notification when someone sends one.</Text>}
          {sightings.map((s) => (
            <Paper key={s.id} style={styles.sighting}>
              <Text style={styles.when}>{timeAgo(s.createdAtMs, Date.now())}{s.finderName ? ` · ${s.finderName}` : ''}</Text>
              <Text style={styles.body}>{s.message}</Text>
              {s.contact ? <Text style={styles.body}>Contact: {s.contact}</Text> : null}
              {s.photoUrl ? <Image source={{ uri: s.photoUrl }} style={styles.sightingPhoto} accessibilityLabel="Photo from the person who saw your dog" /> : null}
              {typeof s.lat === 'number' && typeof s.lng === 'number' ? (
                <PaperButton
                  small
                  icon="map-marker"
                  label="Open the exact spot in Maps"
                  onPress={() => Linking.openURL(`https://maps.apple.com/?ll=${s.lat},${s.lng}&q=${encodeURIComponent('Sighting')}`).catch(() => {})}
                />
              ) : null}
            </Paper>
          ))}

          <PaperButton label={busy === 'found' ? 'Closing…' : `${active.dogName} is found 🎉`} busy={busy === 'found'} onPress={confirmFound} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── No alert: the kit, and the one big button ──────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title="Lost dog kit" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Free for everyone. Fill this in now, while all is calm. If {dogName} ever goes missing, one tap alerts your Pack
          and neighbors and makes a poster with a link anyone can use, no app needed.
        </Text>

        <Paper style={styles.card}>
          <Heading size={20}>Recent photo</Heading>
          <View style={styles.photoRow}>
            {kitPhoto ? <Image source={{ uri: kitPhoto }} style={styles.photo} accessibilityLabel={`${dogName}'s photo for the poster`} /> : <View style={[styles.photo, styles.photoEmpty]} />}
            <PaperButton small label={busy === 'photo' ? 'Adding…' : 'Change photo'} icon="camera" busy={busy === 'photo'} onPress={choosePhoto} style={styles.flex} />
          </View>

          <Text style={styles.label}>Markings</Text>
          <TextInput style={styles.input} value={markings} onChangeText={setMarkings} maxLength={LOST_LIMITS.markings} placeholder="White chest, one brown ear, collar with a blue tag" placeholderTextColor={colors.brownLight} accessibilityLabel="Markings" />

          <Text style={styles.label}>Microchip number <Text style={styles.optional}>(private)</Text></Text>
          <TextInput style={styles.input} value={microchip} onChangeText={setMicrochip} maxLength={LOST_LIMITS.microchip} keyboardType="number-pad" placeholder="Only you see this" placeholderTextColor={colors.brownLight} accessibilityLabel="Microchip number" />

          <Text style={styles.label}>Vet phone <Text style={styles.optional}>(private)</Text></Text>
          <TextInput style={styles.input} value={vetPhone} onChangeText={setVetPhone} maxLength={LOST_LIMITS.vetPhone} keyboardType="phone-pad" placeholder="Only you see this" placeholderTextColor={colors.brownLight} accessibilityLabel="Vet phone" />

          <Text style={styles.label}>Medicine</Text>
          {medicines.length > 0
            ? medicines.map((m) => <Text key={m} style={styles.body}>• {m}</Text>)
            : <Text style={styles.help}>None. Add a Daily medicine reminder (Profile, Dates) and it appears here and on the poster.</Text>}

          <PaperButton label={busy === 'kit' ? 'Saving…' : 'Save the kit'} busy={busy === 'kit'} onPress={() => saveKit()} />
          {savedNote ? <Text style={styles.help} accessibilityLiveRegion="polite">{savedNote}</Text> : null}
        </Paper>

        <Text style={styles.label}>Where were they last seen? <Text style={styles.optional}>(optional, when you report)</Text></Text>
        <TextInput style={styles.input} value={lastSeen} onChangeText={setLastSeen} maxLength={LOST_LIMITS.lastSeen} placeholder="Near the creek trail off Main St" placeholderTextColor={colors.brownLight} accessibilityLabel="Last seen" />

        {!profile.city ? <Slip tone="amber">Add your city to {dogName}&apos;s profile so neighbors nearby can be alerted.</Slip> : null}

        <PinkButton label={busy === 'lost' ? 'Sending the alert…' : 'My dog is lost'} icon="alert-octagon" busy={busy === 'lost'} onPress={confirmLost} accessibilityHint="Alerts your Pack and neighbors and makes a poster" />
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.skip}><Text style={styles.skipText}>Not now</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  center: { alignItems: 'center' },
  flex: { flex: 1 },
  intro: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink },
  card: { gap: 10 },
  label: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
  optional: { fontFamily: fonts.bold, color: colors.brownMid },
  help: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  body: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  when: { fontFamily: fonts.black, fontSize: 13, color: colors.rose },
  input: {
    borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.bold, fontSize: 16, color: colors.ink,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 84, height: 84, borderRadius: 14, borderWidth: 2, borderColor: colors.ink },
  photoEmpty: { backgroundColor: colors.creamDark },
  sighting: { gap: 6 },
  sightingPhoto: { width: '100%', height: 180, borderRadius: 12 },
  skip: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, textDecorationLine: 'underline' },
});
