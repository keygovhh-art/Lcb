export type Prayer = "shacharis" | "mincha" | "maariv";
export type Schedule = Record<Prayer, { time: string; days: number[] }[]>;
export const WEEKDAYS = [1,2,3,4,5,6] as const;
export const PRAYERS: Prayer[] = ["shacharis", "mincha", "maariv"];
export function legacySchedule(v: Record<Prayer,string>): Schedule {
  return Object.fromEntries(PRAYERS.map(p=>[p,(v[p]||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(time=>({time,days:[...WEEKDAYS]}))])) as Schedule;
}
export function validateSchedule(raw: unknown): Schedule {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw Error("Select valid weekday schedules");
  const obj=raw as Record<string,unknown>;
  if(Object.keys(obj).some(k=>!PRAYERS.includes(k as Prayer))) throw Error("Unknown prayer");
  const output={} as Schedule;
  let count=0;
  for(const key of PRAYERS) {
    const arr=obj[key];
    if(!Array.isArray(arr)||arr.length>24) throw Error("Invalid minyan count");
    output[key]=arr.map(entry=>{
      if(!entry||typeof entry!=="object"||Array.isArray(entry))throw Error("Invalid minyan");
      const {time,days}=entry as Record<string,unknown>;
      if(typeof time!=="string"||!time.trim()||time.trim().length>100)throw Error("Invalid time");
      if(!Array.isArray(days)||!days.length||days.length>6||days.some(d=>typeof d!=="number"||!Number.isInteger(d)||d<1||d>6)||new Set(days).size!==days.length)throw Error("Choose one or more weekdays");
      ++count;
      return {time:time.trim(),days:[...days].sort((a,b)=>a-b) as number[]};
    });
  }
  if(!count)throw Error("At least one prayer time is required");
  return output;
}
export function scheduleStrings(schedule:Schedule):Record<Prayer,string> {
  return Object.fromEntries(PRAYERS.map(p=>[p,schedule[p].map(v=>v.time).join("\n")])) as Record<Prayer,string>;
}
export function resolvedSchedule(v:Record<Prayer,string> & {weekdaySchedules?:Schedule|null}): Schedule {
  return v.weekdaySchedules||legacySchedule(v);
}
