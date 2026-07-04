import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, anonKey);

const testEmail = `aleksandrasabrutis18+letterstest${Date.now()}@gmail.com`;
const testPassword = "TestPass123!" + Date.now();

const { data, error } = await supabase.auth.signUp({
  email: testEmail,
  password: testPassword,
});

console.log(JSON.stringify({
  error: error?.message ?? null,
  hasSession: !!data.session,
  userId: data.user?.id ?? null,
  email: testEmail,
}, null, 2));
