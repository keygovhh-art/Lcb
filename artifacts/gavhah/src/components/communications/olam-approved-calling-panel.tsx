import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

type Purpose={id:number;title:string};
type CallRow={
 id:number;number_e164:string;provider:string;status:string;reporting_source?:string;
 outcome:string;mood:string;note:string;case_id:number|null;contact_id:number|null;
 report_details?:{moneyKind?:string;amount?:number|null;donationWarmth?:string;callbackAt?:string|null};
 created_at:string;duration_seconds?:number|null
};
type CallList={items:CallRow[]};
const statuses:Record<string,string>={
  "":"נישט אריינגעלייגט",donation:"געגעבן א נדבה",no_answer:"נישט געענטפערט",
  callback:"צוריקצורופן",pledge:"צוגעזאגט",spoke:"גערעדט",not_interested:"נישט אינטערעסירט",
  asked_no_more:"בעט נישט מער צו רופן",do_not_call:"נישט מער רופן",other:"אנדערע"
};
const warmthLabels:Record<string,string>={
 very_warm:"גאר ווארעם אויפגענומען",very_generous:"געגעבן גאר שיין",
 warm:"ווארעם אויפגענומען",generous:"געגעבן שיין"
};
const menu=[
 ["1","צו מאכן א קאל"],["2","סטאטיסטיקס פון אייגענעם קאל"],
 ["3","קאל־היסטאריע"],["4","לייג אריין א קאנטאקט"],["5","סקעדזשועלן א קאל"]
] as const;
async function callApi<T>(url:string,method="GET",body?:unknown):Promise<T>{
 const r=await fetch(url,{method,credentials:"include",cache:"no-store",
  ...(body===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
 const data:unknown=await r.json().catch(()=>({}));
 if(!r.ok){
  const o=data&&typeof data==="object"&&!Array.isArray(data)?data as Record<string,unknown>:{};
  const error=Object.assign(new Error(typeof o.error==="string"?o.error:"נישט געלונגען"),{
   code:r.status,requiresConfirmation:o.requiresConfirmation===true});
  throw error;
 }
 return data as T;
}
const base="/api/askanus/max/calling/approved";
function Details({call}:{call:CallRow}){
 const r=call.report_details||{};
 return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
  <div><dt className="text-muted-foreground">נומער</dt><dd dir="ltr">{call.number_e164}</dd></div>
  <div><dt className="text-muted-foreground">רעזולטאט</dt><dd>{statuses[call.outcome]||call.outcome}</dd></div>
  <div><dt className="text-muted-foreground">נדבה / התחייבות</dt><dd>{r.moneyKind==="donation"?"נדבה":r.moneyKind==="pledge"?"התחייבות":"נישט אריינגעלייגט"}</dd></div>
  <div><dt className="text-muted-foreground">סומע</dt><dd>{r.amount==null?"נישט אריינגעלייגט":"$"+Number(r.amount).toLocaleString()}</dd></div>
  <div><dt className="text-muted-foreground">באשרייבונג</dt><dd>{warmthLabels[r.donationWarmth||""]||"—"}</dd></div>
  <div><dt className="text-muted-foreground">צוריקצורופן</dt><dd>{r.callbackAt?new Date(r.callbackAt).toLocaleString():"—"}</dd></div>
  <div className="sm:col-span-2"><dt className="text-muted-foreground">נאטיץ</dt><dd className="whitespace-pre-wrap">{call.note||"נישט אריינגעלייגט"}</dd></div>
 </dl>;
}
export function OlamApprovedCallingPanel({cases,providerReady}:{cases:Purpose[];providerReady:boolean}){
 const [section,setSection]=useState<string>("1"),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const [history,setHistory]=useState<CallRow[]>([]),[selected,setSelected]=useState<number|null>(null);
 const [number,setNumber]=useState(""),[contactName,setContactName]=useState(""),[address,setAddress]=useState("");
 const [when,setWhen]=useState(""),[scheduled,setScheduled]=useState<Array<{id:number;title:string;phone_e164:string;due_at:string}>>([]);
 const [country,setCountry]=useState<"US"|"CA">("US");
 const [caseId,setCaseId]=useState<number|null>(null);
 const [outcome,setOutcome]=useState("no_answer"),[moneyKind,setMoneyKind]=useState("none");
 const [amount,setAmount]=useState(""),[warmth,setWarmth]=useState(""),[note,setNote]=useState("");
 const [mood,setMood]=useState("neutral"),[callbackAt,setCallbackAt]=useState("");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [editField,setEditField]=useState("outcome"),[editValue,setEditValue]=useState("");
 const [showStats,setShowStats]=useState(false);
 const load=useCallback(async()=>{
  try{
   const [h,s]=await Promise.all([
    callApi<CallList>(base+"/history"),
    callApi<{items:Array<{id:number;title:string;phone_e164:string;due_at:string}>}>(base+"/scheduled-due")
   ]);
   setHistory(h.items);setScheduled(s.items);
  }catch(e){setError(e instanceof Error?e.message:"פראבלעם ביים לאָדן");}
 },[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  void callApi<{lastUsedCaseId:number|null}>(base+"/context")
   .then(x=>setCaseId(x.lastUsedCaseId)).catch(()=>{});
 },[]);
 const act=async(fn:()=>Promise<void>)=>{
  setBusy(true);setError("");setMessage("");
  try{await fn();await load();}
  catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 const select=(n:string)=>{setSection(n);setError("");setMessage("");setSelected(null);setShowStats(false);};
 const call=history.find(x=>x.id===selected);
 const resultBody=()=>({
  caseId,country,number,outcome,moneyKind,amount:amount===""?null:Number(amount),
  donationWarmth:warmth,mood,note,
  callbackAt:callbackAt?new Date(callbackAt).toISOString():null
 });
 const saveManual=()=>act(async()=>{
  const r=await callApi<{duplicate:boolean;finance?:{financialRecorded:boolean;requiresPurpose?:boolean}}>(
   base+"/manual","POST",{...resultBody(),requestId});
  setRequestId(crypto.randomUUID());setMessage(r.duplicate
   ?"דער באריכט איז שוין אפגעהיטן; נישט דאפלט געציילט."
   :r.finance?.requiresPurpose?"באריכט אפגעהיטן. דער נדבה־סכום ווארט אויף א באשטעטיגטן צוועק."
   :"דער רוף־באריכט איז אפגעהיטן מיט מיין עסקנות.");
 });
 const saveContact=()=>act(async()=>{
  await callApi(base+"/contact","POST",{number,name:contactName,address});
  setContactName("");setAddress("");setMessage("קאנטאקט אפגעהיטן אין נדבן 360.");
 });
 const schedule=()=>act(async()=>{
  if(!when)throw Error("קלויב אויס א דאטום און צייט");
  const r=await callApi<{tishlVisibleAt:string}>(base+"/schedule","POST",{number,dueAt:new Date(when).toISOString()});
  setMessage("אריינגעלייגט אויפן טישל 25 מינוט פריער: "+new Date(r.tishlVisibleAt).toLocaleString());
 });
 const redial=(c:CallRow,confirmAskedNoMore=false)=>act(async()=>{
  try{
   const r=await callApi<{callInitiated?:boolean;prepared?:boolean;id?:number;newCallId?:number}>(base+"/history/"+c.id+"/redial","POST",
    {provider:providerReady?"signalwire":"yemot",confirmAskedNoMore});
   setMessage(r.callInitiated?"דער רוף איז ארויסגעשיקט צו SignalWire.":"דער נומער איז צוגעגרייט; ימות רופט נישט ארויס.");
  }catch(e){
   const er=e as Error&{requiresConfirmation?:boolean};
   if(er.requiresConfirmation&&!confirmAskedNoMore&&window.confirm("דער מענטש האט געבעטן נישט מער צו רופן. צי ווילסטו באשטעטיגן נאכאמאל?")){
    const r=await callApi<{callInitiated?:boolean}>(base+"/history/"+c.id+"/redial","POST",
     {provider:providerReady?"signalwire":"yemot",confirmAskedNoMore:true});
    setMessage(r.callInitiated?"SignalWire רופט.":"דער רוף איז בלויז צוגעגרייט.");return;
   }
   throw e;
  }
 });
 const edit=()=>act(async()=>{
  if(!call)throw Error("קלויב אויס א קאל");
  let v:unknown=editValue;
  if(editField==="caseId")v=editValue?Number(editValue):null;
  else if(editField==="amount")v=editValue?Number(editValue):null;
  else if(editField==="callbackAt")v=editValue?new Date(editValue).toISOString():null;
  await callApi(base+"/history/"+call.id,"PATCH",{[editField]:v});
  setMessage("דער אויסגעקליבענער פעלד איז פארראכטן.");setEditValue("");
 });
 const hide=()=>act(async()=>{
  if(!call||!window.confirm("אכטונג! אויסמעקן בלויז דעם אויסגעקליבענעם קאל־לאג? קאנטאקטן און באשטעטיגטע געלט־רעקארדס בלייבן."))return;
  await callApi(base+"/history/"+call.id,"DELETE",{confirm:"HIDE_THIS_CALL_ONLY"});
  setSelected(null);setMessage("דער איינציגער קאל־לאג איז אראפגענומען.");
 });
 const saveFromHistory=()=>act(async()=>{
  if(!call||!contactName.trim())throw Error("לייג אריין א נאמען");
  await callApi(base+"/history/"+call.id+"/contact","POST",{name:contactName,address});
  setMessage("נומער אפגעהיטן אין נדבן 360.");setContactName("");setAddress("");
 });
 return <section dir="rtl" lang="yi" className="border rounded-xl bg-card p-3 sm:p-4 space-y-4" aria-label="עולם החסד — קאלינג קנעפלעך">
  <h4 className="font-semibold">קאלינג־אפטיילונג — די פינף קנעפלעך</h4>
  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
   {menu.map(([key,title])=><Button key={key} size="sm" type="button"
      variant={section===key?"default":"outline"} className="h-auto min-h-12 whitespace-normal text-xs sm:text-sm"
      onClick={()=>select(key)}>{key} · {title}</Button>)}
  </div>
  {error&&<p role="alert" className="text-destructive text-sm">{error}</p>}
  {message&&<p role="status" className="text-sm">{message}</p>}
  {section==="1"&&<div className="space-y-2 text-sm">
   <p>די סיסטעם געדענקט דעם לעצט גענוצטן פראיעקט. מ'קען קלויבן אן אנדערן פראיעקט אדער א פארבונדענעם קאמפיין, אדער סקיפן.</p>
   <Button type="button" variant="outline" onClick={()=>
    document.getElementById("max-prepare-existing-call")?.scrollIntoView({behavior:"smooth",block:"start"})}>
    גיי צו אויסוואל און רופן
   </Button>
   <p className="text-muted-foreground">פאר צוגעטיילטע קאמפיין־רופן נוצט די עקזיסטירנדע קאמפיין־ליסטע דערנעבן.</p>
  </div>}
  {section==="2"&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void saveManual();}}>
   <p className="text-sm">א רוף פון דיין אייגענעם טעלעפאן — נישט א באשטעטיגטער SignalWire־קאל.</p>
   <label className="block text-sm">טעלעפאן־נומער<Input type="tel" required value={number} onChange={e=>setNumber(e.target.value)}/></label>
   <label className="block text-sm">לאנד<select className="w-full h-10 border rounded-lg bg-background" value={country}
     onChange={e=>setCountry(e.target.value as "US"|"CA")}><option value="US">USA</option><option value="CA">Canada</option></select></label>
   <label className="block text-sm">צוועק — מיין עסקנות<select className="w-full h-10 border rounded-lg bg-background" value={caseId??""}
     onChange={e=>setCaseId(e.target.value?Number(e.target.value):null)}>
     <option value="">אן א צוועק — שפעטער באשטימען</option>
     {cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
   </select></label>
   <label className="block text-sm">רעזולטאט<select className="w-full h-10 border rounded-lg bg-background" value={outcome} onChange={e=>setOutcome(e.target.value)}>
     {Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}
   </select></label>
   <label className="block text-sm">פינאנציעלע אינפארמאציע<select className="w-full h-10 border rounded-lg bg-background" value={moneyKind} onChange={e=>setMoneyKind(e.target.value)}>
     <option value="none">נישט אריינגעלייגט</option><option value="donation">באקומען א נדבה</option><option value="pledge">צוגעזאגט</option>
   </select></label>
   {moneyKind!=="none"&&<label className="block text-sm">סומע ($)<Input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
   {moneyKind==="donation"&&<label className="block text-sm">באשרייבונג<select className="w-full h-10 border rounded-lg bg-background" value={warmth} onChange={e=>setWarmth(e.target.value)}>
    <option value="">נישט אנגעגעבן</option>
    {Object.entries(warmthLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
   </select></label>}
   <label className="block text-sm">שטימונג<select className="w-full h-10 border rounded-lg bg-background" value={mood} onChange={e=>setMood(e.target.value)}>
     <option value="neutral">נייטראל</option><option value="friendly">פריינטליך</option>
     <option value="busy">פארנומען</option><option value="uninterested">נישט אינטערעסירט</option>
     <option value="uncomfortable">אומבאקוועם</option>
   </select></label>
   <label className="block text-sm">צוריקצורופן ווען?<Input type="datetime-local" value={callbackAt} onChange={e=>setCallbackAt(e.target.value)}/></label>
   <label className="block text-sm">נאטיץ<Textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2500}/></label>
   <Button type="submit" disabled={busy||!number.trim()}>אפהיטן די קאל־סטאטיסטיקס</Button>
  </form>}
  {section==="3"&&<div className="space-y-3">
    <p className="text-sm">קאל־היסטאריע — ניי צו אלט. אויף טעלעפאן דרוקט מען 1 בשעת'ן הערן דעם נומער אדער ביז 2 סעקונדעס דערנאך.</p>
    {!history.length&&<p className="text-muted-foreground text-sm">דערווייל קיין קאלס.</p>}
    <div className="max-h-72 overflow-y-auto space-y-1">
     {history.map(c=><button type="button" key={c.id} onClick={()=>{setSelected(c.id);setShowStats(false)}} className={"w-full text-right border rounded-lg p-2 text-sm "+(selected===c.id?"bg-muted":"")}>
      <span dir="ltr">{c.number_e164}</span> · {new Date(c.created_at).toLocaleString()} · {c.status==="prepared"?"נישט גערופן":statuses[c.outcome]||"נישט אריינגעלייגט"}
     </button>)}
    </div>
    {call&&<div className="border rounded-lg p-3 space-y-3">
     <p className="font-semibold" dir="ltr">{call.number_e164}</p>
     <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={()=>void redial(call)}>1 · רידייל</Button>
      <Button type="button" variant="outline" onClick={()=>setShowStats(s=>!s)}>2 · הער סטאטיסטיקס</Button>
      <Button type="button" variant="outline" onClick={()=>{setEditField("outcome");setEditValue("")}}>3 · לייג אריין</Button>
      <Button type="button" variant="outline" onClick={()=>setEditField("mood")}>4 · עדיט</Button>
      <Button type="button" variant="outline" onClick={()=>setEditField("contact")}>5 · סעיוו קאנטאקט</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={()=>void hide()}>6 · מעק דעם לאג</Button>
     </div>
     {showStats&&<Details call={call}/>}
     {editField==="contact"?<div className="space-y-2">
       <Input placeholder="נאמען" value={contactName} onChange={e=>setContactName(e.target.value)}/>
       <Input placeholder="אדרעס (אדער סקיפן)" value={address} onChange={e=>setAddress(e.target.value)}/>
       <Button type="button" onClick={()=>void saveFromHistory()} disabled={busy||!contactName.trim()}>אפהיטן קאנטאקט</Button>
      </div>:<div className="space-y-2">
       <label className="block text-sm">קלויב דעם פעלד<select value={editField} onChange={e=>{setEditField(e.target.value);setEditValue("")}} className="w-full border rounded-lg bg-background p-2">
        <option value="outcome">קאל־רעזולטאט</option><option value="mood">שטימונג</option>
        <option value="moneyKind">נדבה / התחייבות</option><option value="amount">סומע</option>
        <option value="donationWarmth">נדבה־באשרייבונג</option><option value="callbackAt">צוריקצורופן</option>
        <option value="caseId">צוועק</option><option value="note">נאטיץ</option>
       </select></label>
       {editField==="outcome"?<select className="w-full border rounded-lg p-2 bg-background" value={editValue} onChange={e=>setEditValue(e.target.value)}>
        <option value="">נישט אריינגעלייגט</option>
        {Object.entries(statuses).filter(([k])=>k).map(([key,label])=><option value={key} key={key}>{label}</option>)}
       </select>:editField==="mood"?<select className="w-full border rounded-lg p-2 bg-background" value={editValue} onChange={e=>setEditValue(e.target.value)}>
        <option value="">נישט אנגעגעבן</option><option value="friendly">פריינטליך</option><option value="neutral">נייטראל</option><option value="busy">פארנומען</option><option value="uninterested">נישט אינטערעסירט</option><option value="uncomfortable">אומבאקוועם</option>
       </select>:editField==="moneyKind"?<select className="w-full border rounded-lg p-2 bg-background" value={editValue} onChange={e=>setEditValue(e.target.value)}>
        <option value="none">נישט אריינגעלייגט</option><option value="donation">נדבה</option><option value="pledge">התחייבות</option>
       </select>:editField==="donationWarmth"?<select className="w-full border rounded-lg p-2 bg-background" value={editValue} onChange={e=>setEditValue(e.target.value)}>
        <option value="">נישט אנגעגעבן</option>{Object.entries(warmthLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
       </select>:editField==="caseId"?<select className="w-full border rounded-lg p-2 bg-background" value={editValue} onChange={e=>setEditValue(e.target.value)}>
        <option value="">אן א צוועק</option>{cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
       </select>:editField==="note"?<Textarea value={editValue} onChange={e=>setEditValue(e.target.value)}/>:<Input type={editField==="callbackAt"?"datetime-local":"number"} min="0" step={editField==="amount"?"0.01":undefined} value={editValue} onChange={e=>setEditValue(e.target.value)}/>}
       <Button type="button" disabled={busy} onClick={()=>void edit()}>אפהיטן דעם פעלד</Button>
      </div>}
    </div>}
   </div>}
  {section==="4"&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void saveContact();}}>
    <p className="text-sm">דירעקט אריינלייגן א קאנטאקט. די פארגעשריטענע פארוואלטונג בלייבט אין נדבן 360.</p>
    <label className="block text-sm">טעלעפאן־נומער<Input required type="tel" value={number} onChange={e=>setNumber(e.target.value)}/></label>
    <label className="block text-sm">נאמען<Input required value={contactName} onChange={e=>setContactName(e.target.value)}/></label>
    <label className="block text-sm">אדרעס (מען קען סקיפן)<Input value={address} onChange={e=>setAddress(e.target.value)}/></label>
    <Button type="submit" disabled={busy||!number.trim()||!contactName.trim()}>אפהיטן קאנטאקט</Button>
   </form>}
  {section==="5"&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void schedule();}}>
    <p className="text-sm">דאס איז בלויז א דערמאנונג — די סיסטעם וועט <strong>נישט</strong> אויטאמאטיש רופן.</p>
    <label className="block text-sm">טעלעפאן־נומער<Input required type="tel" value={number} onChange={e=>setNumber(e.target.value)}/></label>
    <label className="block text-sm">ווען צו רופן<Input required type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label>
    <Button type="submit" disabled={busy}>סקעדזשועלן פאר מיין טישל</Button>
    {scheduled.length>0&&<div className="space-y-1">{scheduled.map(x=><p key={x.id} className="text-sm border rounded-lg p-2">
      <span dir="ltr">{x.phone_e164}</span> · {new Date(x.due_at).toLocaleString()} · אויפן טישל 25 מינוט פריער
    </p>)}</div>}
   </form>}
 </section>;
}
