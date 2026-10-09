import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Handshake, Mail, Phone, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";

type ContactPoint = {method:"phone"|"email"|"sms";value:string};
type Stage = "new"|"invited"|"needs_reapproval"|"awaiting_staff_release"|"accepted"|"contact_problem"|
  "consent_revoked"|"declined"|"connected"|"closed_unfulfilled";
type Connection = {
  id:number;stage:Stage;role:"requester"|"volunteer";createdAt:string;subject:string;
  volunteerName:string;requesterName:string;
  myApproved:boolean;otherApproved:boolean;finalStaffApproved:boolean;myContact:ContactPoint|null;needsMyContact:boolean;
  contact:string|null;contactMethod:ContactPoint["method"]|null;backupAvailable:boolean;
  contactIssue:string|null;closureReason:string|null;phoneNotices:string;policy:string;
};
const LABELS:Record<Stage,[string,string]>={
  new:["ווארט אויף דער מערכת","Awaiting Gavhah review"],
  invited:["ביידע מוזן מסכים זיין","Both must give permission"],
  needs_reapproval:["נייע רשות נויטיג","Fresh approval required"],
  awaiting_staff_release:["ווארט אויף לעצטע רשות פון גבהה","Awaiting final Gavhah authorization"],
  accepted:["ביידע האבן מסכים געווען","Both approved — contact available"],
  contact_problem:["דער פאל איז צוריק ביי דער מערכת","Contact problem — staff review"],
  consent_revoked:["רשות צוריקגענומען","Permission withdrawn"],
  declined:["די פארבינדונג אפגעזאגט","Introduction declined"],
  connected:["פארבינדונג באשטעטיגט","Real contact confirmed"],
  closed_unfulfilled:["נישט געלונגען","Closed as unsuccessful"],
};
const WAY:Record<ContactPoint["method"],[string,string]>={
  phone:["טעלעפאן־רוף","Phone call"],email:["אימעיל","Email"],sms:["טעקסט־מעסעדזש","Text message"],
};
const urlFor=(method:ContactPoint["method"],value:string)=>{
  if(method==="email")return "mailto:"+value;
  const n=value.replace(/[^\d+]/g,"");
  return (method==="sms"?"sms:":"tel:")+n;
};
export default function ConnectionsPage(){
  const {isAuthenticated,isLoaded}=useAuth(),{lang}=useLanguage(),yi=lang==="yi";
  const {toast}=useToast();
  const [items,setItems]=useState<Connection[]>([]);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState<number|null>(null);
  const [agreed,setAgreed]=useState<Record<number,boolean>>({});
  const [disclose,setDisclose]=useState<Record<number,boolean>>({});
  const [problemText,setProblemText]=useState<Record<number,string>>({});
  const load=useCallback(async()=>{
    if(!isAuthenticated){setLoading(false);return;}
    setLoading(true);
    try{
      const r=await fetch("/api/member-connections/mine",{credentials:"include",cache:"no-store"});
      if(!r.ok)throw Error("Could not load member connections");
      setItems(await r.json());
    }catch(e){toast({title:yi?"נישט געקענט לאדן פארבינדונגען":"Could not load connections",
      description:e instanceof Error?e.message:undefined,variant:"destructive"});}
    finally{setLoading(false);}
  },[isAuthenticated,yi,toast]);
  useEffect(()=>{if(isLoaded)void load();},[isLoaded,load]);
  const action=async(item:Connection,path:string,body:unknown)=>{
    setBusy(item.id);
    try{
      const r=await fetch(`/api/member-connections/${item.id}/${path}`,{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
      });
      if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||"Action could not be saved");}
      toast({title:yi?"די ענדערונג איז אפגעהיטן":"Update saved"});
      await load();
    }catch(e){toast({title:yi?"נישט געלונגען":"Request failed",
      description:e instanceof Error?e.message:undefined,variant:"destructive"});}
    finally{setBusy(null);}
  };
  const problem=(item:Connection,code:string)=>{
    void action(item,"problem",{code,description:code==="other"?problemText[item.id]||"":""});
  };
  return <Layout>
    <section className="container mx-auto px-4 py-8 max-w-4xl space-y-6" dir={yi?"rtl":"ltr"}>
      <header className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary flex items-center gap-2">
            <Handshake className="h-7 w-7"/>{yi?"מיינע פארבינדונגען":"My Connections"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            {yi?"די מערכת קען פארשלאגן א פארבינדונג, אבער קען נישט געבן רשות אנשטאט א מענטש. ביידע מוזן אליין מסכים זיין, און דערנאך מוז די מערכת נאך באזונדער ערלויבן דאס איבערגעבן.":
              "Gavhah reviews the match, but cannot grant anyone's personal permission. Both people must approve, followed by separate FINAL Gavhah authorization, before contact information is shared."}
          </p>
        </div>
        <Button variant="outline" disabled={loading||!isAuthenticated} onClick={()=>void load()}>
          <RefreshCcw className="h-4 w-4 me-2"/>{yi?"דערפריש":"Refresh"}
        </Button>
      </header>
      {!isLoaded||loading?<p className="border rounded-xl p-8">{yi?"לאדנט...":"Loading..."}</p>:
       !isAuthenticated?<div className="border rounded-xl p-6 space-y-3">
         <p>{yi?"מען דארף זיך אריינלאגן":"Sign in to see your connection cases."}</p>
         <Link href="/login?return=%2Fconnections"><Button>{yi?"אריינלאגן":"Sign In"}</Button></Link>
       </div>:items.length===0?<div className="border rounded-xl p-6 space-y-3">
         <p>{yi?"דערווייל זענען נישטא קיין פארבינדונגען.":"You do not have any connection cases."}</p>
         <Link href="/directory"><Button variant="outline">{yi?"געפין אן עסקן":"Find a volunteer"}</Button></Link>
       </div>:<div className="space-y-4">
        {items.map(item=>{
          const name=item.role==="requester"?item.volunteerName:item.requesterName;
          const activeContact=(item.stage==="accepted"||item.stage==="connected")&&item.contact&&item.contactMethod;
          return <article key={item.id} className="border bg-card rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap gap-2 items-start justify-between">
              <div>
                <h2 className="font-semibold text-lg">{name}</h2>
                <p className="text-xs text-muted-foreground">#{item.id} · {item.role==="requester"?(yi?"איך האב געבעטן":"My request"):(yi?"מען בעט מיין הילף":"Someone requested my help")}</p>
              </div>
              <span className="rounded-full bg-muted border px-3 py-1 text-xs font-medium">
                {LABELS[item.stage][yi?0:1]}
              </span>
            </div>
            {["invited","needs_reapproval"].includes(item.stage)&&<div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm">
                {yi?"די מערכת האט דערלויבט די פארבינדונג פאר באטראכטונג. ביידע מענטשן מוזן נאך באשטעטיגן; גארנישט ווערט יעצט איבערגעגעבן.":
                  "Gavhah approved the proposed match for review. Both participants must still personally consent; nothing is shared yet."}
              </p>
              {item.myApproved?<div className="rounded-md bg-muted/30 p-3 text-sm flex gap-2 items-center">
                <Clock className="h-4 w-4"/>
                {yi?"דו האסט שוין מסכים געווען. נאך דער צווייטער צד דארף אויך די מערכת געבן איר לעצטע רשות.":
                  "You approved. Waiting for the other person, followed by final Gavhah permission."}
              </div>:<>
                {item.needsMyContact?<div className="border rounded-md p-3 text-sm space-y-2">
                  <p>{yi?"דו דארפסט ערשט אריינלייגן דיין קאנטאקט־וועג אינעם פראפיל.":
                    "Please enter your private contact method in My Profile first."}</p>
                  <Link href="/profile"><Button variant="outline">{yi?"מיין פראפיל":"My Profile"}</Button></Link>
                </div>:<div className="text-sm space-y-2">
                  <p className="font-medium">
                    {yi?"דיין קאנטאקט וואס דו ווילסט אפשר איבערגעבן":"Your selected contact details"}
                  </p>
                  {item.myContact&&<p className="break-all rounded-md border p-2">
                    {WAY[item.myContact.method][yi?0:1]}: {item.myContact.value}
                  </p>}
                  <p className="text-xs text-muted-foreground">
                    {yi?"דו באשטעטיגסט בלויז פאר דעם ספעציפישן פאל. די מערכת קען נישט אריינדריקן רשות פאר דיר.":
                      "Consent is for this particular match only. Staff cannot authorize sharing for you."}
                  </p>
                  <label className="flex gap-2 items-start text-sm">
                    <input type="checkbox" checked={disclose[item.id]||false}
                      onChange={e=>setDisclose(x=>({...x,[item.id]:e.target.checked}))} className="mt-1"/>
                    {yi?"איך געב פערזענליך רשות איבערצוגעבן מיין אויבנדערמאנטן קאנטאקט נאר פאר דעם פאל.":
                      "I personally authorize sharing the displayed contact method for this case only."}
                  </label>
                  <label className="flex gap-2 items-start text-sm">
                    <input type="checkbox" checked={agreed[item.id]||false}
                      onChange={e=>setAgreed(x=>({...x,[item.id]:e.target.checked}))} className="mt-1"/>
                    {yi?"איך פארשטיי אז מ'טאר נישט איבערגעבן די צווייטע צד'ס קאנטאקט־פרטים פאר אנדערע אן רשות פון דער מערכת און פונעם מענטש.":
                      "I agree not to redistribute the other person's details without their permission and Gavhah's authorization."}
                  </label>
                </div>}
                <div className="flex gap-2 flex-wrap">
                  <Button disabled={busy!==null||item.needsMyContact||!disclose[item.id]||!agreed[item.id]}
                    onClick={()=>void action(item,"respond",{
                      decision:"accept",confirmedPersonalPermission:true,agreedNoRedistribution:true,
                    })}>
                    <CheckCircle2 className="h-4 w-4 me-2"/>{yi?"איך בין מסכים":"I Approve"}
                  </Button>
                  <Button variant="outline" disabled={busy!==null}
                    onClick={()=>void action(item,"respond",{decision:"decline"})}>
                    <XCircle className="h-4 w-4 me-2"/>{yi?"איך וויל נישט":"Decline"}
                  </Button>
                </div>
              </>}
            </div>}
            {item.stage==="awaiting_staff_release"&&<div className="rounded-lg border p-4 space-y-2 bg-muted/20">
              <div className="flex items-center gap-2 font-semibold text-sm"><Clock className="h-5 w-5"/>
                {yi?"ביידע מענטשן האבן מסכים געווען — גבהה דארף נאך באשטעטיגן" :
                  "Both participants approved — awaiting Gavhah's final authorization"}
              </div>
              <p className="text-sm text-muted-foreground">
                {yi?"דאס איבערגעבן די קאנטאקט־פרטים איז דערווייל פארשפארט. נאר ווען די מערכת גיט איר באזונדערן לעצטן אישור וועלן די אויסגעקליבענע פרטים אויפקומען."
                  :"Neither contact detail is available yet. A full Gavhah administrator must separately approve the actual release before either person can view it."}
              </p>
            </div>}
            {item.stage==="new"&&<p className="text-sm text-muted-foreground">
              {yi?"די מערכת דארף נאך באטראכטן צי די פארבינדונג איז פאסיג.":
                "The proposed connection is awaiting Gavhah review."}
            </p>}
            {activeContact&&<div className="border rounded-lg p-4 space-y-3">
              <div className="flex gap-2 items-center font-semibold"><ShieldCheck className="h-5 w-5"/>
                {yi?"ביידע האבן געגעבן רשות":"Mutual personal approval recorded"}
              </div>
              <p className="text-sm">
                {yi?"דער קאנטאקט איז נאר פאר דעם פאל. דו טארסט די אינפארמאציע נישט איבערגעבן פאר אנדערע אן רשות פון גבהה און פונעם מענטש.":
                  "Use these contact details for this approved case only. Do not pass them to anyone else without Gavhah approval and the member's permission."}
              </p>
              <p className="break-all text-sm font-medium">{WAY[item.contactMethod!][yi?0:1]}: {item.contact}</p>
              <a className="inline-flex items-center gap-2 underline text-primary text-sm font-medium"
                href={urlFor(item.contactMethod!,item.contact!)}>
                {item.contactMethod==="email"?<Mail className="h-4 w-4"/>:<Phone className="h-4 w-4"/>}
                {yi?"פארבינד זיך":"Open contact method"}
              </a>
              {item.stage==="accepted"&&<>
                <div className="space-y-2 pt-2">
                  <p className="text-sm font-semibold">
                    {yi?"קען נישט נוצן דעם אנגעגעבענעם וועג? שיק גלייך צוריק צום אדמין:":
                      "Can't use the listed method? Send the case back to Gavhah:"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busy!==null} onClick={()=>problem(item,"no_sms")}>
                      {yi?"איך האב נישט קיין טעקסט":"I can't receive texts"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy!==null} onClick={()=>problem(item,"no_email")}>
                      {yi?"איך האב נישט קיין אימעיל":"I don't have email"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy!==null} onClick={()=>problem(item,"no_phone")}>
                      {yi?"איך קען נישט טעלעפאנירן":"I can't use phone"}
                    </Button>
                  </div>
                  <textarea rows={2} maxLength={500} className="w-full p-2 rounded-md border bg-background text-sm"
                    placeholder={yi?"אנדער פראבלעם? באשרייב עס...":"Other issue? Describe it..."}
                    value={problemText[item.id]||""}
                    onChange={e=>setProblemText(x=>({...x,[item.id]:e.target.value}))}/>
                  <Button size="sm" variant="outline" disabled={busy!==null||(problemText[item.id]||"").trim().length<5}
                    onClick={()=>problem(item,"other")}>{yi?"בעטן הילף פונעם אדמין":"Ask Gavhah for help"}</Button>
                </div>
                {item.role==="requester"&&<Button disabled={busy!==null}
                  onClick={()=>{if(window.confirm(yi?"האסטו זיך טאקע פארבונדן מיט דער צווייטער צד?":"Did actual contact succeed?"))
                    void action(item,"confirm",{});}}>
                  <CheckCircle2 className="h-4 w-4 me-2"/>{yi?"יא, די פארבינדונג איז געלונגען":"Yes, contact succeeded"}
                </Button>}
              </>}
            </div>}
            {item.stage==="contact_problem"&&<div className="border rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold">{yi?"דער פאל איז צוריקגעגאנגען צו גבהה. מען קען אויסקלייבן א נייעם וועג נאר נאך פרישע רשות פון ביידע.":
                "Case returned to Gavhah. Any primary or optional backup requires fresh approval from both."}</p>
              {item.contactIssue&&<p className="break-words text-muted-foreground">{item.contactIssue}</p>}
            </div>}
            {item.stage==="consent_revoked"&&<p className="text-sm text-destructive">
              {yi?"רשות איז צוריקגענומען. נישט ווייטער טיילן אדער נוצן קאנטאקט־פרטים.":
                "Consent was withdrawn. Do not keep sharing or using the contact details."}
            </p>}
            {item.stage==="declined"&&<p className="text-sm text-muted-foreground">
              {yi?"איינער האט נישט מסכים געווען. קיין פריוואטע פרטים ווערן נישט געוויזן.":
                "One participant declined. No private contact details are released."}</p>}
            {item.stage==="closed_unfulfilled"&&<p className="text-sm text-muted-foreground">
              {yi?"פארמאכט אלס נישט געלונגען":"Closed as unsuccessful"}: {item.closureReason||""}
            </p>}
            {item.stage==="connected"&&<p className="text-sm">
              {yi?"דער בעטער האט באשטעטיגט אז די פארבינדונג איז פאקטיש געלונגען.":
                "The requester confirmed real contact succeeded."}
            </p>}
            {["accepted","invited","awaiting_staff_release","contact_problem"].includes(item.stage)&&
              <Button size="sm" variant="ghost" disabled={busy!==null}
                onClick={()=>{if(window.confirm(yi?"ווילסטו צוריקנעמען דיין רשות פאר דעם פאל?":"Withdraw your permission for this case?"))
                  void action(item,"revoke",{});}}>
                {yi?"נעם צוריק מיין רשות":"Withdraw My Consent"}
              </Button>}
          </article>;
        })}
      </div>}
      <p className="text-xs text-muted-foreground flex items-start gap-2">
        <Clock className="h-4 w-4 shrink-0"/>
        {yi?"וועבסייט־נאטיפיקאציעס ווערן צוגעגרייט. אויטאמאטישע טעלעפאן־רופן און SMS זענען נאך נישט פארבונדן; קיינעם ווערט נישט פארגעשטעלט אז א טעלעפאן־מעסעדזש איז שוין געשיקט געווארן.":
          "Website inbox notifications are staged. Automated telephone and SMS delivery are NOT connected; queued phone notices are not sent."}
      </p>
    </section>
  </Layout>;
}
