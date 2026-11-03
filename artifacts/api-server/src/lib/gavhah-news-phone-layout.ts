// Gavhah news telephone layout — current LIVE Worker v115 (2026-11-02).
// Other modules, all news article records, member permissions and subscriptions stay untouched.
// In the main Gavhah phone menu, dial 1 -> "11" (Chesed News).
// A spoken prompt asks caller to WAIT for ALL updates or press 1 for other options.
// On a provider-approved empty read (readNone=Ok / "None"), the phone
// automatically enters the existing full news reader path "111".
// On each story, the existing news read mode likewise auto-advances after silence.
// "Browse news categories" (legacy 112 and 1121-1129) is not presented.
// Existing pending calls on those old paths are sent to options path 97111.
// The parent news menu "11" retains custom per-extension TTS and WAV upload/voice changer.
export const gavhahNewsEntryPrompt = "To hear all updates, stay on the line. For other options, press 1.";
export const gavhahNewsDial = {
 main: "1", internalPath: "11", autoPlayPath: "111",
 otherMenu: "97111",
 otherOptions: {
  "1": {title:"Important and critical news", internalPath:"113"},
  "3": {title:"Read an update by article number", internalPath:"115"},
  "4": {title:"All updates, newest first", internalPath:"111"}
 },
 removedFromNavigation: ["112","1121","1122","1123","1124","1125","1126","1127","1128","1129"],
 back: "*",
} as const;
// README: The Cloudflare Worker code is the active callback source.
// The older API server callback source in this GitHub repo is not yet a complete
// mirror of direct Cloudflare edits. Never redeploy it blindly over Worker v115.
