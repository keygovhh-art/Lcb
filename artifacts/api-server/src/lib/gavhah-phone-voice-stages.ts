// Per-message keypad voice editor metadata. Never announce 10-digit legacy member IDs.
// The {member_id} placeholder is filled dynamically by the actual IVR callback.
export const gavhahPhoneStageVoices:Record<string,{label:string;text:string}>=Object.fromEntries([
  [
    "1851",
    "0 — ערשטע רעגיסטראציע־מעלדונג",
    "Welcome to Gavhah member registration. Choose a six to twelve digit private password. Enter the password and press pound."
  ],
  [
    "1852",
    "0 — איבערחזרן פעסווארד",
    "Enter the same password again, and press pound to confirm."
  ],
  [
    "1853",
    "0 — פעסווארדס שטימען נישט",
    "The passwords did not match. Please enter your original password again."
  ],
  [
    "1854",
    "0 — אויסקלייבן אן אנדערן פעסווארד",
    "Please choose another six to twelve digit private password."
  ],
  [
    "1855",
    "0 — רעגיסטראציע צייטווייליג פארשפארט",
    "Registration is temporarily unavailable. Please try again later."
  ],
  [
    "1856",
    "0 — הצלחה און 4־ציפערדיקער איי־די",
    "Gavhah registration complete. Your four digit member ID is {member_id}. Write it down. I repeat slowly, {member_id}. Your membership is ready."
  ],
  [
    "1857",
    "0 — צופיל אומריכטיגע איבערחזרונגען",
    "Too many unsuccessful confirmations. Please start a new registration."
  ],
  [
    "1858",
    "0 — שוין איינגעשריבן",
    "You are already signed in as a Gavhah member."
  ],
  [
    "1251",
    "אריינגאנג — פעסווארד",
    "Enter your six to twelve digit private Gavhah password, then press pound."
  ],
  [
    "1252",
    "אריינגאנג — צווייטער PIN",
    "Enter your separate additional PIN, then press pound."
  ],
  [
    "1253",
    "אריינגאנג — מעמבער איי־די",
    "Enter your four digit Gavhah member ID, then press pound."
  ],
  [
    "1254",
    "אריינגאנג — הצלחה",
    "Welcome back. Your Gavhah membership is verified."
  ]
].map(([path,label,text])=>[path,{label,text}]));
