// mobile/components/LostAlertCard.tsx
// A lost dog near you, pinned to the top of Neighbarkhood and styled as the
// emergency it is: photo, details, how long ago, and the two things a neighbor
// can do (report a sighting, share the poster). A dog found in the last day
// shows as "home" so the loop visibly closes. Mirrors web/components/LostAlertCard.tsx.

import { useEffect, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import SirenIcon from './SirenIcon';
import { colors, fonts } from '../constants/theme';
import { lostAlertUrl, onHelpers, setHelping } from '../lib/lostDog';
import { lostFacts, timeAgo } from '../../shared/lostDog';
import { trackEvent } from '../lib/analytics';

export default function LostAlertCard({ id, data, uid }: { id: string; data: Record<string, unknown>; uid: string }) {
  const name = String(data.dogName ?? 'A dog');
  const found = data.status === 'found';
  const mine = data.ownerId === uid;
  const photo = typeof data.photoUrl === 'string' ? data.photoUrl : undefined;
  const createdMs = Number(data.createdAtMs ?? 0);
  const [helpers, setHelpers] = useState({ count: 0, mine: false });
  useEffect(() => (found ? undefined : onHelpers(id, uid, setHelpers)), [id, uid, found]);
  const toggleHelping = () => {
    trackEvent('lost_helping', { on: !helpers.mine });
    setHelping(id, uid, !helpers.mine).catch(() => {});
  };
  const facts = lostFacts({
    breed: data.breed as string | undefined,
    size: data.size as string | undefined,
    markings: data.markings as string | undefined,
    microchipped: data.microchipped === true,
    medicines: Array.isArray(data.medicines) ? (data.medicines as string[]) : [],
    lastSeen: undefined,
    city: '',
    state: '',
  }).slice(0, 3);

  async function share() {
    trackEvent('lost_feed_share', {});
    try { await Share.share({ message: `Lost dog near ${String(data.city ?? 'us')}: ${name}. Please look out and share. ${lostAlertUrl(id)}` }); } catch { /* cancelled */ }
  }

  if (found) {
    return (
      <View style={[styles.card, styles.foundCard]}>
        <Text style={styles.foundBanner}>🎉 HOME SAFE</Text>
        <Text style={styles.name}>{name} is home. Thank you, neighbors!</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} accessible={false}>
      <View style={styles.banner}>
        <SirenIcon size={18} />
        <Text style={styles.bannerText}>LOST DOG{createdMs > 0 ? ` · ${timeAgo(createdMs, Date.now())}` : ''}</Text>
      </View>
      <View style={styles.body}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} accessibilityLabel={`Photo of ${name}`} /> : null}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.name}>{name}</Text>
          {!!data.lastSeen && <Text style={styles.lastSeen}>Last seen: {String(data.lastSeen)}</Text>}
          {facts.map((f) => <Text key={f} style={styles.fact}>{f}</Text>)}
          {helpers.count > 0 && (
            <Text style={styles.helping}>🔦 {helpers.count} {helpers.count === 1 ? 'neighbor is' : 'neighbors are'} helping look</Text>
          )}
        </View>
      </View>
      {!mine && (
        <Pressable onPress={toggleHelping} accessibilityRole="button" accessibilityState={{ selected: helpers.mine }} style={[styles.helpBtn, helpers.mine && styles.helpBtnOn]}>
          <Text style={[styles.btnText, helpers.mine && styles.helpBtnOnText]}>{helpers.mine ? '✓ You’re helping look' : 'I’m helping look'}</Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        {mine ? (
          <Pressable onPress={() => router.push('/lost')} style={[styles.btn, styles.btnPrimary]} accessibilityRole="button">
            <Text style={styles.btnPrimaryText}>Open your alert</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { trackEvent('lost_feed_sighting', {}); router.push({ pathname: '/lost/[id]', params: { id } }); }}
            style={[styles.btn, styles.btnPrimary]}
            accessibilityRole="button"
          >
            <Text style={styles.btnPrimaryText}>I’ve seen this dog</Text>
          </Pressable>
        )}
        <Pressable onPress={share} style={styles.btn} accessibilityRole="button">
          <Text style={styles.btnText}>Share the poster</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 3, borderColor: colors.danger, borderRadius: 18, backgroundColor: colors.paper, overflow: 'hidden', marginBottom: 14 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.danger, paddingHorizontal: 12, paddingVertical: 6 },
  bannerText: { fontFamily: fonts.black, fontSize: 13, color: '#fff', letterSpacing: 0.6 },
  body: { flexDirection: 'row', gap: 12, padding: 12 },
  photo: { width: 88, height: 88, borderRadius: 12, borderWidth: 2, borderColor: colors.ink },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  lastSeen: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  fact: { fontFamily: fonts.bold, fontSize: 13, color: colors.brownMid },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  btn: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  btnPrimary: { backgroundColor: colors.danger, borderColor: colors.danger },
  btnText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  btnPrimaryText: { fontFamily: fonts.black, fontSize: 14, color: '#fff' },
  helping: { fontFamily: fonts.black, fontSize: 13, color: colors.danger },
  helpBtn: { marginHorizontal: 12, marginBottom: 8, minHeight: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  helpBtnOn: { backgroundColor: colors.ink },
  helpBtnOnText: { color: '#fff' },
  foundCard: { borderColor: '#2E8B57', padding: 12, gap: 4 },
  foundBanner: { fontFamily: fonts.black, fontSize: 13, color: '#2E8B57', letterSpacing: 0.6 },
});
