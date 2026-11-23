import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useFonts } from 'expo-font';
import { Chewy_400Regular } from '@expo-google-fonts/chewy';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';
import { SessionProvider, useSession } from '../lib/session';
import { addNotificationTapListener, registerForPushNotifications } from '../lib/push';
import { colors } from '../constants/theme';

/**
 * Saves this device's push token on sign-in when permission is already
 * granted (it never prompts; see lib/push.ts), and routes notification taps.
 */
function PushBootstrap() {
  const { user, loading, profileComplete } = useSession();
  const uid = user?.uid ?? null;
  const ready = !loading && Boolean(uid) && profileComplete;
  const readyRef = useRef(ready);
  const loadingRef = useRef(loading);
  const pendingRoute = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    void registerForPushNotifications(uid);
  }, [uid]);

  const flush = useCallback(() => {
    const route = pendingRoute.current;
    if (!route) return;
    pendingRoute.current = null;
    // Wait a tick: on a cold start the root index screen redirects in the
    // same commit that makes us ready, and the tapped screen belongs on top
    // of wherever that lands.
    setTimeout(() => {
      if (route.startsWith('/(tabs)/')) router.navigate(route as Href);
      else router.push(route as Href);
    }, 0);
  }, []);

  useEffect(() => {
    readyRef.current = ready;
    loadingRef.current = loading;
    if (ready) flush();
    // Signed out, or no finished profile: nothing a notification points at
    // is reachable, so drop it rather than jump there later.
    else if (!loading) pendingRoute.current = null;
  }, [flush, loading, ready]);

  useEffect(() => {
    return addNotificationTapListener((route) => {
      if (readyRef.current) {
        pendingRoute.current = route;
        flush();
      } else if (loadingRef.current) {
        // Cold start: hold it until the session has loaded.
        pendingRoute.current = route;
      }
    });
  }, [flush]);

  return null;
}

export default function RootLayout() {
  const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!stripePublishableKey) {
    throw new Error('Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY for mobile Stripe initialization');
  }

  // Brand fonts shared with the web app: Chewy (display), Caveat (owner
  // handwriting) and Nunito (body).
  const [fontsLoaded] = useFonts({
    Chewy_400Regular,
    Caveat_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sky }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.sky }}>
      <StripeProvider publishableKey={stripePublishableKey}>
        <SessionProvider>
          <PushBootstrap />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.sky } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="welcome" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="household/index" />
            <Stack.Screen name="household/join" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="chat/[matchId]"
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="dogtype-reveal"
              options={{ presentation: 'modal', animation: 'fade' }}
            />
            <Stack.Screen name="fun/wanted" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="fun/snoot" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="fun/sticker-studio" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="fun/adventures" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="fun/barkle" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="fun/playroom" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </SessionProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
