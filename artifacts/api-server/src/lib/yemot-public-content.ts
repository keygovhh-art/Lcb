import { and, desc, eq, lte, or } from "drizzle-orm";
import { db, newsTable, charitiesTable } from "@workspace/db";

// These public read-only queries use the SAME canonical Gavhah records as the
// website. Phone calls never get cookies, private member data, or edit rights.
type News = { id:number; title:string; summary:string|null; content:string|null };
type Charity = { id:number; name:string; description:string; goalAmount:number; raisedAmount:number };
export async function publicPhoneNews():Promise<News[]>{
 const rows=await db.select({
   id:newsTable.id,title:newsTable.title,
   summary:newsTable.summary,content:newsTable.content
 }).from(newsTable).orderBy(desc(newsTable.createdAt)).limit(5);
 return rows;
}
export async function publicPhoneCharity():Promise<Charity[]>{
 const published=or(
   and(eq(charitiesTable.publicationState,"live"),eq(charitiesTable.isActive,true)),
   and(eq(charitiesTable.publicationState,"scheduled"),lte(charitiesTable.scheduledAt,new Date()))
 );
 const rows=await db.select({
   id:charitiesTable.id,name:charitiesTable.name,
   description:charitiesTable.description,goalAmount:charitiesTable.goalAmount,
   raisedAmount:charitiesTable.raisedAmount
 }).from(charitiesTable).where(published).orderBy(desc(charitiesTable.createdAt)).limit(5);
 return rows;
}

// Provider TTS on the test line is ENGLISH ONLY: do not send Yiddish/Hebrew,
// URLs, markup, or ampersand/control delimiters to TTS. The underlying records
// are not changed, translated or discarded.
export function speakEnglish(value:unknown,maxLength=230):string{
 const raw=String(value??"").replace(/<[^>]*>/g," ").replace(/https?:\/\/\S+/g," ");
 if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(raw))return "";
 return raw.replace(/[&=,\r\n;#]/g," ").replace(/[^\x20-\x7e]/g," ").replace(/\s+/g," ").trim().slice(0,maxLength);
}
export function voicePrompt(text:string):string{
 return "t-"+speakEnglish(text,490);
}
export function responseSpeak(text:string):string{
 return "id_list_message="+voicePrompt(text);
}
export function responseAsk(text:string,param:string,maxDigits=1):string{
 return "read="+voicePrompt(text)+"="+param+",no,"+maxDigits+",1,8,Digits,yes";
}
export function renderNewsMenu(items:News[]):string{
 if(!items.length)return responseSpeak("There are no public news updates yet.");
 const options=items.map((x,i)=>
  "Press "+(i+1)+" for update "+(i+1)+". "+
    (speakEnglish(x.title,70)||"This update has no English voice title yet")+".").join(" ");
 return responseAsk("The latest news updates. "+options,"newsItem",1);
}
export function renderSelectedNews(items:News[],pressed:unknown):string{
 if(!/^[1-5]$/.test(String(pressed??"")))return renderNewsMenu(items);
 const row=items[Number(pressed)-1];
 if(!row)return responseSpeak("That news update is not available.");
 const title=speakEnglish(row.title,120);
 const body=speakEnglish(row.summary||row.content,300);
 if(!title&&!body)return responseSpeak(
  "This update is available on the Gavhah website. English reading of its Yiddish text is not configured yet."
 );
 return responseSpeak((title||"News update")+". "+(body||"Full update is on the Gavhah website."));
}
export function renderCharityMenu(items:Charity[]):string{
 if(!items.length)return responseSpeak("There are no public fundraising campaigns at the moment.");
 return responseAsk("Public charity campaigns. "+items.map((x,i)=>
  "Press "+(i+1)+" for campaign "+(i+1)+". "+
  (speakEnglish(x.name,60)||"Campaign information")+".").join(" "),"charityItem",1);
}
export function renderSelectedCharity(items:Charity[],pressed:unknown):string{
 if(!/^[1-5]$/.test(String(pressed??"")))return renderCharityMenu(items);
 const row=items[Number(pressed)-1];
 if(!row)return responseSpeak("That campaign is no longer listed.");
 const title=speakEnglish(row.name,85)||"Charity campaign";
 const details=speakEnglish(row.description,235);
 const goal=Number(row.goalAmount);
 const raised=Number(row.raisedAmount);
 const totals=Number.isFinite(goal)&&Number.isFinite(raised)&&goal>=0&&raised>=0
   ?" Reported target "+goal+" dollars. Website reported raised amount "+raised+" dollars.":"";
 return responseSpeak(title+". "+(details||"English description is not available yet.")+totals+
  " This line does not process donations or store card details.");
}
