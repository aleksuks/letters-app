import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/use-auth";
import { useTheme, outlineOnly, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";

export default function SignInScreen() {
  const { signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const s = makeStyles(colors);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);

    if (isSignUp) {
      const { error } = await signUpWithEmail(email, password);
      setLoading(false);
      if (error) {
        if (error.message === "account_already_registered") {
          Alert.alert(
            "Paskyra jau egzistuoja",
            "Su šiuo el. paštu jau yra sukurta paskyra. Prisijunkite arba atkurkite slaptažodį."
          );
        } else {
          Alert.alert("Klaida", error.message);
        }
      } else {
        setAwaitingConfirmation(true);
      }
    } else {
      const { error } = await signInWithEmail(email, password);
      setLoading(false);
      if (error) Alert.alert("Klaida", error.message);
    }
  }

  async function handlePasswordReset() {
    if (!email) return;
    setLoading(true);
    const { error } = await sendPasswordReset(email);
    setLoading(false);
    if (error) {
      Alert.alert("Klaida", error.message);
    } else {
      setResetSent(true);
    }
  }

  if (forgotPassword) {
    if (resetSent) {
      return (
        <SafeAreaView style={s.container}>
          <View style={s.inner}>
            <Text style={s.title}>Patikrinkite savo el. paštą</Text>
            <Text style={s.subtitle}>
              Jei paskyra su adresu {email} egzistuoja, nusiuntėme nuorodą
              slaptažodžiui atkurti.
            </Text>
            <TouchableOpacity
              style={s.button}
              onPress={() => { setForgotPassword(false); setResetSent(false); }}
            >
              <Text style={s.buttonText}>Grįžti į prisijungimą</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView
          style={s.inner}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Text style={s.title}>Pamiršote slaptažodį?</Text>
          <Text style={s.subtitle}>
            Įveskite savo el. paštą — atsiųsime nuorodą slaptažodžiui atkurti.
          </Text>

          <TextInput
            style={s.input}
            placeholder="El. paštas"
            placeholderTextColor={colors.subtext}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TouchableOpacity style={s.button} onPress={handlePasswordReset} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.accentText} />
            ) : (
              <Text style={s.buttonText}>Siųsti nuorodą</Text>
            )}
          </TouchableOpacity>

          <View style={s.switchRow}>
            <TouchableOpacity
              onPress={() => setForgotPassword(false)}
              hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
            >
              <Text style={s.switchLink}>Grįžti į prisijungimą</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (awaitingConfirmation) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.inner}>
          <Text style={s.title}>Patikrinkite savo el. paštą</Text>
          <Text style={s.subtitle}>
            Nusiuntėme patvirtinimo nuorodą į {email}. Patvirtinus, grįžkite čia.
          </Text>
          <TouchableOpacity
            style={s.button}
            onPress={() => { setAwaitingConfirmation(false); setIsSignUp(false); }}
          >
            <Text style={s.buttonText}>Prisijungti</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={s.inner}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={s.title}>
          {isSignUp ? "Tapti nariu" : "Sveiki sugrįžę"}
        </Text>
        <Text style={s.subtitle}>
          {isSignUp
            ? "Rašyk ir gauk laiškelius."
            : "Norint tęsti, prisijunk"}
        </Text>

        <TextInput
          style={s.input}
          placeholder="El. paštas"
          placeholderTextColor={colors.subtext}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          placeholder="Slaptažodis"
          placeholderTextColor={colors.subtext}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={s.button} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={s.buttonText}>{isSignUp ? "Registruotis" : "Prisijungti"}</Text>
          )}
        </TouchableOpacity>

        {!isSignUp && (
          <TouchableOpacity
            onPress={() => setForgotPassword(true)}
            style={s.forgotPassword}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
          >
            <Text style={s.switchLink}>Pamiršote slaptažodį?</Text>
          </TouchableOpacity>
        )}

        <View style={s.switchRow}>
          <Text style={s.switchText}>
            {isSignUp ? "Jau turi paskyrą? " : "Neturi paskyros? "}
          </Text>
          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
          >
            <Text style={s.switchLink}>{isSignUp ? "Prisijungti" : "Registruotis"}</Text>
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
    forgotPassword: { alignItems: "center", marginTop: 16 },
    switchRow: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
    switchText: { color: colors.subtext, fontSize: 14 },
    switchLink: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  });
}
