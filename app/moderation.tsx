import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert,
  FlatList, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, outlineOnly } from "@/contexts/theme";
import { useAccessibility, HIT_SLOP_LARGE, LARGE_BUTTON } from "@/contexts/accessibility";
import { supabase } from "@/lib/supabase";
import { Letter, MapLetter, Report } from "@/types";

type QueueLetter = Letter & { author: { nickname: string } | null };

type QueueMapLetter = MapLetter & { author: { nickname: string } | null };

type ConvMessage = { sender: string; body: string };

type ReportItem = Report & { preview: string; messages?: ConvMessage[] };

// Same paper/letter look as the Supabase auth email templates (brick red
// #96150D accent) so a manual send doesn't read as visually distinct from
// signup/reset mail. The one placeholder paragraph is what gets replaced;
// header/footer scaffold stays as-is.
const DEFAULT_EMAIL_BODY = `<div style="background-color:#f4ede0; padding:40px 20px; font-family: Georgia, 'Times New Roman', serif;">
  <div style="max-width:480px; margin:0 auto; background-color:#fffaf0; border:1px solid #e0d5c0; border-radius:8px; padding:32px 28px;">
    <p style="font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#9c8a6e; margin:0 0 24px;">Laiškelis</p>
    <p style="font-size:15px; line-height:1.6; color:#4a3f30; margin:0 0 24px;">
      Rašykite žinutę čia.
    </p>
    <p style="font-size:13px; color:#9c8a6e; margin:0; line-height:1.5;">
      — Laiškelis
    </p>
  </div>
  <p style="text-align:center; font-size:12px; color:#b0a58e; margin-top:20px;">Laiškelis · laiskelis.lt</p>
</div>`;

type OverviewStats = {
  active_letters_count: number;
  total_letters_count: number;
  obituary_public_count: number;
  pending_obituary_review: number;
  open_reports_count: number;
  total_users_count: number;
  active_users_24h: number;
  active_users_7d: number;
  total_conversations_count: number;
  total_messages_count: number;
  active_map_letters_count: number;
};

export default function ModerationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { largeTouchTargets } = useAccessibility();
  const s = makeStyles(colors);

  const [letters, setLetters] = useState<QueueLetter[]>([]);
  const [activeLetters, setActiveLetters] = useState<QueueLetter[]>([]);
  const [activeMapLetters, setActiveMapLetters] = useState<QueueMapLetter[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [activeLettersOpen, setActiveLettersOpen] = useState(false);
  const [activeMapLettersOpen, setActiveMapLettersOpen] = useState(false);
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);
  const [sendingEmail, setSendingEmail] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    // Letters only reach the queue once status flips to 'expired'; run the
    // sweep first so the queue is complete even during quiet periods with
    // no receive traffic (which is the other place the sweep runs).
    Promise.all([
      supabase
        .rpc("expire_due_letters")
        .then(() =>
          supabase
            .from("letters")
            .select("*, author:user_profiles(nickname)")
            .eq("status", "expired")
            .eq("obituary_reviewed", false)
            .order("expires_at", { ascending: true })
        ),
      loadReports(),
      supabase
        .from("letters")
        .select("*, author:user_profiles(nickname)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.rpc("moderation_overview_stats").single(),
      supabase
        .from("map_letters")
        .select("*, author:user_profiles(nickname)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100),
    ]).then(([lettersRes, reportItems, activeLettersRes, overviewRes, activeMapLettersRes]) => {
      setLetters((lettersRes.data as QueueLetter[]) ?? []);
      setReports(reportItems);
      setActiveLetters((activeLettersRes.data as QueueLetter[]) ?? []);
      setOverview((overviewRes.data as OverviewStats) ?? null);
      setActiveMapLetters((activeMapLettersRes.data as QueueMapLetter[]) ?? []);
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
    const mapLetterIds = openReports.filter(r => r.target_type === "map_letter").map(r => r.target_id);
    const convIds = openReports.filter(r => r.target_type === "conversation").map(r => r.target_id);
    const messageIds = openReports.filter(r => r.target_type === "message").map(r => r.target_id);

    const [lettersRes, mapLettersRes, convsRes, messagesRes, reportedMessagesRes] = await Promise.all([
      letterIds.length
        ? supabase.from("letters").select("id, body").in("id", letterIds)
        : Promise.resolve({ data: [] as { id: string; body: string }[] }),
      mapLetterIds.length
        ? supabase.from("map_letters").select("id, body").in("id", mapLetterIds)
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
      // Reported individual messages — RLS (messages_moderator_select, migration
      // 041) exposes a row here once reported_at is set, independent of whether
      // its conversation is also reported.
      messageIds.length
        ? supabase
            .from("messages")
            .select("id, body, sender:user_profiles!sender_id(nickname)")
            .in("id", messageIds)
        : Promise.resolve({ data: [] as { id: string; body: string; sender: { nickname: string } | null }[] }),
    ]);

    type ConvPreview = { id: string; user_a: { nickname: string } | null; user_b: { nickname: string } | null };
    type MessageRow = { conversation_id: string; body: string; sender: { nickname: string } | null };
    type ReportedMessageRow = { id: string; body: string; sender: { nickname: string } | null };

    const letterPreviews = new Map((lettersRes.data ?? []).map(l => [l.id, l.body]));
    const mapLetterPreviews = new Map((mapLettersRes.data ?? []).map(l => [l.id, l.body]));
    const convPreviews = new Map(
      ((convsRes.data ?? []) as ConvPreview[]).map(c => [c.id, `${c.user_a?.nickname ?? "?"} ↔ ${c.user_b?.nickname ?? "?"}`])
    );
    const messagePreviews = new Map(
      ((reportedMessagesRes.data ?? []) as ReportedMessageRow[]).map(m => [m.id, `${m.sender?.nickname ?? "?"}: ${m.body}`])
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
          ? letterPreviews.get(r.target_id) ?? "(laiškelis nerastas)"
          : r.target_type === "map_letter"
            ? mapLetterPreviews.get(r.target_id) ?? "(laiškelis nerastas)"
            : r.target_type === "message"
              ? messagePreviews.get(r.target_id) ?? "(žinutė nerasta)"
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

  async function resolveMessageReport(report: ReportItem, action: "ignore" | "mute" | "ban") {
    setActingOn(report.id);
    const { error } = await supabase.rpc("resolve_message_report", {
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

  // Permanent, unreviewable removal — the moderator (also the sole
  // developer here) deleting something on their own initiative straight
  // away, rather than the soft flip-to-removed_reported + review-queue
  // path every user-filed report goes through (that flow is untouched;
  // this is a second, moderator-only capability layered on top of it,
  // backed by the is_moderator() DELETE policies from migration 044).
  function confirmDeleteLetter(id: string, table: "letters" | "map_letters") {
    Alert.alert(
      "Delete permanently?",
      "This deletes the letter outright — no review queue, no undo.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setActingOn(id);
            const { error } = await supabase.from(table).delete().eq("id", id);
            setActingOn(null);
            if (error) {
              Alert.alert("Klaida", error.message);
              return;
            }
            if (table === "letters") {
              setActiveLetters(prev => prev.filter(l => l.id !== id));
              setLetters(prev => prev.filter(l => l.id !== id));
            } else {
              setActiveMapLetters(prev => prev.filter(l => l.id !== id));
            }
            // The deleted row may itself have been an open report's target
            // (e.g. deleted straight from the Open reports queue) — its
            // preview would otherwise dangle until the next load().
            setReports(prev => prev.filter(r => r.target_id !== id));
          },
        },
      ]
    );
  }

  async function sendManualEmail() {
    if (!emailTo || !emailSubject || !emailBody) {
      Alert.alert("Klaida", "Fill in to, subject, and body.");
      return;
    }
    setSendingEmail(true);
    const { error } = await supabase.functions.invoke("send-manual-email", {
      body: { to: emailTo, subject: emailSubject, html: emailBody },
    });
    setSendingEmail(false);
    if (error) {
      Alert.alert("Klaida", error.message);
      return;
    }
    Alert.alert("Sent", `Email sent to ${emailTo}.`);
    setEmailTo("");
    setEmailSubject("");
    setEmailBody(DEFAULT_EMAIL_BODY);
    setEmailFormOpen(false);
  }

  function daysLeft(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  function confirmBan(report: ReportItem) {
    const resolve = report.target_type === "message" ? resolveMessageReport : resolveConversationReport;
    Alert.alert(
      "Ban this user?",
      "Restricts them from writing letters, sending messages, or sending connection requests, indefinitely.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Ban", style: "destructive", onPress: () => resolve(report, "ban") },
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
        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.back()}
          hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : 8}
          accessibilityRole="button"
          accessibilityLabel="Grįžti atgal"
        >
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

            {!loading && (
              <View style={s.reportsSection}>
                <TouchableOpacity
                  style={s.sectionToggle}
                  onPress={() => setEmailFormOpen(v => !v)}
                  hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
                >
                  <Text style={s.sectionTitle}>Send email</Text>
                  <Ionicons
                    name={emailFormOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.subtext}
                  />
                </TouchableOpacity>
                {emailFormOpen && (
                  <View style={s.card}>
                    <TextInput
                      style={s.input}
                      placeholder="To"
                      placeholderTextColor={colors.subtext}
                      value={emailTo}
                      onChangeText={setEmailTo}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <TextInput
                      style={s.input}
                      placeholder="Subject"
                      placeholderTextColor={colors.subtext}
                      value={emailSubject}
                      onChangeText={setEmailSubject}
                    />
                    <TextInput
                      style={[s.input, s.inputMultiline]}
                      placeholder="Body (HTML allowed)"
                      placeholderTextColor={colors.subtext}
                      value={emailBody}
                      onChangeText={setEmailBody}
                      multiline
                    />
                    <TouchableOpacity
                      style={[s.actionButton, s.approveButton, largeTouchTargets && s.actionButtonLarge]}
                      onPress={sendManualEmail}
                      disabled={sendingEmail}
                    >
                      {sendingEmail ? (
                        <ActivityIndicator color={colors.accentText} />
                      ) : (
                        <Text style={s.approveText}>Send</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {!loading && overview && (
              <View style={s.statsSection}>
                <Text style={s.sectionTitle}>Overview</Text>
                <View style={s.statsGrid}>
                  <StatTile label="Active letters" value={overview.active_letters_count} s={s} />
                  <StatTile label="Map letters" value={overview.active_map_letters_count} s={s} />
                  <StatTile label="Total letters" value={overview.total_letters_count} s={s} />
                  <StatTile label="In Obituary" value={overview.obituary_public_count} s={s} />
                  <StatTile label="Pending review" value={overview.pending_obituary_review} s={s} />
                  <StatTile label="Open reports" value={overview.open_reports_count} s={s} />
                  <StatTile label="Total users" value={overview.total_users_count} s={s} />
                  <StatTile label="Active (24h)" value={overview.active_users_24h} s={s} />
                  <StatTile label="Active (7d)" value={overview.active_users_7d} s={s} />
                  <StatTile label="Conversations" value={overview.total_conversations_count} s={s} />
                  <StatTile label="Messages" value={overview.total_messages_count} s={s} />
                </View>
              </View>
            )}

            {!loading && activeLetters.length > 0 && (
              <View style={s.reportsSection}>
                <TouchableOpacity
                  style={s.sectionToggle}
                  onPress={() => setActiveLettersOpen(v => !v)}
                  hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
                >
                  <Text style={s.sectionTitle}>Active letters ({activeLetters.length})</Text>
                  <Ionicons
                    name={activeLettersOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.subtext}
                  />
                </TouchableOpacity>
                {activeLettersOpen && activeLetters.map(item => (
                  <View key={item.id} style={s.card}>
                    <Text style={s.cardBody}>{item.body}</Text>
                    <View style={s.cardMeta}>
                      <Text style={s.metaText}>{item.author?.nickname ?? "unknown"}</Text>
                      <Text style={s.metaText}>
                        ❤ {item.like_count} · 💀 {item.dislike_count} · {item.travel_count} travels · {daysLeft(item.expires_at)}d left
                      </Text>
                    </View>
                    <View style={s.actionRow}>
                      <TouchableOpacity
                        style={[s.actionButton, s.banButton, largeTouchTargets && s.actionButtonLarge]}
                        onPress={() => confirmDeleteLetter(item.id, "letters")}
                        disabled={actingOn === item.id}
                      >
                        <Ionicons name="trash" size={16} color="#fff" />
                        <Text style={s.banText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {!loading && activeMapLetters.length > 0 && (
              <View style={s.reportsSection}>
                <TouchableOpacity
                  style={s.sectionToggle}
                  onPress={() => setActiveMapLettersOpen(v => !v)}
                  hitSlop={largeTouchTargets ? HIT_SLOP_LARGE : undefined}
                >
                  <Text style={s.sectionTitle}>Active map letters ({activeMapLetters.length})</Text>
                  <Ionicons
                    name={activeMapLettersOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.subtext}
                  />
                </TouchableOpacity>
                {activeMapLettersOpen && activeMapLetters.map(item => (
                  <View key={item.id} style={s.card}>
                    <Text style={s.cardBody}>{item.body}</Text>
                    <View style={s.cardMeta}>
                      <Text style={s.metaText}>{item.author?.nickname ?? "unknown"}</Text>
                      <Text style={s.metaText}>❤ {item.like_count}</Text>
                    </View>
                    <View style={s.actionRow}>
                      <TouchableOpacity
                        style={[s.actionButton, s.banButton, largeTouchTargets && s.actionButtonLarge]}
                        onPress={() => confirmDeleteLetter(item.id, "map_letters")}
                        disabled={actingOn === item.id}
                      >
                        <Ionicons name="trash" size={16} color="#fff" />
                        <Text style={s.banText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

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
                    {item.target_type === "letter" || item.target_type === "map_letter" ? (
                      <View style={s.actionRow}>
                        <TouchableOpacity
                          style={[s.actionButton, s.rejectButton, largeTouchTargets && s.actionButtonLarge]}
                          onPress={() => resolveLetterReport(item, true)}
                          disabled={actingOn === item.id}
                        >
                          <Ionicons name="refresh" size={18} color={colors.subtext} />
                          <Text style={s.rejectText}>Restore</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionButton, s.approveButton, largeTouchTargets && s.actionButtonLarge]}
                          onPress={() => resolveLetterReport(item, false)}
                          disabled={actingOn === item.id}
                        >
                          <Ionicons name="checkmark" size={18} color={colors.accentText} />
                          <Text style={s.approveText}>Confirm removal</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionButton, s.banButton, largeTouchTargets && s.actionButtonLarge]}
                          onPress={() => confirmDeleteLetter(item.target_id, item.target_type === "letter" ? "letters" : "map_letters")}
                          disabled={actingOn === item.id}
                        >
                          <Ionicons name="trash" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={s.actionRow}>
                        <TouchableOpacity
                          style={[s.actionButton, s.rejectButton, largeTouchTargets && s.actionButtonLarge]}
                          onPress={() => (item.target_type === "message" ? resolveMessageReport : resolveConversationReport)(item, "ignore")}
                          disabled={actingOn === item.id}
                        >
                          <Text style={s.rejectText}>Ignore</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionButton, s.muteButton, largeTouchTargets && s.actionButtonLarge]}
                          onPress={() => (item.target_type === "message" ? resolveMessageReport : resolveConversationReport)(item, "mute")}
                          disabled={actingOn === item.id}
                        >
                          <Text style={s.muteText}>Mute 2d</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionButton, s.banButton, largeTouchTargets && s.actionButtonLarge]}
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
                style={[s.actionButton, s.rejectButton, largeTouchTargets && s.actionButtonLarge]}
                onPress={() => review(item, false)}
                disabled={actingOn === item.id}
              >
                <Ionicons name="close" size={18} color={colors.subtext} />
                <Text style={s.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionButton, s.approveButton, largeTouchTargets && s.actionButtonLarge]}
                onPress={() => review(item, true)}
                disabled={actingOn === item.id}
              >
                <Ionicons name="checkmark" size={18} color={colors.accentText} />
                <Text style={s.approveText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionButton, s.banButton, largeTouchTargets && s.actionButtonLarge]}
                onPress={() => confirmDeleteLetter(item.id, "letters")}
                disabled={actingOn === item.id}
              >
                <Ionicons name="trash" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function StatTile({
  label,
  value,
  s,
}: {
  label: string;
  value: number;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={s.statTile}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
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
    statsSection: { marginBottom: 8 },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    statTile: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      minWidth: "30%",
      flexGrow: 1,
      ...outlineOnly(colors),
    },
    statValue: { fontSize: 22, fontWeight: "bold", color: colors.text },
    statLabel: { fontSize: 12, color: colors.subtext, marginTop: 2 },
    reportsSection: { marginBottom: 8 },
    sectionToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
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
      ...outlineOnly(colors),
    },
    transcriptLine: { fontSize: 13, color: colors.text, lineHeight: 18 },
    transcriptSender: { fontWeight: "700", color: colors.subtext },
    transcriptEmpty: { fontSize: 13, color: colors.subtext, fontStyle: "italic" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      ...outlineOnly(colors),
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
    actionButtonLarge: LARGE_BUTTON,
    rejectButton: { borderWidth: 1, borderColor: colors.border },
    rejectText: { fontSize: 14, color: colors.subtext, fontWeight: "600" },
    approveButton: { backgroundColor: colors.accent },
    approveText: { fontSize: 14, color: colors.accentText, fontWeight: "600" },
    muteButton: { borderWidth: 1, borderColor: colors.accent },
    muteText: { fontSize: 14, color: colors.accent, fontWeight: "600" },
    banButton: { backgroundColor: colors.red ?? "#ef4444" },
    banText: { fontSize: 14, color: "#fff", fontWeight: "600" },
    input: {
      backgroundColor: colors.surfaceAlt ?? colors.bg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      marginBottom: 10,
      ...outlineOnly(colors),
    },
    inputMultiline: { minHeight: 100, textAlignVertical: "top" },
  });
}
