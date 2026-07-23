import { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabPage } from "@/components/tab-pager";
import { TutorialTip } from "@/components/tutorial-tip";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { useTheme } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE } from "@/contexts/accessibility";
import { buildMapHtml, type MapHtmlLetter } from "@/lib/map-html";
import * as Haptics from "@/lib/haptics";
import type { MapLetterWithNickname } from "@/types";

type WebMessage =
  | { type: "ready" }
  | { type: "letterTap"; id: string }
  | { type: "likeTap"; id: string }
  | { type: "placePick"; lat: number; lng: number };

export default function MapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [webReady, setWebReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [placeMode, setPlaceMode] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  // The letters live in a ref (not state) because their only consumer is the
  // WebView injection below — re-rendering the RN tree for them is wasted.
  const lettersRef = useRef<MapLetterWithNickname[]>([]);

  // The map is full-bleed (no SafeAreaView — the map itself should reach
  // the screen edges), so floating overlays clear the notch/status bar
  // explicitly.
  const overlayTop = insets.top + 12;

  const s = makeStyles(colors);

  // Rebuilding the HTML would reload the whole map, so it's frozen for the
  // screen's lifetime; a theme change applies on next mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildMapHtml(colors), []);

  const pushLetters = useCallback(() => {
    if (!webRef.current) return;
    const payload: MapHtmlLetter[] = lettersRef.current.map((l) => ({
      id: l.id,
      lat: l.lat,
      lng: l.lng,
      own: l.author_id === user?.id,
      likes: l.like_count,
      body: l.body,
      nick: l.author_nickname,
    }));
    webRef.current.injectJavaScript(
      `window.setLetters && window.setLetters(${JSON.stringify(payload)}); true;`
    );
  }, [user?.id]);

  const load = useCallback(() => {
    supabase.rpc("get_map_letters").then(({ data }) => {
      lettersRef.current = (data as MapLetterWithNickname[]) ?? [];
      setLoading(false);
      pushLetters();
    });
  }, [pushLetters]);

  useFocusAfterTransition(load);

  function handleMessage(event: WebViewMessageEvent) {
    let msg: WebMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "ready") {
      setWebReady(true);
      pushLetters();
    } else if (msg.type === "letterTap") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({ pathname: "/map-letter", params: { id: msg.id } });
    } else if (msg.type === "likeTap") {
      // The heart already popped in the WebView (optimistic); the RPC is
      // idempotent, so a re-tap on an already-liked letter is harmless.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      supabase.rpc("like_map_letter", { p_map_letter_id: msg.id }).then(({ error }) => {
        if (!error) load(); // refresh the count chip on the card
      });
    } else if (msg.type === "placePick") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPicked({ lat: msg.lat, lng: msg.lng });
    }
  }

  function setWebPlaceMode(on: boolean) {
    webRef.current?.injectJavaScript(
      `window.setPlaceMode && window.setPlaceMode(${on}); true;`
    );
  }

  function startPlacing() {
    setPlaceMode(true);
    setPicked(null);
    setWebPlaceMode(true);
  }

  function cancelPlacing() {
    setPlaceMode(false);
    setPicked(null);
    setWebPlaceMode(false);
  }

  function confirmPlace() {
    if (!picked) return;
    const { lat, lng } = picked;
    cancelPlacing();
    router.push({
      pathname: "/map-write",
      params: { lat: String(lat), lng: String(lng) },
    });
  }

  return (
    <TabPage style={s.container} edges={["left", "right"]}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={s.web}
        originWhitelist={["*"]}
        onMessage={handleMessage}
        // Subresources (Leaflet CDN, tiles) don't go through this — only
        // top-frame navigations do. The initial html-string load is
        // about:blank/data:, so blocking http(s) here only stops taps on
        // the attribution links from hijacking the map view.
        onShouldStartLoadWithRequest={(req) => !req.url.startsWith("http")}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={false}
        overScrollMode="never"
        bounces={false}
      />

      {(!webReady || loading) && (
        <View style={s.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}

      {!placeMode && (
        <TutorialTip
          id="map_intro_v2"
          text="Čia guli laiškeliai, palikti konkrečiose vietose — kažkam, kas ten buvo. Priartink ir paskaityk, o jei laiškelis patiko — bakstelėk jį du kartus."
          style={{ ...s.tip, top: overlayTop }}
        />
      )}

      {placeMode && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[s.placeBanner, { top: overlayTop }]}>
          <Text style={s.placeBannerText}>
            {picked
              ? "Vieta pažymėta — rašyk laiškelį"
              : "Bakstelėk vietą, kurioje nori palikti laiškelį"}
          </Text>
          <TouchableOpacity
            onPress={cancelPlacing}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
            accessibilityRole="button"
            accessibilityLabel="Atšaukti"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {placeMode && picked ? (
        <Animated.View entering={FadeIn.duration(200)} style={s.fabWrap}>
          <TouchableOpacity
            style={[s.fab, largeTouchTargets && s.fabLarge]}
            onPress={confirmPlace}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={20} color={colors.accentText} />
            <Text style={s.fabText}>Rašyti čia</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : !placeMode ? (
        <View style={s.fabWrap}>
          <TouchableOpacity
            style={[s.fab, largeTouchTargets && s.fabLarge]}
            onPress={startPlacing}
            activeOpacity={0.85}
          >
            <Ionicons name="location-outline" size={20} color={colors.accentText} />
            <Text style={s.fabText}>Palikti laiškelį</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TabPage>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    web: { flex: 1, backgroundColor: colors.bg },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    tip: { position: "absolute", left: 12, right: 12 },
    placeBanner: {
      position: "absolute",
      left: 12,
      right: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    placeBannerText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: "600" },
    fabWrap: { position: "absolute", right: 16, bottom: 20 },
    fab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 26,
      paddingHorizontal: 18,
      paddingVertical: 13,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    fabLarge: { paddingVertical: 17 },
    fabText: { color: colors.accentText, fontWeight: "bold", fontSize: 15 },
  });
}
