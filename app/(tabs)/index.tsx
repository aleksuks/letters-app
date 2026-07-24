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
import { DoubleTapLike } from "@/components/double-tap-like";

type ObituaryLetter = Letter & { author: { nickname: string } | null };
type SortMode = "popular" | "recent" | "original";
type PopularPeriod = "all" | "month" | "week";

type SortOption = {
  key: string;
  sort: SortMode;
  period: PopularPeriod;
  label: string;
};

const SORT_COLUMN: Record<SortMode, string> = {
  popular: "total_like_count",
  recent: "created_at",
  original: "like_count",
};

// TUNING KNOB: "this week"/"this month" popular windows are rolling day
// counts, anchored on died_at (when the letter actually landed in the
// Obituary), not created_at or individual like timestamps — like_count
// has no per-like timestamp to filter on.
const PERIOD_DAYS: Partial<Record<PopularPeriod, number>> = {
  month: 30,
  week: 7,
};

const SORT_OPTIONS: SortOption[] = [
  { key: "popular_all", sort: "popular", period: "all", label: "Populiariausi (visų laikų)" },
  { key: "popular_month", sort: "popular", period: "month", label: "Populiariausi (šį mėnesį)" },
  { key: "popular_week", sort: "popular", period: "week", label: "Populiariausi (šią savaitę)" },
  { key: "recent", sort: "recent", period: "all", label: "Naujausi" },
  { key: "original", sort: "original", period: "all", label: "Daugiausiai surinkę dar beskraidant" },
];

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
  const [sortKey, setSortKey] = useState<string>(SORT_OPTIONS[0].key);
  const sortOption = SORT_OPTIONS.find((o) => o.key === sortKey) ?? SORT_OPTIONS[0];
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const backdropOpacity = useSharedValue(0);
  const sheetY = useSharedValue(windowHeight);
  const indicatorY = useSharedValue(0);
  const [letters, setLetters] = useState<ObituaryLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [givenAfterLikes, setGivenAfterLikes] = useState<Set<string>>(new Set());

  const load = useCallback((option: SortOption) => {
    setLoading(true);
    let query = supabase
      .from("letters")
      .select("*, author:user_profiles(nickname)")
      .eq("status", "expired")
      .eq("approved_for_obituary", true);

    const periodDays = PERIOD_DAYS[option.period];
    if (periodDays !== undefined) {
      const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      query = query.gte("died_at", cutoff.toISOString());
    }

    query
      .order(SORT_COLUMN[option.sort], { ascending: false })
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

  useFocusAfterTransition(useCallback(() => load(sortOption), [load, sortOption]));

  const toggleAfterLike = useCallback(async (letterId: string) => {
    const wasGiven = givenAfterLikes.has(letterId);
    setGivenAfterLikes((prev) => {
      const next = new Set(prev);
      if (wasGiven) next.delete(letterId); else next.add(letterId);
      return next;
    });
    setLetters((prev) =>
      prev.map((l) =>
        l.id === letterId
          ? { ...l, after_like_count: Math.max(0, l.after_like_count + (wasGiven ? -1 : 1)) }
          : l
      )
    );
    const { error } = await supabase.rpc("give_after_like", { p_letter_id: letterId });
    if (error) {
      setGivenAfterLikes((prev) => {
        const next = new Set(prev);
        if (wasGiven) next.add(letterId); else next.delete(letterId);
        return next;
      });
      setLetters((prev) =>
        prev.map((l) =>
          l.id === letterId
            ? { ...l, after_like_count: Math.max(0, l.after_like_count + (wasGiven ? 1 : -1)) }
            : l
        )
      );
    }
  }, [givenAfterLikes]);

  const openSortMenu = useCallback(() => {
    indicatorY.value = SORT_OPTIONS.findIndex((o) => o.key === sortKey) * itemHeight;
    sheetY.value = windowHeight;
    backdropOpacity.value = 0;
    setSortMenuVisible(true);
    backdropOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    sheetY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [sortKey, itemHeight, windowHeight, indicatorY, sheetY, backdropOpacity]);

  const closeSortMenu = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
    sheetY.value = withTiming(windowHeight, { duration: 260, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setSortMenuVisible)(false);
    });
  }, [windowHeight, backdropOpacity, sheetY]);

  const selectSort = useCallback((key: string) => {
    setSortKey(key);
    const targetY = SORT_OPTIONS.findIndex((o) => o.key === key) * itemHeight;
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
              id="obituary_intro_v2"
              text="Čia ilsisi laiškeliai, kurių kelionė jau baigta. Laiškeliai nustoja keliauti, kai juos išbalsuoja arba praėjus savaitei. Dukart bakstelėk laiškelį — paliksi jam širdelę."
            />

            <TouchableOpacity
              style={[s.sortDropdownButton, largeTouchTargets && s.sortDropdownButtonLarge]}
              onPress={openSortMenu}
            >
              <Text style={s.sortDropdownText}>{sortOption.label}</Text>
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
            // Double-tap anywhere on the letter drops a big heart where the
            // finger landed and gives the post-mortem like; the small button
            // stays as the screen-reader-friendly (and discoverable) path.
            <DoubleTapLike onLike={() => toggleAfterLike(item.id)} style={s.card}>
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
                    onPress={() => toggleAfterLike(item.id)}
                    accessibilityLabel={given ? "Atšaukti širdelę po mirties" : "Skirti širdelę po mirties"}
                  >
                    <Text style={s.heartText}>{given ? "❤" : "🤍"} {item.after_like_count}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </DoubleTapLike>
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
              {SORT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[s.sortMenuItem, { height: itemHeight }]}
                  onPress={() => selectSort(option.key)}
                >
                  <Text
                    style={[s.sortMenuItemText, sortKey === option.key && s.sortMenuItemTextActive]}
                    numberOfLines={2}
                  >
                    {option.label}
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
