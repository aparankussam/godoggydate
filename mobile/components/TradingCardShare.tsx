// mobile/components/TradingCardShare.tsx
// The dog's trading card with "Share this card" and the public-page link. One
// home for the logic that used to live inline on the profile screen, now used
// by the Share sheet and the Playroom.

import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { Glyph, PaperButton } from './pack/kit';
import DogTradingCard from './DogTradingCard';
import { captureAndShare } from '../lib/shareCard';
import { dogPageUrl } from '../lib/webLinks';
import { trackEvent } from '../lib/analytics';
import type { SavedDogProfile } from '../lib/profile';

export default function TradingCardShare({ profile, userId }: { profile: SavedDogProfile; userId: string }) {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('trading_card_share_click');
    const dogName = profile.name?.trim() || 'my dog';
    const pronoun = profile.sex === 'F' ? 'her' : profile.sex === 'M' ? 'his' : 'their';
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-godoggydate-card.png`,
      `${dogName} on GoDoggyDate`,
      { caption: `That's ${dogName} on GoDoggyDate — see ${pronoun} page:`, url: dogPageUrl(profile.name ?? '', userId) },
    );
    if (result === 'shared') trackEvent('trading_card_shared', { method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share card', 'Please try again in a moment.');
    setSharing(false);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.cardWrap}>
        <DogTradingCard ref={cardRef} profile={profile} />
      </View>
      <PaperButton
        icon="export-variant"
        label={sharing ? 'Rendering…' : 'Share this card'}
        accessibilityLabel="Share this card"
        onPress={handleShare}
        disabled={sharing}
      />
      <Pressable
        style={styles.link}
        accessibilityRole="link"
        accessibilityLabel={`View ${profile.name}'s public page`}
        onPress={() =>
          Linking.openURL(dogPageUrl(profile.name ?? '', userId)).catch(() =>
            Alert.alert('Could not open link', 'Please try again in a moment.'),
          )
        }
      >
        <Text style={styles.linkText}>View {profile.name}&apos;s public page</Text>
        <Glyph name="chevron-right" size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  cardWrap: { alignItems: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  linkText: { fontFamily: fonts.black, fontSize: 15, color: colors.ink, textDecorationLine: 'underline' },
});
