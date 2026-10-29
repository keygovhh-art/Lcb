/** A handset-only flow for MANUALLY entering a result after a donor call.
 * This does not place an outgoing call, or prove an answered/settled call.
 */
export type PhoneStage=
 "choose"|"donation_kind"|"donation_amount"|"mood"|"callback"|
 "callback_minutes"|"callback_hours"|"callback_exact_choice"|"callback_exact_minute"|
 "recontact_scope"|"recontact_period"|"recontact_months"|"confirm";
export type PhonePending={
 stage:PhoneStage;userId:number;contactId:number;caseId:number;contactName:string;
 expiresAt:number;requestId:string;at:number;
 outcome?:string;moneyKind?:"none"|"received"|"pledged";amount?:number;
 mood?:string;callbackKind?:"none"|"ten_minutes"|"minutes"|"one_hour"|"hours";
 callbackMinutes?:number;callbackHours?:number;callbackMinuteOfHour?:number|null;
 recontactScope?:"same_purpose"|"new_purpose";recontactMonths?:number;
};
const outcomes:Record<string,string>={"1":"gave","2":"no_answer","3":"callback",
 "4":"not_interested","5":"do_not_call","6":"other"};
const moods:Record<string,string>={"1":"not_entered","2":"neutral","3":"friendly",
 "4":"busy","5":"uncomfortable","6":"uninterested","7":"very_warm",
 "8":"gave_generously","9":"warm_and_gave_generously"};

export function readMaxPhonePending(raw:string):PhonePending|null{
 try{
  const x=JSON.parse(raw) as PhonePending;
  if(!x||!["choose","donation_kind","donation_amount","mood","callback",
   "callback_minutes","callback_hours","callback_exact_choice","callback_exact_minute",
   "recontact_scope","recontact_period","recontact_months","confirm"].includes(x.stage)||
   !Number.isSafeInteger(x.userId)||x.userId<=0||
   !Number.isSafeInteger(x.contactId)||x.contactId<=0||
   !Number.isSafeInteger(x.caseId)||x.caseId<=0||
   !Number.isFinite(x.expiresAt)||x.expiresAt<Date.now()||
   !Number.isFinite(x.at)||x.at>Date.now()+60000||Date.now()-x.at>60*60*1000||
   typeof x.contactName!=="string"||x.contactName.length>240||
   !/^[a-f0-9]{64}$/.test(x.requestId))return null;
  return x;
 }catch{return null;}
}
export function maxPhonePrompt(x:PhonePending):{text:string;digits:number}{
 const menu=" Press zero to cancel.";
 switch(x.stage){
  case "choose":return{text:"Manual call result for "+x.contactName+
   ". Press 1 for gave a donation, 2 for did not answer, 3 for callback requested,"+
   " 4 for not interested, 5 for Do Not Call, or 6 for other."+menu,digits:1};
  case "donation_kind":return{text:"Donation information. Press 1 if received, manually reported."+
   " Press 2 for a pledge, not yet received."+menu,digits:1};
  case "donation_amount":return{text:"Enter the dollar amount, up to eight digits, then pound. It will be manually reported, not provider verified.",digits:8};
  case "mood":return{text:"How was the conversation? Press 1 for not entered, 2 neutral,"+
   " 3 friendly, 4 busy, 5 uncomfortable, 6 uninterested, 7 very warmly received"+
   (x.outcome==="gave"?", 8 gave generously, 9 warmly received and gave generously":"")+
   ". The default is NOT ENTERED. Press 1 to skip.",digits:1};
  case "callback":return{text:"Would you like to schedule a callback? Press 1 for ten minutes,"+
   " 2 for another number of minutes up to one hour, 3 for one hour,"+
   " 4 for one to twenty four hours, or 5 for no callback.",digits:1};
  case "callback_minutes":return{text:"Enter the number of minutes, one to sixty, then pound.",digits:2};
  case "callback_hours":return{text:"Enter one to twenty four hours after this report, then pound.",digits:2};
  case "callback_exact_choice":return{text:"Press 1 to use the same minute as now, or 2 to choose the exact minute within that future hour.",digits:1};
  case "callback_exact_minute":return{text:"Enter the exact minute, zero to fifty nine, then pound.",digits:2};
  case "recontact_scope":return{text:x.outcome==="do_not_call"?"Do Not Call is in effect. Press 1 to continue without a future calling schedule.":"Do you want this donor considered for a future purpose?"+
   " Press 1 for no, 2 for this same purpose, or 3 for a new purpose.",digits:1};
  case "recontact_period":return{text:"Press 1 for six calendar months, or 2 for a custom number of months.",digits:1};
  case "recontact_months":return{text:"Enter one to twenty four months, then pound.",digits:2};
  case "confirm":return{text:"Review: "+(x.outcome||"unknown").replaceAll("_"," ")+
   (x.moneyKind&&x.moneyKind!=="none"?" "+x.moneyKind+" "+x.amount+" dollars.":"")+
   (x.callbackKind&&x.callbackKind!=="none"?" A callback reminder was selected.":"")+
   (x.recontactScope?" Future donor review in "+x.recontactMonths+" months.":"")+
   " Press 1 to SAVE on your MAX website and Tishl; 2 to start the report over; zero to cancel.",digits:1};
 }
}
const next=(x:PhonePending,stage:PhoneStage):PhonePending=>({...x,stage});
export function advanceMaxPhone(x:PhonePending,digit:string):{pending:PhonePending;error?:string;save?:boolean}{
 if(x.stage==="choose"){
  const outcome=outcomes[digit];
  if(!outcome)return{pending:x,error:"Choose one through six."};
  const change={...x,outcome,moneyKind:"none" as const,mood:"not_entered"};
  return{pending:next(change,outcome==="gave"?"donation_kind":
   outcome==="no_answer"||outcome==="callback"?"callback":"mood")};
 }
 if(x.stage==="donation_kind"){
  if(digit!=="1"&&digit!=="2")return{pending:x,error:"Press one for received, or two for pledged."};
  return{pending:next({...x,moneyKind:digit==="1"?"received":"pledged"},"donation_amount")};
 }
 if(x.stage==="donation_amount"){
  if(!/^[0-9]{1,8}$/.test(digit)||Number(digit)<=0)return{pending:x,error:"Enter a positive dollar amount, then pound."};
  return{pending:next({...x,amount:Number(digit)},"mood")};
 }
 if(x.stage==="mood"){
  const mood=moods[digit];
  if(!mood||((digit==="8"||digit==="9")&&x.outcome!=="gave"))return{pending:x,error:"Choose a listed conversation category."};
  return{pending:next({...x,mood},"recontact_scope")};
 }
 if(x.stage==="callback"){
  const kinds:Record<string,PhonePending["callbackKind"]>={"1":"ten_minutes","2":"minutes",
   "3":"one_hour","4":"hours","5":"none"};
  const kind=kinds[digit];if(!kind)return{pending:x,error:"Choose a listed callback option."};
  return{pending:next({...x,callbackKind:kind},
   kind==="minutes"?"callback_minutes":kind==="hours"?"callback_hours":"mood")};
 }
 if(x.stage==="callback_minutes"){
  if(!/^[0-9]{1,2}$/.test(digit)||+digit<1||+digit>60)return{pending:x,error:"Choose one to sixty minutes."};
  return{pending:next({...x,callbackMinutes:+digit},"mood")};
 }
 if(x.stage==="callback_hours"){
  if(!/^[0-9]{1,2}$/.test(digit)||+digit<1||+digit>24)return{pending:x,error:"Choose one to twenty four hours."};
  return{pending:next({...x,callbackHours:+digit},"callback_exact_choice")};
 }
 if(x.stage==="callback_exact_choice"){
  if(digit==="1")return{pending:next({...x,callbackMinuteOfHour:null},"mood")};
  if(digit==="2")return{pending:next(x,"callback_exact_minute")};
  return{pending:x,error:"Press one or two."};
 }
 if(x.stage==="callback_exact_minute"){
  if(!/^[0-9]{1,2}$/.test(digit)||+digit>59)return{pending:x,error:"Choose zero to fifty nine."};
  return{pending:next({...x,callbackMinuteOfHour:+digit},"mood")};
 }
 if(x.stage==="recontact_scope"){
  if(x.outcome==="do_not_call"||digit==="1")return{pending:next({...x,recontactScope:undefined},"confirm")};
  if(digit!=="2"&&digit!=="3")return{pending:x,error:"Choose 1, 2, or 3."};
  return{pending:next({...x,recontactScope:digit==="2"?"same_purpose":"new_purpose"},"recontact_period")};
 }
 if(x.stage==="recontact_period"){
  if(digit==="1")return{pending:next({...x,recontactMonths:6},"confirm")};
  if(digit==="2")return{pending:next(x,"recontact_months")};
  return{pending:x,error:"Press one for six months, or two for another period."};
 }
 if(x.stage==="recontact_months"){
  if(!/^[0-9]{1,2}$/.test(digit)||+digit<1||+digit>24)return{pending:x,error:"Enter 1 to 24 months."};
  return{pending:next({...x,recontactMonths:+digit},"confirm")};
 }
 if(x.stage==="confirm"){
  if(digit==="1")return{pending:x,save:true};
  if(digit==="2")return{pending:next({...x,outcome:undefined,moneyKind:"none",amount:undefined,
    mood:"not_entered",callbackKind:"none",recontactScope:undefined,recontactMonths:undefined},"choose")};
  return{pending:x,error:"Press one to save or two to restart."};
 }
 return{pending:x};
}
