/**
 * Yemot native English IVR prosody, WITHOUT SSML or third-party AI.
 *
 * Yemot's 'read=t-...' syntax reserves a literal period for the
 * audio-segment separator. A supported ' .t- ' boundary lets the
 * English TTS finish a sentence, then begin a new natural phrase.
 *
 * A comma stays inside a short phrase for a natural, smaller breath.
 * We NEVER interpolate an untrusted literal '=', '&' or '.t-' from
 * the user's input into Yemot control syntax.
 *
 * Note: the real speech rate/voice are set by the provider ext.ini
 * (rate/tts_rate and voice/tts_voice), not this module.
 */
export function yemotEnglishSpeech(input:unknown,maxLength=720):string{
 // Yemot performs ONE TTS synthesis for t- text. Splitting every sentence
 // into ".t-" forces additional synthesis and can delay and cut off a menu.
 // Preserve audible breaths with commas within that one TTS message.
 const cap=Math.max(1,Math.min(1050,Math.floor(maxLength)||720));
 let raw=String(input??"")
  .replace(/<[^>]*>/g," ")
  .replace(/https?:\/\/\S+/gi," ")
  .replace(/[\u0590-\u05ff\u0600-\u06ff]/gu," ")
  .replace(/[\r\n\t]+/g," ")
  .replace(/\b(\d+)\.(\d+)\b/g,"$1 point $2")
  .replace(/&/g," and ")
  .replace(/@/g," at ")
  .replace(/[‐‑–—-]/g," ")
  .replace(/[.!?;:]+/g,", ")
  .replace(/[^A-Za-z0-9 ',]/g," ")
  .replace(/\s*,\s*/g,", ")
  .replace(/(?:,\s*){2,}/g,", ")
  .replace(/\s+/g," ").trim();
 // The documented provider limit is ~150 words in one TTS message.
 // Never silently discard every menu item after the eighth sentence.
 const words=raw.split(/\s+/).filter(Boolean);
 if(words.length>140)raw=words.slice(0,140).join(" ")+" For remaining details, use the website";
 if(raw.length>cap){
  const end=raw.slice(0,cap);
  const boundary=end.lastIndexOf(" ");
  raw=end.slice(0,boundary>cap/2?boundary:cap).replace(/[,\s]+$/,"");
 }
 raw=raw.replace(/(?:,\s*)+$/,"").trim();
 return "t-"+(raw||"Please try again");
}

/** Safe formatted read line; never confuses TTS punctuation with keypad CSV. */
export function yemotEnglishRead(input:unknown,name:string,maxDigits:number):string{
 if(!/^[a-z]{2}\d{1,6}$/.test(name))throw Error("Invalid Yemot input name");
 if(!Number.isInteger(maxDigits)||maxDigits<1||maxDigits>16)throw Error("Invalid Yemot digit count");
 return "read="+yemotEnglishSpeech(input,900)+"="+name+",no,"+maxDigits+",1,12,No,no";
}
