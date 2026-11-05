import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";

type Settings={channel:"daily"|"united";enabled:boolean;active_charity_id:number|null;
 phone_before_news:boolean;website_before_news:boolean;website_autoplay:boolean;
 announcement_mode:"tts"|"recording";join_mode:"tts"|"recording";
 donation_hotline:string|null;donation_instructions_en:string;
 payment_adapter:string;checkout_url:string|null};
type RequestRow={id:number;channel:string;purpose:string;member_id:number;request_note:string;
 state:string;proposed_text_en:string|null;has_audio:boolean};
const api=async(path:string,method="GET",body?:unknown)=>{
 const r=await fetch(path,{
  method,credentials:"same-origin",cache:"no-store",
  ...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})
 });
 const result=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(result.error||"נישט געלונגען");
 return result;
};
export function CauseChannelsTeamSettings({which}:{which:"united"|"daily"}){
 const [settings,setSettings]=useState<Settings|null>(null);
 const [messageRows,setMessageRows]=useState<RequestRow[]>([]);
 const [charityId,setCharityId]=useState("");
 const [memberId,setMemberId]=useState("");
 const [requestNote,setRequestNote]=useState("");
 const [purpose,setPurpose]=useState("announcement");
 const [reviewNotes,setReviewNotes]=useState<Record<number,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=useCallback(async()=>{
  try{
   const [data,msgs]=await Promise.all([
    api("/api/admin/cause-channels"),
    api("/api/admin/cause-message-requests")
   ]);
   const s=(data.channels as Settings[]).find(x=>x.channel===which)||null;
   setSettings(s);setCharityId(s?.active_charity_id?String(s.active_charity_id):"");
   setMessageRows((msgs as RequestRow[]).filter(x=>x.channel===which));setError("");
  }catch(e){setError(e instanceof Error?e.message:"נישט פארבונדן");}
 },[which]);
 useEffect(()=>{void load()},[load]);
 const set=<T extends keyof Settings>(k:T,v:Settings[T])=>setSettings(old=>old?{...old,[k]:v}:old);
 const run=async(fn:()=>Promise<unknown>)=>{
  if(busy)return;setBusy(true);setError("");setSuccess("");
  try{await fn();setSuccess("אפהיטן איז געלונגען.");await load();}
  catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
  finally{setBusy(false);}
 };
 if(!settings)return <p role="status">{error||"מען ליינט די סעטינגס..."}</p>;
 const save=()=>run(()=>api("/api/admin/cause-channels/"+which,"PATCH",{
  enabled:settings.enabled,phoneBeforeNews:settings.phone_before_news,
  websiteBeforeNews:settings.website_before_news,websiteAutoplay:settings.website_autoplay,
  announcementMode:settings.announcement_mode,joinMode:settings.join_mode,
  donationHotline:settings.donation_hotline,donationInstructionsEn:settings.donation_instructions_en,
  paymentAdapter:settings.payment_adapter,checkoutUrl:settings.checkout_url,
  ...(which==="daily"?{activeCharityId:charityId?Number(charityId):null}:{})
 }));
 return <section dir="rtl" lang="yi" className="space-y-5">
  <header className="rounded-xl border p-5 space-y-2">
   <h2 className="text-2xl font-bold">{which==="daily"?"היינטיגע צוועק סעטינגס":"מתאחדים באהבה — צוועק סעטינגס"}</h2>
   <p className="text-sm text-muted-foreground">
    {which==="daily"?"דאס איז אינגאנצן באזונדער פון מתאחדים באהבה.":"דאס איז אינגאנצן באזונדער פון היינטיגע צוועק."}
    סיסטעם־מעסעדזשעס גייען נאר ארויס נאך דער מערכת־באשטעטיגונג.
   </p>
   {success&&<p role="status">{success}</p>}
   {error&&<p role="alert" className="text-destructive">{error}</p>}
  </header>
  <div className="rounded-xl border p-5 space-y-4">
   <h3 className="font-bold">אויסוואלן פאר טעלעפאן און פובליק וועבזייט</h3>
   <label className="flex items-center gap-2"><input type="checkbox" checked={settings.enabled}
      onChange={e=>set("enabled",e.target.checked)}/> אנגעצונדן</label>
   {which==="daily"&&<>
     <label className="flex items-center gap-2"><input type="checkbox" checked={settings.phone_before_news}
        onChange={e=>set("phone_before_news",e.target.checked)}/> פארליינען אויפן ליין איידער נייעס</label>
     <label className="flex items-center gap-2"><input type="checkbox" checked={settings.website_before_news}
        onChange={e=>set("website_before_news",e.target.checked)}/> ווייזן אויפן נייעס־וועבזייט</label>
     <label className="flex items-center gap-2"><input type="checkbox" checked={settings.website_autoplay}
        onChange={e=>set("website_autoplay",e.target.checked)}/> פרובירן אויטאמאטישן אודיא־שפילן (בראוזער קען בלאקירן)</label>
     <Input type="number" min="1" placeholder="היינטיגע Charity איי־די — לאז ליידיג פאר אויסגעקליבענעם"
       value={charityId} onChange={e=>setCharityId(e.target.value)}/>
   </>}
   <div className="grid md:grid-cols-2 gap-3">
    <div className="space-y-1">
     <label className="font-medium">אפיציעלע צוועק־מעסעדזש</label>
     <Select value={settings.announcement_mode} onValueChange={x=>set("announcement_mode",x as "tts"|"recording")}>
       <SelectTrigger><SelectValue/></SelectTrigger>
       <SelectContent><SelectItem value="tts">TTS אין ענגליש</SelectItem><SelectItem value="recording">באשטעטיגטע רעקארדירונג</SelectItem></SelectContent>
     </Select>
    </div>
    <div className="space-y-1">
     <label className="font-medium">אנשליסן און נדבה־אנווייזונגען</label>
     <Select value={settings.join_mode} onValueChange={x=>set("join_mode",x as "tts"|"recording")}>
       <SelectTrigger><SelectValue/></SelectTrigger>
       <SelectContent><SelectItem value="tts">TTS אין ענגליש</SelectItem><SelectItem value="recording">באשטעטיגטע רעקארדירונג</SelectItem></SelectContent>
     </Select>
    </div>
   </div>
   <Input placeholder="קאמפיין האטליין נומער" value={settings.donation_hotline||""}
    onChange={e=>set("donation_hotline",e.target.value||null)}/>
   <Textarea placeholder="אפיציעלע ענגלישע TTS־אנווייזונגען וויאזוי צו געבן נדבה"
    maxLength={3000} value={settings.donation_instructions_en}
    onChange={e=>set("donation_instructions_en",e.target.value)}/>
   <h3 className="font-bold">פעימענט־פראוויידער — ביז פארבינדונג אויסגעלאשן</h3>
   <Select value={settings.payment_adapter} onValueChange={x=>set("payment_adapter",x)}>
     <SelectTrigger><SelectValue/></SelectTrigger>
     <SelectContent><SelectItem value="none">נישט פארבונדן</SelectItem>
       <SelectItem value="hosted_checkout">פראוויידער־באצאל־לינק</SelectItem></SelectContent>
   </Select>
   <Input placeholder="https://provider.example/secure-checkout" type="url"
    value={settings.checkout_url||""} onChange={e=>set("checkout_url",e.target.value||null)}/>
   <p className="text-xs text-muted-foreground">קיין קארטל־נומערן ווערן נישט גענומען דורך גבהה. API־באצאלונגען און באשטעטיגטע Webhooks דארפן א באזונדערע פראוויידער־פארבינדונג.</p>
   <Button disabled={busy} onClick={()=>void save()}>אפהיטן {which==="daily"?"היינטיגע צוועק":"מתאחדים באהבה"} סעטינגס</Button>
  </div>
  <div className="rounded-xl border p-5 space-y-3">
   <h3 className="font-bold">שיק א מעמבער א מעלדונג צו צושטעלן אן אפיציעלע מעסעדזש</h3>
   <Input type="number" min="1" value={memberId} onChange={e=>setMemberId(e.target.value)} placeholder="מעמבער־איי־די"/>
   <Select value={purpose} onValueChange={setPurpose}>
    <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
     <SelectItem value="announcement">די אפיציעלע צוועק־מעסעדזש</SelectItem>
     <SelectItem value="join">די מעסעדזש ביי קנעפל 1 — אנשליסן/נדבה</SelectItem>
    </SelectContent>
   </Select>
   <Textarea value={requestNote} onChange={e=>setRequestNote(e.target.value)} placeholder="וואס דער מעמבער זאל איינרעדן אדער שרייבן"/>
   <Button disabled={busy||!memberId} onClick={()=>void run(()=>
    api("/api/admin/cause-message-requests","POST",
      {channel:which,purpose,memberId:Number(memberId),note:requestNote}))}>שיקן באשעפטיגונג־בקשה אין מעלדונגען</Button>
  </div>
  <div className="rounded-xl border p-5 space-y-3">
   <h3 className="font-bold">איינגעשיקטע מעסעדזשעס — טיעם־איבערקוק</h3>
   {messageRows.length===0&&<p>קיין פרישע מעסעדזש־בקשות נישט.</p>}
   {messageRows.map(m=><article key={m.id} className="border rounded-lg p-4 space-y-2">
    <strong>#{m.id} · {m.purpose==="announcement"?"צוועק־מעסעדזש":"נדבה־אנווייזונגען"} · מעמבער #{m.member_id}</strong>
    <p className="text-xs">{m.state}</p>
    {m.proposed_text_en&&<p className="text-sm whitespace-pre-wrap">{m.proposed_text_en}</p>}
    {m.has_audio&&<audio controls className="w-full" src={`/api/cause-message-requests/${m.id}/audio`}/>}
    {m.state==="submitted"&&<>
      <Textarea placeholder="מערכת־הערה צום באשלוס" value={reviewNotes[m.id]||""}
       onChange={e=>setReviewNotes(o=>({...o,[m.id]:e.target.value}))}/>
      <div className="flex gap-2 flex-wrap">
       <Button disabled={busy} onClick={()=>void run(()=>
        api(`/api/admin/cause-message-requests/${m.id}/review`,"POST",
          {decision:"approved",note:reviewNotes[m.id]||""}))}>באשטעטיגן צו פארעפנטליכן</Button>
       <Button disabled={busy} variant="destructive" onClick={()=>void run(()=>
        api(`/api/admin/cause-message-requests/${m.id}/review`,"POST",
          {decision:"rejected",note:reviewNotes[m.id]||""}))}>אפווארפן</Button>
      </div>
    </>}
   </article>)}
   <p className="text-xs text-muted-foreground">א באשטעטיגטער אודיא־פייל ווערט גלייך הערבאר אויפן וועבזייט. פאר די ימות־ליין דארף דער פייל ערשט ווערן פובליצירט ווי WAV אין האטליין־עדיטער און פארבונדן צום געהעריגן מעניו.</p>
  </div>
 </section>;
}
