import { useEffect, useState } from "react";
import {
  View, Text, SafeAreaView, TouchableOpacity,
  StyleSheet, Switch, ScrollView, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const s = makeStyles(colors);

  const [acceptsRequests, setAcceptsRequests] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("accepts_requests")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setAcceptsRequests(data.accepts_requests);
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
      Alert.alert("Klaida", error.message);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Nustatymai</Text>
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Užklausos susisiekti</Text>
          <View style={s.settingItem}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>Leisti užklausas pokalbiams</Text>
              <Text style={s.settingDesc}>
                Leisti laiškelių gavėjams siųsti užklausas pokalbiams
              </Text>
            </View>
            <Switch
              value={acceptsRequests}
              onValueChange={handleToggleRequests}
              disabled={!loaded}
              trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
              thumbColor="#fff"
              accessibilityLabel="Leisti užklausas pokalbiams"
              accessibilityRole="switch"
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Pritaikymas</Text>
          <TouchableOpacity
            style={[s.settingItem, { marginBottom: 0 }]}
            onPress={() => router.push("/accessibility" as any)}
            accessibilityRole="button"
            accessibilityLabel="Pritaikymo neįgaliesiems nustatymai"
          >
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>Pritaikymas neįgaliesiems</Text>
              <Text style={s.settingDesc}>Animacijos, kontrastas</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Paskyra</Text>
          <TouchableOpacity
            style={s.settingItem}
            onPress={() => Alert.alert("Privacy", "Privacy policy coming soon.")}
          >
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.settingItem}
            onPress={() => Alert.alert("Terms", "Terms of service coming soon.")}
          >
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>Terms of Service</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </TouchableOpacity>
          <View style={[s.settingItem, { marginBottom: 0 }]}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>Laiškelio versija</Text>
            </View>
            <Text style={s.versionText}>1.0.0</Text>
          </View>
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
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    settingContent: { flex: 1 },
    settingLabel: { fontSize: 16, color: colors.text, fontWeight: "500" },
    settingDesc: { fontSize: 13, color: colors.subtext, marginTop: 4 },
    versionText: { fontSize: 14, color: colors.subtext },
  });
}
