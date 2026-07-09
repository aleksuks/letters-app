import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = Haptics.NotificationFeedbackType;

// Android's vibration motors read noticeably stronger than iOS's Taptic
// Engine for the same nominal style, so step impact intensity down a
// notch on Android to match the feel users get on iOS.
const ANDROID_IMPACT_DOWNGRADE: Partial<
  Record<Haptics.ImpactFeedbackStyle, Haptics.ImpactFeedbackStyle>
> = {
  [Haptics.ImpactFeedbackStyle.Heavy]: Haptics.ImpactFeedbackStyle.Medium,
  [Haptics.ImpactFeedbackStyle.Medium]: Haptics.ImpactFeedbackStyle.Light,
  [Haptics.ImpactFeedbackStyle.Rigid]: Haptics.ImpactFeedbackStyle.Light,
};

export function impactAsync(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium
) {
  const resolvedStyle =
    Platform.OS === 'android' ? (ANDROID_IMPACT_DOWNGRADE[style] ?? style) : style;
  return Haptics.impactAsync(resolvedStyle);
}

export function notificationAsync(type: Haptics.NotificationFeedbackType) {
  return Haptics.notificationAsync(type);
}

export function selectionAsync() {
  return Haptics.selectionAsync();
}
