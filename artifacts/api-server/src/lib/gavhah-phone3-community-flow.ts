import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {phonePromptOverride} from "../routes/yemot-voice-studio";
import {validRecordedPath} from "./yemot-news-engagement";

// Main-menu 3: private coordinator intake & staff-reviewed community projects.
// Never trust Caller ID; caller must be a verified, still-active Gavhah member.
export type Phone3Kind="offer"|"request"|"project";
export type Phone3Draft={
 kind:"gavhah_phone3";
 intake:Phone3Kind|null;
 stage:"role"|"area"|"timing"|"type"|"details"|"location_choice"|"location"|
       "title"|"goal_choice"|"goal"|"confirm";
 category:string;
 availability:string;
 urgency:string;
 details:string;
 title:string;
 location:string;
 goal:string;
 memberId:number;
 until:number;
};
export function parsePhone3Draft(value:string):Phone3Draft|null{
 try{
  const d=JSON.parse(value) as Phone3Draft;
  if(d?.kind!=="gavhah_phone3"||!Number.isSafeInteger(d.memberId)||
      d.memberId<1||!Number.isFinite(d.until)||d.until<Date.now()||
      !["role","area","timing","type","details","location_choice","location","title","goal_choice","goal","confirm"].includes(d.stage))return null;
  if(d.details&&!validRecordedPath(d.details))return null;
  for(const key of ["title","location","goal"] as const)
    if(d[key]&&!validRecordedPath(d[key]))return null;
  return d;
 }catch{return null;}
}
const areas:Record<string,string>={
 "1":"coordination","2":"fundraising","3":"transport","4":"publicity","5":"other"};
const projects:Record<string,string>={
 "1":"project","2":"campaign","3":"initiative","4":"program"};
function nextRecordStage(d:Phone3Draft,field:"title"|"details"|"location"|"goal"){
 const following:Record<typeof field,Phone3Draft["stage"]>={
  title:"details",details:"location_choice",location:d.intake==="project"?"goal_choice":"confirm",goal:"confirm"
 };
 d.stage=following[field];
}
export function phone3WantsRecording(path:string,flash:string):boolean{
 return /^(?:970311|970312)$/.test(path)&&
  ["title","details","location","goal"].includes(parsePhone3Draft(flash)?.stage||"");
}
function voicePointer(x:string):string{
 const p=validRecordedPath(x);
 return p?"f-"+p.slice("ivr2:".length).replace(/\.wav$/i,""):"";
}
async function commitPhone3(client:PoolClient,d:Phone3Draft,callHash:string){
 const type=d.intake;
 if(!type||!validRecordedPath(d.details)||type==="project"&&!validRecordedPath(d.title))
  return {ok:false,message:"Required recorded details are missing. Nothing was submitted."};
 const fingerprint=createHash("sha256")
  .update("gavhah-phone3-v1|"+callHash+"|"+d.memberId+"|"+type+"|"+d.details+"|"+d.title).digest("hex");
 const previous=await client.query<{id:number}>(
   "SELECT id FROM public.gavhah_phone3_intake WHERE request_fingerprint=$1",[fingerprint]);
 if(previous.rows[0])return {ok:true,message:"This application is already on the Gavhah staff list. Number "+previous.rows[0].id+". "};
 const volume=await client.query<{n:string}>(
  "SELECT count(*)::text AS n FROM public.gavhah_phone3_intake "+
  "WHERE member_id=$1 AND created_at>now()-interval '1 hour'",[d.memberId]);
 if(Number(volume.rows[0]?.n||0)>4)return {ok:false,message:"Too many recent applications. Please contact Gavhah staff."};
 let projectId:number|null=null;
 if(type==="project"){
  // No invented typed title/description may be approved: staff must transcribe
  // the authenticated recordings and manually approve the non-public project.
  const row=await client.query<{id:number}>(
    "INSERT INTO public.community_projects "+
    "(title,description,type,organizer_name,location,goal_description,status,owner_id) "+
    "VALUES($1,$2,$3,$4,NULL,NULL,'pending',$5) RETURNING id",
    ["Phone project application #"+fingerprint.slice(0,12),
     "Pending recorded details — staff transcription and approval required",
     d.category,"גבהה־מעמבער",d.memberId]);
  projectId=row.rows[0].id;
 }
 const inserted=await client.query<{id:number}>(
  "INSERT INTO public.gavhah_phone3_intake "+
  "(member_id,kind,category,availability,urgency,voice_title,voice_details,voice_location,voice_goal,project_id,request_fingerprint) "+
  "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
  [d.memberId,type,d.category,d.availability||null,d.urgency||null,
   d.title||null,d.details,d.location||null,d.goal||null,projectId,fingerprint]);
 // Put a private, staff-visible pointer in the normal operations inbox.
 // Never expose voice files, caller ID, or applications in public activity.
 await client.query(
  "INSERT INTO public.support_messages "+
  "(user_id,name,email,type,subject,message,status) VALUES($1,$2,$3,$4,$5,$6,'open')",
  [d.memberId,"Gavhah phone member","phone3@internal.invalid","phone3_intake",
    "Private Askanim / project intake #"+inserted.rows[0].id,
    "PRIVATE SYSTEM APPLICATION — use Founder Dashboard > keypad 3 review. "+
    "Kind: "+type+". Category: "+d.category+". Project ID: "+(projectId||"not a project")+
    ". Do not disclose member contact details without mutual consent and staff authorization."]);
 return {ok:true,message:"Your application number is "+inserted.rows[0].id+
   ". It was saved PRIVATELY for Gavhah staff. "+
   (type==="project"?"The project is NOT public until approved. ":"No private helper information is public.")};
}
export type Phone3Next={path:string,page:number,flash:string,feedback:string};
export async function nextPhone3State(client:PoolClient,current:Phone3Next,digit:string,
 userId:number|null,verified:boolean,callHash:string):Promise<Phone3Next>{
 let {path,page,flash}=current;
 let feedback="";
 if(path==="9703"){
  if(digit==="1")path="97031";
  else if(digit==="None"||digit==="")page=Math.min(page+1,200);
 }else if(path==="97031"){
  if(digit==="1"||digit==="2"){
   if(!verified||!userId){
    feedback="Sign into your verified Gavhah member account first. In My Askanus use the eight digit website pairing code. No application was submitted.";
   }else{
    path=digit==="1"?"970311":"970312";
    const d:Phone3Draft={
      kind:"gavhah_phone3",intake:digit==="1"?null:"project",
      stage:digit==="1"?"role":"type",category:"",availability:"",urgency:"",
      details:"",title:"",location:"",goal:"",memberId:userId,until:Date.now()+15*60*1000
    };
    flash=JSON.stringify(d);
   }
  }
 }else if(path==="970311"||path==="970312"){
  const d=parsePhone3Draft(flash);
  if(!d||!verified||!userId||d.memberId!==userId){
   path="97031";flash="";
   feedback="Your private application has expired or your secure login ended. Please start again.";
  }else if(d.stage==="role"){
   if(digit==="1"||digit==="2"){d.intake=digit==="1"?"offer":"request";d.stage="area";}
  }else if(d.stage==="area"){
   if(areas[digit]){d.category=areas[digit];d.stage="timing";}
  }else if(d.stage==="timing"){
   const times:Record<string,string>={"1":"flexible","2":"daytime","3":"evening","4":"weekend"};
   if(times[digit]){
    if(d.intake==="offer")d.availability=times[digit];else d.urgency=digit==="1"?"normal":"urgent";
    d.stage="details";
   }
  }else if(d.stage==="type"){
   if(projects[digit]){d.category=projects[digit];d.stage="title";}
  }else if(["title","details","location","goal"].includes(d.stage)){
   const field=d.stage as "title"|"details"|"location"|"goal";
   const valid=validRecordedPath(digit);
   if(valid){d[field]=valid;nextRecordStage(d,field);}
   else feedback="The recording was not received. Record your answer and finish with pound. ";
  }else if(d.stage==="location_choice"){
   if(digit==="1")d.stage="location";
   else if(digit==="2")d.stage=d.intake==="project"?"goal_choice":"confirm";
  }else if(d.stage==="goal_choice"){
   if(digit==="1")d.stage="goal";
   else if(digit==="2")d.stage="confirm";
  }else if(d.stage==="confirm"){
   if(digit==="1"){
    const result=await commitPhone3(client,d,callHash);
    feedback=result.message;
    if(result.ok){path="9703";page=0;flash="";}
   }else if(digit==="2"){feedback="Your recordings will play now. Press one to submit, three to start over, or four to cancel. ";}
   else if(digit==="3"){
    d.title="";d.details="";d.location="";d.goal="";
    d.stage=d.intake==="project"?"title":"details";
   }else if(digit==="4"){
    flash="";path="97031";feedback="Cancelled. Nothing was submitted.";
   }
  }
  if(path==="970311"||path==="970312")flash=JSON.stringify(d);
 }
 return {path,page,flash,feedback};
}
export type Phone3Speech={spoken:string;audio:string[];mode:"menu"|"listen"|"record"};
function safeEnglish(value:unknown,max=300):string{
 const s=String(value||"");
 return /[^\x20-\x7e]/.test(s)?"":s.slice(0,max).replace(/[=,&#]/g," ");
}
export async function phone3Speech(client:PoolClient,path:string,page:number,flash:string,feedback:string):Promise<Phone3Speech>{
 const audio:string[]=[];
 if(path==="9703"){
  const override=await phonePromptOverride(path);
  const clip=voicePointer(override.audioPath||"");if(clip)audio.push(clip);
  const message=clip?"":(override.ttsText||"For community projects and campaigns, stay on the line. For options press one. ");
  const rows=await client.query<{title:string;description:string}>(
   "SELECT title,description FROM public.community_projects "+
   "WHERE status='active' ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1",
   [page]);
  const data=rows.rows[0];
  const item=data?" Community project "+(page+1)+". "+
    (safeEnglish(data.title,100)||"Project in the Gavhah community directory.")+" "+
    (safeEnglish(data.description,280)||"Read the project details on the public website.")+
    " Stay on the line for the next project. ":" No more approved projects. Press one for options.";
  return {spoken:feedback+message+item,audio,mode:data?"listen":"menu"};
 }
 if(path==="97031"){
  const override=await phonePromptOverride(path);
  const clip=voicePointer(override.audioPath||"");if(clip)audio.push(clip);
  return {spoken:feedback+(clip?"":(override.ttsText||
   "To join the private Gavhah list of people offering help or needing Askanim for a campaign, press one. "+
   "To propose a new campaign or project for staff approval, press two. All private intake is handled only by Gavhah staff.")),
   audio,mode:"menu"};
 }
 const d=parsePhone3Draft(flash);
 if(!d)return {spoken:feedback+"To start again press one for the private directory or two for a proposed project.",audio,mode:"menu"};
 if(["title","details","location","goal"].includes(d.stage)){
  const script:Record<string,string>={
   title:"Record the project or campaign name, and finish with pound.",
   details:d.intake==="project"
    ?"Record the full project description, who it serves, and what is planned. Finish with pound."
    :"Record what assistance you can provide or need for the campaign and any important details. Finish with pound.",
   location:"Record your city, neighborhood or area. Finish with pound.",
   goal:"Record your project goal, people, money or resources needed. Do not speak payment card information. Finish with pound."
  };
  return {spoken:feedback+script[d.stage],audio,mode:"record"};
 }
 if(d.stage==="confirm"){
  for(const field of ["title","details","location","goal"] as const){
   const audioPart=voicePointer(d[field]);if(audioPart)audio.push(audioPart);
  }
  return {spoken:feedback+
   "Review your recorded answers. Press one to submit to the Gavhah staff, "+
   "two to hear them again, three to record again, or four to cancel. "+
   "Community projects require staff approval; private requests are never public.",audio,mode:"menu"};
 }
 const scripts:Record<string,string>={
  role:"The private Askanim lists are handled by Gavhah staff only. Press one if you OFFER help. Press two if you NEED helpers for a campaign.",
  area:"Choose your area. Press 1 for coordination, 2 fundraising, 3 transportation, 4 publicity, or 5 for something else.",
  timing:"Press one for flexible or normal, two for daytime or urgent, three for evenings, or four for weekends.",
  type:"Choose a project type. Press one for project, two for campaign, three for initiative, or four for program.",
  location_choice:"To record your city or region, press one. To skip this optional field, press two.",
  goal_choice:"To record what your project needs, press one. To skip this optional field, press two."
 };
 return {spoken:feedback+(scripts[d.stage]||"Please continue."),audio,mode:"menu"};
}
