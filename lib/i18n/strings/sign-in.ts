import { defineStrings } from "@/lib/i18n";

export const signInStrings = defineStrings({
  lt: {
    accountExistsTitle: "Paskyra jau egzistuoja",
    accountExistsBody: "Su šiuo el. paštu jau yra sukurta paskyra. Prisijunkite arba atkurkite slaptažodį.",
    disposableEmailTitle: "Šis el. paštas netinka",
    disposableEmailBody: "Laikini/vienkartiniai el. pašto adresai neleidžiami — jei paskyrą reikės atkurti, laiškas turi kur nueiti. Naudokite tikrą el. paštą.",
    emailVariantTitle: "Šis adresas jau naudojamas",
    emailVariantBody: "Šis el. paštas veda į tą pačią dėžutę kaip jau esanti paskyra — „+“ priedas ar taškai Gmail adrese naujo adreso nesukuria. Vienai dėžutei — viena paskyra. Prisijunkite arba atkurkite slaptažodį.",
    errorTitle: "Klaida",

    checkEmailTitle: "Patikrinkite savo el. paštą",
    resetSentBody: "Jei paskyra su adresu {email} egzistuoja, nusiuntėme nuorodą slaptažodžiui atkurti.",
    backToSignIn: "Grįžti į prisijungimą",

    forgotPasswordTitle: "Pamiršote slaptažodį?",
    forgotPasswordSubtitle: "Įveskite savo el. paštą — atsiųsime nuorodą slaptažodžiui atkurti.",
    emailPlaceholder: "El. paštas",
    sendLink: "Siųsti nuorodą",

    confirmationSentBody: "Nusiuntėme patvirtinimo nuorodą į {email}. Patvirtinus, grįžkite čia.",
    signIn: "Prisijungti",

    signUpTitle: "Tapti nariu",
    signInTitle: "Sveiki sugrįžę",
    signUpSubtitle: "Rašyk ir gauk laiškelius.",
    signInSubtitle: "Norint tęsti, prisijunk",
    passwordPlaceholder: "Slaptažodis",
    signUpAction: "Registruotis",
    forgotPasswordLink: "Pamiršote slaptažodį?",
    hasAccountPrompt: "Jau turi paskyrą? ",
    noAccountPrompt: "Neturi paskyros? ",
  },
  en: {
    accountExistsTitle: "Account already exists",
    accountExistsBody: "There's already an account with this email. Sign in or reset your password.",
    disposableEmailTitle: "This email won't work",
    disposableEmailBody: "Temporary/disposable email addresses aren't allowed — if you ever need to recover your account, the email needs somewhere to land. Please use a real address.",
    emailVariantTitle: "This address is already in use",
    emailVariantBody: "This email lands in the same inbox as an existing account — a “+” tag or dots in a Gmail address don't make a new address. One inbox, one account. Sign in or reset your password.",
    errorTitle: "Error",

    checkEmailTitle: "Check your email",
    resetSentBody: "If an account with {email} exists, we've sent a link to reset your password.",
    backToSignIn: "Back to sign in",

    forgotPasswordTitle: "Forgot your password?",
    forgotPasswordSubtitle: "Enter your email — we'll send you a link to reset your password.",
    emailPlaceholder: "Email",
    sendLink: "Send link",

    confirmationSentBody: "We've sent a confirmation link to {email}. Come back here once you've confirmed.",
    signIn: "Sign in",

    signUpTitle: "Join in",
    signInTitle: "Welcome back",
    signUpSubtitle: "Write and receive letters.",
    signInSubtitle: "Sign in to continue",
    passwordPlaceholder: "Password",
    signUpAction: "Sign up",
    forgotPasswordLink: "Forgot your password?",
    hasAccountPrompt: "Already have an account? ",
    noAccountPrompt: "Don't have an account? ",
  },
});
