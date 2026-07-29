import { defineStrings } from "@/lib/i18n";

export const accessibilityScreenStrings = defineStrings({
  lt: {
    title: "Pritaikymas neįgaliesiems",
    backLabel: "Atgal",

    motionSection: "Judesys",
    reduceMotionLabel: "Visada mažinti animacijas",
    reduceMotionDesc: "Laiško vokelio, siuntimo ir skirtukų animacijos bus beveik akimirksniu, nepriklausomai nuo telefono nustatymų.",
    motionHintSystemReduced: "Šiuo metu mažinama, nes tai įjungta telefono nustatymuose.",
    motionHintSystemNormal: "Šiuo metu animacijos rodomos įprastai, kaip nustatyta telefone.",
    motionHintAppOverride: "Animacijos sumažintos šioje programėlėje.",

    visionSection: "Regėjimas",
    highContrastLabel: "Didesnis kontrastas",
    highContrastDesc: "Tamsesnis tekstas ir ryškesni kraštai visoje programėlėje, kad būtų lengviau skaityti.",
    textSizeHint: "Teksto dydis seka telefono bendrojo teksto dydžio nustatymą — jį galima keisti telefono nustatymuose.",

    touchSection: "Lietimas",
    largeTouchLabel: "Didesni mygtukai",
    largeTouchDesc: "Padidina mygtukų ir piktogramų lietimo sritį visoje programėlėje — patogiau, jei taikliai paliesti sunkiau.",
  },
  en: {
    title: "Accessibility",
    backLabel: "Back",

    motionSection: "Motion",
    reduceMotionLabel: "Always reduce animations",
    reduceMotionDesc: "The envelope, sending, and tab animations will be nearly instant, regardless of your phone's settings.",
    motionHintSystemReduced: "Currently reduced, because that's turned on in your phone's settings.",
    motionHintSystemNormal: "Animations are currently shown normally, as set on your phone.",
    motionHintAppOverride: "Animations are reduced in this app.",

    visionSection: "Vision",
    highContrastLabel: "Higher contrast",
    highContrastDesc: "Darker text and sharper edges throughout the app, for easier reading.",
    textSizeHint: "Text size follows your phone's overall text size setting — you can change it in your phone's settings.",

    touchSection: "Touch",
    largeTouchLabel: "Bigger buttons",
    largeTouchDesc: "Increases the touch area of buttons and icons throughout the app — helpful if precise taps are difficult.",
  },
});
