import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';
import { SessionProvider, useSession } from '../lib/session';
import { addNotificationTapListener, registerForPushNotifications } from '../lib/push';
import { colors } from '../constants/theme';

/** Registers this device for push once signed in, and routes notification taps. */
function PushBootstrap() {
  const { user } = useSession();

  useEffect(() => {
    if (!user) return;
    void registerForPushNotifications(user.uid);
  }, [user]);

  useEffect(() => {
    return addNotificationTapListener((matchId) => {
      router.push({ pathname: '/chat/[matchId]', params: { matchId } });
    });
  }, []);

  return null;
}

export default function RootLayout() {
  const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!stripePublishableKey) {
    throw new Error('Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY for mobile Stripe initialization');
  }

  // The web app's Fraunces/Nunito brand fonts were never actually loaded on
  // mobile — theme.ts silently fell back to system fonts (Georgia for
  // display), so iOS looked like a newspaper instead of the styled web app.
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider publishableKey={stripePublishableKey}>
        <SessionProvider>
          <PushBootstrap />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="welcome" />
            <Stack.Screen name="onboarding" />
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
          </Stack>
        </SessionProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
