import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { UserProfile } from "@/types";

interface ProfileContextType {
  profile: UserProfile | null;
  refreshProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  refreshProfile: () => {},
});

// Fetched as soon as a session exists (mirrors UnreadMessagesProvider),
// not lazily when the profile tab first mounts — avatar, nickname, and
// is_moderator are already in hand by the time the user gets there instead
// of flashing the default fox and hiding the moderation menu item while a
// fetch that only just started resolves.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const refreshProfile = useCallback(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [user]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return (
    <ProfileContext.Provider value={{ profile, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
