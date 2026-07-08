// Drains notification_outbox and hands each row to Expo's push API.
// Invoked once a minute by the 'push-notifications-dispatch' pg_cron job
// (migration 015). Deliberately single-attempt: a row that fails just sits
// with sent_at still null and an `error` note — there is no in-app inbox to
// retry into later, and these are gentle nudges, not critical delivery.
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

type OutboxRow = {
  id: string;
  push_token: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
};

type ExpoTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: rows, error } = await supabase
    .from("notification_outbox")
    .select("id, push_token, title, body, data")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return Response.json({ sent: 0 });
  }

  let sent = 0;
  const staleTokens = new Set<string>();

  const allRows = rows as OutboxRow[];
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const page = allRows.slice(i, i + BATCH_SIZE);

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        page.map((r) => ({
          to: r.push_token,
          title: r.title,
          body: r.body,
          data: r.data ?? {},
          // Matches the file bundled via the expo-notifications config
          // plugin's `sounds` option (app.json) and the Android channel
          // set up in lib/notifications.ts.
          sound: "notification.wav",
        }))
      ),
    });

    const json = await res.json().catch(() => null);
    const tickets: ExpoTicket[] = json?.data ?? [];

    await supabase
      .from("notification_outbox")
      .update({ sent_at: new Date().toISOString() })
      .in("id", page.map((r) => r.id));

    for (let t = 0; t < page.length; t++) {
      const ticket = tickets[t];
      const row = page[t];
      if (!ticket || ticket.status === "error") {
        await supabase
          .from("notification_outbox")
          .update({ error: ticket?.message ?? "no_ticket_returned" })
          .eq("id", row.id);
        if (ticket?.details?.error === "DeviceNotRegistered") {
          staleTokens.add(row.push_token);
        }
      } else {
        sent++;
      }
    }
  }

  if (staleTokens.size > 0) {
    await supabase
      .from("user_profiles")
      .update({ push_token: null })
      .in("push_token", Array.from(staleTokens));
  }

  return Response.json({ sent, total: rows.length });
});
