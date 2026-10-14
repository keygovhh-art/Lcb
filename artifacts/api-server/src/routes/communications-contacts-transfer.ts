import { Router } from "express";
import { db } from "@workspace/db";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { communicationContacts } from "@workspace/db/schema";
import { requireAuth, getSessionUserId } from "../middlewares/auth";

const router = Router();
const FIELDS = ["name","phone","email","notes","do_not_call"] as const;
const normalizePhone=(s:string)=>s.replace(/[^0-9]/g,"");
const normalizeEmail=(s:string)=>s.trim().toLowerCase();
const norm=(s:unknown,max:number)=>String(s??"").trim().slice(0,max);
// Proper RFC-4180 CSV, including quoted commas, new lines and escaped quotes.
function parseCsv(text:string):string[][]{
  const lines:string[][]=[]; let row:string[]=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'&&text[i+1]==='"'){cell+='"';i++;continue;}
      if(c==='"'){quoted=false;continue;}
      cell+=c;continue;
    }
    if(c==='"'){if(cell)throw Error("Misplaced quote in CSV");quoted=true;continue;}
    if(c===","){row.push(cell);cell="";continue;}
    if(c==="\r"||c==="\n"){
      if(c==="\r"&&text[i+1]==="\n")i++;
      row.push(cell);cell="";
      if(row.some(x=>x.trim()))lines.push(row);
      row=[];continue;
    }
    cell+=c;
  }
  if(quoted)throw Error("Unclosed CSV quote");
  row.push(cell);if(row.some(x=>x.trim()))lines.push(row);
  return lines;
}
const csvCell=(v:unknown)=>{
  let s=String(v??"");
  // Protect Excel and spreadsheet applications from CSV formula injection.
  if(/^[ \t]*[=+\-@\t\r]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
};
type ImportRow={line:number;name:string;phone:string;email:string;notes:string;doNotCall:boolean};
function parseRows(input:unknown):ImportRow[]{
  if(typeof input!=="string"||input.length>512000)throw Error("CSV must be text under 500 KB");
  const data=parseCsv(input.replace(/^\uFEFF/,""));
  if(data.length<2)throw Error("CSV needs a header and at least one row");
  if(data.length>501)throw Error("Import up to 500 contacts in one batch");
  const headings=data.shift()!.map(s=>s.trim().toLowerCase().replace(/\s+/g,"_"));
  if(!headings.includes("name"))throw Error('CSV must contain a "name" column');
  const rows:ImportRow[]=[];
  for(let i=0;i<data.length;i++){
    const cols=data[i];
    const v=(key:string)=>cols[headings.indexOf(key)]??"";
    const name=norm(v("name"),240);
    const phone=norm(v("phone"),80);
    const email=norm(v("email"),240).toLowerCase();
    if(!name||name.length>240)throw Error("Missing name on CSV line "+(i+2));
    if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>240))
      throw Error("Invalid email on CSV line "+(i+2));
    if(phone&&normalizePhone(phone).length<7)
      throw Error("Invalid phone on CSV line "+(i+2));
    // Name-only entries are valid: export/import must preserve such contacts.
    // They can only be de-duplicated by identical normalized name.
    rows.push({line:i+2,name,phone,email,notes:norm(v("notes"),4000),
      doNotCall:/^(true|1|yes)$/i.test(v("do_not_call").trim())});
  }
  return rows;
}
async function inspectImport(userId:number,rows:ImportRow[]){
  // Server-side compare is per owner. Unlike a client-only preview this also
  // checks duplicates throughout the entire existing address book.
  const phones=new Set<string>(),emails=new Set<string>(),nameOnly=new Set<string>();
  let last=0;
  for(;;){
    const page=await db.select({id:communicationContacts.id,name:communicationContacts.name,phone:communicationContacts.phone,
      email:communicationContacts.email}).from(communicationContacts)
      .where(and(eq(communicationContacts.userId,userId),gt(communicationContacts.id,last)))
      .orderBy(asc(communicationContacts.id)).limit(2000);
    if(!page.length)break;
    for(const record of page){
      const p=normalizePhone(record.phone);if(p)phones.add(p);
      const e=normalizeEmail(record.email);if(e)emails.add(e);
      if(!p&&!e)nameOnly.add(record.name.trim().toLocaleLowerCase());
    }
    last=page[page.length-1].id;
    if(page.length<2000)break;
  }
  const imported:ImportRow[]=[],skipped:Array<{line:number;reason:string}>=[];
  for(const r of rows){
    const p=normalizePhone(r.phone),e=normalizeEmail(r.email);
    if((p&&phones.has(p))||(e&&emails.has(e))||(!p&&!e&&nameOnly.has(r.name.toLocaleLowerCase()))){
      skipped.push({line:r.line,reason:"Existing contact or repeated entry"});continue;
    }
    if(p)phones.add(p);if(e)emails.add(e);
    if(!p&&!e)nameOnly.add(r.name.toLocaleLowerCase());
    imported.push(r);
  }
  return {imported,skipped};
}

router.post("/askanus/contacts/import-preview",requireAuth,async(req,res)=>{
  try{
    const rows=parseRows(req.body?.csv);
    const result=await inspectImport(getSessionUserId(req)!,rows);
    res.setHeader("Cache-Control","private, no-store");
    res.json({total:rows.length,ready:result.imported.length,duplicates:result.skipped.length,
      preview:result.imported.slice(0,10).map(r=>({line:r.line,name:r.name,phone:r.phone,email:r.email,doNotCall:r.doNotCall})),
      skipped:result.skipped.slice(0,20)});
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:"Invalid CSV"});}
});
router.post("/askanus/contacts/import",requireAuth,async(req,res)=>{
  if(req.body?.confirm!==true){res.status(400).json({error:"Please preview and explicitly confirm the import"});return;}
  let rows:ImportRow[];
  try{rows=parseRows(req.body?.csv);}catch(e){
    res.status(400).json({error:e instanceof Error?e.message:"Invalid CSV"});return;
  }
  const userId=getSessionUserId(req)!;
  // Serialize member imports so two parallel import requests cannot both
  // insert the same records after checking the same old contact list.
  const result=await db.transaction(async tx=>{
    await tx.execute(/* member-scoped advisory lock */ 
      sql.raw('SELECT pg_advisory_xact_lock(843122, '+userId+')'));
    // Read from tx so the duplicate check sees committed rows after the lock;
    // repeat verification immediately before writing in this transaction.
    const current=await tx.select({id:communicationContacts.id,name:communicationContacts.name,phone:communicationContacts.phone,
      email:communicationContacts.email}).from(communicationContacts)
      .where(eq(communicationContacts.userId,userId));
    const phoneKeys=new Set(current.map(r=>normalizePhone(r.phone)).filter(Boolean));
    const emailKeys=new Set(current.map(r=>normalizeEmail(r.email)).filter(Boolean));
    const nameOnlyKeys=new Set(current.filter(r=>!normalizePhone(r.phone)&&!normalizeEmail(r.email))
      .map(r=>r.name.trim().toLocaleLowerCase()));
    const toSave:ImportRow[]=[];
    for(const r of rows){
      const p=normalizePhone(r.phone),e=normalizeEmail(r.email);
      if((p&&phoneKeys.has(p))||(e&&emailKeys.has(e))||(!p&&!e&&nameOnlyKeys.has(r.name.toLocaleLowerCase())))continue;
      if(p)phoneKeys.add(p);if(e)emailKeys.add(e);
      if(!p&&!e)nameOnlyKeys.add(r.name.toLocaleLowerCase());
      toSave.push(r);
    }
    if(toSave.length){
      await tx.insert(communicationContacts).values(toSave.map(r=>({
        userId,name:r.name,phone:r.phone,email:r.email,notes:r.notes,doNotCall:r.doNotCall,
        optOutReason:r.doNotCall?"Imported do-not-call flag":"",
      })));
    }
    return {total:rows.length,imported:toSave.length,skipped:rows.length-toSave.length};
  });
  res.setHeader("Cache-Control","private, no-store");
  res.status(201).json(result);
});
router.get("/askanus/contacts/export.csv",requireAuth,async(req,res)=>{
  const userId=getSessionUserId(req)!;
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",'attachment; filename="gavhah-private-contacts.csv"');
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.write("\uFEFF"+FIELDS.join(",")+"\r\n");
  let last=0;
  for(;;){
    const page=await db.select().from(communicationContacts)
      .where(and(eq(communicationContacts.userId,userId),gt(communicationContacts.id,last)))
      .orderBy(asc(communicationContacts.id)).limit(1000);
    if(!page.length)break;
    for(const r of page){
      res.write([r.name,r.phone,r.email,r.notes,r.doNotCall?"true":"false"].map(csvCell).join(",")+"\r\n");
    }
    last=page[page.length-1].id;
    if(page.length<1000)break;
  }
  res.end();
});
export default router;
