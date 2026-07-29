import { defineStrings } from "@/lib/i18n";

export const receiveStrings = defineStrings({
  lt: {
    close: "Uždaryti",
    closeLetter: "Uždaryti laiškelį",
    from: "nuo {nickname}",
    unknownAuthor: "nepažįstamasis",
    reportLabel: "Pranešti apie laiškelį",
    reportHint: "Laiškelis bus iškart pašalintas iš apyvartos, kol jį peržiūrės administratorius",

    emptyTitle: "Kol kas jokių laiškelių",
    emptyHint: "Pasaulis tylus. Pabandyk vėliau, arba parašyk pats.",
    emptyButton: "Atgal",

    withdrawnTitle: "Laiškelis atšauktas",
    withdrawnBody: "Siuntėjas atšaukė savo laiškelį prieš tau spėjant jį perskaityti.",

    reportConfirmTitle: "Pranešti apie laiškelį?",
    reportConfirmBody: "Laiškelis bus iškart pašalintas iš apyvartos, kol jį peržiūrės administratorius.",
    reportReasonContent: "Netinkamas turinys",
    reportReasonHarassment: "Priekabiavimas ar grasinimai",
    reportThanksTitle: "Ačiū",
    reportThanksBody: "Praneštas laiškelis pašalintas iš apyvartos, kol jį peržiūrės administratorius.",

    likeBadge: "Persiųsti kitam",
    dislikeBadge: "Į kapines",

    resultLikedTitle: "Persiųstas kitam",
    resultLikedHint: "Laiškelis keliauja pas naują nepažįstamąjį.",
    resultDislikedTitle: "Iškeliavo į kapines",
    resultDislikedHint: "Trys tokie balsai — ir laiškelis baigia kelionę.",

    actionsTip: "Jei laiškelis patiko, brauk jį dešinėn ir jis keliaus pas kitą gavėją. Jei jis dėmesio nevertas, brauk kairėn, ir siųsim jį į kapines. Jei nori pabendrauti su autoriumi, gali nusiųsti užklausą.",
    swipeHint: "Brauk laiškelį į šoną arba spausk mygtuką",

    requestButton: "Prašymas susisiekti",
    requestClosed: "Šis žmogus šiuo metu nepriima pokalbių užklausų.",
    greetingPlaceholder: "Trumpai pasisveikink…",
    sendGreeting: "Išsiųsti",
    requestSent: "Prašymas išsiųstas, o siuntėjas pagalvos ar sutinka.",

    alreadyRequestedTitle: "Leidimo jau prašyta",
    alreadyRequestedBody: "Jau išsiuntei užklausą susisiekti su siuntėju.",
    conversationExistsTitle: "Pokalbis jau vyksta",
    conversationExistsBody: "Su šio laiškelio autoriumi jau turi pokalbį — atsiverskite jį skiltyje „Pokalbiai“.",
    requestsClosedTitle: "Nepriima užklausų",
    requestsClosedBody: "Šis žmogus šiuo metu nepriima pokalbių užklausų.",

    errorTitle: "Klaida",
  },
  en: {
    close: "Close",
    closeLetter: "Close letter",
    from: "from {nickname}",
    unknownAuthor: "a stranger",
    reportLabel: "Report letter",
    reportHint: "The letter will be immediately removed from circulation pending review",

    emptyTitle: "No letters right now",
    emptyHint: "The world's quiet. Try again later, or write one yourself.",
    emptyButton: "Back",

    withdrawnTitle: "Letter withdrawn",
    withdrawnBody: "The sender withdrew this letter before you got the chance to read it.",

    reportConfirmTitle: "Report this letter?",
    reportConfirmBody: "The letter will be immediately removed from circulation pending review.",
    reportReasonContent: "Inappropriate content",
    reportReasonHarassment: "Harassment or threats",
    reportThanksTitle: "Thank you",
    reportThanksBody: "The reported letter has been removed from circulation pending review.",

    likeBadge: "Send onward",
    dislikeBadge: "To the graveyard",

    resultLikedTitle: "Sent onward",
    resultLikedHint: "The letter is on its way to a new stranger.",
    resultDislikedTitle: "Off to the graveyard",
    resultDislikedHint: "Three votes like that — and the letter's journey ends.",

    actionsTip: "If you liked the letter, swipe it right and it'll travel on to another reader. If it's not worth anyone's time, swipe left and we'll send it to the graveyard. Want to talk to the author? You can send a request.",
    swipeHint: "Swipe the letter sideways, or use the buttons",

    requestButton: "Request to talk",
    requestClosed: "This person isn't accepting requests to talk right now.",
    greetingPlaceholder: "Say a quick hello…",
    sendGreeting: "Send",
    requestSent: "Request sent — the sender will decide whether to accept.",

    alreadyRequestedTitle: "Already requested",
    alreadyRequestedBody: "You've already sent this sender a request to talk.",
    conversationExistsTitle: "You already have a conversation",
    conversationExistsBody: "You already have a conversation with this letter's author — open it under “Conversations”.",
    requestsClosedTitle: "Not accepting requests",
    requestsClosedBody: "This person isn't accepting requests to talk right now.",

    errorTitle: "Error",
  },
});
