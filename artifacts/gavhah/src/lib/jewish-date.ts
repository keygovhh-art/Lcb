/** Exact daytime Gregorian <-> Hebrew calendar conversions from ICU/Intl.
 * Date is stored as the SAME Gregorian ISO date in existing APIs. No timezone
 * shifts, no alternate database date, no Hebrew/Gregorian mismatch.
 */
const fmt=new Intl.DateTimeFormat('en-US-u-ca-hebrew',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
const re=/^(\d{4})-(\d{2})-(\d{2})$/;
const names={
 'Tishri':'תשרי','Tishrei':'תשרי','Heshvan':'חשון','Cheshvan':'חשון',
 'Kislev':'כסלו','Tevet':'טבת','Shevat':'שבט','Shvat':'שבט',
 'Adar':'אדר','Adar I':'אדר א׳','Adar II':'אדר ב׳',
 'Nisan':'ניסן','Iyar':'אייר','Sivan':'סיון',
 'Tamuz':'תמוז','Tammuz':'תמוז','Av':'אב','Elul':'אלול'
};
export function asGregorianDate(iso:string):Date|null {
 const match=re.exec(iso);if(!match)return null;
 const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
 const dt=new Date(Date.UTC(y,m-1,d,12));
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?dt:null;
}
export function isoUTC(date:Date):string{
 return [date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('-');
}
export function hebrewParts(iso:string){
 const date=asGregorianDate(iso);if(!date)return null;
 const parts=Object.fromEntries(fmt.formatToParts(date).map(p=>[p.type,p.value]));
 return {day:Number(parts.day),month:parts.month,year:Number(parts.year)};
}
const letters:[number,string][]=[[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']];
export function hebrewNumerals(num:number):string{
 let n=num%1000;if(n===15)return 'ט״ו';if(n===16)return 'ט״ז';
 let out='';for(const [value,letter] of letters){while(n>=value){out+=letter;n-=value;}}
 return out.length===1?out+'׳':out.slice(0,-1)+'״'+out.slice(-1);
}
export function jewishDateLabel(iso:string){
 const v=hebrewParts(iso);if(!v)return '';
 return hebrewNumerals(v.day)+' '+(names[v.month]||v.month)+' '+hebrewNumerals(v.year);
}
export function hebrewYearDays(year:number){
 if(!Number.isInteger(year)||year<5660||year>5860)return [];
 const from=Date.UTC(year-3761,7,1,12),until=Date.UTC(year-3760,10,1,12);
 const months:Array<{id:string;label:string;days:Array<{iso:string;day:number;weekday:number;gregDay:number}>}>=[];
 const byId=new Map<string,typeof months[number]>();
 for(let time=from;time<until;time+=86400000){
  const date=new Date(time),iso=isoUTC(date),h=hebrewParts(iso);
  if(!h||h.year!==year)continue;
  let group=byId.get(h.month);
  if(!group){group={id:h.month,label:names[h.month]||h.month,days:[]};months.push(group);byId.set(h.month,group);}
  group.days.push({iso,day:h.day,weekday:date.getUTCDay(),gregDay:date.getUTCDate()});
 }
 return months;
}

const parshaCache=new Map<string,Promise<string>>();
/** Official public Hebcal parsha-only API; no member or account data sent. */
export async function upcomingParsha(iso:string,location:'diaspora'|'israel'='diaspora'):Promise<string>{
 const date=asGregorianDate(iso);if(!date)return '';
 date.setUTCDate(date.getUTCDate()+(6-date.getUTCDay()+7)%7);
 const saturday=isoUTC(date);
 const key=location+':'+saturday;
 if(!parshaCache.has(key))parshaCache.set(key,(async()=>{
  const u=new URL('https://www.hebcal.com/hebcal');
  for(const [k,v] of Object.entries({v:'1',cfg:'json',start:saturday,end:saturday,s:'on',leyning:'off',i:location==='israel'?'on':'off'}))
   u.searchParams.set(k,v);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
  try{
   const res=await fetch(u,{mode:'cors',signal:controller.signal});
   if(!res.ok)throw Error('Parsha lookup unavailable');
   const data=await res.json() as {items?:Array<{category?:string;hebrew?:string}>};
   const parsha=data.items?.find(x=>x.category==='parashat');
   return parsha?.hebrew?('פ׳ '+parsha.hebrew.replace(/^פרשת\s*/,'')):'שבת יום־טוב — קיין געווענליכע פרשה';
  }finally{clearTimeout(timeout);}
 })().catch(()=> 'פרשה־אינפארמאציע איז צייטווייליג נישט אוועילעבל'));
 return parshaCache.get(key)!;
}
