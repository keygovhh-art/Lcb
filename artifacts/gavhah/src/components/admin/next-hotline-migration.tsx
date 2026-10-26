import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

type Plan={
 configured:boolean;providerKind:"signalwire"|"yemot"|"other"|null;
 providerLabel:string|null;candidateNumber:string|null;
 stage:string;endpoint:string|null;testingEnabled:boolean;signalwireSigningKeyReady:boolean;
 testedCalls:number;lastTestAt:string|null;productionLineUntouched:boolean;
 cutoverEnabled:boolean;stillToCheck:string[];whatRemainsOnGavhah:string[];
};
type Prepare=Plan&{entryKey?:string;callbackUrl:string;providerParameter?:string;instruction?:string};
const blank:Plan={configured:false,providerKind:null,providerLabel:null,
 candidateNumber:null,stage:"not_configured",endpoint:null,testingEnabled:false,signalwireSigningKeyReady:false,
 testedCalls:0,lastTestAt:null,productionLineUntouched:true,cutoverEnabled:false,
 stillToCheck:[],whatRemainsOnGavhah:[]};
async function api(action:string,options?:RequestInit){
 const r=await fetch("/api/admin/hotline-migration/"+action,{
  credentials:"include",cache:"no-store",...options,
  headers:{"Content-Type":"application/json",...(options?.headers||{})}
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||"דער פארלאנג איז נישט געלונגען");
 return data;
}
export function NextHotlineMigration(){
 const [plan,setPlan]=useState<Plan>(blank);
 const [providerKind,setProviderKind]=useState<"signalwire"|"yemot"|"other">("signalwire");
 const [providerLabel,setProviderLabel]=useState("SignalWire");
 const [candidateNumber,setCandidateNumber]=useState("");
 const [oneTime,setOneTime]=useState<Prepare|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [info,setInfo]=useState("");
 const [error,setError]=useState("");
 async function refresh(){
  const p=await api("status") as Plan;
  setPlan(p);
  setProviderKind(p.providerKind||"signalwire");
  setProviderLabel(p.providerLabel||"SignalWire");
  setCandidateNumber(p.candidateNumber||"");
  setLoading(false);
 }
 useEffect(()=>{void refresh().catch(e=>{setError(e.message);setLoading(false);});},[]);
 async function task(fn:()=>Promise<void>){
  setBusy(true);setError("");setInfo("");
  try{await fn();await refresh();}
  catch(e){setError(e instanceof Error?e.message:"אומבאקאנטער פעלער");}
  finally{setBusy(false);}
 }
 function save(){
  void task(async()=>{
   if(plan.stage==="testing"&&!window.confirm("דאס וועט בלויז אויסמעקן דעם נייעם פראבע־שליסל און פראבע־סטאטוס. דער אלטער האטליין בלייבט אומגערירט. ווייטער?"))return;
   setOneTime(null);
   await api("draft",{method:"POST",body:JSON.stringify({
    providerKind,providerLabel,candidateNumber,
    confirmReset:plan.stage==="testing"
   })});
   setInfo("דער נייער האטליין איז אפגעהיטן אלס באזונדערע צוגרייטונג. דער איצטיגער האטליין איז נישט געטוישט.");
  });
 }
 function prepare(){
  void task(async()=>{
   const rotate=plan.stage==="testing";
   if(rotate&&!window.confirm("שאפן א נייעם פראבע־שליסל? דער פריערדיגער נייער פראבע־שליסל וועט אויפהערן צו ארבעטן."))return;
   const data=await api("prepare-test",{method:"POST",body:JSON.stringify({confirmRotate:rotate})}) as Prepare;
   setOneTime(data);
   setInfo("די נייע פראבע־פארבינדונג איז גרייט. לייג אריין די אינפארמאציע בלויז אויפן נייעם נומער.");
  });
 }
 return <section dir="rtl" lang="yi" className="rounded-xl border bg-card p-4 sm:p-6 space-y-5">
  <div>
   <h2 className="font-bold text-xl">איבערפירן עולם החסד צו א נייעם האטליין</h2>
   <p className="text-sm text-muted-foreground mt-2">
    דער נייער נומער קען ארבעטן מיט די זעלבע מעמבערס, MAX, נייעס, אויפגאבן, און פונקציע־קאוד.
    דער אלטער האטליין בלייבט אנגעצונדן. דאס איז א צוגרייטונג און פראבע — נישט קיין לייוו־איבערשאלטונג.
   </p>
  </div>
  <div className="rounded-lg border p-3 text-sm space-y-1">
   <div>אלטער האטליין: <strong>אומגעענדערט</strong></div>
   <div>נייער האטליין: <strong>{plan.stage==="testing"?"פראבע־מאדוס":plan.stage==="draft"?"צוגעגרייט":"נאך נישט איינגעשטעלט"}</strong></div>
   <div>ערהאלטענע נייע פראבע־רופן: <strong>{plan.testedCalls}</strong></div>
   <div>לעצטע פראבע: <strong dir="ltr">{plan.lastTestAt?new Date(plan.lastTestAt).toLocaleString("en-US"):"נאך נישט"}</strong></div>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <label className="text-sm space-y-2">נייער פראוויידער
    <select className="flex h-10 w-full rounded-md border bg-background px-3" value={providerKind}
     onChange={e=>{const k=e.target.value as "signalwire"|"yemot"|"other";setProviderKind(k);setProviderLabel(k==="signalwire"?"SignalWire":k==="yemot"?"ימות המשיח":"");}}>
     <option value="signalwire">SignalWire — נייע פירמע</option>
     <option value="yemot">ימות המשיח — גלייכער API־טיפ</option>
     <option value="other">אנדערע האטליין־פירמע</option>
    </select>
   </label>
   <label className="text-sm space-y-2">פירמע־נאמען
    <Input value={providerLabel} onChange={e=>setProviderLabel(e.target.value)} maxLength={60}/>
   </label>
   <label className="text-sm space-y-2 sm:col-span-2">נייער טעלעפאן־נומער
    <Input type="tel" inputMode="numeric" dir="ltr" value={candidateNumber}
     onChange={e=>setCandidateNumber(e.target.value.replace(/[^0-9]/g,"").slice(0,15))}
     placeholder="דער נייער נומער — אויב שוין דא"/>
   </label>
  </div>
  <div className="flex flex-wrap gap-2">
   <Button disabled={loading||busy||!providerLabel.trim()} onClick={save}>
    אפהיטן נייער האטליין־פלאן
   </Button>
   <Button variant="outline" disabled={busy} onClick={()=>void task(async()=>{await refresh();setInfo("סטאטוס אויפגעפרישט.");})}>
    איבערקוקן פראבע־סטאטוס
   </Button>
  </div>
  {(plan.providerKind==="yemot"||plan.providerKind==="signalwire")&&plan.candidateNumber&&
   <div className="rounded-lg border p-3 space-y-3">
    <h3 className="font-semibold">באזונדערער {plan.providerKind==="signalwire"?"SignalWire":"ימות"}־פראבע־וועג</h3>
    <p className="text-sm text-muted-foreground">
     דער פראבע־וועג פארבינדט דעם נייעם נומער צום זעלבן גבהה־מעניו און Neon־דאטע.
     דער קנעפל שטעלט גארנישט אן ביים פראוויידער. מען דארף עס אריינלייגן ביים נייעם נומער זעלבסט.
    </p>
    {plan.providerKind==="signalwire"&&<p className="text-sm">
      SignalWire Signing Key אין Render: <strong>{plan.signalwireSigningKeyReady?"גרייט":"נאך פעלט"}</strong>.
      לייג אים בלויז אין גבהה'ס Render Environment אונטער <code>SIGNALWIRE_SIGNING_KEY</code>, נישט אינעם וועבסייט.
      דער פראבע־וועבּהוק ניצט cXML מיט <code>POST</code> און פארזיכערטע DTMF־קנעפלעך.
    </p>}
        <Button disabled={busy} variant="outline" onClick={prepare}>
     {plan.stage==="testing"?"באנייען פראבע־שליסל":"שאפן נייעם פראבע־שליסל"}
    </Button>
   </div>}
  {plan.providerKind==="other"&&<p className="text-sm text-muted-foreground">
   דער פלאן איז אפגעהיטן. פאר אן אנדער פראוויידער דארף מען אריינשטעלן יענעמ'ס API־פארמאט.
   ביז דאן קען מען נישט טענה'ן אז טעלעפאן־פראבעס זענען שוין פארבונדן.
  </p>}
  {oneTime&&<div className="rounded-lg border p-3 space-y-3">
    <p className="font-semibold">{oneTime.entryKey?"דער פראבע־שליסל ווערט געוויזן נאר יעצט. היט אים פריוואט.":"נייער SignalWire Callback — בלויז פארן נייעם נומער"}</p>
    <label className="block text-xs font-semibold">API Callback פארן נייעם נומער
     <textarea readOnly value={oneTime.callbackUrl} dir="ltr" rows={2}
      className="w-full mt-1 rounded-md border p-2 text-xs bg-background"/>
    </label>
    {oneTime.providerParameter&&<label className="block text-xs font-semibold">ימות־פאראמעטער: api_add_0
     <textarea readOnly value={oneTime.providerParameter} dir="ltr" rows={3}
      className="w-full mt-1 rounded-md border p-2 text-xs bg-background"/>
    </label>}
    <p className="text-sm">{plan.providerKind==="signalwire"
      ?"אויף דעם נייעם SignalWire־נומער שטעל א cXML־וועבּהוק מיט POST צום Callback. דער פארזיכערטער שליסל בלייבט אין Render. נישט אנרירן דעם אלטן ימות־נומער."
      :"צום נייעם ימות־נומער בלבד: type=api, api_url_post=yes. נישט איבערשרייבן דעם אלטן נומער אדער /0."}</p>
    <Button variant="outline" onClick={()=>setOneTime(null)}>באהאלטן דעם פראבע־שליסל</Button>
  </div>}
  <div className="space-y-2">
   <h3 className="font-semibold">וואס בלייבט אויף דער זעלבער גבהה־סיסטעם</h3>
   <ul className="list-disc list-inside text-sm space-y-1">
    {plan.whatRemainsOnGavhah.length?plan.whatRemainsOnGavhah.map(x=><li key={x}>{x}</li>):
      <li>די עקזיסטירנדע מעמבערס, MAX, נייעס, אויפגאבן, און דער גאנצער וועבסייט־Backend</li>}
   </ul>
  </div>
  <div className="space-y-2">
   <h3 className="font-semibold">וואס מוז מען נאך באשטעטיגן פארן אריבערגיין</h3>
   <ul className="list-disc list-inside text-sm space-y-1">
    {plan.stillToCheck.map(x=><li key={x}>{x}</li>)}
   </ul>
   <p className="text-xs text-muted-foreground">ריקארדירונגען ביים אלטן פראוויידער ווערן נישט אויטאמאטיש אריבערגעטראגן.</p>
  </div>
  {info&&<p role="status" className="text-sm text-green-700">{info}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
