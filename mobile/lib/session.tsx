import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signOut,
  type User,
} from '@firebase/auth';
import { getFirebase } from './firebase';
import { getUserDogProfile, saveUserDogProfile, isProfileComplete, type SavedDogProfile } from './profile';

interface SessionContextValue {
  user: User | null;
  profile: SavedDogProfile | null;
  loading: boolean;
  profileComplete: boolean;
  signInGuest: () => Promise<void>;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (profile: SavedDogProfile) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { auth } = getFirebase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
      if (__DEV__) {
        console.info('[Session] auth state changed', {
          uid: nextUser?.uid ?? null,
          isAnonymous: nextUser?.isAnonymous ?? false,
          providerIds: nextUser?.providerData?.map((provider) => provider.providerId) ?? [],
        });
      }
      setUser(nextUser);
      if (nextUser) {
        try {
          const nextProfile = await getUserDogProfile(nextUser.uid);
          if (__DEV__) {
            console.info('[Session] profile loaded', {
              uid: nextUser.uid,
              hasProfile: Boolean(nextProfile),
              profileComplete: isProfileComplete(nextProfile),
            });
          }
          setProfile(nextProfile);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return unsub;
  }, [auth]);

  const signInGuest = useCallback(async () => {
    await signInAnonymously(auth);
  }, [auth]);

  const signInWithGoogleIdToken = useCallback(async (idToken: string) => {
    const trimmedToken = idToken.trim();
    if (!trimmedToken) {
      throw new Error('Google sign-in did not return an ID token');
    }

    const credential = GoogleAuthProvider.credential(trimmedToken);
    const currentUser = auth.currentUser;

    if (currentUser?.isAnonymous) {
      try {
        if (__DEV__) {
          console.info('[Session] linking anonymous user with Google credential', {
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
          console.info('[Session] falling back to signInWithCredential after link attempt', { code });
        }
      }
    }

    await signInWithCredential(auth, credential);
  }, [auth]);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, [auth]);

  const saveProfile = useCallback(async (nextProfile: SavedDogProfile) => {
    if (!auth.currentUser) throw new Error('Not signed in');
    await saveUserDogProfile(auth.currentUser.uid, nextProfile);
    setProfile(nextProfile);
  }, [auth]);

  const value = useMemo<SessionContextValue>(() => ({
    user,
    profile,
    loading,
    profileComplete: isProfileComplete(profile),
    signInGuest,
    signInWithGoogleIdToken,
    signOutUser,
    refreshProfile,
    saveProfile,
  }), [loading, profile, refreshProfile, saveProfile, signInGuest, signInWithGoogleIdToken, signOutUser, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
