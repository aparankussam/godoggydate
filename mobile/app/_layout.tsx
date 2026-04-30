import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from '@stripe/stripe-react-native';
import { SessionProvider } from '../lib/session';

export default function RootLayout() {
  const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!stripePublishableKey) {
    throw new Error('Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY for mobile Stripe initialization');
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider publishableKey={stripePublishableKey}>
        <SessionProvider>
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
          </Stack>
        </SessionProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
