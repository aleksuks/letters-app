import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/theme";
import { AVATAR_EMOJIS } from "@/lib/avatars";

interface AvatarPickerGridProps {
  selected: string;
  onSelect: (emoji: string) => void;
}

export function AvatarPickerGrid({ selected, onSelect }: AvatarPickerGridProps) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  return (
    <View style={s.grid}>
      {AVATAR_EMOJIS.map(emoji => {
        const isSelected = emoji === selected;
        return (
          <TouchableOpacity
            key={emoji}
            style={[s.cell, isSelected && s.cellSelected]}
            onPress={() => onSelect(emoji)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`Avataras ${emoji}`}
          >
            <Text style={s.emoji}>{emoji}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    cell: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: "transparent",
    },
    cellSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
    emoji: { fontSize: 26 },
  });
}
