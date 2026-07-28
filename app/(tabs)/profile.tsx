import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { TabPage } from "@/components/tab-pager";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme, outlineOnly } from "@/contexts/theme";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { supabase } from "@/lib/supabase";
import { UserProfile } from "@/types";
import { AvatarCircle } from "@/components/avatar-circle";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const s = makeStyles(colors);

  const load = useCallback(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [user]);

  useFocusAfterTransition(load);

  function handleSettings() {
    router.push("/settings");
  }

  function handleModeration() {
    router.push("/moderation");
  }

  function handleChangeAvatar() {
    router.push("/avatar-picker" as any);
  }

  function handleAtsijungti() {
    Alert.alert("Atsijungti", "Ar tikrai norite atsijungti? Gal ne?", [
      { text: "Atšaukti", style: "cancel" },
      { text: "Atsijungti", style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <TabPage style={s.container}>
      <View style={s.content}>
        <Text style={s.title}>Profilis</Text>

        <View style={s.profileSection}>
          <TouchableOpacity
            onPress={handleChangeAvatar}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Keisti avatarą"
          >
            <AvatarCircle emoji={profile?.avatar_emoji ?? "🦊"} size={96} />
            <View style={s.avatarEditBadge}>
              <Ionicons name="pencil" size={14} color={colors.accentText} />
            </View>
          </TouchableOpacity>
          <Text style={s.nickname}>{profile?.nickname ?? "…"}</Text>
        </View>

        <View style={s.menuContainer}>
          <TouchableOpacity style={s.menuItem} onPress={handleSettings}>
            <View style={s.menuItemContent}>
              <Ionicons name="cog-outline" size={24} color={colors.text} />
              <Text style={s.menuItemText}>Nustatymai</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.subtext} />
          </TouchableOpacity>

          {profile?.is_moderator && (
            <TouchableOpacity style={s.menuItem} onPress={handleModeration}>
              <View style={s.menuItemContent}>
                <Ionicons name="shield-checkmark-outline" size={24} color={colors.text} />
                <Text style={s.menuItemText}>Moderuoti</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.subtext} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.menuItem} onPress={handleAtsijungti}>
            <View style={s.menuItemContent}>
              <Ionicons name="log-out-outline" size={24} color={colors.red} />
              <Text style={s.logoutText}>Atsijungti</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.subtext} />
          </TouchableOpacity>
        </View>
      </View>
    </TabPage>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, paddingHorizontal: 16 },
    title: { fontSize: 32, fontWeight: "bold", color: colors.text, marginTop: 24 },
    profileSection: { marginTop: 32, alignItems: "center" },
    avatarEditBadge: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.accent,
      borderWidth: 2,
      borderColor: colors.bg,
      justifyContent: "center",
      alignItems: "center",
    },
    nickname: { fontSize: 24, fontWeight: "bold", color: colors.text, marginTop: 16 },
    menuContainer: { marginTop: 48, gap: 12 },
    menuItem: {
      backgroundColor: colors.surface,
      ...outlineOnly(colors),
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    menuItemContent: { flexDirection: "row", alignItems: "center" },
    menuItemText: { fontSize: 18, color: colors.text, marginLeft: 16 },
    logoutText: { fontSize: 18, color: colors.red, marginLeft: 16 },
  });
}
