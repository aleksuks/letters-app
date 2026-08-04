// Local config plugin fixing Play Console pre-launch warnings that Expo's
// own SDK 54 prebuild templates don't address on their own:
//
// 1. "Restricted foreground service types" + BOOT_COMPLETED — expo-audio's
//    AndroidManifest unconditionally declares FOREGROUND_SERVICE /
//    FOREGROUND_SERVICE_MEDIA_PLAYBACK and two foreground services
//    (AudioControlsService, AudioRecordingService) even though this app only
//    ever plays short local sound effects via useAudioPlayer (hooks/use-sound.ts)
//    — no background media session, no audio recording. Combined with
//    expo-notifications' BOOT_COMPLETED receiver (needed to reschedule
//    notifications after reboot), Play flags the app as if it could start a
//    restricted foreground service from a boot receiver. Strip the unused
//    services/permissions at manifest-merge time via tools:node="remove".
//
// 2. Deprecated edge-to-edge status/nav bar theme attributes — Expo's
//    default splash-screen and edge-to-edge plugins still emit
//    android:statusBarColor and android:enforceNavigationBarContrast on
//    AppTheme, both deprecated in Android 15 (API 35) and no-ops once
//    edge-to-edge is enforced. Remove them post-hoc; the app never relied on
//    either (content is already edge-to-edge, safe-area-context handles
//    inset-aware layout).
const { withAndroidManifest, withAndroidStyles } = require("expo/config-plugins");

const UNUSED_AUDIO_SERVICES = [
  "expo.modules.audio.service.AudioControlsService",
  "expo.modules.audio.service.AudioRecordingService",
];

const UNUSED_FOREGROUND_SERVICE_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
];

const DEPRECATED_STYLE_ITEMS = [
  "android:statusBarColor",
  "android:enforceNavigationBarContrast",
];

function withStripUnusedAudioForegroundServices(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    manifest["uses-permission"] = (manifest["uses-permission"] || []).filter(
      (item) => !UNUSED_FOREGROUND_SERVICE_PERMISSIONS.includes(item.$["android:name"])
    );
    for (const name of UNUSED_FOREGROUND_SERVICE_PERMISSIONS) {
      manifest["uses-permission"].push({
        $: { "android:name": name, "tools:node": "remove" },
      });
    }

    const application = manifest.application?.[0];
    if (application) {
      application.service = (application.service || []).filter(
        (item) => !UNUSED_AUDIO_SERVICES.includes(item.$["android:name"])
      );
      for (const name of UNUSED_AUDIO_SERVICES) {
        application.service.push({
          $: { "android:name": name, "tools:node": "remove" },
        });
      }
    }

    return config;
  });
}

function withStripDeprecatedEdgeToEdgeStyles(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults.resources.style || [];
    const appTheme = styles.find((style) => style.$.name === "AppTheme");
    if (appTheme?.item) {
      appTheme.item = appTheme.item.filter(
        (item) => !DEPRECATED_STYLE_ITEMS.includes(item.$.name)
      );
    }
    return config;
  });
}

module.exports = function withAndroidPlayStoreFixes(config) {
  config = withStripUnusedAudioForegroundServices(config);
  config = withStripDeprecatedEdgeToEdgeStyles(config);
  return config;
};
