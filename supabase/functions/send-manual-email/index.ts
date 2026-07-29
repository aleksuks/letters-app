// Dev-only utility: lets the founder send an arbitrary one-off email from
// the app itself (moderation.tsx's "Send email" panel), without a channel
// running through the mobile bundle. RESEND_API_KEY never leaves this
// function; the JWT check below re-verifies is_moderator server-side rather
// than trusting the client-side gate on the button.
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
// Must be an address on a domain verified in Resend — if only
// mail.laiskelis.lt is verified there (not the apex), override this via the
// MANUAL_EMAIL_FROM secret instead of the apex default below.
const FROM_ADDRESS = Deno.env.get("MANUAL_EMAIL_FROM") ?? "laiskelis@laiskelis.lt";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return Response.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_moderator")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.is_moderator) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { to, subject, html } = await req.json();
  if (!to || !subject || !html) {
    return Response.json({ error: "to, subject, and html are required" }, { status: 400 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return Response.json({ error: json?.message ?? "Resend request failed" }, { status: 502 });
  }

  return Response.json({ id: json?.id });
});
