import {useEffect,useMemo,useState} from "react";
import {Input} from "@/components/ui/input";
import {asGregorianDate,hebrewParts,hebrewNumerals,hebrewYearDays,jewishDateLabel,upcomingParsha} from "@/lib/jewish-date";

type Props={value:string;onChange:(date:string)=>void;label?:string;timeValue?:string;onTimeChange?:(time:string)=>void;disabled?:boolean};
/** Both pickers select one and the same Gregorian YYYY-MM-DD date in the API. */
export function JewishDateField({value,onChange,label="דאטום",timeValue,onTimeChange,disabled}:Props){
 const today=new Date();
 const todayISO=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
 const initial=hebrewParts(value||todayISO);
 const [mode,setMode]=useState<"hebrew"|"gregorian">("hebrew");
 const [year,setYear]=useState(initial?.year||5787);
 const [month,setMonth]=useState(initial?.month||"Tishri");
 const [location,setLocation]=useState<"diaspora"|"israel">("diaspora");
 const [portion,setPortion]=useState("");
 const h=hebrewParts(value);
 useEffect(()=>{if(h){setYear(h.year);setMonth(h.month);}},[value]);
 useEffect(()=>{
  let active=true;
  if(!value){setPortion("");return;}
  upcomingParsha(value,location).then(s=>{if(active)setPortion(s);});
  return()=>{active=false;};
 },[value,location]);
 const months=useMemo(()=>hebrewYearDays(year),[year]);
 const selected=months.find(x=>x.id===month)||months[0];
 const days=selected?.days||[];
 const cells=Array.from({length:days[0]?.weekday||0},()=>null as typeof days[number]|null).concat(days);
 const chooseYear=(y:number)=>{
  setYear(y);const list=hebrewYearDays(y);
  setMonth(list.find(x=>x.id===month)?.id||list[0]?.id||"Tishri");
 };
 const shift=(dir:number)=>{
  const i=months.findIndex(x=>x.id===selected?.id),next=i+dir;
  if(next>=0&&next<months.length){setMonth(months[next].id);return;}
  const y=year+(dir>0?1:-1);
  if(y<5660||y>5860)return;
  const other=hebrewYearDays(y);setYear(y);setMonth(dir>0?other[0]?.id:other[other.length-1]?.id);
 };
 return <div className="space-y-2" dir="rtl">
  <div className="flex justify-between gap-2 items-center flex-wrap">
    <span className="text-sm font-medium">{label}</span>
    <div className="inline-flex border rounded-lg overflow-hidden text-sm" role="group" aria-label="אויסקלייבן אידישע אדער ענגלישע דאטום">
      <button type="button" aria-pressed={mode==="hebrew"} disabled={disabled}
        className={"px-3 py-2 "+(mode==="hebrew"?"bg-primary text-primary-foreground":"bg-background")}
        onClick={()=>setMode("hebrew")}>אידישער לוח</button>
      <button type="button" aria-pressed={mode==="gregorian"} disabled={disabled}
        className={"px-3 py-2 "+(mode==="gregorian"?"bg-primary text-primary-foreground":"bg-background")}
        onClick={()=>setMode("gregorian")}>ענגלישער לוח</button>
    </div>
  </div>
  {mode==="gregorian"?
    <Input type="date" disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}
      aria-label="ענגלישער דאטום" className="h-11"/>:
    <div className="border rounded-xl p-3 bg-card space-y-3">
      <div className="flex gap-2 items-center">
        <button type="button" aria-label="פריערדיגער אידישער חודש" className="border rounded p-2" disabled={disabled} onClick={()=>shift(-1)}>‹</button>
        <select aria-label="אידישער חודש" className="grow min-w-0 border rounded h-10 bg-background px-2"
          value={selected?.id||""} disabled={disabled} onChange={e=>setMonth(e.target.value)}>
          {months.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select aria-label="אידישער יאר" className="border rounded h-10 bg-background px-1 max-w-28"
          value={year} disabled={disabled} onChange={e=>chooseYear(Number(e.target.value))}>
          {Array.from({length:201},(_,i)=>5660+i).map(y=><option key={y} value={y}>{hebrewNumerals(y)}</option>)}
        </select>
        <button type="button" aria-label="קומענדיגער אידישער חודש" className="border rounded p-2" disabled={disabled} onClick={()=>shift(1)}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["זון","מאנט","דינסט","מיטוואך","דאנער","פרייט","שבת"].map((w,i)=><span key={i}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day,i)=>day?
          <button type="button" key={day.iso} disabled={disabled} aria-pressed={day.iso===value}
            title={jewishDateLabel(day.iso)+" — "+day.iso}
            className={"min-h-11 rounded border flex flex-col items-center justify-center text-sm "+
              (day.iso===value?"bg-primary text-primary-foreground":"bg-background hover:bg-muted")}
            onClick={()=>onChange(day.iso)}>
             <span className="font-semibold">{hebrewNumerals(day.day)}</span>
             <span className="text-[10px] opacity-70" dir="ltr">{day.gregDay}</span>
          </button>:<span key={"empty-"+i}/>)}
      </div>
    </div>}
  <div className="rounded border p-2 text-sm bg-muted/20" aria-live="polite">
    {value&&asGregorianDate(value)?<>
      <strong>{jewishDateLabel(value)}</strong>
      <span className="mx-2">⇄</span><span dir="ltr" className="inline-block">{value}</span>
      {portion&&<div className="text-xs pt-1">{portion}</div>}
      <div className="text-xs mt-2">
        <label>פרשת השבוע לויט:{" "}
          <select className="border rounded bg-background" value={location}
            onChange={e=>setLocation(e.target.value as "diaspora"|"israel")}>
            <option value="diaspora">חוץ לארץ</option><option value="israel">ארץ ישראל</option>
          </select>
        </label>
      </div>
    </>:<span className="text-muted-foreground">קלייב אויס א דאטום אינעם אידישן אדער ענגלישן לוח.</span>}
  </div>
  {onTimeChange!==undefined&&<label className="flex gap-3 items-center text-sm">
    <span>שעה</span><Input type="time" aria-label="שעה" disabled={disabled||!value} className="h-11 grow"
    value={timeValue||""} onChange={e=>onTimeChange(e.target.value)}/></label>}
  <p className="text-xs text-muted-foreground">ביידע לוחות היטן אפ דעם זעלבן דאטום; אידישער טאג טוישט זיך ביי דער נאכט. שעות ווערן אפגעהיטן לויט דער אויסגעקליבענער צייט־זאנע.</p>
 </div>;
}
