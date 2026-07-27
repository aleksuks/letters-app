import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/theme";

interface AvatarCircleProps {
  emoji: string;
  size?: number;
}

export function AvatarCircle({ emoji, size = 44 }: AvatarCircleProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent },
      ]}
    >
      <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { justifyContent: "center", alignItems: "center" },
});
