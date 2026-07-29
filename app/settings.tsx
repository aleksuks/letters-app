import { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity,
  StyleSheet, Switch, ScrollView, Alert, Linking, LayoutChangeEvent,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, outlineOnly } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useLanguage } from "@/contexts/language";
import { useAuth } from "@/hooks/use-auth";
import { useTutorial } from "@/contexts/tutorial";
import { supabase } from "@/lib/supabase";
import { useStrings } from "@/lib/i18n";
import { settingsStrings } from "@/lib/i18n/strings/settings";

const PRIVACY_POLICY_URL = "https://laiskelis.lt/privacy.html";
const TERMS_OF_SERVICE_URL = "https://laiskelis.lt/terms.html";

const APP_VERSION = Constants.expoConfig?.version ?? "—";

// Mirrors langToggle's own padding/gap below — read by the sliding
// highlight's translateX math, so keep the two in sync if either changes.
const LANG_TOGGLE_PAD = 4;
const LANG_TOGGLE_GAP = 4;

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets, reducedMotion } = useAccessibility();
  const { lang, setLang } = useLanguage();
  const { resetAll: resetTutorial } = useTutorial();
  const t = useStrings(settingsStrings);
  const s = makeStyles(colors);

  // Sliding pill behind the active option, mirroring the spring/timing feel
  // used for ceremony elsewhere (e.g. envelope-letter.tsx, receive.tsx) —
  // duration 1 rather than 0 under reduced motion, matching that same
  // convention, since some Reanimated versions treat a literal 0 oddly.
  const [langToggleWidth, setLangToggleWidth] = useState(0);
  const langButtonWidth = langToggleWidth > 0 ? (langToggleWidth - LANG_TOGGLE_PAD * 2 - LANG_TOGGLE_GAP) / 2 : 0;
  const langHighlightX = useSharedValue(lang === "lt" ? 0 : 1);

  useEffect(() => {
    langHighlightX.value = withTiming(lang === "lt" ? 0 : 1, { duration: reducedMotion ? 1 : 220 });
  }, [lang, reducedMotion, langHighlightX]);

  const langHighlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: langHighlightX.value * (langButtonWidth + LANG_TOGGLE_GAP) }],
  }));

  function onLangToggleLayout(e: LayoutChangeEvent) {
    setLangToggleWidth(e.nativeEvent.layout.width);
  }

  const [acceptsRequests, setAcceptsRequests] = useState(true);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [activityNotificationsEnabled, setActivityNotificationsEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("accepts_requests, reminders_enabled, activity_notifications_enabled")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setAcceptsRequests(data.accepts_requests);
          setRemindersEnabled(data.reminders_enabled);
          setActivityNotificationsEnabled(data.activity_notifications_enabled);
        }
        setLoaded(true);
      });
  }, [user]);

  async function handleToggleRequests(value: boolean) {
    if (!user) return;
    setAcceptsRequests(value);
    const { error } = await supabase
      .from("user_profiles")
      .update({ accepts_requests: value })
      .eq("id", user.id);

    if (error) {
      setAcceptsRequests(!value);
      Alert.alert(t.errorTitle, error.message);
    }
  }

  async function handleToggleReminders(value: boolean) {
    if (!user) return;
    setRemindersEnabled(value);
    const { error } = await supabase
      .from("user_profiles")
      .update({ reminders_enabled: value })
      .eq("id", user.id);

    if (error) {
      setRemindersEnabled(!value);
      Alert.alert(t.errorTitle, error.message);
    }
  }

  async function handleToggleActivityNotifications(value: boolean) {
    if (!user) return;
    setActivityNotificationsEnabled(value);
    const { error } = await supabase
      .from("user_profiles")
      .update({ activity_notifications_enabled: value })
      .eq("id", user.id);

    if (error) {
      setActivityNotificationsEnabled(!value);
      Alert.alert(t.errorTitle, error.message);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      t.deleteConfirmTitle,
      t.deleteConfirmBody,
      [
        { text: t.deleteConfirmCancel, style: "cancel" },
        {
          text: t.deleteConfirmContinue,
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t.deleteFinalTitle,
              t.deleteFinalBody,
              [
                { text: t.deleteFinalCancel, style: "cancel" },
                {
                  text: t.deleteFinalConfirm,
                  style: "destructive",
                  onPress: confirmDeleteAccount,
                },
              ]
            );
          },
        },
      ]
    );
  }

  async function confirmDeleteAccount() {
    setDeleting(true);
    const { error } = await supabase.rpc("delete_own_account");
    if (error) {
      setDeleting(false);
      Alert.alert(t.errorTitle, error.message);
      return;
    }
    await signOut();
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel={t.goBack}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>{t.title}</Text>
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.languageSectionTitle}</Text>
          <View style={[s.settingItem, { marginBottom: 0 }]}>
            <View style={s.langToggle} onLayout={onLangToggleLayout}>
              {langButtonWidth > 0 && (
                <Animated.View
                  pointerEvents="none"
                  style={[s.langHighlight, { width: langButtonWidth }, langHighlightStyle]}
                />
              )}
              <TouchableOpacity
                style={s.langOption}
                onPress={() => setLang("lt")}
                accessibilityRole="button"
                accessibilityLabel={t.languageLt}
                accessibilityState={{ selected: lang === "lt" }}
              >
                <Text style={[s.langOptionText, lang === "lt" && s.langOptionTextActive]}>
                  {t.languageLt}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.langOption}
                onPress={() => setLang("en")}
                accessibilityRole="button"
                accessibilityLabel={t.languageEn}
                accessibilityState={{ selected: lang === "en" }}
              >
                <Text style={[s.langOptionText, lang === "en" && s.langOptionTextActive]}>
                  {t.languageEn}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.connectionsSectionTitle}</Text>
          <View style={s.settingItem}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.acceptRequestsLabel}</Text>
              <Text style={s.settingDesc}>
                {t.acceptRequestsDesc}
              </Text>
            </View>
            <Switch
              value={acceptsRequests}
              onValueChange={handleToggleRequests}
              disabled={!loaded}
              trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
              thumbColor="#fff"
              accessibilityLabel={t.acceptRequestsLabel}
              accessibilityRole="switch"
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.privacySectionTitle}</Text>
          <TouchableOpacity
            style={[s.settingItem, { marginBottom: 0 }]}
            onPress={() => router.push("/blocked-users" as any)}
            accessibilityRole="button"
            accessibilityLabel={t.blockedUsersLabel}
          >
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.blockedUsersLabel}</Text>
              <Text style={s.settingDesc}>{t.blockedUsersDesc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.notificationsSectionTitle}</Text>
          <View style={s.settingItem}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.activityNotificationsLabel}</Text>
              <Text style={s.settingDesc}>
                {t.activityNotificationsDesc}
              </Text>
            </View>
            <Switch
              value={activityNotificationsEnabled}
              onValueChange={handleToggleActivityNotifications}
              disabled={!loaded}
              trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
              thumbColor="#fff"
              accessibilityLabel={t.activityNotificationsLabel}
              accessibilityRole="switch"
            />
          </View>
          <View style={[s.settingItem, { marginBottom: 0 }]}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.remindersLabel}</Text>
              <Text style={s.settingDesc}>
                {t.remindersDesc}
              </Text>
            </View>
            <Switch
              value={remindersEnabled}
              onValueChange={handleToggleReminders}
              disabled={!loaded}
              trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
              thumbColor="#fff"
              accessibilityLabel={t.remindersLabel}
              accessibilityRole="switch"
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.helpSectionTitle}</Text>
          <TouchableOpacity
            style={[s.settingItem, { marginBottom: 0 }]}
            onPress={() => {
              resetTutorial();
              Alert.alert(t.resetTutorialDoneTitle, t.resetTutorialDoneBody);
            }}
            accessibilityRole="button"
            accessibilityLabel={t.resetTutorialLabel}
          >
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.resetTutorialLabel}</Text>
              <Text style={s.settingDesc}>{t.resetTutorialDesc}</Text>
            </View>
            <Ionicons name="refresh" size={20} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.accessibilitySectionTitle}</Text>
          <TouchableOpacity
            style={[s.settingItem, { marginBottom: 0 }]}
            onPress={() => router.push("/accessibility" as any)}
            accessibilityRole="button"
            accessibilityLabel={t.accessibilityLabel}
          >
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.accessibilityLabel}</Text>
              <Text style={s.settingDesc}>{t.accessibilityDesc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>{t.accountSectionTitle}</Text>
          <TouchableOpacity
            style={s.settingItem}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
            accessibilityRole="button"
            accessibilityLabel={t.privacyPolicyLabel}
          >
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.privacyPolicyLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.settingItem}
            onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
            accessibilityRole="button"
            accessibilityLabel={t.termsLabel}
          >
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.termsLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </TouchableOpacity>
          <View style={s.settingItem}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>{t.versionLabel}</Text>
            </View>
            <Text style={s.versionText}>{APP_VERSION}</Text>
          </View>
          <TouchableOpacity
            style={[s.settingItem, { marginBottom: 0 }]}
            onPress={handleDeleteAccount}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel={t.deleteAccountLabel}
          >
            <View style={s.settingContent}>
              <Text style={[s.settingLabel, s.dangerText]}>
                {deleting ? t.deleteAccountDeleting : t.deleteAccountLabel}
              </Text>
              <Text style={s.settingDesc}>{t.deleteAccountDesc}</Text>
            </View>
            <Ionicons name="trash-outline" size={20} color={colors.red} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 24,
    },
    backButton: { marginRight: 16 },
    title: { fontSize: 28, fontWeight: "bold", color: colors.text, flex: 1 },
    content: { flex: 1, paddingHorizontal: 16 },
    section: { marginBottom: 32 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.subtext,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    settingItem: {
      backgroundColor: colors.surface,
      ...outlineOnly(colors),
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    settingContent: { flex: 1 },
    settingLabel: { fontSize: 16, color: colors.text, fontWeight: "500" },
    dangerText: { color: colors.red },
    settingDesc: { fontSize: 13, color: colors.subtext, marginTop: 4 },
    versionText: { fontSize: 14, color: colors.subtext },
    langToggle: {
      flexDirection: "row",
      flex: 1,
      backgroundColor: colors.bg,
      borderRadius: 10,
      padding: LANG_TOGGLE_PAD,
      gap: LANG_TOGGLE_GAP,
      position: "relative",
    },
    langHighlight: {
      position: "absolute",
      top: LANG_TOGGLE_PAD,
      bottom: LANG_TOGGLE_PAD,
      left: LANG_TOGGLE_PAD,
      borderRadius: 8,
      backgroundColor: colors.accent,
    },
    langOption: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: "center",
    },
    langOptionText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.subtext,
    },
    langOptionTextActive: {
      color: colors.accentText,
    },
  });
}
