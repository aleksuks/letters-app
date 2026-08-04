import { ViewStyle } from "react-native";

// Google Play now warns that Android ignores orientation/resizability
// locks on large-screen devices (tablets, foldables) from Android 16
// onward, so a phone-only single-column layout stretched edge-to-edge
// would read poorly there. Rather than redesign every screen for large
// viewports, cap and center the reading column — a no-op on phone widths,
// since MAX_CONTENT_WIDTH only ever binds above them.
export const MAX_CONTENT_WIDTH = 600;

export const responsiveContent: ViewStyle = {
  width: "100%",
  maxWidth: MAX_CONTENT_WIDTH,
  alignSelf: "center",
};
