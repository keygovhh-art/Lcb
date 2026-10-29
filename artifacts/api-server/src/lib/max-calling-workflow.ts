/** Shared server rules for MAX manual website/telephone outcome capture.
 * No provider call or verified payment is implied by any of these values.
 */
export const maxOutcomes=["gave","no_answer","callback","not_interested","do_not_call","other"] as const;
export const maxMoods=["not_entered","neutral","friendly","busy","uncomfortable","uninterested","other",
 "very_warm","gave_generously","warm_and_gave_generously"] as const;
export type MaxCallbackPlan={kind:"none"|"ten_minutes"|"minutes"|"one_hour"|"hours";minutes?:number;hours?:number;minuteOfHour?:number|null};
export type MaxRecontactPlan={scope:"same_purpose"|"new_purpose";afterMonths:number};

function localParts(instant:Date,zone:string){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(instant);
 const at=(type:string)=>parts.find(p=>p.type===type)?.value||"";
 return {date:at("year")+"-"+at("month")+"-"+at("day"),time:at("hour")+":"+at("minute"),minute:Number(at("minute"))};
}
export function computeMaxCallback(plan:MaxCallbackPlan,at=new Date(),zone="America/New_York"){
 new Intl.DateTimeFormat("en-US",{timeZone:zone}); // throws on invalid IANA timezone
 if(!Number.isFinite(at.getTime()))throw Error("Invalid call timestamp");
 if(plan.kind==="none")return null;
 let minutes=0;
 if(plan.kind==="ten_minutes")minutes=10;
 else if(plan.kind==="one_hour")minutes=60;
 else if(plan.kind==="minutes"){
  if(!Number.isInteger(plan.minutes)||Number(plan.minutes)<1||Number(plan.minutes)>60)
   throw Error("Custom callback must be 1 to 60 minutes after the call");
  minutes=Number(plan.minutes);
 }else if(plan.kind==="hours"){
  if(!Number.isInteger(plan.hours)||Number(plan.hours)<1||Number(plan.hours)>24)
   throw Error("Select 1 to 24 hours from the end of the call");
  minutes=Number(plan.hours)*60;
  if(plan.minuteOfHour!==null&&plan.minuteOfHour!==undefined){
   const exact=Number(plan.minuteOfHour);
   if(!Number.isInteger(exact)||exact<0||exact>59)throw Error("Minute must be between 0 and 59");
   minutes+=exact-localParts(new Date(at.getTime()+minutes*60000),zone).minute;
  }
 }else throw Error("Unknown callback schedule");
 if(minutes<1||minutes>24*60+59)throw Error("Callback must be within the next 24 hours");
 const instant=new Date(at.getTime()+minutes*60000);
 return {dueAt:instant.toISOString(),...localParts(instant,zone),timeZone:zone};
}
export function computeMaxRecontact(plan:MaxRecontactPlan,at=new Date()){
 if(!["same_purpose","new_purpose"].includes(plan.scope)||
    !Number.isInteger(plan.afterMonths)||plan.afterMonths<1||plan.afterMonths>24)
  throw Error("Recontact must specify a purpose and 1 to 24 months");
 const y=at.getUTCFullYear(),m=at.getUTCMonth(),d=at.getUTCDate();
 const first=new Date(Date.UTC(y,m+plan.afterMonths,1,at.getUTCHours(),at.getUTCMinutes()));
 const lastDay=new Date(Date.UTC(y,m+plan.afterMonths+1,0)).getUTCDate();
 first.setUTCDate(Math.min(d,lastDay));
 return first;
}
