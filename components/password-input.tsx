import { useState } from "react";
import { TextInput, TouchableOpacity, View, StyleSheet, type TextInputProps, type ViewStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { useStrings } from "@/lib/i18n";
import { common } from "@/lib/i18n/strings/common";

type Props = Omit<TextInputProps, "secureTextEntry" | "style"> & {
  containerStyle?: StyleProp<ViewStyle>;
};

export function PasswordInput({ containerStyle, placeholderTextColor, ...props }: Props) {
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const t = useStrings(common);
  const [visible, setVisible] = useState(false);

  return (
    <View style={[s.wrap, containerStyle]}>
      <TextInput
        {...props}
        style={[s.field, { color: colors.text }]}
        placeholderTextColor={placeholderTextColor ?? colors.subtext}
        secureTextEntry={!visible}
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
        accessibilityRole="button"
        accessibilityLabel={visible ? t.hidePassword : t.showPassword}
      >
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.subtext} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center" },
  field: { flex: 1, fontSize: 16, padding: 0 },
});
