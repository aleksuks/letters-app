import { defineStrings } from "@/lib/i18n";

export const writeStrings = defineStrings({
  lt: {
    close: "Uždaryti",
    headerTitle: "Parašyti laiškelį",
    sendButton: "Išsiųsti",

    tipIntro: "Nebijok rašyti nuoširdžiai — dalinamasi tik tavo slapyvardžiu.",

    inputPlaceholder: "Brangus gavėjau...",
    counter: "liko {remaining} simbolių",

    promptsLabel: "Pasiūlymai",
    promptYoungerSelf: "Ką pasakytum jaunesniam sau?",
    promptNeverDaredSay: "Ko niekam nedrįsai pasakyti?",
    promptPerfectDay: "Kaip atrodytų tobula tavo diena?",
    promptPostponedDream: "Apie ką seniai svajoji, bet vis atidedi?",
    promptDearestMemory: "Koks prisiminimas tau brangiausias?",
    promptGrateful: "Už ką šiandien esi dėkingas?",
    promptAfraid: "Ko bijai?",
    promptNewTrait: "Jei rytoj atsibustum įgijęs vieną naują savybę — kokią?",
    promptEncourage: "Padrąsink žmogų, kuriam šiandien sunku.",
    promptSurprised: "Kas tave neseniai nustebino gerąja prasme?",

    addDrawing: "Pridėti piešinį",
    drawingTitle: "Piešinys",
    drawingRemove: "Pašalinti",

    sendCaption: "Tavo laiškas iškeliavo pas nepažįstamąjį…",
    sendCancel: "Atšaukti",

    errorTitle: "Klaida",

    rejectedTitle: "Laiškelis neiškeliavo",
    rejectedScriptBody: "Laiškelius galima rašyti tik lotyniškomis raidėmis. Perrašyk laiškelį lietuviškai ir pabandyk dar kartą.",
    rejectedLinkBody: "Be šansų seni.",
    rejectedModerationBody: "Tavo laiškelyje per daug įžeidžiančios kalbos. Stipresnė kalba nieko tokio, bet šiuo atveju truputį persistengta, ir toks laiškelis niekur neskris. Pabandyk perrašyti.",
  },
  en: {
    close: "Close",
    headerTitle: "Write a letter",
    sendButton: "Send",

    tipIntro: "Don't be afraid to write honestly — only your nickname is ever shared.",

    inputPlaceholder: "Dear stranger...",
    counter: "{remaining} characters left",

    promptsLabel: "Ideas",
    promptYoungerSelf: "What would you tell a younger you?",
    promptNeverDaredSay: "What have you never dared to say to anyone?",
    promptPerfectDay: "What would your perfect day look like?",
    promptPostponedDream: "What's a dream you keep putting off?",
    promptDearestMemory: "What memory means the most to you?",
    promptGrateful: "What are you grateful for today?",
    promptAfraid: "What are you afraid of?",
    promptNewTrait: "If you woke up tomorrow with one new quality — what would it be?",
    promptEncourage: "Encourage someone who's having a hard day.",
    promptSurprised: "What recently surprised you in a good way?",

    addDrawing: "Add a drawing",
    drawingTitle: "Drawing",
    drawingRemove: "Remove",

    sendCaption: "Your letter is on its way to a stranger…",
    sendCancel: "Cancel",

    errorTitle: "Error",

    rejectedTitle: "Your letter didn't go out",
    rejectedScriptBody: "Letters can only be written in Latin script. Rewrite it and try again.",
    rejectedLinkBody: "Not a chance, friend.",
    rejectedModerationBody: "There's too much offensive language in your letter. Strong language on its own is fine, but this one went a bit too far, so it won't be sent as is. Try rewriting it.",
  },
});
