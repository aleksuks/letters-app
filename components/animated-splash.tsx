import { useEffect, useState } from "react";
import { Dimensions, Image, ImageSourcePropType, Platform, PixelRatio, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useFonts } from "expo-font";

const CONTENT_HORIZONTAL_PADDING = 24;

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
  // Read the real device width straight from the native constants rather
  // than trusting the ancestor Flexbox chain (SafeAreaProvider / the Stack
  // navigator's screen container). On a cold launch those don't always
  // have their true committed size on the very first layout pass, so a
  // percentage-of-ancestor width can lock the title's adjustsFontSizeToFit
  // shrink onto a transient, too-narrow value that never corrects itself.
  const { width: windowWidth } = useWindowDimensions();
  const [background] = useState(pickBackground);
  const [frameIndex, setFrameIndex] = useState(0);
  const [fontsLoaded] = useFonts({
    SpecialElite: require("@/assets/fonts/SpecialElite-Regular.ttf"),
  });
  // On Android, `fontsLoaded` can flip true a frame or two before the native
  // font manager has actually registered the typeface for text measurement.
  // Rendering the title immediately on that flip sometimes measures the box
  // against the old (fallback) font metrics and then paints the wider
  // SpecialElite glyphs into it, clipping the tail of the word. Waiting a
  // couple of frames lets native settle before Yoga measures the text.
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % FRAME_SOURCES.length);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!fontsLoaded) return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setFontReady(true));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [fontsLoaded]);

  return (
    <View style={styles.container}>
      {background && <Image source={background} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={styles.content}>
        <Image source={FRAME_SOURCES[frameIndex]} style={styles.logo} resizeMode="contain" />
        <Text
          key={fontReady ? "loaded" : "loading"}
          style={[
            styles.title,
            { width: windowWidth - CONTENT_HORIZONTAL_PADDING * 2, opacity: fontReady ? 1 : 0 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          allowFontScaling={false}
        >
          Laiškelis
        </Text>
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
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 150,
    height: 150,
  },
  title: {
    marginTop: 8,
    fontFamily: "SpecialElite",
    fontSize: 40,
    color: TITLE_COLOR,
    textAlign: "center",
  },
});
