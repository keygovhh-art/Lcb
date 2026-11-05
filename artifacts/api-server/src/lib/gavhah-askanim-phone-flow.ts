import type {PoolClient} from "pg";
import {phonePromptOverride} from "../routes/yemot-voice-studio";
import {
  phoneForumArticle,forumRecordingPlaySegment,publishPhoneForumVoice,readForumVoiceDraft,
  type ForumVoiceDraft
} from "./yemot-forum-voice";

export type AskanimState={path:string;page:number;flash:string;feedback:string};
export async function nextAskanimPhoneState(
 client:PoolClient,state:AskanimState,digit:string,userId:number|null,verified:boolean,callHash:string
):Promise<AskanimState>{
 let {path,page,flash}=state,feedback="";
 if(path==="9702"){
  if(digit==="1"){path="97021";flash="";}
  else if(digit==="None"||digit===""){page=Math.min(300,page+1);}
 }else if(path==="97021"){
  if(digit==="1"){
   if(!verified||!userId)feedback="Please securely link your member account before posting a public discussion. ";
   else{
    path="970211";
    const draft:ForumVoiceDraft={kind:"forum_voice",stage:"record",userId,expiresAt:Date.now()+10*60*1000};
    flash=JSON.stringify(draft);
   }
  }else feedback="Press one to record a new discussion. ";
 }else if(path==="970211"){
  const draft=readForumVoiceDraft(flash);
  if(!draft||draft.userId!==userId){path="97021";flash="";feedback="Recording expired. Press one to start again. ";}
  else if(draft.stage==="record"){
   if(forumRecordingPlaySegment(digit)){
    draft.stage="review";draft.path=digit;flash=JSON.stringify(draft);
   }else feedback="The recording did not finish. Record your message and press pound. ";
  }else if(digit==="2"){
   if(!verified||!userId){path="97021";flash="";feedback="Member login expired. Nothing published. ";}
   else{
    const saved=await publishPhoneForumVoice(client,userId,callHash,draft.path!);
    feedback=saved.message+" ";
    if(saved.ok){flash="";path="9702";page=0;}
   }
  }else if(digit==="3"){flash=JSON.stringify({...draft,stage:"record",path:undefined});}
  else if(digit==="4"){path="97021";flash="";feedback="Draft discarded, no discussion published. ";}
  else if(digit==="5"||digit==="6"){
   path="9702";page=0;flash="";
   feedback=digit==="5"?"Recording cancelled. ":"Continuing with discussions. ";
  }else if(digit!=="1"){
   feedback="Press 1 to hear again, 2 to publish, 3 to rerecord, 4 to discard, 5 to cancel, or 6 to continue. ";
  }
 }
 return {path,page,flash,feedback};
}
export type AskanimSpeech={message:string;media:string[];mode:"listen"|"menu"|"record"};
export async function askanimPhoneSpeech(
 client:PoolClient,path:string,page:number,flash:string,feedback:string
):Promise<AskanimSpeech>{
 const media:string[]=[];
 if(path==="9702"){
  const custom=await phonePromptOverride("9702");
  const head=forumRecordingPlaySegment(custom.audioPath);
  if(head)media.push(head);
  const intro=head?"":(custom.ttsText||"To hear Askanim discussions, stay on the line. For options press one.");
  const entry=await phoneForumArticle(client,page);
  if(!entry)return {media,message:feedback+intro+" There are no more discussions. Press one for options or zero to return.",mode:"menu"};
  const voice=forumRecordingPlaySegment(entry.provider_recording_path);
  if(voice)media.push(voice);
  const content=voice?"Recorded voice discussion. ":
    entry.browser_audio?"The voice recording for this discussion is available on the Gavhah website. ":
    /^[\x20-\x7e]+$/.test(entry.content)
      ?entry.content.slice(0,220)+" "
      :"A written discussion is available in Yiddish on Gavhah. ";
  return {media,message:feedback+intro+" Discussion "+(page+1)+". "+
    (entry.title==="🎙️ א שמועס פונעם גבהה־ליין"?"Voice message. ":"")+content+
    "Stay on the line for the next discussion.",mode:"listen"};
 }
 if(path==="97021"){
  const custom=await phonePromptOverride(path);
  const head=forumRecordingPlaySegment(custom.audioPath);if(head)media.push(head);
  return {media,message:feedback+(head?"":custom.ttsText||
   "To record your own voice discussion and publish it, press one. Press star to go back."),mode:"menu"};
 }
 const draft=readForumVoiceDraft(flash);
 if(draft?.stage==="record")return {media,message:feedback+
   "Record your public discussion after the beep. Press pound when finished. Nothing is published until you approve.",mode:"record"};
 if(draft?.stage==="review"){
  const file=forumRecordingPlaySegment(draft.path);if(file)media.push(file);
  return {media,message:feedback+
   "Your recording has played. Press one to hear it again, two to publish on Gavhah now, "+
   "three to rerecord, four to discard, five to cancel, or six to continue listening.",mode:"menu"};
 }
 return {media,message:feedback+"Press one to start recording.",mode:"menu"};
}
