import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { TabPage } from "@/components/tab-pager";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { useTheme, outlineOnly } from "@/contexts/theme";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { useProfile } from "@/contexts/profile";
import { AvatarCircle } from "@/components/avatar-circle";
import { useStrings } from "@/lib/i18n";
import { common } from "@/lib/i18n/strings/common";
import { profileStrings } from "@/lib/i18n/strings/profile";
import { responsiveContent } from "@/lib/responsive";

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { colors } = useTheme();
  const { profile, refreshProfile } = useProfile();
  const t = useStrings(profileStrings);
  const c = useStrings(common);

  const s = makeStyles(colors);

  // ProfileProvider already fetches this at app launch, so it's normally
  // in hand well before this tab is ever opened — this refresh is just to
  // pick up an avatar change made on the picker screen since then.
  useFocusAfterTransition(refreshProfile);

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
    Alert.alert(t.signOutConfirmTitle, t.signOutConfirmBody, [
      { text: c.cancel, style: "cancel" },
      { text: t.signOutLabel, style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <TabPage style={s.container}>
      <View style={s.content}>
        <Text style={s.title}>{t.title}</Text>

        <View style={s.profileSection}>
          <TouchableOpacity
            onPress={handleChangeAvatar}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.changeAvatarLabel}
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
              <Text style={s.menuItemText}>{t.settingsLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.subtext} />
          </TouchableOpacity>

          {profile?.is_moderator && (
            <TouchableOpacity style={s.menuItem} onPress={handleModeration}>
              <View style={s.menuItemContent}>
                <Ionicons name="shield-checkmark-outline" size={24} color={colors.text} />
                <Text style={s.menuItemText}>{t.moderateLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.subtext} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.menuItem} onPress={handleAtsijungti}>
            <View style={s.menuItemContent}>
              <Ionicons name="log-out-outline" size={24} color={colors.red} />
              <Text style={s.logoutText}>{t.signOutLabel}</Text>
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
    content: { flex: 1, paddingHorizontal: 16, ...responsiveContent },
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
