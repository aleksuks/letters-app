import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Best-effort: a simulator, a denied prompt, or a missing EAS project id
// should just mean this device gets no push token — never block sign-in.
export async function registerForPushNotificationsAsync(userId: string) {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "notification.wav",
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase.from("user_profiles").update({ push_token: token }).eq("id", userId);
  } catch {
    // See comment above — swallow and move on.
  }
}

// Powers the inactivity reminder's "have they gone quiet" check server-side.
// Throttled client-side so foregrounding the app repeatedly in one session
// doesn't spam an update for every transition.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
let lastTouch = 0;

export async function touchLastActive(userId: string) {
  const now = Date.now();
  if (now - lastTouch < TOUCH_INTERVAL_MS) return;
  lastTouch = now;
  await supabase
    .from("user_profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", userId);
}

// Where tapping a given notification type should land the reader.
export function notificationDataToRoute(data: Record<string, unknown> | undefined): string | null {
  switch (data?.type) {
    case "reminder":
      return "/receive";
    case "letter_obituary":
      return "/(tabs)";
    case "like_milestone":
    case "letter_died":
      return "/(tabs)/letters";
    default:
      return null;
  }
}
