import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = Haptics.NotificationFeedbackType;

// Android's vibration motors read noticeably stronger than iOS's Taptic
// Engine for the same nominal style, so every impact collapses to the
// softest native style (Light/Soft, the floor of what expo-haptics'
// Android module can produce) rather than stepping down by just one
// notch — a single step still left Heavy/Medium feeling harsh.
const ANDROID_IMPACT_DOWNGRADE: Partial<
  Record<Haptics.ImpactFeedbackStyle, Haptics.ImpactFeedbackStyle>
> = {
  [Haptics.ImpactFeedbackStyle.Heavy]: Haptics.ImpactFeedbackStyle.Light,
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
