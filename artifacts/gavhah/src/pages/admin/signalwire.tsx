import {useEffect,useState} from "react";
import {Link} from "wouter";
import {useAuth} from "@/context/auth-context";
import {Layout} from "@/components/layout/layout";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

type SignalWireStatus={
 configured:boolean;spaceUrl:string|null;projectId:string|null;verified:boolean;
 lastVerifiedAt:string|null;lastTestAt:string|null;encryptionReady:boolean;
 oldYemotUntouched:boolean;cutoverEnabled:boolean;
};
const initial:SignalWireStatus={configured:false,spaceUrl:null,projectId:null,
 verified:false,lastVerifiedAt:null,lastTestAt:null,encryptionReady:false,
 oldYemotUntouched:true,cutoverEnabled:false};
async function request(action:string,options?:RequestInit){
 const r=await fetch("/api/admin/hotline-migration/signalwire/"+action,{
  credentials:"include",cache:"no-store",...options,
  headers:{"Content-Type":"application/json",...(options?.headers||{})}
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||"די פעולה איז נישט געלונגען");
 return data;
}
export function SignalWireCredentials(){
 const [status,setStatus]=useState<SignalWireStatus>(initial);
 const [spaceUrl,setSpaceUrl]=useState("");
 const [projectId,setProjectId]=useState("");
 const [apiToken,setApiToken]=useState("");
 const [showToken,setShowToken]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function refresh(){
  const s=await request("status") as SignalWireStatus;
  setStatus(s);
  setSpaceUrl(v=>v||s.spaceUrl||"");
  setProjectId(v=>v||s.projectId||"");
  setLoaded(true);
 }
 useEffect(()=>{void refresh().catch(e=>{setError(String(e.message||e));setLoaded(true);});},[]);
 async function work(task:()=>Promise<void>){
  setBusy(true);setError("");setMessage("");
  try{await task();await refresh();}
  catch(e){setError(e instanceof Error?e.message:"אומבאקאנטער פעלער");}
  finally{setBusy(false);}
 }
 return <section dir="rtl" lang="yi" className="rounded-2xl border bg-card p-4 sm:p-6 space-y-5 max-w-3xl">
  <div className="space-y-2">
   <h2 className="text-xl font-bold">SignalWire — API־פארבינדונג</h2>
   <p className="text-sm text-muted-foreground">
    דא לייגסטו אריין די SignalWire־פרטים בלויז איינמאל. דער API־טאקען ווערט ענקריפטירט
    און ווערט נישט ווידער ארויסגעוויזן. בלויז דער גבהה־סופער־עדמין האט צוטריט.
   </p>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm rounded-lg border p-3">
   <p>API־טאקען: <strong>{status.configured?"פארשפארט אפגעהיטן":"נאך נישט איינגעשטעלט"}</strong></p>
   <p>API־פארבינדונג: <strong>{status.verified?"באשטעטיגט":"נאכנישט באשטעטיגט"}</strong></p>
   <p>אלטער ימות־נומער: <strong>בלייבט אומגעענדערט</strong></p>
   <p>נייער האטליין: <strong>נאר צוגרייטונג/פראבע</strong></p>
  </div>
  {!status.encryptionReady&&loaded&&<p role="alert" className="text-sm text-red-700">
   דער סערווער־ענקריפציע־שליסל איז נישט גרייט. מען קען נאכנישט זיכער אפהיטן דעם טאקען.
  </p>}
  <form autoComplete="off" className="space-y-3" onSubmit={e=>{
   e.preventDefault();
   void work(async()=>{
    await request("connection",{method:"PUT",body:JSON.stringify({spaceUrl,projectId,apiToken})});
    setApiToken("");setShowToken(false);
    setMessage("SignalWire־פרטים זענען פארשפארט אפגעהיטן. דרוק יעצט ״פרובירן API־קשר״.");
   });
  }}>
   <label className="block space-y-1.5 text-sm">
    <strong>SignalWire Space URL</strong>
    <Input dir="ltr" type="text" inputMode="url" placeholder="example.signalwire.com"
     value={spaceUrl} onChange={e=>setSpaceUrl(e.target.value)}
     autoCapitalize="none" spellCheck={false} maxLength={100} required/>
   </label>
   <label className="block space-y-1.5 text-sm">
    <strong>Project ID</strong>
    <Input dir="ltr" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
     value={projectId} onChange={e=>setProjectId(e.target.value)}
     autoCapitalize="none" spellCheck={false} maxLength={36} required/>
   </label>
   <label className="block space-y-1.5 text-sm">
    <strong>API Token</strong>
    <Input dir="ltr" type={showToken?"text":"password"} placeholder="SignalWire API Token"
     value={apiToken} onChange={e=>setApiToken(e.target.value)}
     autoComplete="new-password" spellCheck={false} required minLength={12} maxLength={1024}/>
   </label>
   <div className="flex gap-2 flex-wrap">
    <Button type="button" variant="outline" size="sm" onClick={()=>setShowToken(v=>!v)}>
      {showToken?"באהאלטן דעם טאקען":"ווייז דעם טאקען בשעת אריינשרייבן"}
    </Button>
    <Button type="submit" disabled={busy||!loaded||!status.encryptionReady}>
      אפהיטן SignalWire API־טאקען
    </Button>
   </div>
  </form>
  <div className="space-y-2">
   <Button variant="outline" disabled={busy||!status.configured}
    onClick={()=>void work(async()=>{
     const result=await request("test",{method:"POST",body:"{}"});
     setMessage(result.connected?"SignalWire API־קשר איז באשטעטיגט! דער טעסט האט גארנישט געענדערט ביים פראוויידער.":"דער קשר איז נאכנישט באשטעטיגט.");
    })}>פרובירן API־קשר (נאר לייענען)</Button>
   {status.lastVerifiedAt&&<p className="text-xs text-muted-foreground">
    לעצטע סוקסעספולע API־פראבע: <span dir="ltr">{new Date(status.lastVerifiedAt).toLocaleString("en-US")}</span>
   </p>}
  </div>
  <p className="text-sm text-muted-foreground">
   הערה: די API־פרטים קענען טעסטן דעם SignalWire־חשבון. פארן נייעם טעלעפאן־וועבהוק
   דארף מען אויך דעם באזונדערן SignalWire Signing Key. דער טאקען אליין
   ברענגט נאכנישט אריבער די רופן.
  </p>
  <div className="flex gap-2 flex-wrap items-center">
   <Button variant="outline" size="sm" disabled={busy||!status.configured}
    onClick={()=>{
     if(!window.confirm("מעקן נאר דעם SignalWire API־טאקען? די אלטע ימות־פארבינדונג בלייבט."))
      return;
     void work(async()=>{
      await request("connection",{method:"DELETE",body:JSON.stringify({confirm:"REMOVE_SIGNALWIRE_TOKEN_ONLY"})});
      setApiToken("");setMessage("נאר דער SignalWire־טאקען איז אויסגעמעקט.");
     });
    }}>אויסמעקן בלויז SignalWire־טאקען</Button>
   <Link href="/founder">צוריק צום הויפט־עדמין</Link>
  </div>
  {message&&<p role="status" className="text-sm text-green-700">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
export default function SignalWireCredentialsPage(){
 const {user,isLoaded}=useAuth();
 return <Layout>
  <main dir="rtl" lang="yi" className="container mx-auto max-w-4xl p-4 sm:py-8">
   {!isLoaded?<p>מען קאָנטראָלירט דיין אדמין־צוטריט...</p>:
   !user?<div className="space-y-3"><h1 className="text-xl font-bold">SignalWire פארבינדונג</h1>
    <p>ביטע לאג זיך אריין אין דיין גבהה־אקאונט.</p><Link href="/login">אריינלאגן</Link></div>:
   user.role!=="super_admin"?<p role="alert">די אפטיילונג איז נאר פארן הויפט־אדמיניסטראטאר.</p>:
   <SignalWireCredentials/>}
  </main>
 </Layout>;
}
