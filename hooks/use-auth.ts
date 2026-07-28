import { useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

export function useAuth(): AuthState & {
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithEmail(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUpWithEmail(email: string, password: string) {
    const emailRedirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    // Supabase deliberately returns a success-shaped response for an email
    // that's already registered (anti-enumeration) — it just skips creating
    // a new identity. An empty identities array is the documented way to
    // tell the two cases apart without Supabase leaking which emails exist
    // via an explicit error.
    if (!error && data.user && data.user.identities?.length === 0) {
      return { error: new Error('account_already_registered') };
    }
    return { error };
  }

  async function sendPasswordReset(email: string) {
    const redirectTo = Linking.createURL('auth/reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error };
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // Supabase emits a new session object (and thus a new `user` object) on
  // every auth event, including silent token refreshes. Memoizing on the
  // id keeps `user`'s reference stable across those events so effects that
  // depend on it (e.g. fetch-once-per-login screens) don't re-fire and
  // re-run one-time side effects like marking a letter as seen.
  const user = useMemo(() => session?.user ?? null, [session?.user?.id]);

  return {
    session,
    user,
    loading,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    updatePassword,
    signOut,
  };
}
