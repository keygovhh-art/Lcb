import {useEffect,useState} from "react";
import {Link} from "wouter";
import {useAuth} from "@/context/auth-context";
import {Layout} from "@/components/layout/layout";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

type OldRouteAudit={
 number:string;oldSystemExtension:string;state:string;
 oldProviderRouteVerified:boolean;existingVoiceUrlPresent:boolean;
 providerApi:string|null;oldCallHandler:string|null;
 providerApplicationPresent:boolean;checkedAt:string|null;reason:string|null;
 cutoverEnabled:boolean;providerRouteUnchanged:boolean;nextStep:string;
 stagedSharedIvrUrl:string;sharedIvrCodeReady:boolean;sharedIvrSigningKeyReady:boolean;livePhoneTestPassed:boolean
};
type VoiceSwitchPreview={
 number:string;voiceOnly:boolean;oldCallingResourceId:string;
 newCallingResourceId:string;callingAddressId:string;messagingResourceId:string|null;
 messagingAddressId:string;alreadySwitched:boolean;webhookPrepared:boolean;
};
type PhoneInventory={
 numbers:Array<{number:string;label:string;reserved:boolean;voiceAssigned:boolean;voiceCapable:boolean;canConsider:boolean;reason:string}>;
 complete:boolean;hasMore:boolean;readOnly:boolean;protectedNumber:string;
};
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
 const [inventory,setInventory]=useState<PhoneInventory|null>(null);
 const [oldRoute,setOldRoute]=useState<OldRouteAudit|null>(null);
 const [voiceSwitch,setVoiceSwitch]=useState<VoiceSwitchPreview|null>(null);
 const [inventoryLoading,setInventoryLoading]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function refresh(){
  const s=await request("status") as SignalWireStatus;
  setStatus(s);
  try{setOldRoute(await request("shared-route") as OldRouteAudit);}catch{}
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
  <section className="space-y-3 rounded-xl border p-3 sm:p-4" aria-label="8080 migration to Gavhah">
   <h3 className="font-semibold">+1 (605) 655-8080 — עולם החסד אויפן הויפט־מעניו</h3>
   <p className="text-sm">דער פלאן: עולם החסד זאל ווערן דער הויפט־מעניו, און די פריערדיגע סיסטעם
    זאל ארבעטן אונטער <strong>55555</strong>. דער אלטער סיסטעם־וועג ווערט נישט איבערגעשריבן
    ביז מיר האבן אים געפונען און אפגעהיטן.</p>
   {oldRoute&&<div className="text-sm rounded-lg bg-muted/30 p-3 space-y-1">
    <p>סטאטוס: <strong>{oldRoute.state==="not_found"?"דער נומער איז נישט אין דעם פארבונדענעם SignalWire־פראיעקט":
     oldRoute.state==="verified_compatibility_voice_url"?"דער עקזיסטירנדער וועבהוק איז אפגעהיטן":
     oldRoute.state==="unresolved"?"דער אלטער רופן־וועג איז נאכנישט קלאר":
     oldRoute.state==="failed"?"די פראוויידער־פראבע האט נישט מצליח געווען":
     "איבערקוקן דעם עקזיסטירנדן רופן־וועג"}</strong></p>
    <p>עקזיסטירנדער וועבהוק: <strong>{oldRoute.existingVoiceUrlPresent?"געפונען":"נאכנישט באשטעטיגט"}</strong></p>
    {oldRoute.providerApi&&<p>SignalWire API: <strong dir="ltr">{oldRoute.providerApi}</strong></p>}
    {oldRoute.oldCallHandler&&<p>אלטער Voice־וועג: <strong dir="ltr">{oldRoute.oldCallHandler}</strong></p>}

    <p>שוין איבערגעשטעלט: <strong>ניין — קיין רופן נישט געטוישט</strong></p>
    <p>55555־פארבינדונג־קאוד: <strong>{oldRoute.sharedIvrCodeReady?"צוגעגרייט אויף סערווער":"נאך נישט גרייט"}</strong></p>
    <p>SignalWire וועבהוק־Signing Key: <strong>{oldRoute.sharedIvrSigningKeyReady?"איינגעשטעלט":"פעלט נאך אויס"}</strong></p>
    <p>עכטער רופן־טעסט: <strong>{oldRoute.livePhoneTestPassed?"באשטעטיגט":"נאכנישט באשטעטיגט"}</strong></p>
    {oldRoute.sharedIvrCodeReady&&<p className="text-xs text-muted-foreground">
      דער נייער IVR־וועג איז בלויז צוגעגרייט; ער איז נישט אנגעשטעלט ביים SignalWire־נומער.
      דער אלטער וועבהוק און ריקארדירונגען בלייבן אומגערירט.
    </p>}
    {oldRoute.state==="not_found"&&
      <p role="alert">דער פארבונדענער Compatibility־דורכקוק האט דעם נומער נישט געפונען. מען דארף אויך איבערקוקן דעם SignalWire Native־רוטינג. עס קען ליגן
       אונטער א צווייטן SignalWire Space/Project. נוץ דערווייל נישט דעם באשטעטיגן־קנעפל פאר א לייוו־איבערשאלטונג.</p>}
    {oldRoute.checkedAt&&<p className="text-xs text-muted-foreground">לעצטע פראבע: <span dir="ltr">{new Date(oldRoute.checkedAt).toLocaleString("en-US")}</span></p>}
   </div>}
   <Button variant="outline" disabled={busy||!status.verified}
    onClick={()=>void work(async()=>{
      const v=await request("shared-route/recheck",{method:"POST",body:"{}"}) as OldRouteAudit;
      setOldRoute(v);
      setMessage(v.oldProviderRouteVerified?
       "דער עקזיסטירנדער רופן־וועג איז אפגעהיטן. קיין SignalWire־רוטינג איז נישט געטוישט.":
       "די פראבע האט נישט געקענט באשטעטיגן דעם אלטן רוטינג. די סיסטעם בלייבט אומגעענדערט.");
    })}>
    נאכקוקן און אפהיטן דעם אלטן 8080־רופן־וועג (נאר לייענען)
   </Button>
  </section>
  <section className="space-y-3 rounded-xl border p-3 sm:p-4" aria-label="Olam MAX SignalWire calling-only cutover">
   <h3 className="font-semibold">עולם החסד MAX — 605-655-8080 · נאר Voice</h3>
   <p className="text-sm">SignalWire איז בלויז עולם החסד־קאמיוניקאציע. דער גבהה־הויפטמעניו מיט 4444 בלייבט אויף ימות. דער נייע Calling־Handler ווערט געטעסט באזונדער; SMS און דער אלטער emes-newsroom־Handler בלייבן אומגערירט.</p>
   <div className="rounded-lg border p-3 space-y-2 text-sm">
    <p><strong>0. צוגרייטן דעם MAX־Calling־Handler.</strong> דער קנעפל קוקט ערשט צי דער ריכטיגער cXML־וועבהוק עקזיסטירט. נאר אויב ער פעלט, שאפט ער א נייעם אומפארבונדענעם Handler. ער טוישט נישט דעם נומער, SMS, אדער דעם אלטן Emes Newsroom.</p>
    <Button variant="outline" disabled={busy||!status.verified||!!oldRoute?.cutoverEnabled} onClick={()=>void work(async()=>{
     const result=await request("voice-switch/prepare",{method:"POST",body:"{}"}) as {prepared:boolean;created:boolean};
     setVoiceSwitch(null);
     setMessage(result.created?
      "דער עולם החסד MAX־Calling־Webhook איז געשאפן געווארן. קיין רופן זענען נישט איבערגעשטעלט. דרוק יעצט שריט 1 צו באשטעטיגן די גאנצע פארבינדונג.":
      "דער MAX־Webhook איז שוין ריכטיג צוגעגרייט. קיין פראוויידער־רוטינג איז נישט געטוישט. דרוק יעצט שריט 1.");
    })}>0. שאפן אדער באשטעטיגן דעם MAX־cXML Webhook</Button>
   </div>
   <Button variant="outline" disabled={busy||!status.verified} onClick={()=>void work(async()=>{
    const result=await request("voice-switch/preflight") as VoiceSwitchPreview;
    setVoiceSwitch(result);
    setMessage("דער סופער־עדמין־טעסט האט פארגליכן דעם אלטן Calling־Handler, דעם נייעם MAX־Webhook און דעם אפגעזונדערטן SMS־וועג. נאך קיין רוטינג איז נישט געטוישט.");
   })}>1. איבערקוקן דעם נייעם MAX־Voice־Handler (נאר לייענען)</Button>
   {voiceSwitch&&!voiceSwitch.alreadySwitched&&<div className="rounded-lg border p-3 text-sm space-y-2">
    <p><strong>Voice־רוטינג איז גרייט פאר איבערשטעלונג.</strong> דער פריערדיגער Handler איז אפגעהיטן פאר צוריקשטעלן.</p>
    <p>Calling Address: <span dir="ltr">{voiceSwitch.callingAddressId}</span></p>
    <p>SMS־Handler: <strong>בלייבט אומגעענדערט</strong>.</p>
    <p role="alert" className="text-amber-700">אכטונג: דער נומער וועט גלייך אויפהערן צו ניצן דעם emes-newsroom Voice־Handler. די רופן־טעסטן זענען נאך נישט פיזיש באשטעטיגט.</p>
    <Button disabled={busy} onClick={()=>{
      if(!window.confirm("באשטעטיגסטו צו איבערנעמען די אריינקומענדיגע רופן פון +1 605 655 8080 צום עולם החסד MAX־מעניו? דער אלטער emes-newsroom Voice־Handler וועט אפגעטיילט ווערן, SMS בלייבט אומגערירט. אויב דער טעסט־רוף פעלט אויס, נוץ דעם צוריקשטעלן־קנעפל."))return;
      void work(async()=>{
       const result=await request("voice-switch/apply",{method:"POST",body:JSON.stringify({
        confirm:"MOVE_6056558080_CALLING_ONLY",expectedCallingResourceId:voiceSwitch.oldCallingResourceId
       })});
       setVoiceSwitch(null);
       setMessage(result.switched?"SignalWire Voice איז איבערגעשטעלט צו עולם החסד MAX. רוף יעצט 605-655-8080 און פרוביר דעם מעניו. SMS איז אומגעענדערט.":"SignalWire האט נישט באשטעטיגט די איבערשטעלונג.");
      });
    }}>2. איבערשטעלן נאר Calling אויף MAX</Button>
   </div>}
   {(oldRoute?.cutoverEnabled)&&<div className="rounded-lg border p-3 space-y-2 text-sm">
    <p>Voice־איבערשטעלונג איז אנגעצייכנט אלס געשען. פרוביר א רוף. אויב MAX קען נישט אויפנעמען, קען מען צוריקשטעלן דעם אלטן Calling־Handler.</p>
    <Button variant="destructive" disabled={busy} onClick={()=>{
     if(!window.confirm("צוריקשטעלן דעם פריערדיגן emes-newsroom Calling־Handler? SMS בלייבט אומגערירט."))return;
     void work(async()=>{
      const value=await request("voice-switch/rollback",{method:"POST",body:JSON.stringify({confirm:"RESTORE_6056558080_CALLING_ONLY"})});
      setMessage(value.restored?"דער פריערדיגער emes-newsroom Voice־Handler איז צוריקגעשטעלט. SMS איז נישט געטוישט.":"נישט צוריקגעשטעלט.");
     });
    }}>צוריקשטעלן דעם אלטן Voice־Handler</Button>
   </div>}
  </section>
    <section className="space-y-3 rounded-xl border p-3 sm:p-4" aria-label="SignalWire phone number safety">
   <h3 className="font-semibold">SignalWire־נומערן — נישט טוישן אנדערע סיסטעמען</h3>
   <p className="text-sm text-muted-foreground">
    דער נומער <strong dir="ltr">+1 (605) 655-8080</strong> איז אפגעהיטן ביז מען קען פארבינדן די אלטע סיסטעם אויף 55555.
    די ליסטע לייענט נאר די נומערן; זי טוישט קיין Voice־וועבהוק און קויפט גארנישט.
   </p>
   <Button variant="outline" disabled={busy||inventoryLoading||!status.verified}
    onClick={()=>{setInventoryLoading(true);setError("");setInventory(null);
     void request("numbers").then(v=>setInventory(v as PhoneInventory))
      .catch(e=>setError(e instanceof Error?e.message:"נומערן־איבערבליק נישט באקומען"))
      .finally(()=>setInventoryLoading(false));}}>
    {inventoryLoading?"נומערן ווערן איבערגעקוקט...":"זען מיינע SignalWire־נומערן (נאר לייענען)"}
   </Button>
   {inventory&&<div className="space-y-2">
    <p className="text-xs text-muted-foreground">
     {inventory.numbers.length} נומערן איבערגעקוקט.
     {inventory.hasMore?" עס זענען פארהאן נאך נומערן; די ליסטע איז נישט פולשטענדיג.":""}
    </p>
    {inventory.numbers.map((n,i)=><div key={n.number+i} className="rounded-lg border p-3 space-y-1 text-sm">
     <strong dir="ltr" className="block">{n.number}</strong>
     <p>{n.label}</p>
     <p className={n.reserved||n.voiceAssigned?"text-red-700":"text-amber-700"}>
      {n.reserved?"אפגעהיטן — דארף א באזונדערע 55555־איבערפירונג":
       n.voiceAssigned?"פארנומען — עס איז שוין דא אן אנדער IVR/Voice־וועג":
       !n.voiceCapable?"קען נישט אננעמען Voice־רופן":
       "קוקט אויס נישט פארבונדן — מען מוז נאך איבערקוקן SignalWire Fabric"}
     </p>
     {n.canConsider&&<Button variant="outline" size="sm" disabled={busy||inventory.hasMore}
      onClick={()=>{
       if(!window.confirm("דער נומער קוקט אויס פריי אינעם Compatibility API, אבער אן אנדער SignalWire־וועג קען נאך זיין פארבונדן. באשטעטיגסטו אז דער נומער געהערט נישט צו אן אנדערער סיסטעם, און מיר זאלן אים נאר אויסקלייבן פאר פראבעס? עס וועט גארנישט טוישן ביים פראוויידער."))return;
       void work(async()=>{await fetch("/api/admin/hotline-migration/draft",{
        method:"POST",credentials:"include",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({providerKind:"signalwire",providerLabel:"SignalWire",candidateNumber:n.number})}
       ).then(async res=>{const value=await res.json().catch(()=>({}));
        if(!res.ok)throw new Error(value.error||"נישט געלונגען");
       });setMessage("דער נומער איז בלויז אויסגעקליבן פאר דער עולם־החסד־פראבע. קיין רופן זענען נישט אריבערגעפירט.");});
      }}>
      אויסקלייבן נאר פאר עולם־החסד־פראבעס
     </Button>}
    </div>)}
    {!inventory.numbers.length&&<p>קיין אייגענע SignalWire־נומערן זענען נישט געפונען אין דעם איבערגעקוקטן טייל.</p>}
   </div>}
  </section>
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
