import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {isoDay} from "./gavhah-united-participation";
import {newDailyPledge,newDailyDonationIntent} from "./gavhah-daily-participation";
import {readCauseChannel} from "../routes/gavhah-cause-channels";
import {validRecordedPath} from "./yemot-news-engagement";

type Stage="amount"|"due"|"choice"|"confirm"|"title"|"details"|"location_choice"|"location"|"urgency"|"nomination_confirm";
export type DailyPhoneDraft={
 kind:"daily_phone6";mode:"pledge"|"donation"|"nomination";
 stage:Stage;memberId:number;startedAt:number;expiresAt:number;
 dollars?:number;dueOn?:string;title?:string;details?:string;
 location?:string;urgency?:"normal"|"high"|"urgent";
};
export type Phone6={path:string;page:number;flash:string;feedback:string};
export type Phone6Speech={segments:string[];kind:"listen"|"menu"|"record"|"amount"|"date"};
function promptMessage(text:string):string{
 return "t-"+String(text).replace(/[^\x20-\x7e]/g," ").replace(/[=,#]/g," ").trim().slice(0,400);
}
function wav(ref:unknown):string{
 if(!validRecordedPath(ref))return "";
 return "f-"+String(ref).slice(5).replace(/\.wav$/i,"");
}
function safeEnglish(text:unknown,max=400):string{
 const s=String(text||"");
 return /^[\x20-\x7e\r\n]*$/.test(s)?s.slice(0,max).replace(/[=,#]/g," "):"";
}
export function decodeDailyPhoneDraft(flash:string):DailyPhoneDraft|null{
 try{
  const d=JSON.parse(flash) as DailyPhoneDraft;
  if(d?.kind!=="daily_phone6"||
     !["pledge","donation","nomination"].includes(d.mode)||
     !["amount","due","choice","confirm","title","details","location_choice","location","urgency","nomination_confirm"].includes(d.stage)||
     !Number.isSafeInteger(d.memberId)||d.memberId<1||!Number.isFinite(d.expiresAt)||
     d.expiresAt<Date.now()||!Number.isFinite(d.startedAt))return null;
  return d;
 }catch{return null;}
}
export function phone6InputKind(path:string,flash:string):"record"|"amount"|"date"|"menu"{
 if(!path.startsWith("9706"))return "menu";
 const d=decodeDailyPhoneDraft(flash);
 if(!d)return "menu";
 if(["title","details","location"].includes(d.stage))return "record";
 if(d.stage==="amount")return "amount";
 if(d.stage==="due")return "date";
 return "menu";
}
function newDraft(mode:DailyPhoneDraft["mode"],memberId:number):DailyPhoneDraft{
 return {kind:"daily_phone6",mode,
  stage:mode==="pledge"?"amount":mode==="donation"?"choice":"title",
  memberId,startedAt:Date.now(),expiresAt:Date.now()+20*60*1000};
}
function latestId(d:DailyPhoneDraft,callHash:string):string{
 return createHash("sha256").update("united-phone4|"+callHash+"|"+
  d.memberId+"|"+d.mode+"|"+d.startedAt).digest("hex");
}
async function phone6Notify(c:PoolClient,member:number,memberText:string,teamText:string,caseId?:number){
 const url=caseId?"/my?case="+caseId:"/charity";
 await c.query("INSERT INTO public.notifications(user_id,type,message,link_url) "+
  "VALUES($1,'daily_phone_submission',$2,$3)",[member,memberText,url]);
 await c.query("INSERT INTO public.notifications(user_id,type,message,link_url) "+
  "SELECT id,'daily_phone_team',$1,'/founder' FROM public.users "+
  "WHERE role IN ('admin','moderator','super_admin') AND status='active'",[teamText]);
}
async function submitNomination(c:PoolClient,d:DailyPhoneDraft,callHash:string){
 if(!validRecordedPath(d.title)||!validRecordedPath(d.details))
  return {ok:false,message:"Required recordings missing. Nothing submitted."};
 const key=latestId(d,callHash);
 const r=await c.query<{id:number}>(
  "INSERT INTO public.gavhah_daily_phone_nominations "+
  "(member_id,cause_title_audio,cause_details_audio,cause_location_audio,urgency,fingerprint) "+
  "VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=excluded.fingerprint "+
  "RETURNING id",
  [d.memberId,d.title,d.details,d.location||null,d.urgency||"normal",key]);
 await c.query("INSERT INTO public.support_messages "+
  "(user_id,name,email,type,subject,message,status) "+
  "VALUES($1,'Gavhah phone member','daily@internal.invalid','daily_cause_nomination',$2,$3,'open')",
  [d.memberId,"Today's Cause proposal #"+r.rows[0].id,
   "PRIVATE voice proposal — listen to stored WAVs on Founder Dashboard and review before submitting to public queue."]);
 await phone6Notify(c,d.memberId,
  "Your Today's Cause proposal #"+r.rows[0].id+" is in private team review.",
  "New phone cause proposal #"+r.rows[0].id+" needs transcription and approval.");
 return {ok:true,message:"Your cause proposal #"+r.rows[0].id+
  " was saved privately for Gavhah team review. It is not public."};
}
export async function nextDailyPhone6(
 c:PoolClient,current:Phone6,digit:string,userId:number|null,verified:boolean,callHash:string
):Promise<Phone6>{
 let {path,page,flash}=current;let feedback="";
 if(path==="9706"){
  if(digit==="1")path="97061";
  else if(digit==="2"){
   if(!verified||!userId)feedback="Please securely sign into your Gavhah membership first via My Askanus.";
   else{path="97062";flash=JSON.stringify(newDraft("nomination",userId));}
  }
 }else if(path==="97061"){
  if(digit==="1"||digit==="2"){
   if(!verified||!userId)feedback="Please pair your Gavhah account with the eight digit code before joining.";
   else{
    path=digit==="1"?"970611":"970612";
    flash=JSON.stringify(newDraft(digit==="1"?"pledge":"donation",userId));
   }
  }
 }else if(path==="970611"||path==="970612"||path==="97062"){
  const draft=decodeDailyPhoneDraft(flash);
  if(!draft||!verified||!userId||userId!==draft.memberId){
   flash="";path=path==="97062"?"9706":"97061";
   feedback="Your secure session expired. Nothing was submitted.";
  }else{
   if(draft.mode==="pledge"){
    if(draft.stage==="amount"){
     if(/^\d{1,9}$/.test(digit)&&Number(digit)>0){
      draft.dollars=Number(digit);draft.stage="due";
     }else feedback="Enter a whole-dollar amount and finish with pound.";
    }else if(draft.stage==="due"){
     const dd=/^\d{8}$/.test(digit)?digit.slice(0,4)+"-"+digit.slice(4,6)+"-"+digit.slice(6):null;
     if(dd&&isoDay(dd)){draft.dueOn=dd;draft.stage="confirm";}
     else feedback="Enter the eight-digit deadline YYYYMMDD and press pound.";
    }else if(draft.stage==="confirm"){
     if(digit==="1"){
      const current=await readCauseChannel(c,"daily");
      const active:{rows:Array<{id:number}>}={
       rows:current?.enabled&&current.cause?[{id:current.cause.id}]:[]
      };
      if(!active.rows[0])feedback="No active Today's Cause. Nothing saved.";
      else{
       try{
        const saved=await newDailyPledge(c,{
         charityId:active.rows[0].id,memberId:draft.memberId,amountCents:(draft.dollars||0)*100,
         dueOn:draft.dueOn||"",source:"yemot",requestKey:latestId(draft,callHash)
        });
        await phone6Notify(c,draft.memberId,
        saved.status==="pending_team"?"Your extended BLN undertaking is awaiting team approval.":
          "Your BLN undertaking and due-date follow-up were saved in My Askanus.",
        "New Today's Cause phone BLN pledge #"+saved.pledgeId+
          (saved.status==="pending_team"?" requires staff approval.": " accepted within two months."),
        saved.caseId);
        feedback="Your BLN undertaking is saved in My Askanus case "+saved.caseId+". "+
         (saved.status==="pending_team"?"The due date is more than two months away, so the team must approve it.":
         "A follow-up was created for the due date.")+" No payment has been collected.";
        path="9706";page=0;flash="";
       }catch(e){feedback=e instanceof Error&&e.message==="DUE_DATE_IN_PAST"?
        "The deadline cannot be in the past. Press 3 to enter a new deadline.":
        "Unable to save your BLN pledge. Nothing was charged.";}
      }
     }else if(digit==="2"){feedback="The draft is unchanged. Please listen to the details.";}
     else if(digit==="3"){draft.stage="due";}
     else if(digit==="4"){path="97061";flash="";feedback="Cancelled. Nothing saved.";}
    }
   }else if(draft.mode==="donation"){
    if(draft.stage==="choice"){
     if(digit==="1")draft.stage="amount";
     else if(digit==="2"){draft.dollars=undefined;draft.stage="confirm";}
    }else if(draft.stage==="amount"){
     if(/^\d{1,9}$/.test(digit)&&Number(digit)>0){draft.dollars=Number(digit);draft.stage="confirm";}
     else feedback="Enter a whole-dollar amount and press pound.";
    }else if(draft.stage==="confirm"){
     if(digit==="1"){
      const current=await readCauseChannel(c,"daily");
      const active:{rows:Array<{id:number}>}={
       rows:current?.enabled&&current.cause?[{id:current.cause.id}]:[]
      };
      if(!active.rows[0])feedback="No active cause. Nothing saved.";
      else{
       const saved=await newDailyDonationIntent(c,{
        charityId:active.rows[0].id,memberId:draft.memberId,
        amountCents:draft.dollars?draft.dollars*100:null,
        source:"yemot",requestKey:latestId(draft,callHash)
       });
       await phone6Notify(c,draft.memberId,
        "Your donation instructions request was saved in your My Askanus case; no payment has been received.",
        "New Today's Cause phone donation instructions request #"+saved.intentId,saved.caseId);
       feedback="Your donation instructions request is in My Askanus case "+saved.caseId+
        ". No money has been collected. Listen to the joining and donation instructions.";
       path="9706";page=0;flash="";
      }
     }else if(digit==="2"){feedback="Your draft has not been submitted.";}
     else if(digit==="4"){path="97061";flash="";feedback="Cancelled. No payment was made.";}
    }
   }else{
    if(draft.stage==="title"||draft.stage==="details"||draft.stage==="location"){
     if(validRecordedPath(digit)){
      if(draft.stage==="title"){draft.title=digit;draft.stage="details";}
      else if(draft.stage==="details"){draft.details=digit;draft.stage="location_choice";}
      else{draft.location=digit;draft.stage="urgency";}
     }else feedback="No recording received. Try again and press pound.";
    }else if(draft.stage==="location_choice"){
     if(digit==="1")draft.stage="location";
     else if(digit==="2")draft.stage="urgency";
    }else if(draft.stage==="urgency"){
     if(digit==="1"||digit==="2"||digit==="3"){
      draft.urgency=digit==="1"?"normal":digit==="2"?"high":"urgent";
      draft.stage="nomination_confirm";
     }
    }else if(draft.stage==="nomination_confirm"){
     if(digit==="1"){
      const saved=await submitNomination(c,draft,callHash);
      feedback=saved.message;
      if(saved.ok){path="9706";page=0;flash="";}
     }else if(digit==="3"){
      draft.title="";draft.details="";draft.location="";draft.stage="title";
     }else if(digit==="4"){path="9706";flash="";feedback="Cancelled; no proposal was published.";}
    }
   }
   if(path==="970611"||path==="970612"||path==="97062")flash=JSON.stringify(draft);
  }
 }
 return {path,page,flash,feedback};
}
export async function dailyBeforeNewsSegments(client:PoolClient):Promise<string[]>{
 const data=await readCauseChannel(client,"daily");
 if(!data?.enabled||!data.phoneBeforeNews||!data.cause)return [];
 const list:string[]=[];
 list.push(promptMessage("Today's Gavhah Cause. "+safeEnglish(data.cause.title,100)));
 const msg=data.messages?.announcement;
 const path=msg?.phoneAudioReady&&data.announcementMode==="recording"?
  (await client.query("SELECT phone_audio_path FROM public.gavhah_cause_messages "+
   "WHERE channel='daily' AND purpose='announcement'")).rows[0]?.phone_audio_path:null;
 if(path&&wav(path))list.push(wav(path));
 else list.push(promptMessage(msg?.textEn||safeEnglish(data.cause.description,230)||
  "The daily cause is available on the Gavhah website."));
 list.push(promptMessage("To support the daily cause, visit the Gavhah Today's Cause page. "+
  "Now, to hear all news updates, stay on the line. For options press one."));
 return list;
}
export async function speakDailyPhone6(
 client:PoolClient,path:string,flash:string,feedback:string
):Promise<Phone6Speech>{
 const segments:string[]=[];
 const add=(s:string)=>{if(s)segments.push(promptMessage(s));};
 add(feedback);
 const channel=await readCauseChannel(client,"daily");
 const cause=channel?.cause;
 if(path==="9706"){
  if(!cause||!channel?.enabled){
   add("There is no active Today's Cause cause at the moment. Press two to suggest one.");
   return {segments,kind:"menu"};
  }
  // Read both totals BEFORE the official announcement. A BLN promise is
  // never described as money in hand; unapproved pledges are not counted.
  add("Total amount already undertaken, BLN: "+
      Number(cause.pledgedDollars||0).toFixed(2)+" dollars.");
  if(cause.verifiedRaisedDollars===null)
   add("Total funds actually received: not yet verified in the system.");
  else
   add("Total money actually received: "+
       cause.verifiedRaisedDollars.toFixed(2)+" dollars.");
  const official=channel.messages?.announcement;
  const audio=official?.phoneAudioReady&&channel.announcementMode==="recording"?
   (await client.query("SELECT phone_audio_path FROM public.gavhah_cause_messages "+
    "WHERE channel='daily' AND purpose='announcement'")).rows[0]?.phone_audio_path:null;
  if(audio&&wav(audio))segments.push(wav(audio));
  else{
   add(official?.textEn||safeEnglish(cause.title,100)+" "+safeEnglish(cause.description,250));
  }
  add(" "+cause.joinedCount+" people have joined the cause.");
  add("To join the cause, press one. Do you know a cause deserving the spotlight? Press two to submit a proposal for team review.");
  return {segments,kind:"menu"};
 }
 if(path==="97061"){
  add("To make a BLN amount undertaking, press one. To donate now or hear donation instructions, press two. No payment is charged by this hotline.");
  return {segments,kind:"menu"};
 }
 const d=decodeDailyPhoneDraft(flash);
 if(!d){add("The application expired. Press zero to go back.");return {segments,kind:"menu"};}
 if(d.mode==="pledge"){
  if(d.stage==="amount"){add("The undertaking is BLN, without a vow. Enter the whole-dollar amount and press pound.");return {segments,kind:"amount"};}
  if(d.stage==="due"){add("Enter your BLN deadline as eight digits, year month day, then press pound. More than two months requires team approval.");return {segments,kind:"date"};}
  add("BLN undertaking "+d.dollars+" dollars by "+d.dueOn+
   ". Press 1 to save and open your My Askanus case. Press 2 to repeat. Press 3 to change the date. Press 4 to cancel. This is not a payment.");
  return {segments,kind:"menu"};
 }
 if(d.mode==="donation"){
  const m=channel?.messages?.join;
  const audio=m?.phoneAudioReady&&channel?.joinMode==="recording"?
   (await client.query("SELECT phone_audio_path FROM public.gavhah_cause_messages "+
    "WHERE channel='daily' AND purpose='join'")).rows[0]?.phone_audio_path:null;
  if(audio&&wav(audio))segments.push(wav(audio));
  else add(m?.textEn||channel?.donationInstructionsEn||
    "You may donate through the campaign's official hotline, or the Gavhah website after a provider is connected.");
  if(channel?.donationHotline)add("Donation hotline "+channel.donationHotline);
  if(d.stage==="choice"){
   add("Press 1 to enter a planned donation amount. Press 2 to continue without entering an amount.");
   return {segments,kind:"menu"};
  }
  if(d.stage==="amount"){add("Enter the whole-dollar amount and press pound.");return {segments,kind:"amount"};}
  add("Press 1 to save your donation request and create a My Askanus case. Press 2 to repeat the instructions, or 4 to cancel. No card or bank information is collected.");
  return {segments,kind:"menu"};
 }
 if(d.stage==="title"){add("Record the name of the suggested cause, then press pound.");return {segments,kind:"record"};}
 if(d.stage==="details"){add("Record why the cause deserves the spotlight and the details, then press pound.");return {segments,kind:"record"};}
 if(d.stage==="location_choice"){add("For a city or region press one. To skip, press two.");return {segments,kind:"menu"};}
 if(d.stage==="location"){add("Record the city or region, then press pound.");return {segments,kind:"record"};}
 if(d.stage==="urgency"){add("For normal press one, high priority two, urgent three.");return {segments,kind:"menu"};}
 for(const f of ["title","details","location"] as const){
  const a=wav(d[f]);if(a)segments.push(a);
 }
 add("You have heard your proposal. Press one to submit privately to Gavhah team review. Press two to hear again, three to rerecord, or four to cancel. Nothing becomes public automatically.");
 return {segments,kind:"menu"};
}
