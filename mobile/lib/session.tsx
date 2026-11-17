import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signOut,
  type AuthCredential,
  type User,
} from '@firebase/auth';
import { getFirebase } from './firebase';
import { getUserDogProfile, saveUserDogProfile, isProfileComplete, type SavedDogProfile } from './profile';
import { setAnalyticsUser, trackEvent } from './analytics';
import { getHouseholdDogsForUser, peekPendingHouseholdInvite, type HouseholdDog } from './household';
import {
  hasAcceptedCurrentTerms,
  recordTermsAcceptance as writeTermsAcceptance,
  rememberTermsAcceptedOnDevice,
} from './account';

/** What the router needs to know to decide where a signed-in person belongs. */
export interface SessionSnapshot {
  user: User | null;
  profile: SavedDogProfile | null;
  profileComplete: boolean;
  householdDogs: HouseholdDog[];
  /**
   * No finished dog profile of their own, but invited onto someone else's dog.
   * Web's version is `!savedProfile && dogs.length > 0`; on iPhone an
   * unfinished profile also counts, because iPhone would otherwise hold them
   * in onboarding with no way to reach the dog they were invited to help with.
   */
  householdOnly: boolean;
  termsAccepted: boolean;
}

interface SessionContextValue extends SessionSnapshot {
  loading: boolean;
  signInGuest: () => Promise<void>;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signInWithAppleCredential: (identityToken: string, rawNonce: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Re-reads profile, household and Terms for the signed-in user. */
  refreshSession: () => Promise<SessionSnapshot>;
  /** Saves 18+ / Terms acceptance for the signed-in user. Best effort, never throws. */
  recordTermsAcceptance: () => Promise<void>;
  saveProfile: (profile: SavedDogProfile) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface AccountData {
  profile: SavedDogProfile | null;
  householdDogs: HouseholdDog[];
  termsAccepted: boolean;
}

async function loadAccount(user: User): Promise<AccountData> {
  const [profile, termsAccepted] = await Promise.all([
    getUserDogProfile(user.uid),
    hasAcceptedCurrentTerms(user.uid).catch(() => false),
  ]);
  // Same gate as web: someone with their own dog never runs the household
  // query. A failed query falls back to the ordinary onboarding path.
  const householdDogs = isProfileComplete(profile)
    ? []
    : await getHouseholdDogsForUser(user.uid).catch((error) => {
        console.warn('[Session] household lookup failed', error);
        return [] as HouseholdDog[];
      });
  return { profile, householdDogs, termsAccepted };
}

function toSnapshot(user: User | null, data: AccountData | null): SessionSnapshot {
  const profile = data?.profile ?? null;
  const profileComplete = isProfileComplete(profile);
  const householdDogs = data?.householdDogs ?? [];
  return {
    user,
    profile,
    profileComplete,
    householdDogs,
    householdOnly: !profileComplete && householdDogs.length > 0,
    termsAccepted: data?.termsAccepted ?? false,
  };
}

/**
 * Where a person with a restored session belongs. Used by the root index, and
 * by the welcome and onboarding screens when the session changes under them.
 * Guests without a finished profile stay on the welcome screen, which offers
 * "Resume as Guest".
 */
export function homeRouteFor(
  session: Pick<SessionSnapshot, 'user' | 'profileComplete' | 'householdOnly'>,
): string {
  if (!session.user) return '/welcome';
  if (session.profileComplete) return '/(tabs)/discover';
  if (session.householdOnly) return '/household';
  if (session.user.isAnonymous) return '/welcome';
  return '/onboarding';
}

/**
 * Where to go right after someone signs in (Google, Apple or guest) from the
 * welcome screen. A household invite link that arrived while signed out wins.
 */
export function routeAfterSignIn(
  session: Pick<SessionSnapshot, 'user' | 'profileComplete' | 'householdOnly'>,
): string {
  if (!session.user) return '/welcome';
  if (peekPendingHouseholdInvite()) return '/household/join';
  if (session.profileComplete) return '/(tabs)/discover';
  if (session.householdOnly) return '/household';
  return '/onboarding';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { auth } = getFirebase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [householdDogs, setHouseholdDogs] = useState<HouseholdDog[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  // Each auth event gets a number; only the latest one may write state, so a
  // slow load for a previous account can't land on top of the current one.
  const authSeq = useRef(0);
  // Acceptance recorded on this device during this session. Covers the window
  // where a load that started before the write reads the old users/{uid}.
  const acceptedUid = useRef<string | null>(null);

  const applyAccount = useCallback((uid: string, data: AccountData) => {
    setProfile(data.profile);
    setHouseholdDogs(data.householdDogs);
    setTermsAccepted(data.termsAccepted || acceptedUid.current === uid);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return;
    }

    const nextProfile = await getUserDogProfile(auth.currentUser.uid);
    setProfile(nextProfile);
  }, [auth]);

  useEffect(() => {
    if (!auth) {
      console.error('Auth not initialized');
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      const seq = ++authSeq.current;
      if (__DEV__) {
        console.info('[Session] auth state changed', {
          uid: nextUser?.uid ?? null,
          isAnonymous: nextUser?.isAnonymous ?? false,
          providerIds: nextUser?.providerData?.map((provider) => provider.providerId) ?? [],
        });
      }
      setUser(nextUser);
      setAnalyticsUser(nextUser?.uid ?? null);
      if (!nextUser) {
        setProfile(null);
        setHouseholdDogs([]);
        setTermsAccepted(false);
        setLoading(false);
        return;
      }

      // Screens that route on the session (index, welcome, onboarding) wait
      // for this, so a sign-in can't be routed on the previous account's
      // profile or before the household lookup has answered.
      setLoading(true);
      try {
        const data = await loadAccount(nextUser);
        if (__DEV__) {
          console.info('[Session] account loaded', {
            uid: nextUser.uid,
            hasProfile: Boolean(data.profile),
            profileComplete: isProfileComplete(data.profile),
            householdDogs: data.householdDogs.length,
            termsAccepted: data.termsAccepted,
          });
        }
        if (seq === authSeq.current) applyAccount(nextUser.uid, data);
      } catch (error) {
        console.warn('[Session] could not load account', error);
        if (seq === authSeq.current) {
          setProfile(null);
          setHouseholdDogs([]);
        }
      } finally {
        if (seq === authSeq.current) setLoading(false);
      }
    });

    return unsub;
  }, [applyAccount, auth]);

  const refreshSession = useCallback(async (): Promise<SessionSnapshot> => {
    const current = auth.currentUser;
    if (!current) return toSnapshot(null, null);
    const data = await loadAccount(current);
    const merged = { ...data, termsAccepted: data.termsAccepted || acceptedUid.current === current.uid };
    if (auth.currentUser?.uid === current.uid) {
      // Linking a guest to Google/Apple keeps the same User object and fires
      // no auth event; setting it here is harmless and keeps state in step.
      setUser(current);
      applyAccount(current.uid, merged);
    }
    return toSnapshot(current, merged);
  }, [applyAccount, auth]);

  const recordTermsAcceptance = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    acceptedUid.current = current.uid;
    setTermsAccepted(true);
    void rememberTermsAcceptedOnDevice();
    // Best effort, like web: a failed write must not strand someone who just
    // signed in. The box was ticked before any sign-in button would work.
    await writeTermsAcceptance(current.uid).catch((error) => {
      console.error('recordTermsAcceptance failed', error);
    });
  }, [auth]);

  const signInGuest = useCallback(async () => {
    await signInAnonymously(auth);
  }, [auth]);

  const applyCredential = useCallback(async (credential: AuthCredential, providerLabel: string) => {
    const currentUser = auth.currentUser;

    if (currentUser?.isAnonymous) {
      try {
        if (__DEV__) {
          console.info(`[Session] linking anonymous user with ${providerLabel} credential`, {
            uid: currentUser.uid,
          });
        }
        await linkWithCredential(currentUser, credential);
        return;
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code ?? '') : '';
        if (code !== 'auth/credential-already-in-use' && code !== 'auth/provider-already-linked') {
          throw error;
        }
        if (__DEV__) {
          console.info('[Session] falling back to signInWithCredential after link attempt', { code, providerLabel });
        }
      }
    }

    await signInWithCredential(auth, credential);
  }, [auth]);

  const signInWithGoogleIdToken = useCallback(async (idToken: string) => {
    const trimmedToken = idToken.trim();
    if (!trimmedToken) {
      throw new Error('Google sign-in did not return an ID token');
    }

    const credential = GoogleAuthProvider.credential(trimmedToken);
    await applyCredential(credential, 'Google');
  }, [applyCredential]);

  const signInWithAppleCredential = useCallback(async (identityToken: string, rawNonce: string) => {
    const trimmedToken = identityToken.trim();
    if (!trimmedToken) {
      throw new Error('Apple sign-in did not return an identity token');
    }

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: trimmedToken,
      rawNonce: rawNonce || undefined,
    });

    await applyCredential(credential, 'Apple');
  }, [applyCredential]);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, [auth]);

  const saveProfile = useCallback(async (nextProfile: SavedDogProfile) => {
    if (!auth.currentUser) throw new Error('Not signed in');
    await saveUserDogProfile(auth.currentUser.uid, nextProfile);
    setProfile(nextProfile);
    const completed = isProfileComplete(nextProfile);
    trackEvent('profile_saved', { context: 'mobile', completed });
    if (completed) trackEvent('profile_completed', { context: 'mobile' });
  }, [auth]);

  const value = useMemo<SessionContextValue>(() => {
    const profileComplete = isProfileComplete(profile);
    return {
      user,
      profile,
      loading,
      profileComplete,
      householdDogs,
      householdOnly: !profileComplete && householdDogs.length > 0,
      termsAccepted,
      signInGuest,
      signInWithGoogleIdToken,
      signInWithAppleCredential,
      signOutUser,
      refreshProfile,
      refreshSession,
      recordTermsAcceptance,
      saveProfile,
    };
  }, [
    householdDogs,
    loading,
    profile,
    recordTermsAcceptance,
    refreshProfile,
    refreshSession,
    saveProfile,
    signInGuest,
    signInWithAppleCredential,
    signInWithGoogleIdToken,
    signOutUser,
    termsAccepted,
    user,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
