import { useState } from "react";
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { PasswordInput } from "@/components/password-input";
import { useTheme, outlineOnly, outlineOver } from "@/contexts/theme";
import { useStrings } from "@/lib/i18n";
import { resetPasswordStrings } from "@/lib/i18n/strings/reset-password";

// Reached only via the recovery deep link handled in app/_layout.tsx, which
// calls setSession() from the emailed tokens before routing here — so a
// session already exists by the time this screen mounts, and updatePassword
// just needs a new value from the user.
export default function ResetPasswordScreen() {
  const { updatePassword, signOut } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const t = useStrings(resetPasswordStrings);
  const s = makeStyles(colors);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (password.length < 6) {
      Alert.alert(t.errorTitle, t.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t.errorTitle, t.passwordsDontMatch);
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      Alert.alert(t.errorTitle, error.message);
      return;
    }
    router.replace("/(tabs)");
  }

  async function handleCancel() {
    await signOut();
    router.replace("/(auth)/sign-in");
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={s.inner}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={s.title}>{t.title}</Text>
        <Text style={s.subtitle}>{t.subtitle}</Text>

        <PasswordInput
          containerStyle={s.input}
          placeholder={t.newPasswordPlaceholder}
          value={password}
          onChangeText={setPassword}
        />
        <PasswordInput
          containerStyle={s.input}
          placeholder={t.confirmPasswordPlaceholder}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <TouchableOpacity style={s.button} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={s.buttonText}>{t.save}</Text>
          )}
        </TouchableOpacity>

        <View style={s.switchRow}>
          <TouchableOpacity onPress={handleCancel}>
            <Text style={s.switchLink}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    inner: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
    title: { fontSize: 36, fontWeight: "bold", color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 16, color: colors.subtext, marginBottom: 40, lineHeight: 24 },
    input: {
      backgroundColor: colors.surface, color: colors.text, borderRadius: 12,
      padding: 16, fontSize: 16, marginBottom: 16,
      ...outlineOver(colors, colors.border),
    },
    button: {
      backgroundColor: colors.accent, borderRadius: 12, padding: 16,
      alignItems: "center", marginTop: 8,
      ...outlineOnly(colors),
    },
    buttonText: { color: colors.accentText, fontSize: 16, fontWeight: "bold" },
    switchRow: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
    switchLink: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  });
}
