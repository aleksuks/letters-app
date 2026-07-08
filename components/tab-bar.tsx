import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/theme";

const ICON_BOX = 40;

/**
 * Simple tab bar: no sliding indicator, the active tab is just the icon
 * and label in a darker color. Bottom padding is safe-area-aware so the
 * icons clear the home indicator on notched/Dynamic Island iPhones
 * instead of crowding it.
 */
export function AnimatedTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.tabBar,
        borderTopColor: colors.tabBarBorder,
        borderTopWidth: 1,
        paddingBottom: insets.bottom + (Platform.OS === "ios" ? 10 : 8),
        paddingTop: 8,
        height: 56 + insets.bottom + (Platform.OS === "ios" ? 10 : 8),
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const label =
          typeof options.title === "string" ? options.title : route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={{ flex: 1, alignItems: "center" }}
          >
            <View
              style={{
                width: ICON_BOX,
                height: ICON_BOX,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {options.tabBarIcon?.({
                focused: isFocused,
                color: isFocused ? colors.text : colors.tabInactive,
                size: 24,
              })}
            </View>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                marginTop: 4,
                color: isFocused ? colors.text : colors.tabInactive,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
