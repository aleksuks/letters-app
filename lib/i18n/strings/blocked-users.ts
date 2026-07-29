import { defineStrings } from "@/lib/i18n";

export const blockedUsersStrings = defineStrings({
  lt: {
    title: "Blokuoti vartotojai",
    unblockConfirmTitle: "Atblokuoti?",
    unblockConfirmBody: "{nickname} vėl galės siųsti tau užklausas pokalbiams ir žinutes.",
    genericUserFallback: "Šis vartotojas",
    strangerFallback: "nepažįstamasis",
    unblockAction: "Atblokuoti",
    unblockLabel: "Atblokuoti {nickname}",
    emptyList: "Niekas nėra užblokuotas.",
  },
  en: {
    title: "Blocked users",
    unblockConfirmTitle: "Unblock?",
    unblockConfirmBody: "{nickname} will be able to send you requests to talk and messages again.",
    genericUserFallback: "This user",
    strangerFallback: "a stranger",
    unblockAction: "Unblock",
    unblockLabel: "Unblock {nickname}",
    emptyList: "No one is blocked.",
  },
});
