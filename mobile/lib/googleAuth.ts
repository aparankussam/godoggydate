import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

let configured = false;

function mapGoogleSignInError(error: unknown): Error {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown Google sign-in error');
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('developer_error') ||
    normalized.includes('12500') ||
    normalized.includes('12501') ||
    normalized.includes('client id') ||
    normalized.includes('id token')
  ) {
    return new Error('Google sign-in is misconfigured for this build. Please try Apple sign-in or guest mode for now.');
  }

  if (normalized.includes('network')) {
    return new Error('Google sign-in could not reach the network. Please try again in a moment.');
  }

  return error instanceof Error ? error : new Error(rawMessage);
}

function ensureConfigured(): void {
  if (configured) return;
  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID ||
    '';
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

  if (!webClientId) {
    throw new Error(
      'Google sign-in is not configured: missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    );
  }

  GoogleSignin.configure({
    webClientId,
    iosClientId: iosClientId || undefined,
    scopes: ['openid', 'profile', 'email'],
  });

  configured = true;
}

export interface GoogleSignInResult {
  status: 'success' | 'cancelled';
  idToken?: string;
}

export async function signInWithGoogleNative(): Promise<GoogleSignInResult> {
  ensureConfigured();

  try {
    const response = await GoogleSignin.signIn();
    // v13 returns { type: 'success' | 'cancelled', data: { idToken, ... } }
    if (response.type === 'cancelled') {
      return { status: 'cancelled' };
    }
    const idToken = response.data?.idToken;
    if (!idToken) {
      throw new Error('Google sign-in did not return an ID token');
    }
    return { status: 'success', idToken };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return { status: 'cancelled' };
      }
      if (error.code === statusCodes.IN_PROGRESS) {
        throw new Error('A Google sign-in is already in progress.');
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services is not available on this device.');
      }
    }
    throw mapGoogleSignInError(error);
  }
}
