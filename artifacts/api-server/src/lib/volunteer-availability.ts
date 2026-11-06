export type VolunteerAvailabilityMode = "anytime" | "daily" | "weekly" | "once" | "range";
export type VolunteerAvailabilitySchedule = {
  mode:VolunteerAvailabilityMode;
  startTime?:string;
  endTime?:string;
  date?:string;
  fromDate?:string;
  untilDate?:string;
  weekDays?:number[];
  timeZone?:string;
};
export function validateAvailabilitySchedule(input:unknown):VolunteerAvailabilitySchedule{
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Select an availability schedule");
 const item=input as Record<string,unknown>;
 const mode=String(item.mode||"");
 if(!["anytime","daily","weekly","once","range"].includes(mode))throw Error("Invalid availability type");
 if(mode==="anytime")return{mode:"anytime"};
 const startTime=String(item.startTime||"");
 const endTime=String(item.endTime||"");
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)||! /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)||startTime===endTime)
  throw Error("Enter two different start/end times in HH:MM format");
 const tz=String(item.timeZone||"").trim();
 if(!tz||tz.length>80)throw Error("Select a time zone");
 try{new Intl.DateTimeFormat("en-US",{timeZone:tz}).format(new Date());}
 catch{throw Error("Invalid time zone");}
 const result:VolunteerAvailabilitySchedule={mode:mode as VolunteerAvailabilityMode,startTime,endTime,timeZone:tz};
 const validDate=(value:unknown)=>{
  const date=String(value||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T00:00:00.000Z"))||new Date(date+"T00:00:00.000Z").toISOString().slice(0,10)!==date)
   throw Error("Enter a valid calendar date");
  return date;
 };
 if(mode==="once")result.date=validDate(item.date);
 if(mode==="range"){
  result.fromDate=validDate(item.fromDate);result.untilDate=validDate(item.untilDate);
  if(result.fromDate>result.untilDate)throw Error("Start date must be before end date");
 }
 if(mode==="weekly"){
  if(!Array.isArray(item.weekDays)||!item.weekDays.length||item.weekDays.length>7||
    item.weekDays.some(x=>!Number.isInteger(x)||x<0||x>6)||
    new Set(item.weekDays).size!==item.weekDays.length)throw Error("Select at least one day of the week");
  result.weekDays=[...item.weekDays].sort((a:number,b:number)=>a-b);
 }
 return result;
}
export function shortAvailabilityDescription(schedule:VolunteerAvailabilitySchedule){
 const hh=(x?:string)=>x||"";
 switch(schedule.mode){
  case "anytime":return "Any time";
  case "daily":return `Daily ${hh(schedule.startTime)}–${hh(schedule.endTime)} (${schedule.timeZone})`;
  case "weekly":return `Weekly on ${(schedule.weekDays||[]).map(x=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][x]).join(", ")} ${hh(schedule.startTime)}–${hh(schedule.endTime)} (${schedule.timeZone})`;
  case "once":return `Once on ${schedule.date}, ${hh(schedule.startTime)}–${hh(schedule.endTime)} (${schedule.timeZone})`;
  case "range":return `${schedule.fromDate} through ${schedule.untilDate}, daily ${hh(schedule.startTime)}–${hh(schedule.endTime)} (${schedule.timeZone})`;
 }
}
