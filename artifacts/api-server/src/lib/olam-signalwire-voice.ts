/**
 * Exclusive to Olam Hachesed Communication's signed SignalWire callback.
 * All public menu paths can have their own speech timing without changing
 * what buttons do, touching account records, or using premium paid TTS voices.
 * SignalWire cXML supports <Say>, SSML <break> and <prosody>.
 */
import {pool} from "@workspace/db";

export type OlamVoiceProfile={
 path:string;rate_percent:number;comma_pause_ms:number;
 sentence_pause_ms:number;enabled:boolean;
};
const defaults:OlamVoiceProfile={path:"root",rate_percent:104,comma_pause_ms:145,sentence_pause_ms:310,enabled:true};
const safePath=(path:string)=>path==="root"||/^[1-9][0-9]{0,11}$/.test(path);
const between=(v:unknown,min:number,max:number):number|null=>{
 const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:null;
};
export function validateOlamVoiceProfile(path:string,input:unknown){
 if(!safePath(path)||!input||typeof input!=="object")return null;
 const o=input as Record<string,unknown>;
 const rate=between(o.rate_percent,90,115);
 const comma=between(o.comma_pause_ms,60,350);
 const sentence=between(o.sentence_pause_ms,150,750);
 if(rate===null||comma===null||sentence===null||typeof o.enabled!=="boolean")return null;
 return {path,rate_percent:rate,comma_pause_ms:comma,sentence_pause_ms:sentence,enabled:o.enabled} satisfies OlamVoiceProfile;
}
export async function olamVoiceProfile(path:string):Promise<OlamVoiceProfile>{
 const p=safePath(path)?path:"root";
 try{
  const q=await pool.query<OlamVoiceProfile>(
   "SELECT path,rate_percent,comma_pause_ms,sentence_pause_ms,enabled "+
   "FROM public.gavhah_olam_signalwire_voice_profiles "+
   "WHERE enabled=true AND path = ANY($1::text[]) "+
   "ORDER BY CASE WHEN path=$2 THEN 0 ELSE 1 END LIMIT 1",
   [[p,"root"],p]);
  const x=q.rows[0];if(x&&validateOlamVoiceProfile(x.path,x))return x;
 }catch{
  // Provider call must still work even during a database migration.
 }
 return {...defaults,path:p};
}
export async function getOlamVoiceProfiles(){
 const q=await pool.query<OlamVoiceProfile>(
  "SELECT path,rate_percent,comma_pause_ms,sentence_pause_ms,enabled "+
  "FROM public.gavhah_olam_signalwire_voice_profiles ORDER BY length(path),path");
 return q.rows;
}
export async function setOlamVoiceProfile(path:string,value:unknown){
 const p=validateOlamVoiceProfile(path,value);
 if(!p)return {ok:false,error:"Invalid voice settings. Rate 90-115%; comma 60-350ms; sentence 150-750ms."};
 await pool.query("INSERT INTO public.gavhah_olam_signalwire_voice_profiles "+
  "(path,rate_percent,comma_pause_ms,sentence_pause_ms,enabled) VALUES($1,$2,$3,$4,$5) "+
  "ON CONFLICT(path) DO UPDATE SET rate_percent=EXCLUDED.rate_percent,"+
  "comma_pause_ms=EXCLUDED.comma_pause_ms,sentence_pause_ms=EXCLUDED.sentence_pause_ms,"+
  "enabled=EXCLUDED.enabled,updated_at=now()",
  [p.path,p.rate_percent,p.comma_pause_ms,p.sentence_pause_ms,p.enabled]);
 return {ok:true,settings:p};
}
const escapeXml=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
/**
 * Caller-controlled text is XML-escaped BEFORE constructing trusted SSML.
 * Preserve pauses even for a plain phone-menu message with many options.
 * Never add <Pause length=1> between menu items: one second is too slow.
 */
export function olamSpeak(text:unknown,profile:OlamVoiceProfile=defaults):string{
 const opt=validateOlamVoiceProfile(profile.path,profile)||defaults;
 const scrubbed=String(text??"")
  .replace(/<[^>]*>/g," ")
  .replace(/https?:\/\/\S+/gi," ")
  .replace(/[\u0590-\u05ff\u0600-\u06ff]/gu," ")
  .replace(/[\r\n\t]+/g," ")
  .replace(/\b(\d+)\.(\d+)\b/g,"$1 point $2")
  .replace(/\s+/g," ").trim().slice(0,3200);
 // Keep the original words and numbers; insert pauses *only* at punctuation.
 let spoken="";
 let last=0;
 const punctuation=/([,;:]|[.!?]+)/g;
 let match:RegExpExecArray|null;
 while((match=punctuation.exec(scrubbed))!==null){
  spoken+=escapeXml(scrubbed.slice(last,match.index));
  const isComma=/^[,;:]$/.test(match[0]);
  spoken+=isComma
   ? '<break time="'+opt.comma_pause_ms+'ms"/>'
   : '<break time="'+opt.sentence_pause_ms+'ms"/>';
  last=match.index+match[0].length;
 }
 spoken+=escapeXml(scrubbed.slice(last));
 // A small pace lift, with genuinely slower finance/confirmation extensions.
 return '<Say voice="man" language="en-US"><prosody rate="'+opt.rate_percent+'%">'+
  (spoken.trim()||"Please try again")+'</prosody></Say>';
}
