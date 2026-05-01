import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

export interface AppleSignInResult {
  status: 'success' | 'cancelled';
  identityToken?: string;
  rawNonce?: string;
}

function generateRawNonce(byteLength = 16): string {
  const bytes = Crypto.getRandomBytes(byteLength);
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    result += bytes[i].toString(16).padStart(2, '0');
  }
  return result;
}

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithAppleNative(): Promise<AppleSignInResult> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only available on iOS');
  }

  const rawNonce = generateRawNonce();
  const hashedNonce = await sha256(rawNonce);

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('Apple sign-in did not return an identity token');
    }

    return {
      status: 'success',
      identityToken: credential.identityToken,
      rawNonce,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return { status: 'cancelled' };
    }
    throw error;
  }
}
