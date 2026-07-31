import { defineStrings } from "@/lib/i18n";

// app/(tabs)/conversations.tsx — the conversations/chat list tab.
export const conversationsStrings = defineStrings({
  lt: {
    title: "Pokalbiai",

    requestsSectionTitle: "Užklausos susisiekti",
    messagesSectionTitle: "Žinutės",

    unknownNickname: "nepažįstamasis",
    letterPreview: "re: „{body}“",
    greetingQuoted: "„{greeting}“",

    declineButton: "Atmesti",
    acceptButton: "Priimti",

    emptyText: "Kol kas jokių pokalbių.",
    // The old banner tip's content lives here now — read exactly when the
    // screen is otherwise empty and the user is wondering what goes in it.
    emptyHint:
      "Jei kas norės su tavimi pabendrauti, užklausa atsiras čia. Priėmus prasidės pokalbis, o atmesta užklausa tiesiog dings — siuntėjas to net nesužinos.",

    alreadyConversationTitle: "Pokalbis jau vyksta",
    alreadyConversationBody:
      "Su šiuo žmogumi jau turi pokalbį — atsiverk jį skiltyje „Pokalbiai“.",
  },
  en: {
    title: "Conversations",

    requestsSectionTitle: "Requests to talk",
    messagesSectionTitle: "Messages",

    unknownNickname: "a stranger",
    letterPreview: "re: “{body}”",
    greetingQuoted: "“{greeting}”",

    declineButton: "Decline",
    acceptButton: "Accept",

    emptyText: "No conversations yet.",
    emptyHint:
      "If someone wants to talk with you, their request will show up here. Accept it and a conversation begins — decline, and it just quietly disappears; the sender never finds out.",

    alreadyConversationTitle: "You're already talking",
    alreadyConversationBody:
      "You already have a conversation with this person — open it from the Conversations tab.",
  },
});
