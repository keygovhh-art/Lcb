/** Accurate local wall-clock comparisons without guessing a donor's timezone. */
export function validIanaTimeZone(value:unknown):value is string {
  if(typeof value!=="string"||value.length>80||!value)return false;
  try {new Intl.DateTimeFormat("en-US",{timeZone:value}).format(new Date());return true;}
  catch{return false;}
}
export function localClock(now:Date,timeZone:string):{date:string;time:string}{
  const formatter=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const parts=Object.fromEntries(formatter.formatToParts(now).map(p=>[p.type,p.value]));
  return {date:parts.year+"-"+parts.month+"-"+parts.day,time:parts.hour+":"+parts.minute};
}
export function reminderStatus(task:{dueDate:string|null;dueTime:string|null;timeZone:string|null},
  viewerZone:string,now:Date):"due"|"today"|"upcoming"|"undated" {
  if(!task.dueDate)return "undated";
  const zone=task.timeZone&&validIanaTimeZone(task.timeZone)?task.timeZone:viewerZone;
  const clock=localClock(now,zone);
  if(task.dueDate<clock.date)return "due";
  if(task.dueDate===clock.date){
    if(!task.dueTime||task.dueTime<=clock.time)return "due";
    return "today";
  }
  return "upcoming";
}
export function localHorizon(now:Date,zone:string,days:number):string {
  const tomorrow=new Date(now.getTime()+days*86400000);
  return localClock(tomorrow,zone).date;
}
