export type VolunteerAvailabilitySchedule={
 mode:"anytime"|"daily"|"weekly"|"once"|"range";
 startTime?:string;endTime?:string;date?:string;fromDate?:string;untilDate?:string;
 weekDays?:number[];timeZone?:string;
};
export const defaultAvailability=():VolunteerAvailabilitySchedule=>({
 mode:"anytime",startTime:"09:00",endTime:"17:00",weekDays:[0,1,2,3,4,5,6],
 timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"
});
const dayOptions=[["זונטאג","Sunday"],["מאנטאג","Monday"],["דינסטאג","Tuesday"],["מיטוואך","Wednesday"],["דאנערשטאג","Thursday"],["פרייטאג","Friday"],["שבת","Saturday"]];
export function AvailabilityFields({value,onChange,yi}:{
 value:VolunteerAvailabilitySchedule;
 onChange:(v:VolunteerAvailabilitySchedule)=>void;
 yi:boolean;
}){
 const set=(key:keyof VolunteerAvailabilitySchedule,val:unknown)=>onChange({...value,[key]:val});
 const needsHours=value.mode!=="anytime";
 const cls="w-full min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm";
 return <fieldset className="space-y-3 rounded-lg border p-3">
  <legend className="px-1 font-semibold">{yi?"ווען קענסטו העלפן?":"When can you help?"}</legend>
  <label className="block space-y-1 text-sm">
   <span>{yi?"וועלכע צייטן?":"Availability type"}</span>
   <select className={cls} value={value.mode} onChange={e=>set("mode",e.target.value)}>
    <option value="anytime">{yi?"יעדע צייט":"Anytime"}</option>
    <option value="daily">{yi?"טעגליכע שעות — פון ביז":"Daily hours — from/to"}</option>
    <option value="weekly">{yi?"געוויסע טעג אין דער וואך":"Selected weekdays"}</option>
    <option value="once">{yi?"איינמאליגע דאטום און צייט":"One-time date and hours"}</option>
    <option value="range">{yi?"פון א דאטום ביז א דאטום":"Custom date range"}</option>
   </select>
  </label>
  {value.mode==="weekly"&&
   <div className="space-y-2">
    <p className="text-sm">{yi?"וועלכע טעג פון דער וואך?":"Which weekdays?"}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
     {dayOptions.map(([he,en],day)=><label key={en} className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={(value.weekDays||[]).includes(day)}
       onChange={e=>set("weekDays",e.target.checked?
        [...new Set([...(value.weekDays||[]),day])].sort((a,b)=>a-b):
        (value.weekDays||[]).filter(d=>d!==day))}/>
      {yi?he:en}
     </label>)}
    </div>
   </div>}
  {value.mode==="once"&&<label className="block space-y-1 text-sm">
    <span>{yi?"דער דאטום":"Date"}</span>
    <input className={cls} type="date" required value={value.date||""}
     onChange={e=>set("date",e.target.value)}/>
   </label>}
  {value.mode==="range"&&<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-sm">
     <span>{yi?"פון וועלכן דאטום":"From date"}</span>
     <input className={cls} type="date" required value={value.fromDate||""}
      onChange={e=>set("fromDate",e.target.value)}/>
    </label>
    <label className="space-y-1 text-sm">
     <span>{yi?"ביז וועלכן דאטום":"Until date"}</span>
     <input className={cls} type="date" required value={value.untilDate||""}
      onChange={e=>set("untilDate",e.target.value)}/>
    </label>
   </div>}
  {needsHours&&<>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-sm">
     <span>{yi?"פון וויפיל אזייגער":"Start time"}</span>
     <input className={cls} type="time" required value={value.startTime||""}
      onChange={e=>set("startTime",e.target.value)}/>
    </label>
    <label className="space-y-1 text-sm">
     <span>{yi?"ביז וויפיל אזייגער":"End time"}</span>
     <input className={cls} type="time" required value={value.endTime||""}
      onChange={e=>set("endTime",e.target.value)}/>
    </label>
   </div>
   <label className="block space-y-1 text-sm">
    <span>{yi?"צייט־זאנע":"Time zone"}</span>
    <input className={cls} required maxLength={80} value={value.timeZone||""}
     onChange={e=>set("timeZone",e.target.value)} placeholder="America/New_York"/>
   </label>
  </>}
 </fieldset>;
}
