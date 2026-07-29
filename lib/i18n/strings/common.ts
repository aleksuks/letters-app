import { defineStrings } from "@/lib/i18n";

// Shared across screens: generic alert buttons, error titles, loading
// states. Pull from here before adding a near-duplicate to a screen's own
// strings file.
export const common = defineStrings({
  lt: {
    error: "Klaida",
    ok: "Gerai",
    cancel: "Atšaukti",
    continueAction: "Tęsti",
    delete: "Ištrinti",
    save: "Išsaugoti",
    loading: "Kraunama...",
    goBack: "Grįžti atgal",
    tryAgain: "Bandyti dar kartą",
    somethingWentWrong: "Kažkas nutiko ne taip",
  },
  en: {
    error: "Error",
    ok: "OK",
    cancel: "Cancel",
    continueAction: "Continue",
    delete: "Delete",
    save: "Save",
    loading: "Loading...",
    goBack: "Go back",
    tryAgain: "Try again",
    somethingWentWrong: "Something went wrong",
  },
});
