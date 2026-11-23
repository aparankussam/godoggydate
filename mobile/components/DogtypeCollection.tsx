// mobile/components/DogtypeCollection.tsx
// "N of 16 Dogtypes discovered". Names show only for your own dog's type and
// the types of dogs you've matched. Every other tile is an identical "?" that
// carries no type data at all (it is not even handed one).

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { colors, fonts } from '../constants/theme';
import { PrimaryButton, SecondaryButton } from './sticker';
import { getFirebase } from '../lib/firebase';
import { trackEvent } from '../lib/analytics';
import { discoverOwnType, loadDiscoveries, onDiscoveriesChange } from '../lib/dogtypeDiscovery';
import { computeDogtype, dogtypeByCode, dogtypeCompat, dogtypeReasons } from '../../shared/dogtype';
import { discoveredOrder, type DogtypeLedger } from '../../shared/progress';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  userId: string;
  savedProfile: SavedDogProfile;
}

const TOTAL = 16;

function whenLabel(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DogtypeCollection({ userId, savedProfile }: Props) {
  const own = computeDogtype(savedProfile);
  const ownCode = own?.code ?? '';
  const dogName = savedProfile.name?.trim() || 'Your dog';
  const [ledger, setLedger] = useState<DogtypeLedger>({});
  const [picked, setPicked] = useState<string | 'hidden' | null>(null);
  const [matchExists, setMatchExists] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    if (ownCode) void discoverOwnType(userId, ownCode);
    const load = () => void loadDiscoveries(userId).then(setLedger);
    load();
    return onDiscoveriesChange(load);
  }, [userId, ownCode]);

  const codes = useMemo(() => discoveredOrder(ledger, ownCode), [ledger, ownCode]);
  const found = codes.length;
  const hiddenCount = Math.max(0, TOTAL - found);
  const entry = picked && picked !== 'hidden' ? ledger[picked] : undefined;
  const matchId = entry?.dogId ? [userId, entry.dogId].sort().join('_') : null;

  useEffect(() => {
    setMatchExists(false);
    if (!matchId) return;
    let cancelled = false;
    getDoc(doc(getFirebase().db, 'matches', matchId))
      .then((s) => !cancelled && setMatchExists(s.exists()))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (!own) return null;

  function pick(next: string | 'hidden') {
    setPicked((cur) => (cur === next ? null : next));
    trackEvent('dogtype_tile_tap', { discovered: next !== 'hidden' });
  }

  const pickedType = picked && picked !== 'hidden' ? dogtypeByCode(picked) : null;
  const compat = pickedType && picked !== ownCode ? dogtypeCompat(ownCode, pickedType.code) : null;
  const firstReason = pickedType && picked !== ownCode ? dogtypeReasons(ownCode, pickedType.code)[0] : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Reveal explorer</Text>
        <Text style={styles.title}>
          {found} of {TOTAL} Dogtypes discovered
        </Text>
        <Text style={styles.sub}>
          {hiddenCount > 0
            ? `Match with a dog to see their Dogtype. The other ${hiddenCount} stay a mystery until then.`
            : 'You found them all. Every Dogtype is yours.'}
        </Text>
        <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: TOTAL, now: found }}>
          <View style={[styles.barFill, { width: `${(found / TOTAL) * 100}%` }]} />
        </View>

        <View style={styles.grid}>
          {codes.map((code) => {
            const t = dogtypeByCode(code);
            if (!t) return null;
            const on = picked === code;
            return (
              <Pressable
                key={code}
                onPress={() => pick(code)}
                accessibilityRole="button"
                accessibilityLabel={`${t.name}${code === ownCode ? `, ${dogName}'s type` : ''}`}
                accessibilityState={{ selected: on }}
                style={[styles.tile, styles.tileOn, code === ownCode ? styles.tileOwn : styles.tileMet, on && styles.tilePicked]}
              >
                <Text style={styles.tileEmoji}>{t.emoji}</Text>
                <Text style={styles.tileName} numberOfLines={2}>
                  {t.name.replace(/^The /, '')}
                </Text>
              </Pressable>
            );
          })}
          {Array.from({ length: hiddenCount }, (_, i) => (
            <Pressable
              key={`h${i}`}
              onPress={() => pick('hidden')}
              accessibilityRole="button"
              accessibilityLabel="Hidden Dogtype"
              style={[styles.tile, styles.tileHidden]}
            >
              <Text style={styles.tileQ}>?</Text>
            </Pressable>
          ))}
        </View>

        {picked === 'hidden' && (
          <View style={[styles.panel, styles.panelHidden]}>
            <Text style={styles.panelTitle}>Still hidden</Text>
            <Text style={styles.panelBody}>Match with a dog of this type and it’s yours to see. No hints, no peeking.</Text>
          </View>
        )}
        {pickedType && picked !== 'hidden' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{pickedType.name}</Text>
            <Text style={styles.panelMeta}>
              {picked === ownCode
                ? `That’s ${dogName}`
                : entry?.dogName
                  ? `Discovered through ${entry.dogName} · ${whenLabel(entry.at)}`
                  : `Discovered ${whenLabel(entry?.at ?? Date.now())}`}
            </Text>
            {picked === ownCode ? (
              <Text style={styles.panelBody}>{pickedType.blurb}</Text>
            ) : (
              <>
                {compat && <Text style={styles.panelVibe}>With {dogName}: {compat.headline.toLowerCase()}</Text>}
                {firstReason && <Text style={styles.panelBody}>{firstReason.text}</Text>}
                {matchExists && matchId && entry?.dogName && (
                  <SecondaryButton
                    label={`Open chat with ${entry.dogName}`}
                    onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId, name: entry.dogName ?? '' } })}
                  />
                )}
              </>
            )}
          </View>
        )}
      </View>

      {hiddenCount > 0 && (
        <PrimaryButton label={`Keep swiping · ${hiddenCount} to find`} onPress={() => router.push('/(tabs)/discover')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 22,
    padding: 16,
    gap: 10,
    shadowColor: colors.ink,
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 0,
  },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  sub: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  bar: { height: 10, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 999, backgroundColor: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '23%', height: 96, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  tileOn: { borderWidth: 2, borderColor: colors.ink },
  tileOwn: { backgroundColor: colors.goldLight },
  tileMet: { backgroundColor: colors.note },
  tilePicked: { borderWidth: 3 },
  tileHidden: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.brownMid },
  tileEmoji: { fontSize: 26 },
  tileName: { fontFamily: fonts.black, fontSize: 11, lineHeight: 13, textAlign: 'center', color: colors.ink },
  tileQ: { fontFamily: fonts.display, fontSize: 30, color: colors.brownMid },
  panel: { borderWidth: 2, borderColor: colors.ink, borderRadius: 16, padding: 14, gap: 8, backgroundColor: colors.white },
  panelHidden: { borderStyle: 'dashed', borderColor: colors.brownMid, backgroundColor: 'transparent' },
  panelTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 25, color: colors.ink },
  panelMeta: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownMid },
  panelVibe: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  panelBody: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.ink },
});
