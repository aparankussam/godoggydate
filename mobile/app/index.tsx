import { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts } from '../constants/theme';

export default function SplashIndex() {
  useEffect(() => {
    async function checkOnboarding() {
      await new Promise((r) => setTimeout(r, 1800));
      const dogId = await AsyncStorage.getItem('userDogId');
      if (dogId) {
        router.replace('/(tabs)/discover');
      } else {
        router.replace('/onboarding');
      }
    }
    checkOnboarding();
  }, []);

  return (
    <LinearGradient colors={['#FDF6EE', '#F5E6D3']} style={styles.container}>
      <View style={styles.logoWrap}>
        <Text style={styles.paw}>🐾</Text>
        <Text style={styles.title}>GoDoggyDate</Text>
        <Text style={styles.tagline}>Find safer, happier playdates for your dog</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    gap: 12,
  },
  paw: {
    fontSize: 72,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.brown,
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.brownLight,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
