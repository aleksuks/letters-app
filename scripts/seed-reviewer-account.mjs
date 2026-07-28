// One-off helper to create the App Store / Play Console reviewer demo
// account and seed it with a few letters so a reviewer opening the app sees
// a working feed, not an empty state. Separate from the shared dev account
// in TEST_ACCOUNT.md, which gets wiped before release — this one is meant
// to survive as the account pasted into each store's review notes.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import crypto from "crypto";

const env = fs.readFileSync(".env", "utf8");
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const envLocal = fs.readFileSync(".env.local", "utf8");
const serviceRoleKey = envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const REVIEWER_EMAIL = "aleksandrasabrutis18+laiskelisreviewer@gmail.com";
const REVIEWER_PASSWORD = crypto.randomBytes(12).toString("base64url");
const REVIEWER_NICKNAME = "peržiūrėtojas";

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const REVIEWER_LETTERS = [
  "Sveiki! Tai laiškelis apžvalgininkui — paraše rasite laiškų, kuriuos rašo ir gauna žmonės šioje programėlėje.",
  "Kiekvienas laiškelis gali keliauti pas kitą žmogų, jei jis patinka skaitytojams — tai atsitiktinis, bet apgalvotas procesas.",
  "Žemėlapyje laiškeliai prisegami prie konkrečios vietos Lietuvoje — pabandykite atidaryti žemėlapio skirtuką.",
];

const supabase = createClient(url, anonKey);

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: REVIEWER_EMAIL,
  password: REVIEWER_PASSWORD,
  email_confirm: true,
});

let userId;
if (createError) {
  if (!createError.message.includes("already been registered")) throw createError;
  console.log("Reviewer account already exists, rotating password instead");
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email === REVIEWER_EMAIL);
  if (!existing) throw new Error("User reported as existing but not found in listUsers()");
  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password: REVIEWER_PASSWORD,
    email_confirm: true,
  });
  if (updateError) throw updateError;
  userId = existing.id;
} else {
  console.log("Created + confirmed reviewer account", created.user.id);
  userId = created.user.id;
}

const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
  email: REVIEWER_EMAIL,
  password: REVIEWER_PASSWORD,
});
if (signInError) throw signInError;

const user = signInData.user;

const { data: profile } = await supabase
  .from("user_profiles")
  .select("id, nickname")
  .eq("id", user.id)
  .maybeSingle();

if (!profile) {
  const { error: profileError } = await supabase.from("user_profiles").insert({
    id: user.id,
    nickname: REVIEWER_NICKNAME,
    age_confirmed: true,
  });
  if (profileError) throw profileError;
  console.log("Created profile with nickname", REVIEWER_NICKNAME);
} else {
  console.log("Profile already exists:", profile.nickname);
}

const { data: existingLetters } = await supabase
  .from("letters")
  .select("id")
  .eq("author_id", user.id);

if (!existingLetters || existingLetters.length === 0) {
  for (const body of REVIEWER_LETTERS) {
    const { error } = await supabase.from("letters").insert({ author_id: user.id, body });
    if (error) console.log("Failed to insert letter:", error.message);
    else console.log("Inserted letter:", body.slice(0, 40) + "...");
  }
} else {
  console.log(`Skipping letter seed — ${existingLetters.length} already exist for this account.`);
}

const credentialsDoc = `# Store reviewer demo account

Not committed — see .gitignore's \`credentials/\` entry. Paste these into
App Store Connect's review notes "Sign-In Information" block and into the
Play Console's private testing notes.

- Email: \`${REVIEWER_EMAIL}\`
- Password: \`${REVIEWER_PASSWORD}\`
- Nickname: \`${REVIEWER_NICKNAME}\`
- User ID: \`${userId}\`

Seeded with 3 sample letters (Lithuanian) via
\`scripts/seed-reviewer-account.mjs\`. Re-running the script rotates the
password and skips reseeding if the account already has letters.

Unlike \`TEST_ACCOUNT.md\`, this account is meant to survive real launch —
don't wipe it in the same pass that wipes test data.
`;
fs.writeFileSync("credentials/reviewer-account.md", credentialsDoc);
console.log("\nReviewer account ready — credentials saved to credentials/reviewer-account.md");
