import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Linking, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { AvatarPickerGrid } from "@/components/avatar-picker-grid";
import { randomAvatarEmoji } from "@/lib/avatars";

const PRIVACY_POLICY_URL = "https://aleksuks.github.io/letters-app/privacy.html";
const TERMS_OF_SERVICE_URL = "https://aleksuks.github.io/letters-app/terms.html";

export default function OnboardingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const s = makeStyles(colors);
  const [nickname, setNickname] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState(randomAvatarEmoji);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const canProceed = ageConfirmed && termsAccepted && nickname.trim().length >= 2;

  async function handleFinish() {
    if (!user || !canProceed) return;
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
          Alert.alert("Vartotojo vardas užimtas", "Pabandyk kitą.");
        } else if (error.message.includes("nickname_rejected_moderation")) {
          Alert.alert(
            "Netinkamas slapyvardis",
            "Šis slapyvardis per daug įžeidžiantis. Pasirink kitą."
          );
        } else {
          throw error;
        }
        return;
      }

      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Klaida", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Sveiki :)</Text>
        <Text style={s.subtitle}>
          Laiškelis yra galimybė pasakyti kažką asmeniško, kažkam, ko (gal) niekada nesutiksi.
        </Text>

        <View style={s.field}>
          <Text style={s.label}>Pasirink slapyvardį</Text>
          <TextInput
            style={s.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="pvz. rasytojas67"
            placeholderTextColor={colors.subtext}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
          />
          <Text style={s.hint}>Tai vienintelis vardas kurį matys kiti - tikro nereikia.</Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Pasirink avatarą</Text>
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
          <Text style={s.checkLabel}>Patvirtinu, jog esu pilnametis.</Text>
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
            Sutinku su{" "}
            <Text style={s.link} onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
              naudojimo sąlygomis
            </Text>
            {" "}ir{" "}
            <Text style={s.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              privatumo politika
            </Text>.
          </Text>
        </View>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.button, !canProceed && s.buttonDisabled]}
          onPress={handleFinish}
          disabled={!canProceed || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={s.buttonText}>Baigiau</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24 },
    title: { fontSize: 34, fontWeight: "bold", color: colors.text },
    subtitle: { fontSize: 16, color: colors.subtext, marginTop: 12, lineHeight: 24 },
    field: { marginTop: 48 },
    label: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 10 },
    input: {
      backgroundColor: colors.surface, borderRadius: 12, padding: 16,
      fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border,
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
    },
    button: {
      backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: "center",
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.accentText, fontSize: 16, fontWeight: "bold" },
  });
}
