import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabPage } from "@/components/tab-pager";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { useTheme, outlineOnly, outlineOver } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE, LARGE_BUTTON } from "@/contexts/accessibility";
import { buildMapHtml, type MapHtmlLetter } from "@/lib/map-html";
import { searchPlaces, type PlaceMatch } from "@/lib/place-search";
import * as Haptics from "@/lib/haptics";
import type { MapLetterWithNickname } from "@/types";
import { useStrings } from "@/lib/i18n";
import { common } from "@/lib/i18n/strings/common";
import { mapStrings } from "@/lib/i18n/strings/map";

type WebMessage =
  | { type: "ready" }
  | { type: "contextLost" }
  | { type: "letterTap"; id: string; openRequest?: boolean }
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Local, offline place-name search (lib/place-search.ts) — no geocoding
  // service, so this is a cheap synchronous scan safe to run per keystroke.
  const results = useMemo(() => searchPlaces(query), [query]);
  // The letters live in a ref (not state) because their only consumer is the
  // WebView injection below — re-rendering the RN tree for them is wasted.
  const lettersRef = useRef<MapLetterWithNickname[]>([]);
  const t = useStrings(mapStrings);
  const c = useStrings(common);

  // The map is full-bleed (no SafeAreaView — the map itself should reach
  // the screen edges), so floating overlays clear the notch/status bar
  // explicitly.
  const overlayTop = insets.top + 12;

  const s = makeStyles(colors);

  // Rebuilding the HTML would reload the whole map, so it's frozen for the
  // screen's lifetime; a theme or language change applies on next mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildMapHtml(colors, { cardReadMore: t.cardReadMore, cardHasDrawingLabel: t.cardHasDrawingLabel }), []);

  const pushLetters = useCallback(() => {
    if (!webRef.current) return;
    const payload: MapHtmlLetter[] = lettersRef.current.map((l) => ({
      id: l.id,
      lat: l.lat,
      lng: l.lng,
      own: l.author_id === user?.id,
      likes: l.like_count,
      // The drawing itself never crosses into the WebView — only the fact
      // that there is one. Shipping every letter's strokes to the map would
      // bloat the payload for something the card can't render anyway.
      pic: l.drawing != null,
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

  // The map's "ready" message only fires once MapLibre's own `load` event
  // fires, which depends on the CDN script, style JSON, and tiles all
  // resolving. On a rare flaky connection one of those hangs or fails
  // silently and "ready" never arrives, leaving the spinner stuck forever —
  // this is the "map doesn't load until I restart the app" report, since
  // nothing else ever prompts a retry. A watchdog timeout reloads the
  // WebView if it hasn't booted within a generous window.
  const READY_TIMEOUT_MS = 15000;
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armReadyTimeout = useCallback(() => {
    if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
    readyTimeoutRef.current = setTimeout(() => {
      webRef.current?.reload();
    }, READY_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    armReadyTimeout();
    return () => {
      if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
    };
  }, [armReadyTimeout]);

  function handleWebLoadStart() {
    // Fires on the initial load and on every reload() — including the ones
    // triggered below — so it's the single place that resets "booting"
    // state and re-arms the watchdog.
    setWebReady(false);
    armReadyTimeout();
  }

  function recoverDeadWebView() {
    // Covers three distinct ways the WebView ends up permanently blank
    // without the "ready" watchdog ever getting a chance to catch it —
    // it only guards the *initial* boot, and since this tab's WebView is
    // never unmounted (components/tab-pager.tsx keeps every tab mounted
    // for the app's whole life) there's no second boot to watch:
    //   - iOS WKWebView content process died (memory-pressure eviction)
    //   - Android renderer process died
    //   - the canvas's WebGL context was lost (GPU pressure, long
    //     backgrounding) without the WebView process itself dying —
    //     reported proactively by lib/map-html.ts's "contextLost" message
    // In every case the WebView survives but shows blank; only an
    // explicit reload gets a fresh process/GL context.
    setWebReady(false);
    webRef.current?.reload();
  }

  function handleMessage(event: WebViewMessageEvent) {
    let msg: WebMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "ready") {
      if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
      setWebReady(true);
      pushLetters();
    } else if (msg.type === "contextLost") {
      recoverDeadWebView();
    } else if (msg.type === "letterTap") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: "/map-letter",
        params: msg.openRequest ? { id: msg.id, openRequest: "1" } : { id: msg.id },
      });
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

  function openSearch() {
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
  }

  function selectPlace(place: PlaceMatch) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    webRef.current?.injectJavaScript(
      `window.flyTo && window.flyTo(${place.lat}, ${place.lng}); true;`
    );
    closeSearch();
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
        // The MapLibre canvas is a single opaque surface: nothing inside it is
        // an accessibility element, so without a label a screen reader lands
        // on an unnamed blank view and the whole screen reads as empty. This
        // at least names it and points at the control that can move it. A
        // genuine non-visual path through the map would be a list of letters
        // by place, which is a product decision (it adds a browsing surface
        // the product deliberately does not have), not a labelling fix.
        accessible
        accessibilityRole="image"
        accessibilityLabel={t.mapAccessibilityLabel}
        accessibilityHint={t.mapAccessibilityHint}
        onMessage={handleMessage}
        onLoadStart={handleWebLoadStart}
        onContentProcessDidTerminate={recoverDeadWebView}
        onRenderProcessGone={recoverDeadWebView}
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

      {!placeMode && !searchOpen && (
        <TouchableOpacity
          style={[s.searchButton, { top: overlayTop }]}
          onPress={openSearch}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t.searchButtonLabel}
        >
          <Ionicons name="search" size={19} color={colors.text} />
        </TouchableOpacity>
      )}

      {searchOpen && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(120)}
          style={[s.searchWrap, { top: overlayTop }]}
        >
          <View style={s.searchBar}>
            <Ionicons name="search" size={17} color={colors.subtext} />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t.searchPlaceholder}
              placeholderTextColor={colors.subtext}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            <TouchableOpacity
              onPress={closeSearch}
              hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
              accessibilityRole="button"
              accessibilityLabel={t.closeSearchLabel}
            >
              <Ionicons name="close" size={20} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          {query.trim().length >= 2 && (
            <View style={s.searchResults}>
              {results.length === 0 ? (
                <Text style={s.searchEmpty}>{t.searchEmpty}</Text>
              ) : (
                <FlatList
                  data={results}
                  keyExtractor={(item, i) => `${item.name}-${item.lat}-${item.lng}-${i}`}
                  keyboardShouldPersistTaps="handled"
                  ItemSeparatorComponent={() => <View style={s.searchResultSep} />}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={s.searchResultRow}
                      onPress={() => selectPlace(item)}
                    >
                      <Ionicons name="location-outline" size={16} color={colors.subtext} />
                      <Text style={s.searchResultText}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          )}
        </Animated.View>
      )}

      {placeMode && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[s.placeBanner, { top: overlayTop }]}>
          <Text style={s.placeBannerText}>
            {picked
              ? t.placePickedText
              : t.placePendingText}
          </Text>
          <TouchableOpacity
            onPress={cancelPlacing}
            hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
            accessibilityRole="button"
            accessibilityLabel={c.cancel}
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
            <Text style={s.fabText}>{t.writeHereButton}</Text>
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
            <Text style={s.fabText}>{t.leaveLetterButton}</Text>
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
    searchButton: {
      position: "absolute",
      right: 12,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      ...outlineOver(colors, colors.border),
    },
    searchWrap: { position: "absolute", left: 12, right: 12 },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      ...outlineOver(colors, colors.border),
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
    searchResults: {
      marginTop: 6,
      maxHeight: 260,
      backgroundColor: colors.surface,
      borderRadius: 14,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      ...outlineOver(colors, colors.border),
    },
    searchResultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    searchResultSep: { height: 1, backgroundColor: colors.border },
    searchResultText: { fontSize: 14, color: colors.text },
    searchEmpty: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 13,
      color: colors.subtext,
      textAlign: "center",
    },
    placeBanner: {
      position: "absolute",
      left: 12,
      right: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      ...outlineOver(colors, colors.border),
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
      ...outlineOnly(colors),
    },
    fabLarge: LARGE_BUTTON,
    fabText: { color: colors.accentText, fontWeight: "bold", fontSize: 15 },
  });
}
