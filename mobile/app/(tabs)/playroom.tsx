// mobile/app/(tabs)/playroom.tsx
// The Playroom tab: today's Barkle alone at the top, "Zoomies" (games and
// keepsakes, each a small card with a real preview), and "Treat Lab" (the AI
// makers, one line each that opens in place, one at a time). Everything starts
// collapsed. Makers only call their AI route on an explicit tap inside the open
// view.

import { useEffect, useRef, useState } from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { Gingham, Glyph, Heading, PinkButton, card } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { trackEvent } from '../../lib/analytics';
import { getHeroPhoto } from '../../lib/photos';
import { resolveHeroIndex } from '../../lib/coverPhoto';
import { usePlayroomGlimpses } from '../../lib/playroomGlimpses';
import ZoomieCard from '../../components/playroom/ZoomieCard';
import TreatRow from '../../components/playroom/TreatRow';
import ToyBox from '../../components/playroom/ToyBox';
import Collar from '../../components/playroom/Collar';
import { useCharms, type Charm } from '../../lib/charms';
import RoastSection from '../../components/RoastSection';
import ApologySection from '../../components/ApologySection';
import TextsSection from '../../components/TextsSection';
import HumanReviewSection from '../../components/HumanReviewSection';
import DogQuizSection from '../../components/DogQuizSection';
import PlaqueCard from '../../components/PlaqueCard';
import DiptychSection, { shouldShowDiptych } from '../../components/DiptychSection';
import LetterSection from '../../components/LetterSection';
import TradingCardShare from '../../components/TradingCardShare';
import { pickLetterMilestone } from '../../lib/letter';

type Panel = 'letter' | 'card' | 'dogday' | null;

export default function PlayroomTab() {
  const { user, profile } = useSession();
  const [panel, setPanel] = useState<Panel>(null);
  const [treat, setTreat] = useState<string | null>(null);
  const g = usePlayroomGlimpses(user?.uid, profile ?? null);
  const { earned, earn, go } = useCharms(user?.uid);
  const params = useLocalSearchParams<{ treat?: string; panel?: string }>();
  const scroll = useRef<ScrollView>(null);
  const panelY = useRef(0);
  const treatY = useRef(0);

  // A charm (or another toy's "next up") can point at a Treat Lab row or a
  // Zoomies panel on this screen: open it and scroll it into view.
  const openHere = (kind: 'treat' | 'panel', id: string) => {
    void earn(id);
    if (kind === 'treat') setTreat(id);
    else setPanel(id as Panel);
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, (kind === 'treat' ? treatY.current : panelY.current) - 12), animated: true }), 80);
  };
  useEffect(() => {
    if (params.treat) openHere('treat', params.treat);
    else if (params.panel) openHere('panel', params.panel);
  }, [params.treat, params.panel]);
  const pickCharm = (charm: Charm) => {
    trackEvent('playroom_card_open', { feature: charm.id, via: 'collar' });
    const href = charm.href;
    const linkParams = typeof href === 'object' ? (href.params as { treat?: string; panel?: string } | undefined) : undefined;
    if (linkParams?.treat) openHere('treat', linkParams.treat);
    else if (linkParams?.panel) openHere('panel', linkParams.panel);
    else go(charm);
  };

  if (!profile || !user) {
    return (
      <SafeAreaView style={styles.container}>
        <Gingham />
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Glyph name="paw" size={40} /></View>
          <Text style={styles.emptyText}>Set up your dog&apos;s profile first. The Playroom is built from it.</Text>
          <PinkButton label="Go to profile" onPress={() => router.replace('/(tabs)/profile')} style={styles.emptyButton} />
        </View>
      </SafeAreaView>
    );
  }

  const name = profile.name?.trim() || 'your dog';
  const photo = getHeroPhoto(profile.photos, resolveHeroIndex(profile));
  const thumb = photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} /> : undefined;
  const open = (feature: string, route: Href) => () => {
    trackEvent('playroom_card_open', { feature });
    void earn(feature);
    router.push(route);
  };
  const toggle = (feature: Panel) => () => {
    trackEvent('playroom_card_open', { feature: feature ?? 'none' });
    if (feature) void earn(feature);
    setPanel((cur) => (cur === feature ? null : feature));
  };
  const stamp = g.stampTotal > 0 ? `${g.stamped} of ${g.stampTotal} stamped` : 'A bucket list of real-world quests';
  const streakLine =
    g.streak.current > 0
      ? `${g.streak.current}-day streak${g.streak.best > g.streak.current ? ` · best ${g.streak.best}` : ''}`
      : g.streak.yesterdaySolved === false
        ? 'Yesterday got away from you. Start a new streak today.'
        : 'Guess the dog in six tries';
  const treatKey = (k: string) => () => {
    trackEvent('playroom_card_open', { feature: k });
    void earn(k);
    setTreat((cur) => (cur === k ? null : k));
  };

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <ScrollView ref={scroll} contentContainerStyle={styles.content}>
        <Heading size={32}>Playroom</Heading>

        <Collar earned={earned} dogName={name} onPick={pickCharm} />

        <View style={[card.paper, styles.hero]}>
          <Text style={styles.eyebrow}>Today’s Barkle</Text>
          <Text style={styles.heroTitle}>{streakLine}</Text>
          <PinkButton
            label="Play today’s Barkle"
            onPress={() => { trackEvent('fun_open', { feature: 'barkle' }); void earn('barkle'); router.push('/fun/barkle'); }}
          />
        </View>

        <View onLayout={(e) => { panelY.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height; }}>
          <ToyBox title="Zoomies" emoji="🎾" tint={colors.goldLight} layout="grid">
            <ZoomieCard
              label="Snoot Boop"
              glyph="gesture-tap"
              glimpse={g.boops > 0 ? `${g.boops} boops${g.nextStickerAt ? ` · next sticker at ${g.nextStickerAt}` : ''}` : `Boop ${name}'s snoot to earn stickers`}
              onPress={open('snoot', '/fun/snoot')}
            />
            <ZoomieCard
              label="Sticker Studio"
              glyph="sticker-emoji"
              glimpse={g.stickers > 0 ? `${g.stickers} sticker${g.stickers === 1 ? '' : 's'} earned` : 'Earn stickers by booping, then stick them on photos'}
              onPress={open('sticker-studio', '/fun/sticker-studio')}
            />
            <ZoomieCard label="Wanted Poster" glyph="card-account-details-star" thumb={thumb} glimpse={`Make ${name} a wanted poster`} onPress={open('wanted', '/fun/wanted')} />
            <ZoomieCard label="Trading card" glyph="card-account-details-star" thumb={thumb} glimpse={`Share ${name}’s card and public page`} active={panel === 'card'} onPress={toggle('card')} />
            <ZoomieCard label="Adventure Passport" glyph="map-marker-path" glimpse={stamp} onPress={open('adventures', '/fun/adventures')} />
            <ZoomieCard label="Excuse Note" glyph="note-edit" glimpse="A “my dog ate it” note, made to share" onPress={open('excuse', '/fun/excuse')} />
            <ZoomieCard
              label={`A letter from ${name}`}
              glyph="email-outline"
              glimpse={g.letterLine}
              active={panel === 'letter'}
              onPress={toggle('letter')}
            />
            {shouldShowDiptych(profile) && (
              <ZoomieCard label="National Dog Day" glyph="image-multiple" glimpse="Then and now, side by side" active={panel === 'dogday'} onPress={toggle('dogday')} />
            )}
          </ToyBox>
        </View>

        {panel === 'letter' &&
          (pickLetterMilestone(profile) ? (
            <LetterSection savedProfile={profile} userId={user.uid} />
          ) : (
            <View style={[card.paper, styles.note]}>
              <Text style={styles.noteText}>
                A letter from {name} arrives on their Gotcha Day or birthday. Add those dates in Profile, under About, and it will be ready the week they come around.
              </Text>
            </View>
          ))}
        {panel === 'card' && <TradingCardShare profile={profile} userId={user.uid} />}
        {panel === 'dogday' && <DiptychSection savedProfile={profile} />}

        <View onLayout={(e) => { treatY.current = e.nativeEvent.layout.y; }}>
          <ToyBox title="Treat Lab" emoji="🦴" tint={colors.kraft} layout="stack">
            <TreatRow title={`Roast ${name}`} glimpse="A kind-hearted roast, built from their real profile" open={treat === 'roast'} onToggle={treatKey('roast')}>
              <RoastSection savedProfile={profile} />
            </TreatRow>
            <TreatRow title={`Texts from ${name}`} glimpse="A thread of texts to you, in their voice" open={treat === 'texts'} onToggle={treatKey('texts')}>
              <TextsSection savedProfile={profile} />
            </TreatRow>
            <TreatRow title="Notes-App Apology" glimpse={`The apology ${name} would type, if they could`} open={treat === 'apology'} onToggle={treatKey('apology')}>
              <ApologySection savedProfile={profile} />
            </TreatRow>
            <TreatRow title="My Human Review" glimpse={`${name} reviews you`} open={treat === 'review'} onToggle={treatKey('review')}>
              <HumanReviewSection savedProfile={profile} userId={user.uid} />
            </TreatRow>
            <TreatRow title="Dog quiz" glimpse="Pass the phone: how well do friends know them?" open={treat === 'quiz'} onToggle={treatKey('quiz')}>
              <DogQuizSection savedProfile={profile} />
            </TreatRow>
            <TreatRow title="Employee of the Month" glimpse="A plaque for the office dog" open={treat === 'plaque'} onToggle={treatKey('plaque')}>
              <PlaqueCard savedProfile={profile} />
            </TreatRow>
          </ToyBox>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  hero: { borderRadius: 22, padding: 16, gap: 10 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose },
  heroTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  note: { borderRadius: 18, padding: 14 },
  noteText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, textAlign: 'center', lineHeight: 21 },
  emptyButton: { marginTop: 8, alignSelf: 'stretch' },
});
