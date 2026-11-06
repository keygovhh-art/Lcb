import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {useToast} from "@/hooks/use-toast";

type GroupConference={
 provider:string;callingProvider:string;groupId:number;configured:boolean;enabled:boolean;
 mode:string;accessMode:"members"|"public";canManage:boolean;canJoin:boolean;
 status:string;providerPhysicallyTested:boolean;note:string;
 dialLine?:string;extension?:string;entryCode?:string;
 providerLine?:string;listenerExtension?:string;moderatorExtension?:string;
 moderatorCode?:string;providerState?:string;
};
const api=async(url:string,method="GET",body?:unknown)=>{
 const response=await fetch(url,{
  method,credentials:"same-origin",cache:"no-store",
  headers:body===undefined?undefined:{"Content-Type":"application/json"},
  body:body===undefined?undefined:JSON.stringify(body)
 });
 const json=await response.json().catch(()=>({error:"קיין ענטפער פון סיסטעם"}));
 if(!response.ok)throw Error(String(json.error||"דער פארלאנג איז נישט געלונגען"));
 return json;
};
export function GroupConferencePanel({groupId,isSuperAdmin}:{
 groupId:number;isSuperAdmin:boolean;
}){
 const {toast}=useToast();
 const [data,setData]=useState<GroupConference|null>(null);
 const [enabled,setEnabled]=useState(false);
 const [accessMode,setAccessMode]=useState<"members"|"public">("members");
 const [mode,setMode]=useState<"speech"|"listen_all">("speech");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const refresh=useCallback(async()=>{
  try{
   const r=await api("/api/groups/"+groupId+"/conference") as GroupConference;
   setData(r);setEnabled(r.enabled);setAccessMode(r.accessMode);
   setMode(r.mode==="צוהערן"?"listen_all":"speech");setError("");
  }catch(e){setError(e instanceof Error?e.message:"נישט געלונגען");}
 },[groupId]);
 useEffect(()=>{void refresh();},[refresh]);
 const mutate=async(fn:()=>Promise<unknown>)=>{
  setBusy(true);
  try{await fn();await refresh();toast({title:"דערהיינטיגט"});}
  catch(e){const message=e instanceof Error?e.message:"נישט געלונגען";setError(message);
   toast({title:message,variant:"destructive"});}
  finally{setBusy(false);}
 };
 if(!data&&!error)return <section dir="rtl" className="rounded-xl border bg-card p-4">
  <h3 className="font-semibold">גרופ־קאנפרענץ</h3>
 </section>;
 return <section dir="rtl" className="rounded-xl border bg-card p-4 space-y-3">
  <h3 className="font-semibold text-lg">גרופ־קאנפרענץ</h3>
  <p className="text-sm text-muted-foreground">
   די גרופ־קאנפרענץ גייט דורך ימות. געווענליכע טעלעפאן־קאלס גייען נאר דורך SignalWire.
  </p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {data&&<>
   <p className="text-sm">
    {data.status==="open"?"די קאנפרענץ־איינלאדונגען זענען אפן.":
     data.status==="closed"?"דער קאנפרענץ־צימער איז גרייט, אבער די איינלאדונגען זענען פארמאכט.":
     data.status==="needs_provider_review"?"די ימות־צימער דארף נאך א פראוויידער־פרוף.":
     data.status==="provisioning"?"מען גרייט צו די קאנפרענץ־צימערן.":
     "דער ימות־קאנפרענץ־צימער דארף נאך ווערן איינגעשטעלט."}
   </p>
   {data.canJoin&&data.dialLine&&data.extension&&
    <div className="rounded-lg border p-3 space-y-2">
     <p className="font-medium">אריינקומען צום גרופ־קאנפרענץ</p>
     <p className="text-sm">טעלעפאן: <b dir="ltr">{data.dialLine}</b></p>
     <p className="text-sm">קאנפרענץ־עקסטענשאן: <b dir="ltr">{data.extension}</b></p>
     {data.entryCode&&<p className="text-sm">אריינגאנג־קאד: <b dir="ltr">{data.entryCode}</b></p>}
     <a href={"tel:+"+data.dialLine.replace(/\D/g,"")} className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium">
      רוף אן צו דער קאנפרענץ
     </a>
     <p className="text-xs text-muted-foreground">
      נאך אנרופן גיי צום אנגעצייכנטן עקסטענשאן און גיב אריין דעם קאד.
     </p>
    </div>}
   {data.canManage&&
    <div className="rounded-lg border p-3 space-y-3">
     <h4 className="font-medium">קאנפרענץ־פארוואלטונג</h4>
     {data.providerState&&<p className="text-sm text-muted-foreground">ימות־צושטאנד: {data.providerState}</p>}
     {data.providerLine&&data.listenerExtension&&
      <p className="text-sm">גרופ־צימער: <b dir="ltr">{data.providerLine} / {data.listenerExtension}</b></p>}
     {data.moderatorExtension&&<p className="text-sm">
      מנהל־עקסטענשאן: <b dir="ltr">{data.moderatorExtension}</b>
     </p>}
     {data.moderatorCode&&<p className="text-sm">
      געהיימער מנהל־קאד: <b dir="ltr">{data.moderatorCode}</b>
     </p>}
     <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}
       disabled={!data.configured||busy}/>
      עפענען קאנפרענץ־איינלאדונגען
     </label>
     <label className="block text-sm space-y-1">ווער מעג אריינקומען?
      <select className="block w-full rounded-md border bg-background p-2"
       value={accessMode} onChange={e=>setAccessMode(e.target.value as "members"|"public")}>
       <option value="members">נאר גרופ־מעמבערס</option>
       <option value="public">אויך דער ציבור — נאר ביי פובליק גרופעס</option>
      </select>
     </label>
     <label className="block text-sm space-y-1">אויסשטעל
      <select className="block w-full rounded-md border bg-background p-2"
       value={mode} onChange={e=>setMode(e.target.value as "speech"|"listen_all")}
       disabled={data.configured}>
       <option value="speech">גרופ־שמועס</option>
       <option value="listen_all">נאר צוהערן צום רעדנער</option>
      </select>
     </label>
     <Button variant="outline" disabled={busy||!data.configured}
      onClick={()=>void mutate(()=>api("/api/groups/"+groupId+"/conference","PATCH",{enabled,accessMode,mode}))}>
      {busy?"היט אפ...":"היט אפ קאנפרענץ־איינשטעלונגען"}
     </Button>
     <p className="text-xs text-muted-foreground">
      פארמאכן איינלאדונגען שליסט נישט אויטאמאטיש אפ מענטשן וואס זענען שוין אין א טעלעפאן־קאנפרענץ.
     </p>
     {isSuperAdmin&&data.status==="not_configured"&&
      <Button disabled={busy} onClick={()=>void mutate(()=>api(
       "/api/admin/groups/"+groupId+"/conference/provision","POST",
       {confirm:"ADD_ONLY_YEMOT_GROUP_CONFERENCE",mode}))}>
       מאך גרייט א נייער ימות־צימער — אן אנרירן אנדערע עקסטענשאנס
      </Button>}
     {isSuperAdmin&&data.status==="needs_provider_review"&&
      <Button variant="outline" disabled={busy} onClick={()=>void mutate(()=>api(
       "/api/admin/groups/"+groupId+"/conference/verify","POST",{}))}>
       פרוף נאכאמאל דעם עקזיסטירנדן ימות־צימער
      </Button>}
     {data.configured&&
      <p className="text-xs text-muted-foreground">
       מנהלים קענען דורך די ימות־קאנפרענץ־קיפעד פארוואלטן שטילקייט און רעדנער;
       דער וועבסייט קען נישט באשטעטיגן לעבעדיגע טעלעפאן־צוהערער אן א באזונדערן פראוויידער־פרוף.
      </p>}
    </div>}
   {!data.canJoin&&data.enabled&&<p className="text-sm text-muted-foreground">
    נאר ערלויבטע מעמבערס קענען זען די אריינגאנג־דעטאלן.
   </p>}
  </>}
 </section>;
}
