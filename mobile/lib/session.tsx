import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth';
import { getFirebase } from './firebase';
import { getUserDogProfile, saveUserDogProfile, isProfileComplete, type SavedDogProfile } from './profile';

interface SessionContextValue {
  user: User | null;
  profile: SavedDogProfile | null;
  loading: boolean;
  profileComplete: boolean;
  signInGuest: () => Promise<void>;
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
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const nextProfile = await getUserDogProfile(nextUser.uid);
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
    signOutUser,
    refreshProfile,
    saveProfile,
  }), [loading, profile, refreshProfile, saveProfile, signInGuest, signOutUser, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
