import { defineStrings } from "@/lib/i18n";

export const resetPasswordStrings = defineStrings({
  lt: {
    errorTitle: "Klaida",
    passwordTooShort: "Slaptažodis turi būti bent 6 simbolių.",
    passwordsDontMatch: "Slaptažodžiai nesutampa.",

    title: "Naujas slaptažodis",
    subtitle: "Įveskite naują slaptažodį savo paskyrai.",
    newPasswordPlaceholder: "Naujas slaptažodis",
    confirmPasswordPlaceholder: "Pakartokite slaptažodį",
    save: "Išsaugoti slaptažodį",
    cancel: "Atšaukti",
  },
  en: {
    errorTitle: "Error",
    passwordTooShort: "Your password needs to be at least 6 characters.",
    passwordsDontMatch: "Passwords don't match.",

    title: "New password",
    subtitle: "Enter a new password for your account.",
    newPasswordPlaceholder: "New password",
    confirmPasswordPlaceholder: "Confirm password",
    save: "Save password",
    cancel: "Cancel",
  },
});
