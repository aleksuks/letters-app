import { defineStrings } from "@/lib/i18n";

// app/(tabs)/conversations.tsx — the conversations/chat list tab.
export const conversationsStrings = defineStrings({
  lt: {
    title: "Pokalbiai",
    tutorialIntro:
      "Jei kas norės su tavimi pabendrauti, užklausa bus čia. Priėmus prasidės pokalbis, o atsisakius užklausa tiesiog dings, ir siuntėjas to net nesužinos.",

    requestsSectionTitle: "Užklausos susisiekti",
    messagesSectionTitle: "Žinutės",

    unknownNickname: "nepažįstamasis",
    letterPreview: "re: „{body}“",
    greetingQuoted: "„{greeting}“",

    declineButton: "Atmesti",
    acceptButton: "Priimti",

    emptyText: "Kol kas jokių pokalbių.",
    emptyHint: "Norint pradėti pokalbį, priimk užklausą susisiekti.",

    alreadyConversationTitle: "Pokalbis jau vyksta",
    alreadyConversationBody:
      "Su šiuo žmogumi jau turi pokalbį — atsiverk jį skiltyje „Pokalbiai“.",
  },
  en: {
    title: "Conversations",
    tutorialIntro:
      "If someone wants to talk with you, their request will show up here. Accept it and a conversation begins — decline, and it just quietly disappears; the sender never finds out.",

    requestsSectionTitle: "Requests to talk",
    messagesSectionTitle: "Messages",

    unknownNickname: "a stranger",
    letterPreview: "re: “{body}”",
    greetingQuoted: "“{greeting}”",

    declineButton: "Decline",
    acceptButton: "Accept",

    emptyText: "No conversations yet.",
    emptyHint: "Accept a request to talk to start a conversation.",

    alreadyConversationTitle: "You're already talking",
    alreadyConversationBody:
      "You already have a conversation with this person — open it from the Conversations tab.",
  },
});
