// mobile/app/places/index.tsx
// "Where we go" for your city: the places other owners use, by category, with
// counts (shown only once 3+ owners use a place). Pack Day parks appear under
// Parks automatically. "Ask for a rec" pings owners in your city who tagged
// that category. Reachable from the profile's Where we go section.

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { BackHeader, Gingham, Heading, Paper, PaperButton, Slip, Tag, type } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { askPlaceRec, listCityPackDays, listPlaces, placeErrorMessage, type PublicPlace } from '../../lib/places';
import { nearbyLine, packDayParks, placeCityKey, placeIdFor, PLACE_CATEGORIES, PLACE_CATEGORY_KEYS, type PlaceCategory } from '../../../shared/places';

export default function PlacesScreen() {
  const { profile } = useSession();
  const [category, setCategory] = useState<PlaceCategory>('vet');
  const [places, setPlaces] = useState<PublicPlace[] | null>(null);
  const [parks, setParks] = useState<ReturnType<typeof packDayParks>>([]);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const city = profile?.city?.trim() ?? '';
  const state = profile?.state?.trim() ?? '';
  const cityKey = city && state ? placeCityKey(city, state) : null;

  useFocusEffect(
    useCallback(() => {
      if (!cityKey) return undefined;
      let active = true;
      setPlaces(null);
      setError(null);
      Promise.all([
        listPlaces(cityKey, category),
        category === 'park' ? listCityPackDays(city) : Promise.resolve([]),
      ])
        .then(([list, events]) => {
          if (!active) return;
          setPlaces(list);
          setParks(packDayParks(events, Date.now()));
        })
        .catch(() => active && setError('We couldn’t load places. Check your connection and try again.'));
      return () => { active = false; };
    }, [cityKey, city, category]),
  );

  async function handleAsk() {
    setAsking(true);
    try {
      await askPlaceRec(category);
      Alert.alert('Asked', `Neighbors who use a ${PLACE_CATEGORIES[category].noun} have been nudged. You’ll see their picks here as they tag them.`);
    } catch (err) {
      Alert.alert('Not sent', placeErrorMessage(err, 'We couldn’t send that. Please try again.'));
    } finally {
      setAsking(false);
    }
  }

  // A park that already has a public count page isn't listed twice.
  const listedIds = new Set((places ?? []).map((p) => p.placeId));
  const extraParks = parks.filter((p) => cityKey && !listedIds.has(placeIdFor(cityKey, 'park', p.name)));

  return (
    <SafeAreaView style={styles.safe}>
      <Gingham />
      <BackHeader title="Where we go" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pack'))} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {!cityKey ? (
          <Slip tone="amber">Add your city and state to your dog’s profile to see places near you.</Slip>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {PLACE_CATEGORY_KEYS.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setCategory(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: key === category }}
                  style={[styles.chip, key === category && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{PLACE_CATEGORIES[key].emoji} {PLACE_CATEGORIES[key].label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {error && <Slip tone="error">{error}</Slip>}
            {!places && !error && <ActivityIndicator color={colors.ink} style={{ marginVertical: 24 }} />}

            {places?.map((place) => (
              <Pressable key={place.placeId} onPress={() => router.push({ pathname: '/places/[id]', params: { id: place.placeId } })} accessibilityRole="button">
                <Paper style={styles.row}>
                  <Heading size={20}>{place.name}</Heading>
                  <Text style={type.soft}>{nearbyLine(place.ownerCount, 'this place')}</Text>
                </Paper>
              </Pressable>
            ))}
            {extraParks.map((park) => (
              <Pressable
                key={park.slug}
                onPress={() => router.push({ pathname: '/places/[id]', params: { id: placeIdFor(cityKey!, 'park', park.name), name: park.name, city } })}
                accessibilityRole="button"
              >
                <Paper style={styles.row}>
                  <Heading size={20}>{park.name}</Heading>
                  <Tag label={`${park.held + park.upcoming.length} Pack Day${park.held + park.upcoming.length === 1 ? '' : 's'}`} icon="paw" />
                </Paper>
              </Pressable>
            ))}
            {places && places.length === 0 && extraParks.length === 0 && (
              <Slip tone="info">
                No {PLACE_CATEGORIES[category].noun} has 3 owners yet, which is when we start showing a place. Tag yours from your profile to help it get there.
              </Slip>
            )}

            <PaperButton
              icon="comment-question-outline"
              label={asking ? 'Asking…' : `Ask for a ${PLACE_CATEGORIES[category].noun} rec`}
              onPress={handleAsk}
              disabled={asking}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.sky },
  scroll: { padding: 16, gap: 12 },
  chips: { gap: 8, paddingBottom: 4 },
  chip: { borderWidth: 2, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.cream },
  chipOn: { backgroundColor: colors.primaryLight },
  chipText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  row: { gap: 4 },
});
