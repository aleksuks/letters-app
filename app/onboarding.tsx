import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Linking, ScrollView,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useTheme, outlineOnly, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { AvatarPickerGrid } from "@/components/avatar-picker-grid";
import { randomAvatarEmoji } from "@/lib/avatars";
import { useStrings } from "@/lib/i18n";
import { onboardingStrings } from "@/lib/i18n/strings/onboarding";
import { responsiveContent } from "@/lib/responsive";

const PRIVACY_POLICY_URL = "https://laiskelis.lt/privacy.html";
const TERMS_OF_SERVICE_URL = "https://laiskelis.lt/terms.html";

export default function OnboardingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const t = useStrings(onboardingStrings);
  const s = makeStyles(colors);
  const [nickname, setNickname] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState(randomAvatarEmoji);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const canProceed = ageConfirmed && termsAccepted && nickname.trim().length >= 2;

  async function handleFinish() {
    if (!user) return;
    if (!canProceed) {
      if (nickname.trim().length < 2) {
        Alert.alert(t.missingNicknameTitle, t.missingNicknameBody);
      } else if (!ageConfirmed) {
        Alert.alert(t.missingAgeTitle, t.missingAgeBody);
      } else if (!termsAccepted) {
        Alert.alert(t.missingTermsTitle, t.missingTermsBody);
      }
      return;
    }
    setLoading(true);

    try {
      const { error } = await supabase.from("user_profiles").insert({
        id: user.id,
        nickname: nickname.trim(),
        avatar_emoji: avatarEmoji,
        age_confirmed: true,
      });

      if (error) {
        if (error.code === "23505") {
          Alert.alert(t.nicknameTakenTitle, t.nicknameTakenBody);
        } else if (error.message.includes("nickname_rejected_script")) {
          // Migration 040 — a Cyrillic nickname is the app's easiest
          // impersonation vector, since it's the only identity others see.
          Alert.alert(
            t.invalidNicknameScriptTitle,
            t.invalidNicknameScriptBody
          );
        } else if (error.message.includes("nickname_rejected_moderation")) {
          Alert.alert(
            t.invalidNicknameModerationTitle,
            t.invalidNicknameModerationBody
          );
        } else {
          throw error;
        }
        return;
      }

      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert(t.errorTitle, (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={s.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        style={s.content}
        contentContainerStyle={s.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>{t.title}</Text>
        <Text style={s.subtitle}>
          {t.subtitle}
        </Text>

        <View style={s.field}>
          <Text style={s.label}>{t.nicknameLabel}</Text>
          <TextInput
            style={s.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder={t.nicknamePlaceholder}
            placeholderTextColor={colors.subtext}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
          />
          <Text style={s.hint}>{t.nicknameHint}</Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>{t.avatarLabel}</Text>
          <AvatarPickerGrid selected={avatarEmoji} onSelect={setAvatarEmoji} />
        </View>

        <TouchableOpacity
          style={s.checkbox}
          onPress={() => setAgeConfirmed(v => !v)}
          activeOpacity={0.7}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
        >
          <View style={[s.checkBox, ageConfirmed && s.checkBoxChecked]}>
            {ageConfirmed && <Text style={s.checkMark}>✓</Text>}
          </View>
          <Text style={s.checkLabel}>{t.ageConfirmLabel}</Text>
        </TouchableOpacity>

        <View style={s.checkboxMulti}>
          <TouchableOpacity
            onPress={() => setTermsAccepted(v => !v)}
            activeOpacity={0.7}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
          >
            <View style={[s.checkBox, termsAccepted && s.checkBoxChecked]}>
              {termsAccepted && <Text style={s.checkMark}>✓</Text>}
            </View>
          </TouchableOpacity>
          <Text style={[s.checkLabel, s.checkLabelMulti]}>
            {t.termsPrefix}{" "}
            <Text style={s.link} onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
              {t.termsLink}
            </Text>
            {" "}{t.termsMiddle}{" "}
            <Text style={s.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              {t.privacyLink}
            </Text>.
          </Text>
        </View>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.button, !canProceed && s.buttonDisabled]}
          onPress={handleFinish}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={s.buttonText}>{t.finish}</Text>
          )}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    keyboardAvoider: { flex: 1 },
    content: { flex: 1, ...responsiveContent },
    contentContainer: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24 },
    title: { fontSize: 34, fontWeight: "bold", color: colors.text },
    subtitle: { fontSize: 16, color: colors.subtext, marginTop: 12, lineHeight: 24 },
    field: { marginTop: 48 },
    label: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 10 },
    input: {
      backgroundColor: colors.surface, borderRadius: 12, padding: 16,
      fontSize: 16, color: colors.text,
      ...outlineOver(colors, colors.border),
    },
    hint: { fontSize: 12, color: colors.subtext, marginTop: 8 },
    checkbox: { flexDirection: "row", alignItems: "center", marginTop: 36 },
    checkBox: {
      width: 24, height: 24, borderRadius: 6, borderWidth: 2,
      borderColor: colors.subtext, justifyContent: "center", alignItems: "center",
    },
    checkBoxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkMark: { color: colors.accentText, fontSize: 14, fontWeight: "bold" },
    checkLabel: { fontSize: 15, color: colors.text, marginLeft: 12 },
    checkboxMulti: { flexDirection: "row", alignItems: "flex-start", marginTop: 16 },
    checkLabelMulti: { flex: 1, lineHeight: 21 },
    link: { color: colors.accent, textDecorationLine: "underline" },
    footer: {
      paddingHorizontal: 24, paddingVertical: 24,
      borderTopWidth: 1, borderTopColor: colors.border,
      ...responsiveContent,
    },
    button: {
      backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: "center",
      ...outlineOnly(colors),
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.accentText, fontSize: 16, fontWeight: "bold" },
  });
}
