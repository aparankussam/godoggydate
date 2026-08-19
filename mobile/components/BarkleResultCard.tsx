// mobile/components/BarkleResultCard.tsx
// The shareable Barkle result — a SPOILER-FREE card: it shows only the puzzle
// number, the score, and the warmth emoji grid, never the breed name or its
// emoji, so a repost can't spoil the day for anyone who hasn't played.
// forwardRef<View> for react-native-view-shot capture; brand + the
// godoggydate.com/barkle back-link are baked INSIDE the captured region so a
// reposted PNG carries the link (mirrors WantedPosterCard / DogtypeCard).

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts } from '../constants/theme';
import { MAX_TRIES, tileForGuess, type GuessResult } from '../../shared/barkle';

interface Props {
  puzzleNumber: number;
  results: GuessResult[];
  won: boolean;
}

const BarkleResultCard = forwardRef<View, Props>(({ puzzleNumber, results, won }, ref) => {
  const score = won ? `${results.length}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
  const grid = results.map(tileForGuess).join('');

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient
        colors={won ? ['#7A2E0E', '#E8633A', '#F5B731'] : ['#241A2E', '#5C3D2E', '#9B7560']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.inner}>
        <Text style={styles.kicker}>THE DAILY DOG GAME</Text>
        <Text style={styles.title}>🐾 Barkle #{puzzleNumber}</Text>

        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>
            {won ? `Solved in ${score}` : `Out of guesses · ${score}`}
          </Text>
        </View>

        <Text style={styles.grid} accessibilityLabel={`Result grid ${grid}`}>
          {grid}
        </Text>

        <Text style={styles.tagline}>Guess the mystery breed in six tries.</Text>

        <View style={styles.footer}>
          <Text style={styles.brand}>GoDoggyDate</Text>
          <Text style={styles.url}>godoggydate.com/barkle</Text>
        </View>
      </View>
    </View>
  );
});

BarkleResultCard.displayName = 'BarkleResultCard';
export default BarkleResultCard;

const CARD_WIDTH = 320;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#5C3D2E',
  },
  inner: {
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.8)',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: '#FFFFFF',
    marginTop: 6,
    textAlign: 'center',
  },
  scorePill: {
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  scoreText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  grid: {
    marginTop: 20,
    fontSize: 34,
    letterSpacing: 4,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 18,
    textAlign: 'center',
  },
  footer: {
    marginTop: 22,
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingTop: 12,
  },
  brand: { fontFamily: fonts.display, fontSize: 15, color: '#FFFFFF' },
  url: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.8)' },
});
