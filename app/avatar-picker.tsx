import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, outlineOnly } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { AvatarPickerGrid } from "@/components/avatar-picker-grid";
import { DEFAULT_AVATAR_EMOJI } from "@/lib/avatars";

export default function AvatarPickerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const s = makeStyles(colors);

  const [selected, setSelected] = useState(DEFAULT_AVATAR_EMOJI);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("avatar_emoji")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setSelected(data.avatar_emoji);
        setLoaded(true);
      });
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ avatar_emoji: selected })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      Alert.alert("Klaida", error.message);
      return;
    }
    router.back();
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel="Grįžti atgal"
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Pasirink avatarą</Text>
      </View>

      <View style={s.content}>
        {loaded ? (
          <AvatarPickerGrid selected={selected} onSelect={setSelected} />
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.button, saving && s.buttonDisabled]}
          onPress={handleSave}
          disabled={saving || !loaded}
        >
          {saving ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={s.buttonText}>Išsaugoti</Text>
          )}
        </TouchableOpacity>
      </View>
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
    content: { flex: 1, paddingHorizontal: 24 },
    footer: {
      paddingHorizontal: 24, paddingVertical: 24,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    button: {
      backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: "center",
      ...outlineOnly(colors),
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.accentText, fontSize: 16, fontWeight: "bold" },
  });
}
