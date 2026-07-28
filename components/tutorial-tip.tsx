import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTutorial } from "@/contexts/tutorial";
import { useTheme, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";

interface TutorialTipProps {
  id: string;
  text: string;
  style?: ViewStyle;
}

// Shown once per `id`, the first time a user reaches the screen/feature it
// documents; dismissing it marks it seen for good (contexts/tutorial.tsx).
export function TutorialTip({ id, text, style }: TutorialTipProps) {
  const { isSeen, markSeen } = useTutorial();
  const { colors } = useTheme();
  const { largeTouchTargets, reducedMotion } = useAccessibility();

  if (isSeen(id)) return null;

  const s = makeStyles(colors);

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(300)}
      exiting={reducedMotion ? undefined : FadeOut.duration(200)}
      style={[s.container, style]}
    >
      <Ionicons name="bulb-outline" size={18} color={colors.accent} style={s.icon} />
      <Text style={s.text}>{text}</Text>
      <TouchableOpacity
        onPress={() => markSeen(id)}
        hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
        style={s.closeButton}
        accessibilityRole="button"
        accessibilityLabel="Uždaryti patarimą"
      >
        <Ionicons name="close" size={16} color={colors.subtext} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.surfaceAlt ?? colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      ...outlineOver(colors, colors.accent),
    },
    icon: { marginTop: 1 },
    text: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
    closeButton: { padding: 2, marginTop: 1 },
  });
}
