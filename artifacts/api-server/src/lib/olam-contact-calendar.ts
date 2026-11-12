/**
 * One Hebrew/Gregorian calendar conversion for MAX Contacts.
 * Use the IANA New York timezone consistently with My Tishl and Gedenk.
 * Hebrew month numbers start with Tishrei, using 13 months only in leap years.
 */
export const olamWeekdays = ["זונטאג","מאנטאג","דינסטאג","מיטוואך","דאנערשטאג","פרייטאג","שבת"];
export const olamHebrewMonths = ["תשרי","חשון","כסלו","טבת","שבט","אדר","ניסן","אייר","סיון","תמוז","אב","אלול"];
const leap=(y:number)=>[0,3,6,8,11,14,17].includes(y%19);
const norm=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,"");
export function olamHebrewToCivil(year:number,month:number,day:number):string|null{
 if(!Number.isSafeInteger(year)||year<5000||year>7000||!Number.isSafeInteger(day)||day<1||day>30||!Number.isSafeInteger(month)||month<1||month>(leap(year)?13:12))return null;
 const list=leap(year)
  ? ["tishri","heshvan","kislev","tevet","shevat","adar i","adar ii","nisan","iyar","sivan","tamuz","av","elul"]
  : ["tishri","heshvan","kislev","tevet","shevat","adar","nisan","iyar","sivan","tamuz","av","elul"];
 const monthName=norm(list[month-1]);
 const fmt=new Intl.DateTimeFormat("en-u-ca-hebrew",{timeZone:"America/New_York",year:"numeric",month:"long",day:"numeric"});
 const start=Date.UTC(year-3761,7,15,12),end=Date.UTC(year-3760,11,31,12);
 for(let time=start;time<=end;time+=86400000){
  const parts=Object.fromEntries(fmt.formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  const actual=norm(String(parts.month||""));
  const match=actual===monthName||(monthName==="tishri"&&actual==="tishrei")||
   (monthName==="heshvan"&&["cheshvan","marcheshvan"].includes(actual))||
   (monthName==="adarii"&&actual==="adar")||
   (monthName==="tamuz"&&actual==="tammuz");
  if(Number(parts.year)===year&&Number(parts.day)===day&&match)return new Date(time).toISOString().slice(0,10);
 }
 return null;
}
export function olamCivilToHebrew(civil:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(civil))return null;
 const d=new Date(civil+"T12:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==civil)return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-u-ca-hebrew",
  {timeZone:"America/New_York",year:"numeric",month:"long",day:"numeric"})
  .formatToParts(d).map(x=>[x.type,x.value]));
 return{year:Number(p.year),month:String(p.month),day:Number(p.day),
  weekday:olamWeekdays[d.getUTCDay()]};
}
/** Reuse Gavhah's existing Hebcal-based parsha source, not an approximate hand-built schedule. */
export async function olamParshaForCivilDay(civil:string):Promise<{name:string;shabbatDate:string}|null>{
 if(!olamCivilToHebrew(civil))return null;
 const day=new Date(civil+"T12:00:00Z"),sunday=day.getUTCDay(),shabbat=new Date(day.getTime()+(6-sunday)*86400000);
 const shabbatDate=shabbat.toISOString().slice(0,10);
 const query=new URL("https://www.hebcal.com/hebcal");
 query.searchParams.set("v","1");query.searchParams.set("cfg","json");
 query.searchParams.set("s","on");query.searchParams.set("i","off");
 query.searchParams.set("start",shabbatDate);query.searchParams.set("end",shabbatDate);
 const response=await fetch(query.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(7000)});
 if(!response.ok)return null;
 const info=await response.json() as {items?:Array<{category?:string;date?:string;title?:string;hebrew?:string}>};
 const parsha=(info.items||[]).find(x=>x.category==="parashat"&&x.date===shabbatDate);
 return parsha?{name:String(parsha.hebrew||parsha.title||""),shabbatDate}:null;
}
