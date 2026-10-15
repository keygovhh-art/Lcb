/** Reject non-existent dates (such as February 31), not just malformed strings. */
export function validCalendarDate(v:unknown):boolean {
  if(v===undefined||v===null||v==="")return true;
  if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const [y,m,d]=v.split("-").map(Number);
  if(y<1900||y>9999)return false;
  const t=new Date(Date.UTC(y,m-1,d));
  return t.getUTCFullYear()===y&&t.getUTCMonth()+1===m&&t.getUTCDate()===d;
}

export type RepeatRule="none"|"daily"|"weekly"|"monthly";
export const isRepeatRule=(v:unknown):v is RepeatRule=>
  v==="none"||v==="daily"||v==="weekly"||v==="monthly";

export function nextRepeatDate(original:string,rule:RepeatRule,anchor?:number|null){
  if(rule==="none")return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(original))return null;
  const [y,m,d]=original.split("-").map(Number);
  const date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==m||date.getUTCDate()!==d)return null;
  if(rule==="daily")date.setUTCDate(date.getUTCDate()+1);
  if(rule==="weekly")date.setUTCDate(date.getUTCDate()+7);
  if(rule==="monthly"){
    const nextMonth=m===12?1:m+1;
    const nextYear=m===12?y+1:y;
    const lastDay=new Date(Date.UTC(nextYear,nextMonth,0)).getUTCDate();
    const desiredDay=Math.min(31,Math.max(1,anchor??d));
    return [nextYear,String(nextMonth).padStart(2,"0"),String(Math.min(lastDay,desiredDay)).padStart(2,"0")].join("-");
  }
  return date.toISOString().slice(0,10);
}
