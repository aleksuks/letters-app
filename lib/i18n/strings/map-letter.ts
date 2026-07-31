import { defineStrings } from "@/lib/i18n";

export const mapLetterStrings = defineStrings({
  lt: {
    close: "Uždaryti",
    reportLabel: "Pranešti apie laiškelį",
    reportHint: "Laiškelis bus iškart pašalintas iš žemėlapio, kol jį peržiūrės administratorius",

    emptyTitle: "Laiškelio čia nebėra",
    emptyHint: "Jis pasibaigė arba buvo pašalintas.",

    strangerSignature: "nepažįstamasis",
    meta: "Paliktas {left} · gulės čia iki {until}",

    likeHintLiked: "Patiko. Bakstelėk dar kartą du kartus, jei nori atšaukti.",
    likeHintUnliked: "Patiko? Bakstelėk laiškelį du kartus.",

    deleteLetter: "Pašalinti laiškelį",

    requestSentNote: "Užklausa išsiųsta. Jei autorius sutiks, pokalbį rasi skiltyje „Pokalbiai“.",

    requestLabel: "Parašyk trumpą žinutę — autorius nuspręs, ar pradėti pokalbį.",
    requestPlaceholder: "Sveiki! Manau, šis laiškelis skirtas man...",
    cancel: "Atšaukti",
    send: "Siųsti",
    replyToAuthor: "Atsiliepti autoriui",

    letterGoneTitle: "Laiškelio nebėra",
    letterGoneBody: "Šis laiškelis jau pasibaigė.",

    alreadyRequestedTitle: "Leidimo jau prašyta",
    alreadyRequestedBody: "Jau išsiuntei užklausą susisiekti su siuntėju.",
    conversationExistsTitle: "Pokalbis jau vyksta",
    conversationExistsBody: "Su šio laiškelio autoriumi jau turi pokalbį — atsiverskite jį skiltyje „Pokalbiai“.",
    notAcceptingTitle: "Nepriima užklausų",
    notAcceptingBody: "Šis žmogus šiuo metu nepriima pokalbių užklausų.",

    reportThanksTitle: "Ačiū",
    reportThanksBody: "Praneštas laiškelis pašalintas iš žemėlapio, kol jį peržiūrės administratorius.",

    confirmReportTitle: "Pranešti apie laiškelį?",
    confirmReportBody: "Laiškelis bus iškart pašalintas iš žemėlapio, kol jį peržiūrės administratorius.",
    reasonInappropriate: "Netinkamas turinys",
    reasonHarassment: "Priekabiavimas ar grasinimai",

    confirmDeleteTitle: "Pašalinti laiškelį?",
    confirmDeleteBody: "Laiškelis visam laikui dings iš žemėlapio.",
    delete: "Pašalinti",

    errorTitle: "Klaida",
  },
  en: {
    close: "Close",
    reportLabel: "Report letter",
    reportHint: "The letter will be pulled from the map right away, pending review",

    emptyTitle: "This letter is gone",
    emptyHint: "It expired, or was removed.",

    strangerSignature: "a stranger",
    meta: "Left on {left} · stays here until {until}",

    likeHintLiked: "Liked. Tap it twice again to undo that.",
    likeHintUnliked: "Like it? Tap the letter twice.",

    deleteLetter: "Delete letter",

    requestSentNote: "Request sent. If the author accepts, you'll find the chat under “Conversations.”",

    requestLabel: "Write a short note — the author will decide whether to start a conversation.",
    requestPlaceholder: "Hi! I think this letter might be for me...",
    cancel: "Cancel",
    send: "Send",
    replyToAuthor: "Reply to the author",

    letterGoneTitle: "Letter is gone",
    letterGoneBody: "This letter has already expired.",

    alreadyRequestedTitle: "Already asked",
    alreadyRequestedBody: "You've already sent a request to reach out to the sender.",
    conversationExistsTitle: "Conversation already going",
    conversationExistsBody: "You already have a conversation with this letter's author — find it under “Conversations.”",
    notAcceptingTitle: "Not accepting requests",
    notAcceptingBody: "This person isn't accepting conversation requests right now.",

    reportThanksTitle: "Thank you",
    reportThanksBody: "The reported letter has been pulled from the map, pending review.",

    confirmReportTitle: "Report this letter?",
    confirmReportBody: "The letter will be pulled from the map right away, pending review.",
    reasonInappropriate: "Inappropriate content",
    reasonHarassment: "Harassment or threats",

    confirmDeleteTitle: "Delete letter?",
    confirmDeleteBody: "The letter will disappear from the map for good.",
    delete: "Delete",

    errorTitle: "Error",
  },
});
