import { useTutorial } from "@/contexts/tutorial";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { EnvelopeLetter } from "@/components/envelope-letter";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const TUTORIAL_ID = "welcome_letter";

const WELCOME_BODY =
  "Sveiki!\n\n" +
  "„Laiškelyje“ slepiesi po slapyvardžiu ir rašai trumpus tekstus " +
  "nepažįstamiems.\n\n" +
  "Jei laiškelį palaikini, jis juda toliau pas kitą gavėją. Jei manai, " +
  "kad jis to nevertas, siunti į kapines - surinkus pakankamai balsų, " +
  "jis nebeskraido ir atgula poilsiui. Praėjus moderacijai, patenka į " +
  "pagrindinį puslapį visų teismui.\n\n" +
  "Jei laiškelis kažkam ant tiek patinka (ar nepatinka), kad nori " +
  "susisiekti su siuntėju - galima išsiųsti užklausas, ir jei siuntėjas " +
  "jas priima, rašinėtis privačiai.\n\n" +
  "Kol kas tiek.";

// A swipe of this many px (or a fast enough flick) dismisses the card, same
// feel as the drag stages inside EnvelopeLetter itself.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const OFF_SCREEN_Y = 700;

/**
 * One-time welcome screen: an envelope flies in and opens itself (no swipe
 * required — see EnvelopeLetter's autoPlay), then hands off to a plain
 * reading card explaining what Laiškelis is. Swiping the card down (or
 * tapping the close button) dismisses it for good, the same seen-tracking
 * as every other TutorialTip, just presented as a full-screen ceremony
 * instead of an inline banner.
 *
 * The reading card is mounted from the start (underneath the ceremony, not
 * swapped in after it) so the handoff matches receive.tsx: a white flash
 * fades in as the letter is "pulled free", the ceremony overlay then fades
 * out through that white to reveal the already-there reading card, instead
 * of the two layouts cutting directly into one another.
 */
export function WelcomeLetter() {
  const { isSeen, markSeen } = useTutorial();
  const { colors } = useTheme();
  const { largeTouchTargets, reducedMotion } = useAccessibility();
  const [introDone, setIntroDone] = useState(false);
  const translateY = useSharedValue(0);
  const whiteFade = useSharedValue(0);

  const seen = isSeen(TUTORIAL_ID);
  const s = makeStyles(colors);

  const dismissGesture = Gesture.Pan()
    .enabled(introDone)
    .activeOffsetY([-1000000, 10])
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (translateY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        translateY.value = withTiming(OFF_SCREEN_Y, { duration: 220 }, (finished) => {
          if (finished) runOnJS(markSeen)(TUTORIAL_ID);
        });
      } else {
        translateY.value = withTiming(0, { duration: 200 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: 1 - translateY.value / OFF_SCREEN_Y,
  }));

  const whiteStyle = useAnimatedStyle(() => ({
    opacity: whiteFade.value,
  }));

  if (seen) return null;

  return (
    <View style={s.overlay}>
      <GestureDetector gesture={dismissGesture}>
        <Animated.View style={[s.card, cardStyle]}>
          <SafeAreaView style={s.safe}>
            <TouchableOpacity
              style={s.closeBtn}
              onPress={() => markSeen(TUTORIAL_ID)}
              hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
              accessibilityRole="button"
              accessibilityLabel="Uždaryti"
            >
              <Ionicons name="close" size={26} color={colors.subtext} />
            </TouchableOpacity>
            <View style={s.textWrap}>
              <Text style={s.body}>{WELCOME_BODY}</Text>
            </View>
            <Text style={s.hint}>Brūkštelėk žemyn, kad uždarytum</Text>
          </SafeAreaView>

          {!introDone && (
            <Animated.View style={s.introOverlay} exiting={FadeOut.duration(reducedMotion ? 1 : 400)}>
              <EnvelopeLetter
                body={WELCOME_BODY}
                mode="receive"
                autoPlay
                onDone={() => setIntroDone(true)}
                onPulling={() => {
                  whiteFade.value = withTiming(1, { duration: reducedMotion ? 1 : 500 });
                }}
              />
              <Animated.View
                style={[StyleSheet.absoluteFillObject, s.whiteFlash, whiteStyle]}
                pointerEvents="none"
              />
            </Animated.View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 10,
      elevation: 10,
    },
    card: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    safe: { flex: 1 },
    closeBtn: { position: "absolute", top: 8, right: 8, zIndex: 2, padding: 12 },
    textWrap: { flex: 1, justifyContent: "center", padding: 28 },
    body: { fontSize: 17, color: colors.text, lineHeight: 27 },
    hint: {
      fontSize: 13,
      color: colors.subtext,
      fontStyle: "italic",
      textAlign: "center",
      paddingBottom: 28,
    },
    introOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    whiteFlash: { backgroundColor: "#fff" },
  });
}
