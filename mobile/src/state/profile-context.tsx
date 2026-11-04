import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { getProfile, saveProfile } from '@/db/database';
import { localToday } from '@/components/screen';
import { clampProfile, withScheduleHistory, type Profile } from '@/domain/profile';

type ProfileState = { profile: Profile | null; update: (next: Profile) => void };

const ProfileContext = createContext<ProfileState>({ profile: null, update: () => {} });

export function ProfileProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const current = useRef<Profile | null>(null);

  useEffect(() => {
    getProfile(db).then((p) => {
      current.current = p;
      setProfile(p);
    });
  }, [db]);

  const update = useCallback(
    (next: Profile) => {
      const clamped = withScheduleHistory(current.current, clampProfile(next), localToday());
      current.current = clamped;
      setProfile(clamped);
      saveProfile(db, clamped);
    },
    [db],
  );

  return <ProfileContext.Provider value={{ profile, update }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}
