import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert,
  FlatList, SafeAreaView, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/theme";
import { supabase } from "@/lib/supabase";
import { Letter, Report } from "@/types";

type QueueLetter = Letter & { author: { nickname: string } | null };

type ConvMessage = { sender: string; body: string };

type ReportItem = Report & { preview: string; messages?: ConvMessage[] };

export default function ModerationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [letters, setLetters] = useState<QueueLetter[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from("letters")
        .select("*, author:user_profiles(nickname)")
        .eq("status", "expired")
        .eq("obituary_reviewed", false)
        .order("expires_at", { ascending: true }),
      loadReports(),
    ]).then(([lettersRes, reportItems]) => {
      setLetters((lettersRes.data as QueueLetter[]) ?? []);
      setReports(reportItems);
      setLoading(false);
    });
  }, []);

  async function loadReports(): Promise<ReportItem[]> {
    const { data: openReports } = await supabase
      .from("reports")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: true });

    if (!openReports || openReports.length === 0) return [];

    const letterIds = openReports.filter(r => r.target_type === "letter").map(r => r.target_id);
    const convIds = openReports.filter(r => r.target_type === "conversation").map(r => r.target_id);

    const [lettersRes, convsRes, messagesRes] = await Promise.all([
      letterIds.length
        ? supabase.from("letters").select("id, body").in("id", letterIds)
        : Promise.resolve({ data: [] as { id: string; body: string }[] }),
      convIds.length
        ? supabase
            .from("conversations")
            .select("id, user_a:user_profiles!user_a_id(nickname), user_b:user_profiles!user_b_id(nickname)")
            .in("id", convIds)
        : Promise.resolve({ data: [] as { id: string; user_a: { nickname: string } | null; user_b: { nickname: string } | null }[] }),
      // Reported conversations only — RLS (messages_moderator_select) only
      // exposes rows here for conversations with reported_at set.
      convIds.length
        ? supabase
            .from("messages")
            .select("conversation_id, body, created_at, sender:user_profiles!sender_id(nickname)")
            .in("conversation_id", convIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as { conversation_id: string; body: string; sender: { nickname: string } | null }[] }),
    ]);

    type ConvPreview = { id: string; user_a: { nickname: string } | null; user_b: { nickname: string } | null };
    type MessageRow = { conversation_id: string; body: string; sender: { nickname: string } | null };

    const letterPreviews = new Map((lettersRes.data ?? []).map(l => [l.id, l.body]));
    const convPreviews = new Map(
      ((convsRes.data ?? []) as ConvPreview[]).map(c => [c.id, `${c.user_a?.nickname ?? "?"} ↔ ${c.user_b?.nickname ?? "?"}`])
    );

    const convMessages = new Map<string, ConvMessage[]>();
    for (const m of (messagesRes.data ?? []) as MessageRow[]) {
      const list = convMessages.get(m.conversation_id) ?? [];
      list.push({ sender: m.sender?.nickname ?? "?", body: m.body });
      convMessages.set(m.conversation_id, list);
    }

    return (openReports as Report[]).map(r => ({
      ...r,
      preview:
        r.target_type === "letter"
          ? letterPreviews.get(r.target_id) ?? "(laiškas nerastas)"
          : convPreviews.get(r.target_id) ?? "(pokalbis nerastas)",
      messages: r.target_type === "conversation" ? convMessages.get(r.target_id) ?? [] : undefined,
    }));
  }

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function resolveLetterReport(report: ReportItem, restore: boolean) {
    setActingOn(report.id);
    const { error } = await supabase.rpc("resolve_report", {
      p_report_id: report.id,
      p_restore: restore,
    });
    setActingOn(null);
    if (error) {
      Alert.alert("Klaida", error.message);
      return;
    }
    setReports(prev => prev.filter(r => r.id !== report.id));
  }

  async function resolveConversationReport(report: ReportItem, action: "ignore" | "mute" | "ban") {
    setActingOn(report.id);
    const { error } = await supabase.rpc("resolve_conversation_report", {
      p_report_id: report.id,
      p_action: action,
    });
    setActingOn(null);
    if (error) {
      Alert.alert("Klaida", error.message);
      return;
    }
    setReports(prev => prev.filter(r => r.id !== report.id));
  }

  function confirmBan(report: ReportItem) {
    Alert.alert(
      "Ban this user?",
      "Restricts them from writing letters, sending messages, or sending connection requests, indefinitely.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Ban", style: "destructive", onPress: () => resolveConversationReport(report, "ban") },
      ]
    );
  }

  async function review(letter: QueueLetter, approve: boolean) {
    setActingOn(letter.id);
    const { error } = await supabase
      .from("letters")
      .update({ obituary_reviewed: true, approved_for_obituary: approve })
      .eq("id", letter.id);

    setActingOn(null);
    if (error) {
      Alert.alert("Klaida", error.message);
      return;
    }
    setLetters((prev) => prev.filter((l) => l.id !== letter.id));
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Moderation</Text>
      </View>

      <FlatList
        data={letters}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />}

            {!loading && reports.length > 0 && (
              <View style={s.reportsSection}>
                <Text style={s.sectionTitle}>Open reports</Text>
                {reports.map(item => (
                  <View key={item.id} style={s.card}>
                    <Text style={s.reportType}>{item.target_type}</Text>
                    <Text style={s.cardBody} numberOfLines={4}>{item.preview}</Text>
                    <Text style={s.metaText}>Reason: {item.reason}</Text>
                    {item.target_type === "conversation" && (
                      <ScrollView style={s.transcript} nestedScrollEnabled>
                        {item.messages && item.messages.length > 0 ? (
                          item.messages.map((m, i) => (
                            <Text key={i} style={s.transcriptLine}>
                              <Text style={s.transcriptSender}>{m.sender}: </Text>
                              {m.body}
                            </Text>
                          ))
                        ) : (
                          <Text style={s.transcriptEmpty}>No messages.</Text>
                        )}
                      </ScrollView>
                    )}
                    {item.target_type === "letter" ? (
                      <View style={s.actionRow}>
                        <TouchableOpacity
                          style={[s.actionButton, s.rejectButton]}
                          onPress={() => resolveLetterReport(item, true)}
                          disabled={actingOn === item.id}
                        >
                          <Ionicons name="refresh" size={18} color={colors.subtext} />
                          <Text style={s.rejectText}>Restore</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionButton, s.approveButton]}
                          onPress={() => resolveLetterReport(item, false)}
                          disabled={actingOn === item.id}
                        >
                          <Ionicons name="checkmark" size={18} color={colors.accentText} />
                          <Text style={s.approveText}>Confirm removal</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={s.actionRow}>
                        <TouchableOpacity
                          style={[s.actionButton, s.rejectButton]}
                          onPress={() => resolveConversationReport(item, "ignore")}
                          disabled={actingOn === item.id}
                        >
                          <Text style={s.rejectText}>Ignore</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionButton, s.muteButton]}
                          onPress={() => resolveConversationReport(item, "mute")}
                          disabled={actingOn === item.id}
                        >
                          <Text style={s.muteText}>Mute 2d</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionButton, s.banButton]}
                          onPress={() => confirmBan(item)}
                          disabled={actingOn === item.id}
                        >
                          <Text style={s.banText}>Ban</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {!loading && <Text style={s.sectionTitle}>Obituary queue</Text>}
            {!loading && letters.length === 0 && (
              <Text style={s.empty}>Nothing pending review.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.cardBody}>{item.body}</Text>
            <View style={s.cardMeta}>
              <Text style={s.metaText}>{item.author?.nickname ?? "unknown"}</Text>
              <Text style={s.metaText}>❤ {item.like_count} · {item.travel_count} travels</Text>
            </View>
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.actionButton, s.rejectButton]}
                onPress={() => review(item, false)}
                disabled={actingOn === item.id}
              >
                <Ionicons name="close" size={18} color={colors.subtext} />
                <Text style={s.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionButton, s.approveButton]}
                onPress={() => review(item, true)}
                disabled={actingOn === item.id}
              >
                <Ionicons name="checkmark" size={18} color={colors.accentText} />
                <Text style={s.approveText}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 24,
    },
    backButton: { marginRight: 16 },
    title: { fontSize: 28, fontWeight: "bold", color: colors.text, flex: 1 },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    empty: { color: colors.subtext, fontSize: 15, marginTop: 4 },
    reportsSection: { marginBottom: 8 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.subtext,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
      marginTop: 8,
    },
    reportType: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    transcript: {
      backgroundColor: colors.surfaceAlt ?? colors.bg,
      borderRadius: 10,
      padding: 10,
      marginBottom: 12,
      maxHeight: 220,
      gap: 4,
    },
    transcriptLine: { fontSize: 13, color: colors.text, lineHeight: 18 },
    transcriptSender: { fontWeight: "700", color: colors.subtext },
    transcriptEmpty: { fontSize: 13, color: colors.subtext, fontStyle: "italic" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },
    cardBody: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 12 },
    cardMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    metaText: { fontSize: 13, color: colors.subtext },
    actionRow: { flexDirection: "row", gap: 10 },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 10,
      paddingVertical: 10,
    },
    rejectButton: { borderWidth: 1, borderColor: colors.border },
    rejectText: { fontSize: 14, color: colors.subtext, fontWeight: "600" },
    approveButton: { backgroundColor: colors.accent },
    approveText: { fontSize: 14, color: colors.accentText, fontWeight: "600" },
    muteButton: { borderWidth: 1, borderColor: colors.accent },
    muteText: { fontSize: 14, color: colors.accent, fontWeight: "600" },
    banButton: { backgroundColor: colors.red ?? "#ef4444" },
    banText: { fontSize: 14, color: "#fff", fontWeight: "600" },
  });
}
