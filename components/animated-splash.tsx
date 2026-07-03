import { useEffect, useState } from "react";
import { Dimensions, Image, ImageSourcePropType, Platform, PixelRatio, StyleSheet, Text, View } from "react-native";
import { useFonts } from "expo-font";

const FRAME_SOURCES: ImageSourcePropType[] = [
  require("@/assets/images/logo-frame-1.png"),
  require("@/assets/images/logo-frame-2.png"),
  require("@/assets/images/logo-frame-3.png"),
];
const FRAME_INTERVAL_MS = 1000 / 3; // 3fps, matches the source animation

const ANDROID_BACKGROUNDS: { height: number; src: ImageSourcePropType }[] = [
  { height: 800, src: require("@/assets/splash_screens/android_hdpi_480x800.png") },
  { height: 1280, src: require("@/assets/splash_screens/android_xhdpi_720x1280.png") },
  { height: 1920, src: require("@/assets/splash_screens/android_xxhdpi_1080x1920.png") },
  { height: 2560, src: require("@/assets/splash_screens/android_xxxhdpi_1440x2560.png") },
];

const IPHONE_BACKGROUNDS: { height: number; src: ImageSourcePropType }[] = [
  { height: 1334, src: require("@/assets/splash_screens/ios_iphone_se_8_750x1334.png") },
  { height: 1792, src: require("@/assets/splash_screens/ios_iphone_xr_11_828x1792.png") },
  { height: 2436, src: require("@/assets/splash_screens/ios_iphone_x_xs_1125x2436.png") },
  { height: 2532, src: require("@/assets/splash_screens/ios_iphone_14_1170x2532.png") },
  { height: 2556, src: require("@/assets/splash_screens/ios_iphone_14_pro_1179x2556.png") },
  { height: 2778, src: require("@/assets/splash_screens/ios_iphone_13_pro_max_1284x2778.png") },
  { height: 2796, src: require("@/assets/splash_screens/ios_iphone_14_pro_max_1290x2796.png") },
];

const IPAD_BACKGROUNDS: { height: number; src: ImageSourcePropType }[] = [
  { height: 2160, src: require("@/assets/splash_screens/ios_ipad_10gen_1620x2160.png") },
  { height: 2388, src: require("@/assets/splash_screens/ios_ipad_pro_11_1668x2388.png") },
  { height: 2732, src: require("@/assets/splash_screens/ios_ipad_pro_12_2048x2732.png") },
];

export function pickBackground(): ImageSourcePropType | null {
  if (Platform.OS === "web") return null;

  const candidates =
    Platform.OS === "android" ? ANDROID_BACKGROUNDS : Platform.OS === "ios" && Platform.isPad ? IPAD_BACKGROUNDS : IPHONE_BACKGROUNDS;

  const deviceHeight = Math.round(Dimensions.get("window").height * PixelRatio.get());

  return candidates.reduce((closest, candidate) =>
    Math.abs(candidate.height - deviceHeight) < Math.abs(closest.height - deviceHeight) ? candidate : closest
  ).src;
}

const BACKGROUND_COLOR = "#E3DAC9";
const TITLE_COLOR = "#96150D";

export function AnimatedSplash() {
  const [background] = useState(pickBackground);
  const [frameIndex, setFrameIndex] = useState(0);
  const [fontsLoaded] = useFonts({
    CaveatBrush: require("@/assets/fonts/CaveatBrush-Regular.ttf"),
  });

  useEffect(() => {
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % FRAME_SOURCES.length);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.container}>
      {background && <Image source={background} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={styles.content}>
        <Image source={FRAME_SOURCES[frameIndex]} style={styles.logo} resizeMode="contain" />
        <Text style={[styles.title, { opacity: fontsLoaded ? 1 : 0 }]}>Laiškelis</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKGROUND_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 150,
    height: 150,
  },
  title: {
    marginTop: 8,
    fontFamily: "CaveatBrush",
    fontSize: 48,
    color: TITLE_COLOR,
    textAlign: "center",
  },
});
