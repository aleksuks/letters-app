import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useTheme } from "@/contexts/theme";
import { useTabPager } from "@/components/tab-pager";

const INDICATOR_SIZE = 40;

/**
 * Custom tab bar with a rounded square that slides behind the active tab's
 * icon, driven by the same `position` shared value the page-slide
 * transition uses — the indicator and the page fly-by stay perfectly in
 * sync instead of animating on separate timelines.
 */
export function AnimatedTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { colors } = useTheme();
  const { position, width } = useTabPager();
  const routeCount = state.routes.length;
  const slotWidth = width / routeCount;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          position.value * slotWidth + (slotWidth - INDICATOR_SIZE) / 2,
      },
    ],
  }));

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.tabBar,
        borderTopColor: colors.tabBarBorder,
        borderTopWidth: 1,
        paddingBottom: Platform.OS === "ios" ? 20 : 8,
        paddingTop: 8,
        height: Platform.OS === "ios" ? 80 : 56,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 8,
            width: INDICATOR_SIZE,
            height: INDICATOR_SIZE,
            borderRadius: 12,
            backgroundColor: colors.accent,
          },
          indicatorStyle,
        ]}
      />
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
                width: INDICATOR_SIZE,
                height: INDICATOR_SIZE,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {options.tabBarIcon?.({
                focused: isFocused,
                color: isFocused ? colors.accentText : colors.tabInactive,
                size: 24,
              })}
            </View>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                marginTop: 4,
                color: isFocused ? colors.accent : colors.tabInactive,
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
