// One-off helper to create/reuse the repo's shared test account and drop a
// few sample letters into it. Credentials are intentionally checked into
// TEST_ACCOUNT.md (not gitignored) since this app gets wiped before real
// release — see CLAUDE.md for product context.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const envLocal = fs.readFileSync(".env.local", "utf8");
const serviceRoleKey = envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const TEST_EMAIL = "aleksandrasabrutis18+letterstest@gmail.com";
const TEST_PASSWORD = "LettersTest123!";
const TEST_NICKNAME = "testrasytojas";

// Admin client (service role, bypasses RLS + email confirmation) — used only
// to confirm the seed account so a normal anon-key session can take over.
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_LETTERS = [
  "Sveiki, tai mano pirmas laiškas šiame aplikacijoje. Tiesiog norėjau kažkam parašyti, net jei niekada nesužinosiu, kas jį perskaitys.",
  "Šiandien buvo sunki diena, bet vakare pažiūrėjau į dangų ir pagalvojau, kad viskas bus gerai. Linkiu ir tau ramybės.",
  "Bijau, kad niekada nepasakysiu žmonėms, kaip jais rūpinuosi. Gal parašius čia bus lengviau.",
  "Norėčiau, kad kiti žinotų — nesijaučia gėdos prašyti pagalbos. Aš pati/pats mokausi to kiekvieną dieną.",
];

const supabase = createClient(url, anonKey);

// Ensure the account exists and its email is pre-confirmed, so the anon-key
// sign-in below gets a real session without needing to click an email link.
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
});

if (createError) {
  if (!createError.message.includes("already been registered")) throw createError;
  console.log("User already exists, confirming + resetting password instead");
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email === TEST_EMAIL);
  if (!existing) throw new Error("User reported as existing but not found in listUsers()");
  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (updateError) throw updateError;
} else {
  console.log("Created + confirmed user", created.user.id);
}

const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (signInError) throw signInError;

const user = signInData.user;

console.log("Authenticated as", user.id);

const { data: profile } = await supabase
  .from("user_profiles")
  .select("id, nickname")
  .eq("id", user.id)
  .maybeSingle();

if (!profile) {
  const { error: profileError } = await supabase.from("user_profiles").insert({
    id: user.id,
    nickname: TEST_NICKNAME,
    age_confirmed: true,
  });
  if (profileError) throw profileError;
  console.log("Created profile with nickname", TEST_NICKNAME);
} else {
  console.log("Profile already exists:", profile.nickname);
}

for (const body of TEST_LETTERS) {
  const { error } = await supabase.from("letters").insert({
    author_id: user.id,
    body,
  });
  if (error) {
    console.log("Failed to insert letter:", error.message);
  } else {
    console.log("Inserted letter:", body.slice(0, 40) + "...");
  }
}

console.log("Done.");
