import {
  View, Text, TouchableOpacity,
  StyleSheet, Switch, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";

export default function AccessibilityScreen() {
  const router = useRouter();
  const { colors, highContrast, setHighContrast } = useTheme();
  const {
    reducedMotionOverride, setReducedMotionOverride, reducedMotion,
    largeTouchTargets, setLargeTouchTargets,
  } = useAccessibility();
  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel="Atgal"
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Pritaikymas neįgaliesiems</Text>
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Judesys</Text>

          <View style={s.settingItem}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>Visada mažinti animacijas</Text>
              <Text style={s.settingDesc}>
                Laiško vokelio, siuntimo ir skirtukų animacijos bus beveik
                akimirksniu, nepriklausomai nuo telefono nustatymų.
              </Text>
            </View>
            <Switch
              value={reducedMotionOverride === "on"}
              onValueChange={(v) => setReducedMotionOverride(v ? "on" : "system")}
              trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
              thumbColor="#fff"
              accessibilityLabel="Visada mažinti animacijas"
              accessibilityRole="switch"
            />
          </View>

          <Text style={s.statusHint}>
            {reducedMotionOverride === "system"
              ? reducedMotion
                ? "Šiuo metu mažinama, nes tai įjungta telefono nustatymuose."
                : "Šiuo metu animacijos rodomos įprastai, kaip nustatyta telefone."
              : "Animacijos sumažintos šioje programėlėje."}
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Regėjimas</Text>

          <View style={s.settingItem}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>Didesnis kontrastas</Text>
              <Text style={s.settingDesc}>
                Tamsesnis tekstas ir ryškesni kraštai visoje programėlėje,
                kad būtų lengviau skaityti.
              </Text>
            </View>
            <Switch
              value={highContrast}
              onValueChange={setHighContrast}
              trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
              thumbColor="#fff"
              accessibilityLabel="Didesnis kontrastas"
              accessibilityRole="switch"
            />
          </View>

          <Text style={s.statusHint}>
            Teksto dydis seka telefono bendrojo teksto dydžio nustatymą —
            jį galima keisti telefono nustatymuose.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Lietimas</Text>

          <View style={s.settingItem}>
            <View style={s.settingContent}>
              <Text style={s.settingLabel}>Didesni mygtukai</Text>
              <Text style={s.settingDesc}>
                Padidina mygtukų ir piktogramų lietimo sritį visoje
                programėlėje — patogiau, jei taikliai paliesti sunkiau.
              </Text>
            </View>
            <Switch
              value={largeTouchTargets}
              onValueChange={setLargeTouchTargets}
              trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
              thumbColor="#fff"
              accessibilityLabel="Didesni mygtukai"
              accessibilityRole="switch"
            />
          </View>
        </View>
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
    title: { fontSize: 24, fontWeight: "bold", color: colors.text, flex: 1 },
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
    settingContent: { flex: 1, marginRight: 12 },
    settingLabel: { fontSize: 16, color: colors.text, fontWeight: "500" },
    settingDesc: { fontSize: 13, color: colors.subtext, marginTop: 4, lineHeight: 18 },
    statusHint: { fontSize: 12, color: colors.subtext, paddingHorizontal: 4, lineHeight: 17 },
  });
}
