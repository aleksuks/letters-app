import { defineStrings } from "@/lib/i18n";

export const chatStrings = defineStrings({
  lt: {
    tutorialIntro: "Pokalbis neįpareigoja - gali ištrinti ir išeiti be įspėjimo arba pranešti jei turinys visai nepriimtinas.",
    reportedBanner: "Pokalbis baigtas — pranešta administratoriui.",

    reportMessageTitle: "Pranešti apie žinutę?",
    reportMessageBody: "Žinutė liks matoma, bet administratorius ją peržiūrės.",
    reasonInappropriate: "Netinkamas turinys",
    reasonHarassment: "Priekabiavimas ar grasinimai",

    thanksTitle: "Ačiū",
    reportReceivedBody: "Pranešimas gautas.",

    deleteMessageTitle: "Ištrinti žinutę sau?",
    deleteMessageBody: "Ji ir toliau bus matoma kitam pokalbio dalyviui.",

    messageRejectedTitle: "Žinutė neišsiųsta",
    messageRejectedBody: "Be šansų seni.",

    leaveTitle: "Palikti pokalbį (visam laikui)",
    leaveBody: "Tai užbaigs ir ištrins pokalbį abiems.",
    leaveConfirm: "Į kapines",
    leaveActionLabel: "Palikti pokalbį",

    strangerFallback: "nepažįstamasis",

    blockTitle: "Blokuoti šį žmogų?",
    blockBody: "Jis nebegalės tau rašyti ar siųsti naujų užklausų susisiekti. Šis pokalbis bus užbaigtas.",
    blockConfirm: "Blokuoti",

    reportConversationTitle: "Pranešti apie pokalbį?",
    reportConversationBody: "Pokalbis bus iškart baigtas abiem pusėms. Istorija išliks matoma peržiūrai.",
    reportReceivedConversationBody: "Pranešimas gautas, pokalbis baigtas.",
    reportAction: "Pranešti",

    moreActionsLabel: "Pokalbio veiksmai",
    moreActionsHint: "Išeiti iš pokalbio, blokuoti arba pranešti",

    inputPlaceholder: "Bla bla bla...",
    sendMessageLabel: "Siųsti žinutę",
  },
  en: {
    tutorialIntro: "This conversation doesn't obligate you to anything — you can delete it and leave without warning, or report it if the content is truly unacceptable.",
    reportedBanner: "Conversation ended — reported to a moderator.",

    reportMessageTitle: "Report this message?",
    reportMessageBody: "The message stays visible, but a moderator will review it.",
    reasonInappropriate: "Inappropriate content",
    reasonHarassment: "Harassment or threats",

    thanksTitle: "Thank you",
    reportReceivedBody: "Report received.",

    deleteMessageTitle: "Delete this message for yourself?",
    deleteMessageBody: "It'll still be visible to the other person in the conversation.",

    messageRejectedTitle: "Message not sent",
    messageRejectedBody: "Nice try — no links allowed.",

    leaveTitle: "Leave conversation (for good)",
    leaveBody: "This will end and delete the conversation for both of you.",
    leaveConfirm: "To the graveyard",
    leaveActionLabel: "Leave conversation",

    strangerFallback: "a stranger",

    blockTitle: "Block this person?",
    blockBody: "They won't be able to message you or send new requests to talk. This conversation will end.",
    blockConfirm: "Block",

    reportConversationTitle: "Report this conversation?",
    reportConversationBody: "The conversation will end immediately for both sides. The history stays visible for review.",
    reportReceivedConversationBody: "Report received, conversation ended.",
    reportAction: "Report",

    moreActionsLabel: "Conversation actions",
    moreActionsHint: "Leave the conversation, block, or report",

    inputPlaceholder: "Blah blah blah...",
    sendMessageLabel: "Send message",
  },
});
