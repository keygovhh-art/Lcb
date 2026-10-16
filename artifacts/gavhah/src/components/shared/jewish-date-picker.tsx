import {useEffect,useMemo,useState} from "react";

/** One canonical civil YYYY-MM-DD for storage; two fully synchronized pickers.
 * Conversion runs locally through the browser's Hebrew calendar (ICU).
 * Hebrew days mean their civil *daytime*; sunset-based scheduling needs location.
 */
const en=new Intl.DateTimeFormat("en-u-ca-hebrew",{day:"numeric",month:"long",year:"numeric"});
const he=new Intl.DateTimeFormat("he-u-ca-hebrew",{day:"numeric",month:"long",year:"numeric"});
const pad=(x:number)=>String(x).padStart(2,"0");
const civil=(d:Date)=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join("-");
const parse=(iso:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
 const [y,m,d]=iso.split("-").map(Number);const r=new Date(y,m-1,d,12);
 return r.getFullYear()===y&&r.getMonth()+1===m&&r.getDate()===d?r:null;};
type HebrewPart={year:number;month:string;day:number};
function part(d:Date):HebrewPart{
 const p=en.formatToParts(d),get=(k:string)=>p.find(q=>q.type===k)?.value||"";
 return {year:Number(get("year")),month:get("month"),day:Number(get("day"))};
}
type HebrewMonth={name:string;label:string;days:{day:number;iso:string}[]};
const yearCache=new Map<number,HebrewMonth[]>();
function yearMonths(y:number):HebrewMonth[]{
 if(yearCache.has(y))return yearCache.get(y)!;
 if(!Number.isInteger(y)||y<5000||y>7000)return [];
 const result:HebrewMonth[]=[],byName=new Map<string,HebrewMonth>();
 // From summer preceding Rosh Hashanah through the end of the next autumn.
 const start=new Date(y-3761,5,1,12),end=new Date(y-3759,0,1,12);
 for(let d=new Date(start);d<end;d.setDate(d.getDate()+1)){
  const h=part(d);if(h.year!==y)continue;
  let month=byName.get(h.month);
  if(!month){month={name:h.month,label:he.formatToParts(d).find(q=>q.type==="month")?.value||h.month,days:[]};
   byName.set(h.month,month);result.push(month);}
  month.days.push({day:h.day,iso:civil(d)});
 }
 yearCache.set(y,result);return result;
}
function dayPreview(iso:string){
 const d=parse(iso);if(!d)return "";
 const p=part(d),hdate=he.format(d);
 const yearHe=new Intl.NumberFormat("he",{useGrouping:false}).format(p.year);
 return hdate.replace(yearHe,String(p.year));
}
const weekdays=["זונטאג","מאנטאג","דינסטאג","מיטוואך","דאנערשטאג","פרייטאג","שבת"];
export function JewishDatePicker({value,onChange,label,id}:{
 value:string;onChange:(date:string)=>void;label?:string;id?:string;
}){
 const [mode,setMode]=useState<"english"|"hebrew">("hebrew");
 const chosen=parse(value)||new Date();
 const selected=part(chosen);
 const [viewYear,setViewYear]=useState(selected.year);
 const [viewMonth,setViewMonth]=useState(selected.month);
 const [parsha,setParsha]=useState<string>("");
 useEffect(()=>{setViewYear(selected.year);setViewMonth(selected.month);},[value]);
 const months=useMemo(()=>yearMonths(viewYear),[viewYear]);
 const shown=months.find(x=>x.name===viewMonth)||months[0];
 const pick=(iso:string)=>{if(parse(iso))onChange(iso);};
 useEffect(()=>{
  if(!value){setParsha("");return;}
  const d=parse(value);if(!d)return;
  // Parsha is a PUBLIC Torah calendar lookup, not the private appointment text.
  // An absent network response never changes the chosen date.
  const shabbat=new Date(d);shabbat.setDate(shabbat.getDate()+(6-shabbat.getDay()+7)%7);
  const saturday=civil(shabbat),controller=new AbortController();
  const key="parsha:"+saturday;
  const memory=(window as unknown as {__gavhahParsha?:Record<string,string>});
  if(memory.__gavhahParsha?.[key]){setParsha(memory.__gavhahParsha[key]);return;}
  setParsha("פרשה ווערט נאך געזוכט…");
  fetch("https://www.hebcal.com/hebcal?v=1&cfg=json&start="+saturday+"&end="+saturday+"&s=on&leyning=off&lg=he&i=off",
   {signal:controller.signal}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{
    const p=(d.items||[]).find((e:{category?:string})=>e.category==="parashat");
    const v=typeof p?.hebrew==="string" ? p.hebrew.replace(/[\u0591-\u05c7]/g,"") : "שבת / יום טוב";
    memory.__gavhahParsha={...(memory.__gavhahParsha||{}),[key]:v};setParsha(v);
   }).catch(()=>{if(!controller.signal.aborted)setParsha("פרשה נישט פאראן אָן אינטערנעט");});
  return ()=>controller.abort();
 },[value]);
 const previous=()=>{if(!shown)return;const i=months.indexOf(shown);if(i>0)setViewMonth(months[i-1].name);else{const y=viewYear-1;setViewYear(y);setViewMonth(yearMonths(y).at(-1)?.name||"Elul");}};
 const next=()=>{if(!shown)return;const i=months.indexOf(shown);if(i+1<months.length)setViewMonth(months[i+1].name);else{const y=viewYear+1;setViewYear(y);setViewMonth(yearMonths(y)[0]?.name||"Tishri");}};
 const firstDay=shown?.days[0]?.iso?parse(shown.days[0].iso)?.getDay()||0:0;
 return <div dir="rtl" className="space-y-2 rounded-lg border p-3">
   {label&&<label htmlFor={id} className="font-semibold text-sm">{label}</label>}
   <div className="flex flex-wrap gap-2">
    <button type="button" aria-pressed={mode==="hebrew"} className={"rounded-md border px-3 py-2 text-sm "+(mode==="hebrew"?"bg-primary text-primary-foreground":"")} onClick={()=>setMode("hebrew")}>אידישער לוח</button>
    <button type="button" aria-pressed={mode==="english"} className={"rounded-md border px-3 py-2 text-sm "+(mode==="english"?"bg-primary text-primary-foreground":"")} onClick={()=>setMode("english")}>ענגלישער קאלענדאר</button>
   </div>
   {mode==="english"?
    <input id={id} type="date" dir="ltr" className="w-full min-h-11 rounded-md border bg-background px-3" value={value} onChange={e=>pick(e.target.value)}/>:
    <>
     <div className="flex gap-1 items-center">
      <button type="button" onClick={previous} className="border rounded-lg px-3 min-h-11">‹</button>
      <select aria-label="אידישער חודש" value={shown?.name||""} onChange={e=>setViewMonth(e.target.value)} className="min-w-0 grow border rounded-md px-2 h-11 bg-background">
       {months.map(m=><option key={m.name} value={m.name}>{m.label}</option>)}
      </select>
      <select aria-label="אידישער יאר" value={viewYear} onChange={e=>{const y=Number(e.target.value);setViewYear(y);setViewMonth(yearMonths(y)[0]?.name||"Tishri");}} className="border rounded-md h-11 bg-background px-1">
       {Array.from({length:21},(_,i)=>selected.year-10+i).map(y=><option key={y} value={y}>{y}</option>)}
      </select>
      <button type="button" onClick={next} className="border rounded-lg px-3 min-h-11">›</button>
     </div>
     <div className="grid grid-cols-7 gap-1 text-center text-xs" role="grid" aria-label="אידישער חודש">
       {weekdays.map(w=><span key={w} className="font-semibold p-1">{w.slice(0,2)}</span>)}
       {Array.from({length:firstDay},(_,i)=><span key={"blank"+i}/>)}
       {(shown?.days||[]).map(({day,iso})=><button key={iso} type="button" aria-selected={iso===value}
        onClick={()=>pick(iso)} className={"min-h-9 rounded-md border text-xs "+(iso===value?"bg-primary text-primary-foreground":"")}>
        {day}</button>)}
     </div>
    </>
   }
   <p className="text-xs">אידיש: <strong>{dayPreview(value)||"נישט אויסגעקליבן"}</strong> · פ׳ {parsha||"—"}</p>
   <p className="text-xs" dir="ltr">Gregorian: {value||"—"}</p>
   <p className="text-xs text-muted-foreground">די אידישע דאטום באציט זיך צום טאג ביז שקיעה. פאר א נאכט־פראגראם דארף מען באזונדער באשטעטיגן די שעה און צייט־זאנע.</p>
  </div>;
}
