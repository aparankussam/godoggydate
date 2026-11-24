// mobile/app/lost/[id].tsx
// What a neighbor sees when they tap a lost-dog alert: the dog, how to recognize
// them, and "I saw this dog". The report goes to the owner through the website's
// sighting route (rate limits, content filter), signed in so they can be thanked.
// The owner opening their own alert is sent to the management screen instead.

import { useEffect, useState } from 'react';
import { Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { colors, fonts } from '../../constants/theme';
import { BackHeader, Gingham, Heading, Paper, PaperButton, PinkButton, Slip } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { getLostAlert, lostFacts, reportSighting, type LostAlert } from '../../lib/lostDog';
import { LOST_LIMITS } from '../../../shared/lostDog';

export default function LostAlertScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [alert, setAlert] = useState<LostAlert | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getLostAlert(String(id)).then(setAlert).catch(() => setAlert(null));
  }, [id]);

  useEffect(() => {
    if (alert && user && alert.ownerId === user.uid) router.replace('/lost');
  }, [alert, user]);

  async function addPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to attach a picture.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets?.[0]?.uri) setPhotoUri(result.assets[0].uri);
  }

  async function addPin() {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { Alert.alert('Location off', 'You can describe the place in your message instead.'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Could not get your location', 'You can describe the place in your message instead.');
    }
  }

  async function send() {
    if (!alert || sending) return;
    setSending(true);
    setError('');
    const problem = await reportSighting(alert.id, { message, photoUri, lat: pin?.lat, lng: pin?.lng });
    setSending(false);
    if (problem) setError(problem);
    else setDone(true);
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/discover'));

  if (alert === undefined) {
    return <SafeAreaView style={styles.container}><Gingham /><BackHeader title="Lost dog" onBack={back} /></SafeAreaView>;
  }
  if (alert === null) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <BackHeader title="Lost dog" onBack={back} />
        <View style={styles.content}><Slip>This alert is no longer available.</Slip></View>
      </SafeAreaView>
    );
  }

  const found = alert.status === 'found';
  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <BackHeader title={found ? `${alert.dogName} is home` : `${alert.dogName} is lost`} onBack={back} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {found ? <Slip tone="ok">{alert.dogName} was found. Thank you to everyone who helped look.</Slip> : null}
        <Paper style={styles.card}>
          {alert.photoUrl ? <Image source={{ uri: alert.photoUrl }} style={styles.photo} accessibilityLabel={`${alert.dogName}, the missing dog`} /> : null}
          <Heading size={26}>{alert.dogName}</Heading>
          {lostFacts(alert).map((line) => <Text key={line} style={styles.body}>🐾 {line}</Text>)}
        </Paper>

        {!found && !done && (
          <Paper style={styles.card}>
            <Heading size={20}>I saw this dog</Heading>
            <Text style={styles.help}>Your message goes to the family. They never share their phone number or address, and neither do we.</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={LOST_LIMITS.message}
              placeholder="Where and when did you see them?"
              placeholderTextColor={colors.brownLight}
              accessibilityLabel="What you saw"
            />
            <View style={styles.row}>
              <PaperButton small icon="camera" label={photoUri ? 'Photo added' : 'Add a photo'} onPress={addPhoto} style={styles.flex} />
              <PaperButton small icon="map-marker" label={pin ? 'Spot added' : 'Add my spot'} onPress={addPin} style={styles.flex} />
            </View>
            <Text style={styles.help}>Only the family sees the exact spot.</Text>
            {error ? <Slip tone="error">{error}</Slip> : null}
            <PinkButton label={sending ? 'Sending…' : "Tell the family"} busy={sending} disabled={message.trim().length < 3} onPress={send} />
          </Paper>
        )}
        {done ? <Slip tone="ok" live>Thank you! The family has your message. Keep a calm distance: a scared dog can run.</Slip> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  card: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  photo: { width: '100%', height: 260, borderRadius: 14, borderWidth: 2, borderColor: colors.ink },
  body: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  help: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  input: {
    borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.bold, fontSize: 16, color: colors.ink,
  },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
});
