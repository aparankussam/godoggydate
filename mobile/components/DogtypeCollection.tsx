// mobile/components/DogtypeCollection.tsx
// "N of 16 Dogtypes discovered", two rows to start. Names show only for types
// you've met (matches, or a Pack Day you went to) and, once you have watched the
// reveal, your own dog's type. Every other tile is an identical "?" that is not
// handed any type data. Tapping a discovered tile opens the full read in a sheet.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { PrimaryButton } from './sticker';
import DogtypeSheet from './dogtype/DogtypeSheet';
import { fetchMatches, type MatchItem } from '../lib/matches';
import { trackEvent } from '../lib/analytics';
import {
  discoverOwnType,
  loadDiscoveries,
  loadDogSnapshots,
  loadRevealed,
  matchedDogsOfCode,
  onDiscoveriesChange,
} from '../lib/dogtypeDiscovery';
import { computeDogtype, dogtypeByCode } from '../../shared/dogtype';
import { discoveredOrder, type DogtypeDogMap, type DogtypeLedger } from '../../shared/progress';
import type { SavedDogProfile } from '../lib/profile';

interface Props {
  userId: string;
  savedProfile: SavedDogProfile;
}

const TOTAL = 16;
const COMPACT = 8;

function whenLabel(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DogtypeCollection({ userId, savedProfile }: Props) {
  const own = computeDogtype(savedProfile);
  const ownCode = own?.code ?? '';
  const dogName = savedProfile.name?.trim() || 'Your dog';
  const [ledger, setLedger] = useState<DogtypeLedger>({});
  const [snapshots, setSnapshots] = useState<DogtypeDogMap>({});
  const [revealed, setRevealed] = useState(false);
  const [items, setItems] = useState<MatchItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [sheetCode, setSheetCode] = useState<string | null>(null);
  const [hiddenNote, setHiddenNote] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    if (ownCode) void discoverOwnType(userId, ownCode);
    const load = () => {
      void loadDiscoveries(userId).then(setLedger);
      void loadDogSnapshots(userId).then(setSnapshots);
      void loadRevealed(userId).then(setRevealed);
    };
    load();
    return onDiscoveriesChange(load);
  }, [userId, ownCode]);

  useEffect(() => {
    let cancelled = false;
    // Re-read the current matches on mount and each time a sheet opens, so the list is never stale.
    if (userId) fetchMatches(userId).then((m) => !cancelled && setItems(m)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, sheetCode]);

  // Until the owner has watched their own reveal, their own type stays a "?".
  const codes = useMemo(
    () => discoveredOrder(ledger, ownCode).filter((c) => c !== ownCode || revealed),
    [ledger, ownCode, revealed],
  );
  const found = codes.length;
  const hiddenCount = Math.max(0, TOTAL - found);
  const tiles: (string | null)[] = [...codes, ...Array.from({ length: hiddenCount }, () => null)];
  const visible = showAll ? tiles : tiles.slice(0, COMPACT);

  if (!own) return null;

  const entry = sheetCode ? ledger[sheetCode] : undefined;
  const discoveredLine =
    sheetCode && sheetCode !== ownCode
      ? entry?.dogName
        ? `Discovered through ${entry.dogName} · ${whenLabel(entry.at)}`
        : entry
          ? `Discovered ${whenLabel(entry.at)}`
          : undefined
      : undefined;

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
          {visible.map((code, i) => {
            if (code === null) {
              return (
                <Pressable
                  key={`h${i}`}
                  onPress={() => {
                    setHiddenNote((v) => !v);
                    trackEvent('dogtype_tile_tap', { discovered: false });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Hidden Dogtype"
                  style={[styles.tile, styles.tileHidden]}
                >
                  <Text style={styles.tileQ}>?</Text>
                </Pressable>
              );
            }
            const t = dogtypeByCode(code);
            if (!t) return null;
            const count = matchedDogsOfCode(items, snapshots, code).length;
            return (
              <Pressable
                key={code}
                onPress={() => {
                  setSheetCode(code);
                  trackEvent('dogtype_tile_tap', { discovered: true });
                  trackEvent('dogtype_sheet_open');
                }}
                accessibilityRole="button"
                accessibilityLabel={`${t.name}${code === ownCode ? `, ${dogName}'s type` : ''}${count > 1 ? `, ${count} matches` : ''}`}
                style={[styles.tile, styles.tileOn, code === ownCode ? styles.tileOwn : styles.tileMet]}
              >
                <Text style={styles.tileEmoji}>{t.emoji}</Text>
                <Text style={styles.tileName} numberOfLines={2}>
                  {t.name.replace(/^The /, '')}
                </Text>
                {count > 1 && (
                  <View style={styles.count}><Text style={styles.countText}>×{count}</Text></View>
                )}
              </Pressable>
            );
          })}
        </View>

        {hiddenNote && (
          <View style={styles.hiddenPanel}>
            <Text style={styles.hiddenTitle}>Still hidden</Text>
            <Text style={styles.hiddenBody}>Match with a dog of this type and it’s yours to see. No hints, no peeking.</Text>
          </View>
        )}

        {tiles.length > COMPACT && (
          <Pressable style={styles.toggle} accessibilityRole="button" onPress={() => setShowAll((v) => !v)}>
            <Text style={styles.toggleText}>{showAll ? 'Show fewer ▲' : `Show all ${TOTAL} ▼`}</Text>
          </Pressable>
        )}
      </View>

      {hiddenCount > 0 && (
        <PrimaryButton label={`Keep swiping · ${hiddenCount} to find`} onPress={() => router.push('/(tabs)/discover')} />
      )}

      <DogtypeSheet
        visible={sheetCode !== null}
        onClose={() => setSheetCode(null)}
        code={sheetCode}
        ownCode={ownCode}
        ownName={dogName}
        matches={sheetCode ? matchedDogsOfCode(items, snapshots, sheetCode) : []}
        discoveredLine={discoveredLine}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, marginBottom: 16 },
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
  tile: { width: '23%', height: 78, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  tileOn: { borderWidth: 2, borderColor: colors.ink },
  tileOwn: { backgroundColor: colors.goldLight },
  tileMet: { backgroundColor: colors.note },
  tileHidden: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.brownMid },
  tileEmoji: { fontSize: 24 },
  tileName: { fontFamily: fonts.black, fontSize: 10.5, lineHeight: 12, textAlign: 'center', color: colors.ink },
  tileQ: { fontFamily: fonts.display, fontSize: 26, color: colors.brownMid },
  count: { position: 'absolute', top: 3, right: 4, backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 5 },
  countText: { fontFamily: fonts.black, fontSize: 10, color: colors.paper },
  hiddenPanel: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.brownMid, borderRadius: 16, padding: 12, gap: 4 },
  hiddenTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  hiddenBody: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.ink },
  toggle: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontFamily: fonts.black, fontSize: 14, color: colors.rose },
});
