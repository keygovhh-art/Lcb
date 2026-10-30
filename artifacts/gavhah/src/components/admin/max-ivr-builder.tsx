import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {MaxVoiceStudio} from "./max-voice-studio";

type Action="submenu"|"read_message"|"builtin"|"repeat"|"back"|"hangup";
type Node={path:string;title:string;guide:string;voice_preset:string;timeout_seconds:number;revision:number};
type MenuButton={path:string;digit:string;action:Action;label:string;message:string;target:string};
type Source={nodes:Node[];buttons:MenuButton[];live:boolean;
 actions:Action[];builtins:string[];voices:string[];phoneEditorExtension:string};
const endpoint="/api/admin/max/ivr-editor";
const pathValid=(s:string)=>s==="root"||(/^[1-9]\d{0,11}$/.test(s)&&
 !["55555","4444","8899"].some(p=>s===p||s.startsWith(p)));
const defaults=[["root","הויפט מעניו"],["1","מיין טישל"],["2","רופן און קאמיוניקאציע"],
 ["3","מענטשן און נדבנים"],["4","פראיעקטן און צילן"],["5","פינאנצן און באריכטן"]];
const actions:{id:Action;label:string}[]=[
 {id:"submenu",label:"נייער אונטער־מעניו"},
 {id:"read_message",label:"שפילן אן אנזאג"},
 {id:"builtin",label:"עקזיסטירנדע עסקנות־פונקציע"},
 {id:"repeat",label:"איבערהערן דעם מעניו"},
 {id:"back",label:"צוריק צום פריערדיגן מעניו"},
 {id:"hangup",label:"פארמאכן דעם רוף"}
];
const builtinNames:Record<string,string>={
 my_tishl:"מיין טישל",donor_360:"Donor 360",call_reports:"רוף־באריכטן",
 projects:"פראיעקטן",finance:"פינאנצן",followups:"נאכפאלגן",account:"מיין חשבון"
};
const voiceNames:Record<string,string>={original:"אריגינעל",deep:"טיף",bright:"העל",
 radio:"ראדיא",warm:"ווארעם",soft:"ווייך"};
async function api(path="",init?:RequestInit){
 const res=await fetch(endpoint+path,{credentials:"include",cache:"no-store",...init,
  headers:{"Content-Type":"application/json",...(init?.headers||{})}});
 const d=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(d.error||"די אקציע איז נישט דורכגעגאנגען");
 return d;
}
const blank=(digit:string):MenuButton=>({path:"root",digit,action:"submenu",label:"",message:"",target:""});
export function MaxIvrBuilder(){
 const [data,setData]=useState<Source|null>(null);
 const [selected,setSelected]=useState("root"),[newPath,setNewPath]=useState("");
 const [nodeTitle,setNodeTitle]=useState(""),[guide,setGuide]=useState("");
 const [voice,setVoice]=useState("original"),[timeout,setTimeoutValue]=useState(8);
 const [digit,setDigit]=useState("1"),[config,setConfig]=useState<MenuButton>(blank("1"));
 const [phoneCode,setPhoneCode]=useState(""),[busy,setBusy]=useState(false);
 const [msg,setMsg]=useState(""),[error,setError]=useState("");
 const refresh=useCallback(async()=>{setData(await api() as Source);},[]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
 useEffect(()=>{
  const n=data?.nodes.find(x=>x.path===selected);
  setNodeTitle(n?.title||defaults.find(x=>x[0]===selected)?.[1]||"");
  setGuide(n?.guide||"");
  setVoice(n?.voice_preset||"original");
  setTimeoutValue(n?.timeout_seconds||8);
 },[selected,data?.nodes]);
 useEffect(()=>{
  const existing=data?.buttons.find(x=>x.path===selected&&x.digit===digit);
  setConfig(existing||{...blank(digit),path:selected,target:(selected==="root"?"":selected)+digit});
 },[selected,digit,data?.buttons]);
 const work=async(fn:()=>Promise<void>)=>{
  try{setBusy(true);setError("");setMsg("");await fn();}
  catch(e){setError(e instanceof Error?e.message:"פארלאנג נישט געלונגען");}
  finally{setBusy(false);}
 };
 const saveNode=()=>void work(async()=>{
  await api("/"+selected,{method:"PUT",body:JSON.stringify({
   title:nodeTitle,guide,voicePreset:voice,timeoutSeconds:timeout})});
  await refresh();setMsg("דער גאנצער עקסטענשאן איז אפגעהיטן אלס Draft.");
 });
 const saveButton=()=>void work(async()=>{
  const target=config.action==="submenu"?(selected==="root"?"":selected)+digit:
   config.action==="builtin"?config.target:"";
  await api("/"+selected+"/buttons/"+digit,{method:"PUT",body:JSON.stringify({
   ...config,target
  })});
  await refresh();setMsg("דער קנעפל איז אפגעהיטן אינעם Draft. די לייוו־ליניע איז נישט געטוישט.");
 });
 const eraseButton=()=>void work(async()=>{
  if(!window.confirm("מעקן בלויז דעם נישט־פובליצירטן קנעפל־Draft?"))return;
  await api("/"+selected+"/buttons/"+digit,{method:"DELETE"});
  await refresh();setMsg("נאר דער טיוטע־קנעפל איז אויסגעמעקט; דער לייוו מעניו איז אומגעענדערט.");
 });
 const issueCode=()=>void work(async()=>{
  const result=await api("/phone-code",{method:"POST",body:"{}"});
  setPhoneCode(result.code);setMsg("דער קאָד איז גילטיג פאר פינף מינוט, נאר איין מאל.");
 });
 const paths=[...new Set([...defaults.map(x=>x[0]),...(data?.nodes||[]).map(x=>x.path),
  ...(data?.buttons||[]).flatMap(x=>x.action==="submenu"?[x.target]:[])])]
  .filter(pathValid).sort((a,b)=>a==="root"?-1:b==="root"?1:a.length-b.length||a.localeCompare(b));
 const change=(key:keyof MenuButton,value:string)=>setConfig(old=>({...old,[key]:value}));
 return <div dir="rtl" className="space-y-6">
  <section className="space-y-4 rounded-lg border p-4">
   <h2 className="text-xl font-bold">האטליין IVR־בויער — אלע עקסטענשאנס</h2>
   <p className="text-sm text-muted-foreground">איין עדיטאר פאר מעניוס, קנעפלעך, אקציעס, TTS, רעקארדירונגען און קול־אויסשטעל. אייער גאנצער בנין ווערט אפגעהיטן אין Neon. קיין עקזיסטירנדע מעניו ווערט נישט געטוישט דורך די טיוטעס.</p>
   <p role="status" className="rounded border p-2 text-sm">דאס איז א טעסט־בויער, נישט קיין לייוו־פובליצירונג. דער טעלעפאן־עדיטאר אונטער 8899 איז נאך נישט צוגעשטעלט אויפן עכטן נומער.</p>
   <div className="space-y-1">
    <label className="text-sm font-medium">וועלכן עקסטענשאן ווילסטו רעדאגירן?</label>
    <select className="w-full rounded border bg-background p-2" value={selected}
     onChange={e=>{setSelected(e.target.value);setDigit("1");}}>
     {paths.map(p=><option key={p} value={p}>{p==="root"?"הויפט מעניו":p} — {data?.nodes.find(n=>n.path===p)?.title||defaults.find(x=>x[0]===p)?.[1]||"אונטער־מעניו"}</option>)}
     {!paths.includes(selected)&&<option value={selected}>{selected} — נייע עקסטענשאן</option>}
    </select>
    <div className="flex gap-2">
     <Input dir="ltr" inputMode="numeric" maxLength={12} placeholder="למשל 321" value={newPath}
      onChange={e=>setNewPath(e.target.value)}/>
     <Button variant="outline" disabled={!pathValid(newPath)} onClick={()=>{
      setSelected(newPath);setNewPath("");setDigit("1");}}>עפענען עקסטענשאן</Button>
    </div>
    <p className="text-xs text-muted-foreground">4444, 55555 און 8899 זענען באשיצטע עקסטענשאנס; מען קען זיי נישט איבערשרייבן.</p>
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    <div><label className="text-sm font-medium">נאמען פונעם מעניו</label>
     <Input maxLength={130} value={nodeTitle} onChange={e=>setNodeTitle(e.target.value)}/></div>
    <div><label className="text-sm font-medium">שטימע־אויסשטעל</label>
     <select className="w-full rounded border bg-background p-2" value={voice} onChange={e=>setVoice(e.target.value)}>
      {(data?.voices||Object.keys(voiceNames)).map(v=><option value={v} key={v}>{voiceNames[v]||v}</option>)}
     </select></div>
    <div><label className="text-sm font-medium">וויפיל סעקונדעס ווארטן פאר א קנעפל</label>
     <Input type="number" min={3} max={30} value={timeout} onChange={e=>setTimeoutValue(Number(e.target.value))}/></div>
   </div>
   <div><label className="text-sm font-medium">גענויע אנזאג און אינסטרוקציעס</label>
    <Textarea rows={3} maxLength={1200} value={guide} onChange={e=>setGuide(e.target.value)}
     placeholder="וואס די האטליין זאל זאגן אויף דער עקסטענשאן…" dir="rtl"/></div>
   <Button disabled={busy} onClick={saveNode}>היטן עקסטענשאן־איינשטעלונגען</Button>
  </section>
  <section className="space-y-4 rounded-lg border p-4">
   <h3 className="text-lg font-semibold">יעדער קנעפל — אייגענע פונקציע</h3>
   <div className="grid grid-cols-3 gap-2">
    {Array.from({length:9},(_,i)=>String(i+1)).map(d=>{
     const b=data?.buttons.find(x=>x.path===selected&&x.digit===d);
     return <Button key={d} variant={digit===d?"default":"outline"} className="h-auto min-h-14 flex-col"
      onClick={()=>setDigit(d)}><span className="text-lg">{d}</span>
       <span className="text-xs truncate max-w-full">{b?.label||"נישט איינגעשטעלט"}</span>
      </Button>;
    })}
   </div>
   <p className="text-xs text-muted-foreground">0 בלייבט צוריק/איבערהערן לויטן אריגינעלן סיסטעם; 55555 ווערט קיינמאל נישט בארירט.</p>
   <div className="space-y-2">
    <h4 className="font-semibold">קנעפל {digit}</h4>
    <label className="text-sm">דער נאמען פונעם קנעפל</label>
    <Input maxLength={130} value={config.label} onChange={e=>change("label",e.target.value)}/>
    <label className="text-sm">וואס זאל דעם קנעפל טון?</label>
    <select className="w-full rounded border bg-background p-2" value={config.action}
     onChange={e=>change("action",e.target.value)}>
     {actions.map(a=><option value={a.id} key={a.id}>{a.label}</option>)}
    </select>
    {config.action==="submenu"&&<div className="rounded border p-3 text-sm">
     <p>דער קנעפל וועט עפענען אונטער־עקסטענשאן <b dir="ltr">{(selected==="root"?"":selected)+digit}</b>.</p>
     <Button variant="outline" size="sm" onClick={()=>{
      setSelected((selected==="root"?"":selected)+digit);setDigit("1");}}>עפענען דעם אונטער־מעניו</Button>
    </div>}
    {config.action==="builtin"&&<>
     <label className="text-sm">עקזיסטירנדע עסקנות־פונקציע</label>
     <select className="w-full rounded border bg-background p-2" value={config.target}
      onChange={e=>change("target",e.target.value)}>
      <option value="">קלויבט אויס…</option>
      {Object.keys(builtinNames).map(x=><option key={x} value={x}>{builtinNames[x]}</option>)}
     </select>
    </>}
    <label className="text-sm">אנזאג אויף דעם קנעפל</label>
    <Textarea rows={3} maxLength={900} value={config.message}
     onChange={e=>change("message",e.target.value)}
     placeholder="אנזאג אדער דערקלערונג ביים דרוקן דעם קנעפל"/>
    <div className="flex flex-wrap gap-2">
     <Button onClick={saveButton} disabled={busy||(config.action==="builtin"&&!config.target)}>💾 היטן קנעפל {digit}</Button>
     {data?.buttons.some(x=>x.path===selected&&x.digit===digit)&&
      <Button variant="outline" disabled={busy} onClick={eraseButton}>מעקן דעם טיוטע־קנעפל</Button>}
    </div>
   </div>
  </section>
  <section className="space-y-3 rounded-lg border p-4">
   <h3 className="font-semibold">עדיטן די האטליין פונעם טעלעפאן זעלבסט</h3>
   <p className="text-sm">איינמאל דער באשיצטער עדיטאר ווערט באשטעטיגט אויפן ליין, גייט מען צו עקסטענשאן <b>8899</b>. פארן אריינגיין דארף מען א נייעם, איין־מאליגן קאָד פונעם וועבסייט. מען קען דאן אויסקלויבן אן עקסטענשאן, טוישן קנעפלעך און שטימע־אויסשטעלונגען.</p>
   <Button disabled={busy} variant="outline" onClick={issueCode}>באקומען א נייעם 8־ציפעריגן טעלעפאן־קאָד</Button>
   {phoneCode&&<p className="rounded bg-muted p-3 text-2xl tracking-widest font-bold text-center" dir="ltr">{phoneCode}</p>}
   <p className="text-xs text-muted-foreground">דער טעלעפאן־עדיטאר טוישט נאר טיוטעס; נישט קיין לייוו־מעניוס. מ'האט נאכנישט אנגעשטעלט דעם עכטן SignalWire־רוטינג דערצו.</p>
  </section>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {msg&&<p role="status" className="text-sm">{msg}</p>}
  <MaxVoiceStudio initialPath={selected}/>
 </div>;
}
