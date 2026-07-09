import { useTheme } from "@/contexts/theme";
import { useAccessibility } from "@/contexts/accessibility";
import { supabase } from "@/lib/supabase";
import { Letter } from "@/types";
import { TutorialTip } from "@/components/tutorial-tip";
import { WelcomeLetter } from "@/components/welcome-letter";
import { useFocusAfterTransition } from "@/hooks/use-focus-after-transition";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { TabPage } from "@/components/tab-pager";

type ObituaryLetter = Letter & { author: { nickname: string } | null };
type SortMode = "popular" | "recent" | "original";

const SORT_MODES: SortMode[] = ["popular", "recent", "original"];

const SORT_COLUMN: Record<SortMode, string> = {
  popular: "total_like_count",
  recent: "created_at",
  original: "like_count",
};

const SORT_LABEL: Record<SortMode, string> = {
  popular: "Populiariausi",
  recent: "Naujausi",
  original: "Daugiausiai surinkę dar beskraidant",
};

const ITEM_HEIGHT = 60;
const ITEM_HEIGHT_LARGE = 78;

function daysLived(letter: Letter): number | null {
  if (!letter.died_at) return null;
  const ms = new Date(letter.died_at).getTime() - new Date(letter.created_at).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const s = makeStyles(colors);
  const itemHeight = largeTouchTargets ? ITEM_HEIGHT_LARGE : ITEM_HEIGHT;

  const { height: windowHeight } = useWindowDimensions();
  const [sort, setSort] = useState<SortMode>("popular");
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const backdropOpacity = useSharedValue(0);
  const sheetY = useSharedValue(windowHeight);
  const indicatorY = useSharedValue(0);
  const [letters, setLetters] = useState<ObituaryLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [givenAfterLikes, setGivenAfterLikes] = useState<Set<string>>(new Set());

  const load = useCallback((mode: SortMode) => {
    setLoading(true);
    supabase
      .from("letters")
      .select("*, author:user_profiles(nickname)")
      .eq("status", "expired")
      .eq("approved_for_obituary", true)
      .order(SORT_COLUMN[mode], { ascending: false })
      .then(async ({ data }) => {
        const rows = (data as ObituaryLetter[]) ?? [];
        setLetters(rows);
        setLoading(false);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user || rows.length === 0) {
          setGivenAfterLikes(new Set());
          return;
        }
        const { data: mine } = await supabase
          .from("letter_afterlikes")
          .select("letter_id")
          .eq("user_id", user.id)
          .in("letter_id", rows.map((r) => r.id));
        setGivenAfterLikes(new Set((mine ?? []).map((r) => r.letter_id as string)));
      });
  }, []);

  useFocusAfterTransition(useCallback(() => load(sort), [load, sort]));

  const giveAfterLike = useCallback(async (letterId: string) => {
    if (givenAfterLikes.has(letterId)) return;
    setGivenAfterLikes((prev) => new Set(prev).add(letterId));
    setLetters((prev) =>
      prev.map((l) => (l.id === letterId ? { ...l, after_like_count: l.after_like_count + 1 } : l))
    );
    const { error } = await supabase.rpc("give_after_like", { p_letter_id: letterId });
    if (error) {
      setGivenAfterLikes((prev) => {
        const next = new Set(prev);
        next.delete(letterId);
        return next;
      });
      setLetters((prev) =>
        prev.map((l) => (l.id === letterId ? { ...l, after_like_count: Math.max(0, l.after_like_count - 1) } : l))
      );
    }
  }, [givenAfterLikes]);

  const openSortMenu = useCallback(() => {
    indicatorY.value = SORT_MODES.indexOf(sort) * itemHeight;
    sheetY.value = windowHeight;
    backdropOpacity.value = 0;
    setSortMenuVisible(true);
    backdropOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    sheetY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [sort, itemHeight, windowHeight, indicatorY, sheetY, backdropOpacity]);

  const closeSortMenu = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
    sheetY.value = withTiming(windowHeight, { duration: 260, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setSortMenuVisible)(false);
    });
  }, [windowHeight, backdropOpacity, sheetY]);

  const selectSort = useCallback((mode: SortMode) => {
    setSort(mode);
    const targetY = SORT_MODES.indexOf(mode) * itemHeight;
    indicatorY.value = withTiming(targetY, { duration: 240, easing: Easing.out(Easing.cubic) });
    // Give the indicator a moment to land on the new option before the
    // sheet dismisses, so the selection is actually visible.
    backdropOpacity.value = withTiming(0, { duration: 280, easing: Easing.in(Easing.cubic) });
    sheetY.value = withTiming(
      windowHeight,
      { duration: 340, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(setSortMenuVisible)(false);
      }
    );
  }, [itemHeight, windowHeight, indicatorY, backdropOpacity, sheetY]);

  const dragGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        sheetY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      const shouldDismiss = e.translationY > 100 || e.velocityY > 800;
      if (shouldDismiss) {
        backdropOpacity.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) });
        sheetY.value = withTiming(windowHeight, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(setSortMenuVisible)(false);
        });
      } else {
        sheetY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateY: indicatorY.value }] }));

  return (
    <TabPage style={s.container}>
      <FlatList
        data={letters}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            <Text style={s.title}>Kapinės</Text>
            <Text style={s.subtitle}>Šiems laiškeliams kelionė jau baigta.</Text>

            <TutorialTip
              id="obituary_intro"
              text="Čia ilsisi laiškeliai, kurių kelionė jau baigta. Laiškeliai nustoja keliauti, kai juos išbalsuoja arba praėjus savaitei."
            />

            <TouchableOpacity
              style={[s.sortDropdownButton, largeTouchTargets && s.sortDropdownButtonLarge]}
              onPress={openSortMenu}
            >
              <Text style={s.sortDropdownText}>{SORT_LABEL[sort]}</Text>
              <Text style={s.sortDropdownChevron}>▾</Text>
            </TouchableOpacity>

            {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}
            {!loading && letters.length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyText}>Kol kas jokių laiškų.</Text>
                <Text style={s.emptyHint}>Seni arba nepatikę laiškai bus čia.</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const lived = daysLived(item);
          const given = givenAfterLikes.has(item.id);
          return (
            <View style={s.card}>
              <Text style={s.cardBody}>{item.body}</Text>
              <View style={s.cardMeta}>
                <View style={s.cardMetaLeft}>
                  <Text style={s.cardAuthor}>{item.author?.nickname ?? "nežinomas"}</Text>
                  {lived !== null && (
                    <Text style={s.metaText}>
                      {lived === 0 ? "gyveno < 1 d." : `gyveno ${lived} d.`}
                    </Text>
                  )}
                </View>
                <View style={s.cardMetaRight}>
                  <Text style={s.heartText}>❤ {item.like_count}</Text>
                  <TouchableOpacity
                    style={[s.afterLikeButton, largeTouchTargets && s.afterLikeButtonLarge]}
                    onPress={() => giveAfterLike(item.id)}
                    disabled={given}
                    accessibilityLabel="Skirti širdelę po mirties"
                  >
                    <Text style={s.heartText}>🤍 {item.after_like_count}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
      />
      {sortMenuVisible && (
        <Animated.View style={[StyleSheet.absoluteFillObject, s.sortMenuBackdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSortMenu} />
          <Animated.View style={[s.sortMenu, sheetStyle]}>
            <GestureDetector gesture={dragGesture}>
              <View style={s.sortMenuDragZone}>
                <View style={s.sortMenuHandle} />
              </View>
            </GestureDetector>
            <View style={s.sortMenuItemsContainer}>
              <Animated.View
                style={[s.sortMenuIndicator, { height: itemHeight }, indicatorStyle]}
              />
              {SORT_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[s.sortMenuItem, { height: itemHeight }]}
                  onPress={() => selectSort(mode)}
                >
                  <Text
                    style={[s.sortMenuItemText, sort === mode && s.sortMenuItemTextActive]}
                    numberOfLines={2}
                  >
                    {SORT_LABEL[mode]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      )}
      <WelcomeLetter />
    </TabPage>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    title: { fontSize: 32, fontWeight: "bold", color: colors.text, marginTop: 24 },
    subtitle: { fontSize: 16, color: colors.subtext, marginTop: 6, marginBottom: 20 },
    sortDropdownButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 18,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: 20,
    },
    sortDropdownButtonLarge: { paddingVertical: 24 },
    sortDropdownText: { fontSize: 14, color: colors.text, fontWeight: "600" },
    sortDropdownChevron: { fontSize: 14, color: colors.subtext, marginLeft: 8 },
    sortMenuBackdrop: {
      backgroundColor: "rgba(0,0,0,0.3)",
      justifyContent: "flex-end",
      zIndex: 100,
      elevation: 20,
    },
    sortMenu: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      minHeight: "65%",
      paddingBottom: 32,
      justifyContent: "flex-start",
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    sortMenuDragZone: {
      paddingVertical: 14,
      alignItems: "center",
    },
    sortMenuHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    sortMenuItemsContainer: { position: "relative" },
    sortMenuIndicator: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.accent,
    },
    sortMenuItem: { paddingHorizontal: 20, justifyContent: "center" },
    sortMenuItemText: { fontSize: 15, color: colors.text, fontWeight: "600" },
    sortMenuItemTextActive: { color: colors.accentText },
    empty: { alignItems: "center", paddingTop: 60 },
    emptyText: { fontSize: 18, color: colors.subtext, fontWeight: "600" },
    emptyHint: { fontSize: 14, color: colors.subtext, marginTop: 8, textAlign: "center", opacity: 0.6 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },
    cardBody: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 12 },
    cardMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardMetaLeft: { gap: 2 },
    cardMetaRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    cardAuthor: { fontSize: 13, color: colors.subtext, fontStyle: "italic" },
    metaText: { fontSize: 12, color: colors.subtext, opacity: 0.7 },
    heartText: { fontSize: 13, color: colors.subtext },
    afterLikeButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    afterLikeButtonLarge: { paddingVertical: 10 },
  });
}
