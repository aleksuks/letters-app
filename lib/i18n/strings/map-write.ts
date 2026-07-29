import { defineStrings } from "@/lib/i18n";

export const mapWriteStrings = defineStrings({
  lt: {
    close: "Uždaryti",
    headerTitle: "Palikti laiškelį čia",
    sendButton: "Palikti",

    placeNote:
      "Laiškelis gulės pažymėtoje vietoje 30 dienų — galbūt jį ras tas, kam jis skirtas.",
    placeholder: "Tau, kurį čia sutikau...",
    counter: "liko {remaining} simbolių",

    drawToggle: "Pridėti piešinį",
    drawTitle: "Piešinys",
    drawRemove: "Pašalinti",

    sendCaption: "Tavo laiškelis liko gulėti šioje vietoje…",
    sendCancel: "Atšaukti",

    rejectedTitle: "Laiškelis nepaliktas",
    scriptRejectedBody:
      "Laiškelius galima rašyti tik lotyniškomis raidėmis. Perrašyk laiškelį lietuviškai ir pabandyk dar kartą.",
    linkRejectedBody: "Be šansų seni.",
    moderationRejectedBody:
      "Tavo laiškelyje per daug įžeidžiančios kalbos. Stipresnė kalba nieko tokio, bet šiuo atveju truputį persistengta, ir toks laiškelis čia būti negalės. Pabandyk perrašyti.",
  },
  en: {
    close: "Close",
    headerTitle: "Leave a letter here",
    sendButton: "Leave it",

    placeNote:
      "Your letter will rest at this spot for 30 days — maybe the person it's for will find it.",
    placeholder: "To the one I met here...",
    counter: "{remaining} characters left",

    drawToggle: "Add a drawing",
    drawTitle: "Drawing",
    drawRemove: "Remove",

    sendCaption: "Your letter stayed behind, right here…",
    sendCancel: "Cancel",

    rejectedTitle: "Letter not left",
    scriptRejectedBody:
      "Letters can only be written in Latin letters. Rewrite it and try again.",
    linkRejectedBody: "Not a chance, chief.",
    moderationRejectedBody:
      "Your letter has too much offensive language. Strong language on its own is fine, but this crossed the line, so it can't be left here. Try rewriting it.",
  },
});
