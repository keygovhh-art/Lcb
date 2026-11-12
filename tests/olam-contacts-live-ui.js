
(function(){
"use strict";
const base="/api/member/olam-contacts",el=id=>document.getElementById(id);
const fields=[["name","נאמען"],["phone","טעלעפאן"],["postal_address","אדרעס"],["email","אימעיל"],["city","שטאט"],["organization","ארגאניזאציע"],["notes","נאטיץ"],["relationship_notes","קשרים"],["preferred_hours","באשטימטע צייטן"]];
const cats=[["all","אלע קאנטאקטן"],["eligible","מען קען שוין רופן"],["callbacks","צוריקצורופן פאר א נדבה"],["pledge_pending","נישט פולקאם באצאלטע התחייבותן"],["warm","ווארעמע קאנטאקטן"],["do_not_call","נישט רופן"],["missed","פארפאסטע אריינקומענדיגע קאלס"],["donations","געגעבן א נדבה"],["no_answer","נישט געענטפערט"],["not_interested","נישט אינטערעסירט"],["asked_no_more","בעט נישט מער רופן"],["pledges","צוגעזאגט"],["other","אנדערע"],["unreported","נישט אריינגעלייגט"],["spoke","גערעדט"]];
const labels={"":"נישט אריינגעלייגט",no_answer:"נישט געענטפערט",donation:"געגעבן א נדבה",pledge:"צוגעזאגט",callback:"צוריקצורופן",not_interested:"נישט אינטערעסירט",asked_no_more:"בעט נישט מער רופן",spoke:"גערעדט"};
let page=0,total=0,ref=null,current=null;
const notice=(text,error=false)=>{el("notice").textContent=text;el("notice").className=error?"warn":"";};
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;}
async function api(path,method="GET",payload){
 const options={method,credentials:"include",cache:"no-store"};
 if(payload!==undefined){options.headers={"Content-Type":"application/json"};options.body=JSON.stringify(payload);}
 const r=await fetch(base+path,options),raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data={error:"די סיסטעם האט נישט צוריקגעגעבן א גילטיגן באריכט"};}
 if(!r.ok)throw Error(data.error||("דער פארלאנג איז נישט געלונגען ("+r.status+")"));return data;
}
async function list(){
 const q=new URLSearchParams({category:el("category").value,sort:el("sort").value,page:String(page),limit:"30"});
 if(el("qphone").value.trim())q.set("phone",el("qphone").value.trim());
 if(el("qid").value.trim())q.set("contactId",el("qid").value.trim());
 const ds=el("ds").value;if(ds){q.set("dateSystem",ds);if(ds==="gregorian")q.set("callDate",el("gdate").value);else{q.set("hebrewDay",el("hday").value);q.set("hebrewMonth",el("hmonth").value);q.set("hebrewYear",el("hyear").value);}}
 const result=await api("/list?"+q.toString());total=result.total;el("count").textContent=total+" קאנטאקטן";
 const target=el("list");target.replaceChildren();
 for(const c of result.items){const b=node("button",undefined,"item"),title=node("strong","#"+c.contact_ref+" — "+(c.name||c.phone)),description=node("p",(c.name?c.phone+" · ":"")+(labels[c.current_outcome]||c.current_outcome||"נישט אריינגעלייגט")+(c.do_not_call?" · נישט רופן":""),"muted");b.type="button";b.append(title,description);b.addEventListener("click",()=>open(c.contact_ref));target.append(b);}
 if(!result.items.length)target.append(node("p","קיין קאנטאקטן נישט געפונען.","muted"));
 el("prev").disabled=page===0;el("next").disabled=(page+1)*30>=total;
}
async function open(number){
 ref=Number(number);const v=await api("/"+ref+"/history");current=v.contact;
 el("details").classList.remove("hidden");el("ctitle").textContent="קאנטאקט #"+ref+" — "+(current.name||"אן א נאמען");el("cphone").textContent=current.phone;
 const target=el("editfields");target.replaceChildren();
 for(const [field,label] of fields){const wrap=node("label",label),entry=document.createElement(field==="notes"?"textarea":"input");entry.name=field;entry.value=current[field]||"";if(field==="phone")entry.type="tel";wrap.append(entry);target.append(wrap);}
 el("permission").textContent=current.do_not_call?"ווידער ערלויבן צו רופן":"באשטעטיגן נישט מער רופן";
 const history=el("history");history.replaceChildren();
 for(const [i,e] of v.events.entries()){
  const box=node("div",undefined,"item"),line=node("strong",(i===0?"איצטיגער סטאטוס: ":"פריערדיגער סטאטוס: ")+(labels[e.outcome]||e.outcome||"נישט אריינגעלייגט")),when=node("p","","muted");const d=new Date(e.call_at);
  when.textContent=d.toLocaleDateString("yi-u-ca-hebrew",{timeZone:"America/New_York"})+" · "+d.toLocaleDateString("en-US",{timeZone:"America/New_York"})+" · "+(e.direction==="inbound"?"אריינקומענדיג":"ארויסגייענדיג");box.append(line,when);
  const det=e.details||{},report=det.report||{},purpose=node("p","צוועק: "+(e.purpose_type==="none"?"נישט אויסגעוועלט":e.purpose_type+" "+(e.purpose_key||"")),"muted");box.append(purpose);
  if(det.mood)box.append(node("p","שטימונג: "+det.mood));
  if(report.moneyKind&&report.moneyKind!=="none")box.append(node("p","פינאנציעל באריכט: "+report.moneyKind+" — $"+(report.amount??"נישט אנגעגעבן")));
  if(det.note)box.append(node("p","נאטיץ: "+det.note));history.append(box);
 }
 if(!v.events.length)history.append(node("p","קיין סטאטוסן נישט געפונען.","muted"));
 el("details").scrollIntoView({behavior:"smooth",block:"start"});
}
function guarded(fn){return async function(e){if(e)e.preventDefault();try{await fn(e);}catch(err){notice(err.message||"נישט געלונגען",true);}};}
for(const [k,v] of cats){const o=document.createElement("option");o.value=k;o.textContent=v;el("category").append(o);}
el("find").addEventListener("click",guarded(async()=>{page=0;await list();}));
el("clear").addEventListener("click",guarded(async()=>{for(const id of ["qphone","qid","gdate","hday","hmonth"])el(id).value="";el("ds").value="";page=0;await list();}));
el("prev").addEventListener("click",guarded(async()=>{if(page>0){page--;await list();}}));
el("next").addEventListener("click",guarded(async()=>{if((page+1)*30<total){page++;await list();}}));
el("close").addEventListener("click",()=>{el("details").classList.add("hidden");ref=null;});
el("add").addEventListener("submit",guarded(async e=>{const f=new FormData(e.target),r=await api("/create","POST",Object.fromEntries(f));notice("קאנטאקט אפגעהיטן");e.target.reset();await list();await open(r.contact.contact_ref);}));
el("edit").addEventListener("submit",guarded(async e=>{if(!ref)return;const f=new FormData(e.target);await api("/"+ref+"/update","POST",Object.fromEntries(f));notice("אינפארמאציע אפדעיטעד");await list();await open(ref);}));
el("permission").addEventListener("click",guarded(async()=>{if(!ref)return;const blocked=!current.do_not_call;if(!confirm(blocked?"באשטעטיגן אז מען זאל דעם מענטש נישט מער רופן?":"באשטעטיגן אז מען מעג ווידער רופן?"))return;await api("/"+ref+"/update","POST",{do_not_call:blocked,confirm:"CONFIRM_CALL_PERMISSION"});notice("רופן־ערלויבעניש אפדעיטעד");await list();await open(ref);}));
el("archive").addEventListener("click",guarded(async()=>{if(!ref||!confirm("נאר אויסנעמען דעם קאנטאקט פון דער ליסטע? אלע קאל־און פינאנציעלע היסטאריע בלייבן."))return;await api("/"+ref+"/archive","POST",{confirm:"ARCHIVE_CONTACT_ONLY"});notice("קאנטאקט ארויסגענומען; די היסטאריע בלייבט");el("details").classList.add("hidden");ref=null;await list();}));
el("cadence").addEventListener("submit",guarded(async e=>{if(!ref)return;const x=Object.fromEntries(new FormData(e.target));const payload={scope:x.scope,caseId:x.caseId||null,months:Number(x.months),nextAllowedAt:x.nextAllowedAt?new Date(x.nextAllowedAt).toISOString():null};await api("/"+ref+"/recontact","POST",payload);notice("דער צוריקצורופן־כלל איז אפגעהיטן; קיין אויטאמאטישע קאל");}));
list().catch(e=>notice(e.message,true));
})();
