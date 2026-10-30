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
export function yemotEnglishSpeech(input:unknown,maxLength=430):string{
 const cap=Math.max(1,Math.min(1000,Math.floor(maxLength)||430));
 let spoken=String(input??"")
  .replace(/<[^>]*>/g," ")
  .replace(/https?:\/\/\S+/gi," ")
  .replace(/[\u0590-\u05ff\u0600-\u06ff]/gu," ")
  .replace(/[\r\n\t]+/g," ")
  .replace(/\b(\d+)\.(\d+)\b/g,"$1 point $2")
  .replace(/&/g," and ")
  .replace(/@/g," at ")
  .replace(/[_]/g," ")
  .replace(/[‐‑–—-]/g," ")
  .replace(/\s+/g," ").trim().slice(0,cap);
 // Always generate segment separators ourselves. Literal '.' and
 // all provider syntax are consumed here before we add ".t-".
 spoken=spoken.replace(/[.!?]+/g,"\u001e")
  .replace(/[,;:]+/g,", ")
  .replace(/[^A-Za-z0-9 ',\u001e]/g," ")
  .replace(/[ \t]*,[ \t]*/g,", ")
  .replace(/\s+/g," ")
  .replace(/\u001e\s*/g,"\u001e")
  .replace(/,+\s*\u001e/g,"\u001e");
 // A maximum of eight speech phrases keeps Yamot API read playback
 // responsive and avoids a fresh TTS engine invocation on each word.
 const phrases:string[]=[];
 for(const raw of spoken.split("\u001e")){
  const phrase=raw.trim().replace(/^,+|,+$/g,"").trim();
  if(!phrase)continue;
  // A gentle breath in overlong announcements, never midword.
  const words=phrase.split(/\s+/);
  let chunk:string[]=[];
  for(const word of words){
   if(chunk.length>=22){
    const item=chunk.join(" ").replace(/,+$/,"").trim();
    if(item)phrases.push(item);
    chunk=[];
   }
   chunk.push(word);
  }
  const last=chunk.join(" ").replace(/,+$/,"").trim();
  if(last)phrases.push(last);
 }
 return "t-"+(phrases.slice(0,8).join(".t-")||"Please try again");
}

/** Safe formatted read line; never confuses TTS punctuation with keypad CSV. */
export function yemotEnglishRead(input:unknown,name:string,maxDigits:number):string{
 if(!/^[a-z]{2}\d{1,6}$/.test(name))throw Error("Invalid Yemot input name");
 if(!Number.isInteger(maxDigits)||maxDigits<1||maxDigits>16)throw Error("Invalid Yemot digit count");
 return "read="+yemotEnglishSpeech(input,650)+"="+name+",no,"+maxDigits+",1,12,No,no";
}
