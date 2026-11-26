// mobile/components/WhereWeGoSection.tsx
// Profile → "Where we go": tag the vet, groomer, daycare, trainer and park you
// use. One tap, no reviews or stars. Your tags are visible only to you; other
// owners see a count once 3+ use the same place (see lib/places.ts).

import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { Heading, Paper, PaperButton, PinkButton, Slip, type } from './pack/kit';
import { listMyPlaceTags, placeErrorMessage, removePlaceTag, tagPlace, type MyPlaceTag } from '../lib/places';
import { CONTENT_FILTER_MESSAGE, checkContent } from '../../shared/contentFilter';
import { nearbyLine, PLACE_CATEGORIES, PLACE_CATEGORY_KEYS, PLACE_NAME_MAX, type PlaceCategory } from '../../shared/places';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PLACE_ICONS } from '../../shared/placeIcons';

export default function WhereWeGoSection({ uid, city }: { uid: string; city?: string }) {
  const [tags, setTags] = useState<MyPlaceTag[] | null>(null);
  const [category, setCategory] = useState<PlaceCategory>('vet');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyPlaceTags(uid).then(setTags).catch(() => setTags([]));
  }, [uid]);
  useEffect(load, [load]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!checkContent(trimmed).ok) { setError(CONTENT_FILTER_MESSAGE); return; }
    setBusy(true);
    setError(null);
    try {
      await tagPlace({ category, name: trimmed });
      setName('');
      load();
    } catch (err) {
      setError(placeErrorMessage(err, 'We couldn’t save that. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function remove(tag: MyPlaceTag) {
    Alert.alert(`Remove ${tag.name}?`, 'It stops counting toward this place.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePlaceTag(uid, tag.placeId).then(load).catch(() => Alert.alert('Couldn’t remove it', 'Please try again.')) },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <Heading size={22}>Your spots</Heading>
      <Text style={type.soft}>
        Once 3 or more owners{city ? ` in ${city}` : ''} use a place, others see how many. Your tags stay private.
      </Text>
      <Paper>
        {tags?.map((tag) => (
          <View key={tag.placeId} style={styles.tagRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.strong}><MaterialCommunityIcons name={PLACE_ICONS[tag.category]} size={16} color={colors.ink} /> {tag.name}</Text>
              <Text style={type.small}>{nearbyLine(tag.ownerCount, 'this place') ?? PLACE_CATEGORIES[tag.category].label}</Text>
            </View>
            <Pressable onPress={() => remove(tag)} accessibilityRole="button" accessibilityLabel={`Remove ${tag.name}`} hitSlop={8}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        ))}
        {tags?.length === 0 && <Text style={type.small}>Nothing tagged yet.</Text>}

        <View style={styles.chips}>
          {PLACE_CATEGORY_KEYS.map((key) => (
            <Pressable key={key} onPress={() => setCategory(key)} accessibilityRole="button" accessibilityState={{ selected: key === category }}
              style={[styles.chip, key === category && styles.chipOn]}>
              <Text style={styles.chipText}><MaterialCommunityIcons name={PLACE_ICONS[key]} size={16} color={colors.ink} /> {PLACE_CATEGORIES[key].label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={PLACE_NAME_MAX}
          placeholder={category === 'park' ? 'Zilker Park' : 'Name, e.g. Dr. Patel'}
          placeholderTextColor={colors.brownLight}
          returnKeyType="done"
          onSubmitEditing={add}
          accessibilityLabel="Place name"
        />
        {error && <Slip tone="error">{error}</Slip>}
        <PinkButton label="We go here" onPress={add} busy={busy} disabled={busy || !name.trim()} />
      </Paper>
      <PaperButton icon="map-marker-outline" label="See places near you" onPress={() => router.push('/places')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  remove: { fontFamily: fonts.black, fontSize: 13, color: colors.rose },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 2, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.cream },
  chipOn: { backgroundColor: colors.primaryLight },
  chipText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  input: { borderWidth: 2, borderColor: colors.ink, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 8, fontFamily: fonts.bold, fontSize: 15, color: colors.ink, backgroundColor: '#fff' },
});
