// mobile/app/places/[id].tsx
// One place: its count line (once 3+ owners use it), a map link, and, for a
// park, how many Pack Days happened there with links to the upcoming ones.
// Every Pack Day location has a page, even before anyone tags it.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '../../constants/theme';
import { BackHeader, Gingham, Heading, InkLink, Paper, PaperButton, Slip, type } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { getPublicPlace, listCityPackDays, reportPlace, type PublicPlace } from '../../lib/places';
import { formatPackDayWhen } from '../../../shared/packDay';
import { nearbyLine, packDayParks, PLACE_CATEGORIES, isPlaceCategory, type PackDayPark } from '../../../shared/places';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default function PlaceScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; city?: string }>();
  const id = one(params.id);
  const { user } = useSession();
  const [place, setPlace] = useState<PublicPlace | null>(null);
  const [park, setPark] = useState<PackDayPark<Awaited<ReturnType<typeof listCityPackDays>>[number]> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [, categoryKey, nameSlug] = id.split('__');
  const category = isPlaceCategory(categoryKey) ? categoryKey : null;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const pub = await getPublicPlace(id);
        const city = pub?.city ?? one(params.city);
        const events = category === 'park' && city ? await listCityPackDays(city) : [];
        if (!active) return;
        setPlace(pub);
        setPark(packDayParks(events, Date.now()).find((p) => p.slug === nameSlug) ?? null);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [id, category, nameSlug, params.city]);

  const name = place?.name ?? one(params.name);
  const line = place ? nearbyLine(place.ownerCount, name) : null;

  async function handleReport() {
    if (!user) return;
    const outcome = await reportPlace(user.uid, id);
    Alert.alert(outcome === 'reported' ? 'Report sent' : 'That didn’t go through',
      outcome === 'reported' ? 'Thanks. We review every report within 24 hours.' : 'Please check your connection and try again.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Gingham />
      <BackHeader title={category ? PLACE_CATEGORIES[category].label : 'Place'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/places'))} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {!loaded && <ActivityIndicator color={colors.ink} />}
        {error && <Slip tone="error">We couldn’t load this place. Check your connection and try again.</Slip>}
        {loaded && !error && !name && <Slip tone="info">This place isn’t listed any more.</Slip>}
        {loaded && !!name && (
          <>
            <Paper>
              <Heading size={26}>{name}</Heading>
              <Text style={type.soft}>{line ?? 'Not enough owners yet to show a count.'}</Text>
              {place?.mapUrl && <InkLink label="Open in Maps" onPress={() => Linking.openURL(place.mapUrl!).catch(() => undefined)} />}
            </Paper>

            {category === 'park' && (
              <Paper>
                <Heading size={20}>Pack Days here</Heading>
                <Text style={type.body}>
                  {park && park.held > 0 ? `${park.held} Pack Day${park.held === 1 ? '' : 's'} held here so far.` : 'No Pack Days held here yet.'}
                </Text>
                {park?.upcoming.map((e) => (
                  <Pressable key={e.id} onPress={() => router.push({ pathname: '/pack/[id]', params: { id: e.id } })} accessibilityRole="button">
                    <Text style={[type.strong, styles.upcoming]}>{formatPackDayWhen(e)} · {e.title}</Text>
                  </Pressable>
                ))}
                {park && park.upcoming.length === 0 && <Text style={type.small}>Nothing coming up. Host one from the Pack tab.</Text>}
              </Paper>
            )}

            {place && <PaperButton icon="flag-outline" label="Report this place" onPress={handleReport} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.sky },
  scroll: { padding: 16, gap: 12 },
  upcoming: { marginTop: 8 },
});
